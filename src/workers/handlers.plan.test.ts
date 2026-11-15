import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { computePlan, rankDays, withRefined } from '../astro/planner.ts'
import { fixtureDem, fixtureIllum, fixtureProblem } from '../astro/plannerFixture.ts'
import type { PlanDay } from '../astro/plannerTypes.ts'
import { handleRequest } from './handlers.ts'
import {
  type DemRef,
  type IllumRef,
  PLAN_EXPIRED,
  PLAN_KEEP,
  type PlanFinishResult,
  type PlanPrepareResult,
} from './protocol.ts'

/**
 * The planner jobs through the request handler, as the worker (and the in-thread fallback of
 * astroClient) runs them. The rasters are served by a stubbed fetch; the DE441 table is absent,
 * so the IAU model is used, as in the other tests.
 */
// Horizons and traverses on a loaded machine: well past the 5 s default.
vi.setConfig({ testTimeout: 30_000 })

const dem = fixtureDem()
const illum = fixtureIllum()
const { data: demData, ...demMeta } = dem
const { data: illumData, ...illumMeta } = illum
const dems: DemRef[] = [{ bin: 'test://plan-dem.bin', meta: demMeta }]
const illumRef: IllumRef = { bin: 'test://plan-illum.bin', meta: illumMeta }
// A small radius: a dozen candidates instead of sixty.
const problem = fixtureProblem({ days: 4, radiusM: 260 })

beforeAll(() => {
  vi.stubGlobal('fetch', async (url: string) => {
    const body =
      url === dems[0].bin ? demData.buffer : url === illumRef.bin ? illumData.buffer : null
    return {
      ok: body !== null,
      status: body ? 200 : 404,
      arrayBuffer: async () => body!.slice(0),
      json: async () => ({}),
    }
  })
})
afterAll(() => vi.unstubAllGlobals())

const prepare = () =>
  handleRequest({
    kind: 'planPrepare',
    problem,
    dems,
    illum: illumRef,
  }) as Promise<PlanPrepareResult>

describe('planner jobs', () => {
  it('prepare → days in batches → finish gives the same plan as computePlan', async () => {
    const p = await prepare()
    expect(p.planId).toBeTruthy()
    expect(p.candidates.length).toBeGreaterThan(3)
    const days: PlanDay[] = []
    for (let from = 0; from < problem.days; from += 3) {
      const batch = (await handleRequest({
        kind: 'planDays',
        planId: p.planId,
        from,
        count: 3,
      })) as PlanDay[]
      days.push(...batch)
    }
    // The last batch stops at the end of the range.
    expect(days).toHaveLength(problem.days)
    const top = rankDays(days)
    const picks = (await handleRequest({
      kind: 'planFinish',
      planId: p.planId,
      top,
    })) as PlanFinishResult
    expect(picks).toHaveLength(top.length)
    const result = {
      problem,
      ice: p.ice,
      candidates: p.candidates,
      ...withRefined(days, top, picks),
      complete: true,
    }
    expect(result).toEqual(computePlan([dem], illum, problem))
    expect(structuredClone(result)).toEqual(result)
    // A day that was never evaluated has no pick to refine.
    expect(
      await handleRequest({ kind: 'planFinish', planId: p.planId, top: [problem.days + 5] }),
    ).toEqual([null])
  })

  it(`keeps the last ${PLAN_KEEP} plans and rejects older ids`, async () => {
    const first = await prepare()
    const others = []
    for (let i = 0; i < PLAN_KEEP; i++) others.push(await prepare())
    expect(new Set([first, ...others].map((x) => x.planId)).size).toBe(PLAN_KEEP + 1)
    await expect(
      handleRequest({ kind: 'planDays', planId: first.planId, from: 0, count: 1 }),
    ).rejects.toThrow(PLAN_EXPIRED)
    await expect(
      handleRequest({ kind: 'planFinish', planId: first.planId, top: [0] }),
    ).rejects.toThrow(PLAN_EXPIRED)
    for (const p of others)
      expect(
        await handleRequest({ kind: 'planDays', planId: p.planId, from: 0, count: 1 }),
      ).toHaveLength(1)
  })

  it('fails with a clear message when there is no ice near the target', async () => {
    await expect(
      handleRequest({
        kind: 'planPrepare',
        problem: { ...problem, target: { lat: -89.96, lon: -90 } },
        dems,
        illum: illumRef,
      }),
    ).rejects.toThrow('no-ice-near-target')
  })
})
