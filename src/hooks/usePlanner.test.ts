import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type PlanPrepared,
  type PlanTables,
  PLAN_NO_ICE,
  computePlan,
  evaluateRange,
  planDay,
  prepareCandidates,
  refinePick,
} from '../astro/planner.ts'
import { fixtureDem, fixtureIllum, fixturePoint, fixtureProblem } from '../astro/plannerFixture.ts'
import {
  PLAN_DEFAULTS,
  PLAN_MAX_DAYS,
  type PlanDay,
  type PlanProblem,
} from '../astro/plannerTypes.ts'
import { SITE_SEEDS } from '../config/sites.ts'
import { useMissionStore } from '../store/useMissionStore.ts'
import { usePlannerStore } from '../store/usePlannerStore.ts'
import { useRoverStore } from '../store/useRoverStore.ts'
import {
  PLAN_BATCH_DAYS,
  PLAN_ERROR,
  type PlanJobs,
  buildProblem,
  cancelPlan,
  runPlan,
} from './usePlanner.ts'

// Horizons and traverses on a loaded machine: well past the 5 s default.
vi.setConfig({ testTimeout: 30_000 })

const grids = [fixtureDem()]
const illum = fixtureIllum()
const few = { maxCandidates: 8 }
const problem = fixtureProblem({ days: 5 })
const plan = () => usePlannerStore.getState()

/** The worker jobs run in-thread on the synthetic terrain; `log` records every call. */
function jobs(log: string[] = [], hooks: { afterDays?: (from: number) => void } = {}): PlanJobs {
  const plans = new Map<
    string,
    { problem: PlanProblem; prepared: PlanPrepared; tables: PlanTables; days: PlanDay[] }
  >()
  return {
    async prepare(p) {
      log.push('prepare')
      const prepared = prepareCandidates(grids, illum, p, few)
      const planId = `test-${plans.size}`
      plans.set(planId, { problem: p, prepared, tables: evaluateRange(prepared, p), days: [] })
      return { planId, ice: prepared.ice, candidates: prepared.candidates }
    },
    async days(planId, from, count) {
      log.push(`days ${from}+${count}`)
      const s = plans.get(planId)!
      const out: PlanDay[] = []
      for (let d = from; d < from + count; d++) {
        s.days[d] = planDay(s.prepared, s.tables, s.problem, d)
        out.push(s.days[d])
      }
      hooks.afterDays?.(from)
      return out
    },
    async finish(planId, top) {
      log.push(`finish ${top.length}`)
      const s = plans.get(planId)!
      return top.map((d) => refinePick(s.prepared, s.problem, s.days[d]))
    },
  }
}

beforeEach(() => {
  cancelPlan()
  plan().clearResult()
})

describe('runPlan', () => {
  it('prepares, evaluates the days in batches and refines the shortlist', async () => {
    const log: string[] = []
    const seen: { days: number; progress: number; status: string; complete?: boolean }[] = []
    const off = usePlannerStore.subscribe((s) =>
      seen.push({
        days: s.result?.days.length ?? -1,
        progress: s.progress,
        status: s.status,
        complete: s.result?.complete,
      }),
    )
    await runPlan(problem, jobs(log))
    off()

    expect(log[0]).toBe('prepare')
    expect(log.slice(1, -1)).toEqual([`days 0+${PLAN_BATCH_DAYS}`, `days ${PLAN_BATCH_DAYS}+2`])
    expect(log[log.length - 1]).toMatch(/^finish \d$/)
    // Running with nothing, then the candidates alone, then the days growing, then done.
    expect(seen[0]).toMatchObject({ days: -1, progress: 0, status: 'running' })
    expect(seen[1]).toMatchObject({ days: 0, status: 'running', complete: false })
    expect(seen.map((x) => x.days)).toEqual([-1, 0, PLAN_BATCH_DAYS, 5, 5])
    for (let i = 1; i < seen.length; i++)
      expect(seen[i].progress).toBeGreaterThan(seen[i - 1].progress)
    expect(seen[seen.length - 1]).toMatchObject({ status: 'done', progress: 1, complete: true })

    const s = plan()
    expect(s.error).toBeNull()
    expect(s.result).toEqual(computePlan(grids, illum, problem, undefined, few))
    expect(structuredClone(s.result)).toEqual(s.result)
  })

  it('stops between batches when cancelled, keeping what was computed', async () => {
    const log: string[] = []
    await runPlan(problem, jobs(log, { afterDays: (from) => from === 0 && cancelPlan() }))
    const s = plan()
    expect(s.status).toBe('cancelled')
    // The batch in flight when it was cancelled is dropped; nothing else was asked for.
    expect(log).toEqual(['prepare', `days 0+${PLAN_BATCH_DAYS}`])
    expect(s.result).toMatchObject({ complete: false, days: [], top: [] })
    expect(s.result!.candidates.length).toBeGreaterThan(0)
    cancelPlan()
    expect(plan().status).toBe('cancelled')
  })

  it('keeps the days already published when cancelled later', async () => {
    await runPlan(
      problem,
      jobs([], { afterDays: (from) => from === PLAN_BATCH_DAYS && cancelPlan() }),
    )
    const s = plan()
    expect(s.status).toBe('cancelled')
    expect(s.result!.days).toHaveLength(PLAN_BATCH_DAYS)
    expect(s.result!.complete).toBe(false)
    expect(s.progress).toBeGreaterThan(0)
    expect(s.progress).toBeLessThan(1)
  })

  it('lets a newer run take over', async () => {
    const short = fixtureProblem({ days: 1 })
    const logA: string[] = []
    let second: Promise<void> | undefined
    const first = runPlan(
      problem,
      jobs(logA, {
        afterDays: (from) => {
          if (from === 0) second = runPlan(short, jobs())
        },
      }),
    )
    await first
    await second
    expect(logA).toEqual(['prepare', `days 0+${PLAN_BATCH_DAYS}`])
    const s = plan()
    expect(s.status).toBe('done')
    expect(s.result!.problem).toEqual(short)
    expect(s.result!.days).toHaveLength(1)
  })

  it('reports a target without ice, and any other failure, as an error', async () => {
    await runPlan(fixtureProblem({ target: fixturePoint(-1200, 0) }), jobs())
    expect(plan()).toMatchObject({ status: 'error', error: PLAN_NO_ICE, result: null })
    expect(PLAN_ERROR.noIce).toBe(PLAN_NO_ICE)

    const broken = { ...jobs(), days: () => Promise.reject(new Error('boom')) }
    await runPlan(problem, broken)
    expect(plan()).toMatchObject({ status: 'error', error: 'boom' })
    expect(plan().result!.complete).toBe(false)
  })

  it('needs a known tile site when it goes to the worker', async () => {
    useMissionStore.getState().setSites([])
    await runPlan(problem)
    expect(plan()).toMatchObject({ status: 'error', error: PLAN_ERROR.noTile })
  })
})

describe('buildProblem', () => {
  const sites = SITE_SEEDS.map((s) => ({
    ...s,
    heightM: 0,
    accuracy: 'spherical' as const,
    hasTerrain: false,
  }))
  const from = Date.UTC(2027, 2, 1)

  beforeEach(() => {
    useMissionStore.getState().reset()
    useMissionStore.getState().setSites(sites)
    usePlannerStore.setState({
      target: null,
      tileSiteId: null,
      fromMs: null,
      days: PLAN_DEFAULTS.days,
      minSunDays: PLAN_DEFAULTS.minSunDays,
      minRoverSocPct: PLAN_DEFAULTS.minRoverSocPct,
      radiusM: PLAN_DEFAULTS.radiusM,
    })
  })

  it('says what is missing', () => {
    const p = plan()
    expect(buildProblem()).toEqual({ ok: false, problem: null, reason: 'no-target' })
    p.setTarget({ lat: -89.4, lon: -140 }, null)
    expect(buildProblem()).toMatchObject({ ok: false, reason: 'no-tile' })
    p.setTarget({ lat: -89.4, lon: -140 }, 'shackleton-rim')
    expect(buildProblem()).toMatchObject({ ok: false, reason: 'range' })
    p.setRange(Date.UTC(2025, 11, 31), 30)
    expect(buildProblem()).toMatchObject({ ok: false, reason: 'range' })
    p.setRange(Date.UTC(2030, 11, 20), 30)
    expect(buildProblem()).toMatchObject({ ok: false, reason: 'range' })
    p.setRange(Date.UTC(2030, 11, 2), 30)
    expect(buildProblem().ok).toBe(true)
    // The store clamps what the form sets; anything else that gets in is refused.
    for (const days of [0, PLAN_MAX_DAYS + 1, 2.5]) {
      usePlannerStore.setState({ fromMs: from, days })
      expect(buildProblem()).toMatchObject({ ok: false, reason: 'days' })
    }
    p.setRange(from, PLAN_MAX_DAYS)
    expect(buildProblem().ok).toBe(true)
  })

  it('takes the mission settings of the active scenario and the selected rover', () => {
    const m = useMissionStore.getState()
    m.setMissionDays(20)
    m.setLinkMargin(3)
    m.setRequireDsn(true)
    m.setScienceWeight(0.4)
    m.setHardwareLimits({ maxNightH: 60, roverMaxSlopeDeg: 15 })
    useRoverStore.getState().setRover('csa-rover')
    useRoverStore.getState().setSamples(5)
    useRoverStore.getState().setSampleH(1.5)
    const p = plan()
    p.setTarget({ lat: -89.4044, lon: -140.0766 }, 'shackleton-rim')
    p.setRange(from, 12)
    p.setMinSunDays(7)
    p.setMinRoverSoc(35)
    p.setRadius(1000)
    expect(buildProblem()).toEqual({
      ok: true,
      problem: {
        target: { lat: -89.4044, lon: -140.0766 },
        tileSiteId: 'shackleton-rim',
        fromMs: from,
        days: 12,
        missionDays: 20,
        minSunDays: 7,
        roverId: 'csa-rover',
        samples: 5,
        sampleH: 1.5,
        minRoverSocPct: 35,
        radiusM: 1000,
        hardware: { ...useMissionStore.getState().hardwareLimits, maxNightH: 60 },
        linkMarginDeg: 3,
        requireDsn: true,
        scienceWeight: 0.4,
      },
    })
    expect(useMissionStore.getState().hardwareLimits.roverMaxSlopeDeg).toBe(15)
    useRoverStore.getState().setRover('rover')
    useRoverStore.getState().setSamples(3)
    useRoverStore.getState().setSampleH(2)
  })
})
