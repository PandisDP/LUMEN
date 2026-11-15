import { describe, expect, it, vi } from 'vitest'
import { energyPreset } from '../config/energyProfiles.ts'
import { DAY_MS } from './constants.ts'
import { surfaceDistance } from './frames.ts'
import { classifySite } from './hardware.ts'
import { computeHorizonMask } from './horizonFromDem.ts'
import { ICE_RADIUS_M, combinedScore, computeIceAccess, scienceScore } from './iceAccess.ts'
import { isPsrAt } from './illumination.ts'
import {
  PLAN_MAX_CANDIDATES,
  PLAN_MIN_SEPARATION_M,
  PLAN_NO_GROUND,
  PLAN_NO_ICE,
  PLAN_ROVER_TRIES,
  PLAN_SLOPE_RADIUS_M,
  computePlan,
  evaluateRange,
  lightSpanDays,
  planDay,
  prepareCandidates,
  rankDays,
  refinePick,
  roverViolation,
  withRefined,
} from './planner.ts'
import { fixtureDem, fixtureIllum, fixturePoint, fixtureProblem } from './plannerFixture.ts'
import { PLAN_TOP, type PlanDay, type PlanPick, type PlanViolation } from './plannerTypes.ts'
import { computeDateSweep, computeScenario } from './scenario.ts'
import { SLOPE_SAFE_DEG, slopeAt, slopeStats } from './slope.ts'
import { type TraverseSummary, computeTraverse } from './traverse.ts'

// Horizons and traverses on a loaded machine: well past the 5 s default.
vi.setConfig({ testTimeout: 30_000 })

const grids = [fixtureDem()]
const illum = fixtureIllum()
const base = fixtureProblem()
// Candidates depend on the target, the radius and the rover limit only: shared by the tests.
// Fewer than the real 60 to keep the suite quick.
const few = { maxCandidates: 24 }
const prepared = prepareCandidates(grids, illum, base, few)
const total = prepared.candidates.length + prepared.internals.noRoute
const sum = (r: PlanDay['rejected']) => Object.values(r).reduce((a, b) => a + b, 0)

function daysOf(patch: Parameters<typeof fixtureProblem>[0] = {}) {
  const problem = fixtureProblem(patch)
  const tables = evaluateRange(prepared, problem)
  const days = tables.dayMs.map((_, d) => planDay(prepared, tables, problem, d))
  return { problem, tables, days }
}

describe('prepareCandidates', () => {
  it('finds the ice cell and safe, lit, spaced-out landing points with a route to it', () => {
    expect(isPsrAt(illum, prepared.ice.lat, prepared.ice.lon)).toBe(true)
    expect(
      surfaceDistance(prepared.ice.lat, prepared.ice.lon, base.target.lat, base.target.lon),
    ).toBeLessThan(100)
    const cs = prepared.candidates
    expect(cs.length).toBeGreaterThan(15)
    expect(total).toBeLessThanOrEqual(few.maxCandidates)
    expect(PLAN_MAX_CANDIDATES).toBeGreaterThanOrEqual(few.maxCandidates)
    cs.forEach((c, i) => {
      expect(c.id).toBe(i)
      expect(c.slopeDeg).toBeLessThan(SLOPE_SAFE_DEG)
      expect(c.slopeDeg).toBeCloseTo(slopeAt(grids[0], c.lat, c.lon), 6)
      expect(isPsrAt(illum, c.lat, c.lon)).toBe(false)
      expect(c.distToTargetM).toBeLessThanOrEqual(base.radiusM + 30)
      expect(c.routeM).toBeGreaterThan(0)
      // Never shorter than the straight line to the ice cell (100 m wide).
      const straight = surfaceDistance(c.lat, c.lon, prepared.ice.lat, prepared.ice.lon)
      expect(c.routeM).toBeGreaterThan(straight - 80)
      expect(c.routeMaxSlopeDeg).toBeLessThanOrEqual(base.hardware.roverMaxSlopeDeg)
      // Coordinates survive the 4-decimal custom-site id and URL.
      expect(Number(c.lat.toFixed(4))).toBe(c.lat)
      expect(Number(c.lon.toFixed(4))).toBe(c.lon)
    })
    for (let i = 0; i < cs.length; i++)
      for (let j = i + 1; j < cs.length; j++)
        expect(surfaceDistance(cs[i].lat, cs[i].lon, cs[j].lat, cs[j].lon)).toBeGreaterThanOrEqual(
          PLAN_MIN_SEPARATION_M - 10,
        )
    // The mix: some close to the ice, some far up the dome.
    const routes = cs.map((c) => c.routeM)
    expect(Math.min(...routes)).toBeLessThan(200)
    expect(Math.max(...routes)).toBeGreaterThan(600)
  })

  it('fails clearly when the target has no permanent shadow nearby', () => {
    const lit = fixturePoint(-1200, 0)
    expect(() => prepareCandidates(grids, illum, fixtureProblem({ target: lit }))).toThrow(
      PLAN_NO_ICE,
    )
  })

  it('fails clearly when there is nowhere safe and lit to land around the target', () => {
    // Everything within 150 m of the middle of the shadowed patch is in shadow.
    const deep = fixtureProblem({ target: fixturePoint(1100, 0), radiusM: 150 })
    expect(() => prepareCandidates(grids, illum, deep)).toThrow(PLAN_NO_GROUND)
  })

  it('counts the points with no drivable route', () => {
    // A rover that climbs nothing: the dome itself (2.3°) is too steep.
    const p = prepareCandidates(
      grids,
      illum,
      fixtureProblem({ hardware: { ...base.hardware, roverMaxSlopeDeg: 1 } }),
      few,
    )
    expect(p.candidates).toHaveLength(0)
    expect(p.internals.noRoute).toBeGreaterThan(15)
    const problem = fixtureProblem({ days: 1 })
    const day = planDay(p, evaluateRange(p, problem), problem, 0)
    expect(day.best).toBeNull()
    expect(day.rejected).toEqual({ 'no-route': p.internals.noRoute })
    expect(day.mainViolation).toBe('no-route')
  })
})

describe('planDay', () => {
  const { problem, tables, days } = daysOf()

  it('gives a pick on the good days and says why on the others', () => {
    expect(days.map((d) => d.dayMs)).toEqual(
      Array.from({ length: base.days }, (_, i) => base.fromMs + i * DAY_MS),
    )
    expect(days.filter((d) => d.best).length).toBeGreaterThanOrEqual(3)
    expect(days.some((d) => !d.best)).toBe(true)
    for (const d of days) {
      if (d.best) {
        expect(d.mainViolation).toBeNull()
        // The whole mission: to the ice, every sample, and back before the mission ends.
        expect(d.best.rover.reaches).toBe(true)
        expect(d.best.rover.samplesDone).toBe(problem.samples)
        expect(d.best.rover.returns).toBe(true)
        expect(d.best.rover.marginH!).toBeGreaterThanOrEqual(0)
        expect(d.best.rover.totalH).toBeCloseTo(problem.missionDays * 24 - d.best.rover.marginH!, 6)
        expect(d.best.rover.totalH).toBeGreaterThan(
          d.best.rover.travelH + problem.samples * problem.sampleH,
        )
        expect(d.best.rover.endSocPct).toBeGreaterThanOrEqual(d.best.rover.minSocPct)
        expect(d.best.rover.minSocPct).toBeGreaterThanOrEqual(problem.minRoverSocPct)
        expect(d.best.sunFromLandingH).toBeGreaterThanOrEqual(problem.minSunDays * 24)
        expect(d.best.sunFromLandingH).toBeLessThanOrEqual(lightSpanDays(problem) * 24)
        expect(['good', 'warn']).toContain(d.best.verdict)
        const c = prepared.candidates[d.best.candidateId]
        expect(d.best).toMatchObject({ lat: c.lat, lon: c.lon, routeM: c.routeM })
        expect(d.best.score).toBe(d.best.engineeringScore)
      } else {
        expect(d.mainViolation).not.toBeNull()
        expect(d.rejected[d.mainViolation!]).toBeGreaterThan(0)
        // Nobody got as far as the rover: every candidate was rejected by a cheap constraint.
        expect(sum(d.rejected)).toBe(total)
      }
      expect(sum(d.rejected)).toBeLessThanOrEqual(total - (d.best ? 1 : 0))
    }
  })

  it('agrees with an independent brute force over the candidates of each day', () => {
    // Rover requirement off, so the day's pick is simply the best-scored survivor.
    const free = daysOf({ minRoverSocPct: 0 })
    const horizons = prepared.candidates.map((c) =>
      computeHorizonMask(grids, c.lat, c.lon, { azStepDeg: 1, growth: 0.01 }),
    )
    free.days.forEach((day, d) => {
      const rejected: Partial<Record<PlanViolation, number>> = {}
      const add = (v: PlanViolation) => (rejected[v] = (rejected[v] ?? 0) + 1)
      const scored: { id: number; score: number; routeM: number }[] = []
      prepared.candidates.forEach((c, k) => {
        const h = horizons[k]
        const [m] = computeDateSweep({
          site: { lat: c.lat, lon: c.lon, heightM: h.terrainHeightM },
          mask: h,
          fromMs: day.dayMs,
          days: lightSpanDays(free.problem) - free.problem.missionDays,
          missionDays: free.problem.missionDays,
        })
        const p90 = slopeStats(grids[0], c.lat, c.lon, PLAN_SLOPE_RADIUS_M).p90
        const v = classifySite(free.problem.hardware, { ...m, slopeP90Deg: p90 })
        if (!m.sunAtLanding) add('no-sun-at-landing')
        else if (m.sunFromLandingH < free.problem.minSunDays * 24) add('short-light')
        else if (v.verdict === 'bad') add(v.failed[0])
        else scored.push({ id: c.id, score: m.score, routeM: c.routeM })
      })
      const best = scored.sort((a, b) => b.score - a.score || a.routeM - b.routeM)[0]
      expect(day.best?.candidateId ?? null).toBe(best ? best.id : null)
      expect(day.best?.score ?? null).toBe(best ? best.score : null)
      expect(day.rejected).toEqual(rejected)
      // The same sweep as the tables (the cap on the light only matters when it is reached).
      if (day.best) expect(free.tables.dates[day.best.candidateId][d].startMs).toBe(day.dayMs)
    })
    expect(free.days.some((x) => x.best)).toBe(true)
  })

  it('rejects every candidate for short light when more is asked than any lit run', () => {
    const r = daysOf({ days: 3, minSunDays: 20 })
    for (const d of r.days) {
      expect(d.best).toBeNull()
      expect(d.mainViolation).toBe('short-light')
      expect(sum(d.rejected)).toBe(total)
      expect(Object.keys(d.rejected).sort()).toEqual(
        d.rejected['no-sun-at-landing'] ? ['no-sun-at-landing', 'short-light'] : ['short-light'],
      )
    }
  })

  it('rejects for the link when the hardware needs the Earth and it is not there', () => {
    // A 10° link margin: at the pole the Earth never climbs that high.
    const r = daysOf({
      days: 2,
      linkMarginDeg: 10,
      hardware: { ...base.hardware, minDtePct: 100 },
    })
    for (const d of r.days) {
      expect(d.best).toBeNull()
      expect(d.mainViolation).toBe('dte')
      expect(d.rejected.dte).toBeGreaterThan(total / 2)
      expect(sum(d.rejected)).toBe(total)
    }
  })

  it('rejects for the rover when it cannot keep the battery asked for', () => {
    const r = daysOf({ days: 2, minRoverSocPct: 99 })
    for (const d of r.days) {
      expect(d.best).toBeNull()
      expect(d.mainViolation).toBe('rover-battery')
      const tried = (d.rejected['rover-battery'] ?? 0) + (d.rejected['rover-unreachable'] ?? 0)
      expect(tried).toBeGreaterThanOrEqual(1)
      expect(tried).toBeLessThanOrEqual(PLAN_ROVER_TRIES)
      expect(sum(d.rejected)).toBeLessThanOrEqual(total)
    }
    // With a requirement only the short drives meet, the pick moves closer to the ice.
    const loose = daysOf({ days: 1, minRoverSocPct: 0 }).days[0].best!
    const strict = daysOf({ days: 1, minRoverSocPct: loose.rover.minSocPct + 0.5 }).days[0]
    if (strict.best) {
      expect(strict.best.routeM).toBeLessThan(loose.routeM)
      expect(strict.best.rover.minSocPct).toBeGreaterThanOrEqual(loose.rover.minSocPct + 0.5)
    }
    expect(strict.rejected['rover-battery']).toBeGreaterThanOrEqual(1)
  })

  // The cached trips of a problem that differs from the base one in `samples × sampleH`.
  const trips = (samples: number, sampleH: number, missionDays = base.missionDays) =>
    [...prepared.internals.roverCache]
      .filter(([key]) => key.includes(`:${samples}:${sampleH}:${missionDays}:`))
      .map(([, summary]) => summary)

  it('rejects for the samples when the work in the shadow drains the battery', () => {
    // The app's default workload, 3 × 2 h at 100 W: more than the micro-rover's 600 Wh allow.
    const r = daysOf({ samples: 3, sampleH: 2 })
    days.forEach((ok, i) => {
      const d = r.days[i]
      expect(d.best).toBeNull()
      if (!ok.best) return
      expect(d.mainViolation).toBe('rover-samples')
      expect(d.rejected['rover-samples']).toBeGreaterThanOrEqual(1)
      expect(d.rejected['rover-samples']).toBeLessThanOrEqual(PLAN_ROVER_TRIES)
    })
    const sims = trips(3, 2)
    expect(sims.length).toBeGreaterThanOrEqual(1)
    for (const s of sims) {
      expect(s).toMatchObject({ reaches: true, reason: 'samples', returns: false, success: false })
      expect(s.samplesDone).toBeLessThan(3)
      expect(roverViolation(s, 0)).toBe('rover-samples')
    }
  })

  it('rejects for the return when the battery left after the work does not get it home', () => {
    // One 4.5 h sample is finished with ~20 %: the first metres back, still in the shadow, are
    // too many.
    const r = daysOf({ days: 1, samples: 1, sampleH: 4.5 })
    const [d] = r.days
    expect(d.best).toBeNull()
    expect(d.mainViolation).toBe('rover-no-return')
    expect(d.rejected['rover-no-return']).toBeGreaterThanOrEqual(1)
    const sims = trips(1, 4.5).filter((s) => !s.returns)
    expect(sims.length).toBeGreaterThanOrEqual(1)
    for (const s of sims) {
      expect(s).toMatchObject({ reaches: true, samplesDone: 1, reason: 'battery', onTime: false })
      expect(s.marginH).toBeNull()
      expect(roverViolation(s, 0)).toBe('rover-no-return')
    }
  })

  it('rejects for the deadline when it is back after the end of the mission', () => {
    // A 3 h mission and a 3 h sample: the rover does everything, but the drive makes it late.
    const r = daysOf({ missionDays: 0.125, samples: 1, sampleH: 3 })
    const solved = r.days.filter((d) => (d.rejected['rover-late'] ?? 0) > 0)
    expect(solved.length).toBeGreaterThanOrEqual(3)
    for (const d of solved) {
      expect(d.best).toBeNull()
      expect(d.mainViolation).toBe('rover-late')
    }
    const sims = trips(1, 3, 0.125)
    expect(sims.length).toBeGreaterThanOrEqual(1)
    for (const s of sims) {
      expect(s).toMatchObject({ reaches: true, samplesDone: 1, returns: true, onTime: false })
      expect(s).toMatchObject({ reason: 'late', success: false })
      expect(s.marginH!).toBeLessThan(0)
      expect(s.totalH).toBeCloseTo(3 - s.marginH!, 6)
      expect(s.minSocPct).toBeGreaterThan(base.minRoverSocPct)
      expect(roverViolation(s, 0)).toBe('rover-late')
    }
    // The same trip with a day to do it in is a pick, with the margin to show for it.
    const roomy = daysOf({ days: 1, missionDays: 1, samples: 1, sampleH: 3 }).days[0].best!
    expect(roomy.rover).toMatchObject({ reaches: true, samplesDone: 1, returns: true })
    expect(roomy.rover.marginH!).toBeCloseTo(24 - roomy.rover.totalH, 6)
    expect(roomy.rover.marginH!).toBeGreaterThan(18)
  })

  it('names the first requirement of the round trip that fails', () => {
    const ok = {
      reaches: true,
      samples: 3,
      samplesDone: 3,
      returns: true,
      onTime: true,
      minSocPct: 35,
    } as TraverseSummary
    expect(roverViolation(ok, 20)).toBeNull()
    expect(roverViolation(ok, 35)).toBeNull()
    expect(roverViolation(ok, 36)).toBe('rover-battery')
    expect(roverViolation({ ...ok, onTime: false }, 36)).toBe('rover-late')
    expect(roverViolation({ ...ok, returns: false, onTime: false }, 36)).toBe('rover-no-return')
    expect(roverViolation({ ...ok, samplesDone: 2, returns: false }, 36)).toBe('rover-samples')
    expect(roverViolation({ ...ok, reaches: false, samplesDone: 0 }, 36)).toBe('rover-unreachable')
  })

  it('plans the route once per candidate, whatever the samples, the mission or the day', () => {
    const plans = prepared.internals.traverses.size
    const sims = prepared.internals.roverCache.size
    const a = daysOf({ days: 2, samples: 2, sampleH: 0.5 })
    expect(prepared.internals.roverCache.size).toBeGreaterThan(sims)
    // Same candidates as the base problem: their plans and horizons were already there.
    expect(a.days[0].best!.candidateId).toBe(days[0].best!.candidateId)
    expect(prepared.internals.traverses.size).toBe(plans)
    // More work, same day and point: a longer trip, less margin, less battery.
    expect(a.days[0].best!.rover.samplesDone).toBe(2)
    const light = daysOf({ days: 1, samples: 1, sampleH: 0.5 }).days[0].best!
    expect(a.days[0].best!.rover.totalH).toBeCloseTo(light.rover.totalH + 0.5, 6)
    expect(a.days[0].best!.rover.marginH!).toBeCloseTo(light.rover.marginH! - 0.5, 6)
    expect(a.days[0].best!.rover.minSocPct).toBeLessThan(light.rover.minSocPct)
    expect(a.days[0].best!.rover.travelH).toBe(light.rover.travelH)
  })

  it('blends the science score in by weight', () => {
    const sci = daysOf({ days: 1, scienceWeight: 1, minRoverSocPct: 0 }).days[0].best!
    const c = prepared.candidates[sci.candidateId]
    expect(sci.scienceScore).toBe(
      scienceScore({ routeM: c.routeM, maxSlopeDeg: c.routeMaxSlopeDeg, reachable: true }, 20),
    )
    expect(sci.score).toBe(sci.scienceScore)
    const half = daysOf({ days: 1, scienceWeight: 0.5, minRoverSocPct: 0 }).days[0].best!
    expect(half.score).toBe(combinedScore(half.engineeringScore, half.scienceScore, 0.5))
  })

  it('caches the traverse of a candidate and day', () => {
    const before = prepared.internals.roverCache.size
    planDay(prepared, tables, problem, 0)
    expect(prepared.internals.roverCache.size).toBe(before)
  })
})

describe('rankDays and withRefined', () => {
  const pick = (score: number, marginH: number | null, minSocPct: number, routeM = 500) =>
    ({ score, routeM, rover: { marginH, minSocPct } }) as PlanPick
  const day = (i: number, best: PlanPick | null): PlanDay => ({
    dayMs: i * DAY_MS,
    best,
    rejected: {},
    mainViolation: best ? null : 'short-light',
  })

  it('sorts by score, then larger time margin, then battery, and keeps PLAN_TOP', () => {
    const days = [
      day(0, pick(70, 200, 50)),
      day(1, null),
      day(2, pick(90, 30, 40)),
      day(3, pick(90, 60, 40)),
      day(4, pick(90, 60, 60)),
      day(5, pick(80, 300, 10)),
      day(6, pick(60, 300, 10)),
      day(7, pick(90, 60, 60)),
    ]
    expect(rankDays(days)).toEqual([4, 7, 3, 2, 5])
    expect(rankDays([day(0, null)])).toEqual([])
  })

  it('does not let the length of the route break a tie any more', () => {
    // Same score: the day with more time to spare wins, however long its route.
    const days = [day(0, pick(90, 10, 80, 100)), day(1, pick(90, 40, 30, 900))]
    expect(rankDays(days)).toEqual([1, 0])
    // Same score and margin: the fuller battery.
    expect(rankDays([day(0, pick(90, 40, 30, 100)), day(1, pick(90, 40, 31, 900))])).toEqual([1, 0])
    // A pick without a margin (no deadline) counts as none to spare.
    expect(rankDays([day(0, pick(90, null, 99)), day(1, pick(90, 1, 20))])).toEqual([1, 0])
  })

  it('patches the refined picks and re-sorts the shortlist among itself', () => {
    const days = [day(0, pick(90, 1, 1)), day(1, pick(80, 1, 1)), day(2, pick(70, 1, 1))]
    const top = rankDays(days)
    const r = withRefined(days, top, [pick(75, 1, 1), null, pick(79, 1, 1)])
    expect(r.top).toEqual([1, 2, 0])
    expect(r.days.map((d) => d.best!.score)).toEqual([75, 80, 79])
    expect(days[0].best!.score).toBe(90)
  })
})

describe('computePlan', () => {
  const seen: number[] = []
  const result = computePlan(grids, illum, base, (_, i) => seen.push(i), few)

  it('ranks the days with a solution, without duplicates, best first', () => {
    expect(result.complete).toBe(true)
    expect(result.days).toHaveLength(base.days)
    expect(seen).toEqual(result.days.map((_, i) => i))
    expect(result.top.length).toBeGreaterThanOrEqual(3)
    expect(result.top.length).toBeLessThanOrEqual(PLAN_TOP)
    expect(new Set(result.top).size).toBe(result.top.length)
    const picks = result.top.map((i) => result.days[i].best!)
    for (const p of picks) expect(p).toBeTruthy()
    for (let i = 1; i < picks.length; i++) {
      expect(picks[i - 1].score).toBeGreaterThanOrEqual(picks[i].score)
      if (picks[i - 1].score === picks[i].score)
        expect(picks[i - 1].rover.marginH!).toBeGreaterThanOrEqual(picks[i].rover.marginH!)
    }
    // Nothing left out scores higher than the last of the shortlist (hourly figures).
    if (result.top.length < PLAN_TOP)
      expect(result.days.filter((d) => d.best).length).toBe(result.top.length)
  })

  it('is deterministic and stays plain data', () => {
    const again = computePlan(grids, illum, base, undefined, few)
    expect(again).toEqual(result)
    const clone = structuredClone(result)
    expect(clone).toEqual(result)
    expect(JSON.parse(JSON.stringify(result))).toEqual(result)
    // Small: no series, masks or routes in the result.
    expect(JSON.stringify(result).length).toBeLessThan(40_000)
  })

  it('shows on a shortlisted card what the views compute for that point and date', () => {
    const dayIndex = result.top[0]
    const day = result.days[dayIndex]
    const pick = day.best!
    // The horizon of a custom site on the tile (catalog.fetchDetail → `customHorizon` job).
    const h = computeHorizonMask(grids, pick.lat, pick.lon, { azStepDeg: 0.5, growth: 0.006 })
    const mask = { azStepDeg: h.azStepDeg, elevDeg: Array.from(h.elevDeg) }
    const m = computeScenario({
      site: { lat: pick.lat, lon: pick.lon, heightM: h.terrainHeightM },
      mask,
      startMs: day.dayMs,
      missionDays: base.missionDays,
      linkMarginDeg: base.linkMarginDeg,
      requireDsn: base.requireDsn,
    }).metrics
    expect(pick.engineeringScore).toBe(m.score)
    expect(pick.score).toBe(combinedScore(m.score, pick.scienceScore, base.scienceWeight))
    expect(pick.energyPct).toBeCloseTo(m.energyPct, 6)
    expect(pick.sunlitPct).toBeCloseTo(m.sunlitPct, 6)
    expect(pick.dtePct).toBeCloseTo(m.dtePct, 6)
    expect(pick.longestDarkH).toBeCloseTo(m.longestDarkH, 6)
    expect(pick.heightM).toBe(h.terrainHeightM)

    // The ice card and the rover: useIceAccess with the scenario's iceTarget, then useTraverse.
    const route = computeIceAccess(grids[0], illum, pick.lat, pick.lon, {
      radiusM: ICE_RADIUS_M,
      roverMaxSlopeDeg: base.hardware.roverMaxSlopeDeg,
      target: base.target,
    })
    expect(route.routeM).toBe(pick.routeM)
    expect(scienceScore(route, base.hardware.roverMaxSlopeDeg)).toBe(pick.scienceScore)
    const t = computeTraverse(
      grids,
      {
        lat: pick.lat,
        lon: pick.lon,
        path: route.path,
        startMs: day.dayMs,
        energy: energyPreset(base.roverId)!.profile,
        vehicleId: base.roverId,
        roverMaxSlopeDeg: base.hardware.roverMaxSlopeDeg,
        linkMarginDeg: base.linkMarginDeg,
        requireDsn: base.requireDsn,
        samples: base.samples,
        sampleH: base.sampleH,
        deadlineMs: day.dayMs + base.missionDays * DAY_MS,
      },
      illum,
    ).summary
    expect(t.success).toBe(true)
    // The one-way route of the card is the outbound leg of the trip (same path, resampled).
    expect(t.lengthM).toBeCloseTo(2 * t.outLengthM, 6)
    expect(Math.abs(t.outLengthM - pick.routeM)).toBeLessThan(0.1 * pick.routeM + 20)
    expect(pick.rover).toEqual({
      reaches: t.reaches,
      samplesDone: t.samplesDone,
      returns: t.returns,
      minSocPct: t.minSocPct,
      endSocPct: t.endSocPct,
      travelH: t.outDriveH + t.outWaitH,
      totalH: t.totalH,
      marginH: t.marginH,
      hoursInShadow: t.hoursInShadow,
      dtePct: t.dtePct,
    })
    expect(pick.rover.samplesDone).toBe(base.samples)
    expect(pick.rover.travelH).toBeCloseTo((t.arrivalMs! - day.dayMs) / 3_600_000, 6)
    expect(pick.rover.totalH).toBeCloseTo((t.returnMs! - day.dayMs) / 3_600_000, 6)
    expect(pick.rover.marginH).toBe(base.missionDays * 24 - (t.returnMs! - day.dayMs) / 3_600_000)
  })

  it('keeps the hourly pick close to its refined figures', () => {
    const { problem, days } = daysOf()
    for (const i of result.top) {
      const coarse = days[i].best!
      const fine = refinePick(prepared, problem, days[i])!
      expect(fine).toEqual(result.days[i].best)
      expect(fine.candidateId).toBe(coarse.candidateId)
      expect(Math.abs(fine.score - coarse.score)).toBeLessThanOrEqual(3)
      expect(Math.abs(fine.sunFromLandingH - coarse.sunFromLandingH)).toBeLessThanOrEqual(2)
      expect(fine.rover).toEqual(coarse.rover)
    }
    expect(
      refinePick(
        prepared,
        problem,
        days.find((d) => !d.best)!,
      ),
    ).toBeNull()
  })
})
