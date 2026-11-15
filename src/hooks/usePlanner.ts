import { DAY_MS } from '../astro/constants.ts'
import { PLAN_NO_GROUND, PLAN_NO_ICE, rankDays, withRefined } from '../astro/planner.ts'
import {
  PLAN_MAX_DAYS,
  type PlanDay,
  type PlanProblem,
  type PlanResult,
} from '../astro/plannerTypes.ts'
import { asset, demRefs, loadSiteDetail } from '../data/catalog.ts'
import { selectActiveScenario, useMissionStore } from '../store/useMissionStore.ts'
import { usePlannerStore } from '../store/usePlannerStore.ts'
import { useRoverStore } from '../store/useRoverStore.ts'
import { runPlanDays, runPlanFinish, runPlanPrepare } from '../workers/astroClient.ts'
import { PLAN_EXPIRED, type PlanFinishResult, type PlanPrepareResult } from '../workers/protocol.ts'

/** Days evaluated per worker request: progress and cancellation are checked between batches. */
export const PLAN_BATCH_DAYS = 3
/** Share of the progress bar given to preparing the candidates (horizons and routes). */
export const PLAN_PREPARE_SHARE = 0.15
/** Share left for refining the shortlist at the end. */
export const PLAN_FINISH_SHARE = 0.05

/** `error` of a failed plan when the cause is known (anything else is a raw message). */
export const PLAN_ERROR = {
  /** No permanently shadowed ground within reach of the target. */
  noIce: PLAN_NO_ICE,
  /** No safe, sunlit ground to land on within the radius of the target. */
  noGround: PLAN_NO_GROUND,
  /** The tile site is unknown or has no 20 m terrain / illumination map. */
  noTile: 'no-tile',
  /** The worker dropped the plan (two newer ones were started). */
  expired: PLAN_EXPIRED,
} as const

/** The three worker jobs of a plan (injected in tests). */
export interface PlanJobs {
  prepare: (problem: PlanProblem) => Promise<PlanPrepareResult>
  days: (planId: string, from: number, count: number) => Promise<PlanDay[]>
  finish: (planId: string, top: number[]) => Promise<PlanFinishResult>
}

const workerJobs: PlanJobs = {
  async prepare(problem) {
    const info = useMissionStore.getState().sites.find((s) => s.id === problem.tileSiteId)
    if (!info || info.custom) throw new Error(PLAN_ERROR.noTile)
    const detail = await loadSiteDetail(info)
    if (!detail.terrain || !detail.illum || detail.terrain.meta.projection)
      throw new Error(PLAN_ERROR.noTile)
    const illum = { bin: asset(`data/${detail.illum.file}`), meta: detail.illum.meta }
    return runPlanPrepare(problem, demRefs(detail), illum)
  },
  days: runPlanDays,
  finish: runPlanFinish,
}

/** Bumped by every run and every cancel: a loop whose token is stale stops without a word. */
let runToken = 0

/**
 * Runs a plan (not a hook): candidates first, then the days in batches, publishing the partial
 * result, the shortlist so far and the progress to the planner store after each batch, and
 * finally the refined picks of the shortlist. A newer `runPlan` or `cancelPlan` stops it between
 * batches. Resolves when the run ends, however it ends; failures go to the store, not thrown.
 */
export async function runPlan(problem: PlanProblem, jobs: PlanJobs = workerJobs): Promise<void> {
  const token = ++runToken
  const live = () => token === runToken
  const { setRun } = usePlannerStore.getState()
  // A new plan starts with nothing ticked for Compare and no day selected.
  usePlannerStore.setState({
    status: 'running',
    progress: 0,
    error: null,
    result: null,
    picked: [],
    selectedDayMs: null,
  })
  try {
    const prepared = await jobs.prepare(problem)
    if (!live()) return
    let result: PlanResult = {
      problem,
      ice: prepared.ice,
      candidates: prepared.candidates,
      days: [],
      top: [],
      complete: false,
    }
    setRun({ result, progress: PLAN_PREPARE_SHARE })
    const daysShare = 1 - PLAN_PREPARE_SHARE - PLAN_FINISH_SHARE
    while (result.days.length < problem.days) {
      const from = result.days.length
      const batch = await jobs.days(
        prepared.planId,
        from,
        Math.min(PLAN_BATCH_DAYS, problem.days - from),
      )
      if (!live()) return
      if (!batch.length) throw new Error('planner: empty batch')
      const days = [...result.days, ...batch]
      result = { ...result, days, top: rankDays(days) }
      setRun({
        result,
        progress: PLAN_PREPARE_SHARE + (daysShare * days.length) / problem.days,
      })
    }
    const picks = result.top.length ? await jobs.finish(prepared.planId, result.top) : []
    if (!live()) return
    result = { ...result, ...withRefined(result.days, result.top, picks), complete: true }
    setRun({ result, status: 'done', progress: 1 })
  } catch (err) {
    if (!live()) return
    setRun({ status: 'error', error: err instanceof Error ? err.message : String(err) })
  }
}

/** Stops the running plan; what was computed so far stays on screen. */
export function cancelPlan(): void {
  runToken++
  const s = usePlannerStore.getState()
  if (s.status === 'running') s.setRun({ status: 'cancelled' })
}

export type PlanInputIssue =
  | 'no-target' // no ice target chosen
  | 'no-tile' // no curated 20 m tile covers the target
  | 'range' // first date missing, or the landing dates leave 2026–2030
  | 'days' // number of days outside 1..PLAN_MAX_DAYS

/** Landing dates the planner accepts (the span of the DE441 ephemeris table). */
export const PLAN_DATE_RANGE = { minMs: Date.UTC(2026, 0, 1), maxMs: Date.UTC(2030, 11, 31) }

/**
 * The problem to solve, from the planner's own inputs plus the mission settings of the active
 * scenario (mission length, hardware limits, link margin, DSN, science weight) and the selected
 * rover. With missing or invalid inputs: no problem, and why.
 */
export function buildProblem():
  { ok: true; problem: PlanProblem } | { ok: false; problem: null; reason: PlanInputIssue } {
  const no = (reason: PlanInputIssue) => ({ ok: false as const, problem: null, reason })
  const p = usePlannerStore.getState()
  const sc = selectActiveScenario(useMissionStore.getState())
  const { target } = p
  if (!target || !Number.isFinite(target.lat) || !Number.isFinite(target.lon))
    return no('no-target')
  if (!p.tileSiteId) return no('no-tile')
  if (!Number.isInteger(p.days) || p.days < 1 || p.days > PLAN_MAX_DAYS) return no('days')
  if (
    p.fromMs === null ||
    !Number.isFinite(p.fromMs) ||
    p.fromMs < PLAN_DATE_RANGE.minMs ||
    p.fromMs + (p.days - 1) * DAY_MS > PLAN_DATE_RANGE.maxMs
  )
    return no('range')
  return {
    ok: true,
    problem: {
      target: { lat: target.lat, lon: target.lon },
      tileSiteId: p.tileSiteId,
      fromMs: p.fromMs,
      days: p.days,
      missionDays: sc.missionDays,
      minSunDays: p.minSunDays,
      roverId: useRoverStore.getState().roverId,
      minRoverSocPct: p.minRoverSocPct,
      radiusM: p.radiusM,
      hardware: { ...sc.hardwareLimits },
      linkMarginDeg: sc.linkMarginDeg,
      requireDsn: sc.requireDsn,
      scienceWeight: sc.scienceWeight,
    },
  }
}
