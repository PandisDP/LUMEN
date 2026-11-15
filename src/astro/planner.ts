import { energyPreset } from '../config/energyProfiles.ts'
import { DAY_MS, HOUR_MS } from './constants.ts'
import { type DemGrid, demCovers, latLonToPixel, pixelToLatLon } from './dem.ts'
import { surfaceDistance } from './frames.ts'
import { type Constraint, classifySite } from './hardware.ts'
import type { HorizonMask } from './horizon.ts'
import { computeHorizonMask } from './horizonFromDem.ts'
import { combinedScore, computeIceAccess, nearestPsrCell, scienceScore } from './iceAccess.ts'
import { ILLUM_NODATA, type IllumGrid } from './illumination.ts'
import { type DateCandidate, VISIBLE_THRESHOLD, sweepLandingDates } from './metrics.ts'
import {
  PLAN_TOP,
  type PlanCandidate,
  type PlanDay,
  type PlanPick,
  type PlanProblem,
  type PlanResult,
  type PlanViolation,
} from './plannerTypes.ts'
import { cachedEphemeris, computeScenario, scenarioStepMinutes } from './scenario.ts'
import { evaluateSite } from './series.ts'
import { SLOPE_CAUTION_DEG, SLOPE_SAFE_DEG, slopeAtPixel, slopeStats } from './slope.ts'
import {
  type PreparedTraverse,
  type TraverseJobInput,
  type TraverseSummary,
  prepareTraverse,
  simulatePrepared,
} from './traverse.ts'

/**
 * Engine of the mission planner (contract in plannerTypes.ts). The horizon of a landing point
 * and its rover route to the ice do not depend on the date, so they are computed once per
 * candidate (`prepareCandidates`); one hourly series per candidate then covers the whole range
 * of dates (`evaluateRange`), and each day only filters, ranks and drives the rover for its best
 * candidates (`planDay`): out to the ice, the sampling and back before the mission ends (all
 * required). The shortlisted days are finally recomputed the way the views do
 * (`refinePick`), so a card shows the figures the user finds on opening it.
 *
 * Pure: no DOM, no worker APIs. The heavy per-candidate data stays in `PlanPrepared`, out of
 * the (small, structured-clone friendly) PlanResult.
 */

/** Grid on which landing points are looked for, m. */
export const PLAN_SPACING_M = 40
/** Candidates kept after the preselection (each costs a horizon and a route). */
export const PLAN_MAX_CANDIDATES = 60
/** Preselected candidates are at least this far apart, m. */
export const PLAN_MIN_SEPARATION_M = 80
/** The hardware slope limit is judged on the p90 slope within this radius, as for the sites. */
export const PLAN_SLOPE_RADIUS_M = 500
/** Rover traverses simulated per day at most. */
export const PLAN_ROVER_TRIES = 3
/**
 * Continuous light from touchdown is followed at least this far (days), and never further than
 * `lightSpanDays`: `sunFromLandingH` is capped there, the same for every day of the range.
 */
export const PLAN_LIGHT_LOOKAHEAD_DAYS = 30
/** Error message of a plan whose target has no permanently shadowed ground nearby. */
export const PLAN_NO_ICE = 'no-ice-near-target'
/**
 * Error message of a plan with nowhere to land: no safe, sunlit ground within the radius of the
 * target (e.g. a target deep on the floor of a large shadowed crater).
 */
export const PLAN_NO_GROUND = 'no-safe-ground'

/** Order in which the constraints are applied (ties of `mainViolation` go to the later one). */
export const PLAN_STAGES: readonly PlanViolation[] = [
  'no-route',
  'no-sun-at-landing',
  'short-light',
  'slope',
  'night',
  'dte',
  'rover-unreachable',
  'rover-samples',
  'rover-no-return',
  'rover-late',
  'rover-battery',
]
/** The stages decided by the rover's round trip (the tail of PLAN_STAGES). */
export const PLAN_ROVER_STAGES: readonly PlanViolation[] = PLAN_STAGES.slice(-5)

/** What is kept in memory per plan, aligned with `candidates`. */
export interface PlanInternals {
  grids: readonly DemGrid[]
  illum: IllumGrid
  /** Preselected points with no drivable route to the ice (dropped from `candidates`). */
  noRoute: number
  /** Safe, lit grid points found before the preselection. */
  safeCount: number
  masks: HorizonMask[]
  /** p90 slope within PLAN_SLOPE_RADIUS_M, deg. */
  slopeP90Deg: number[]
  /** Route vertices from computeIceAccess, landing end first. */
  paths: { lat: number; lon: number }[][]
  scienceScore: number[]
  /** Route plan and sky per candidate and rover settings (built on first use). */
  traverses: Map<string, PreparedTraverse>
  /** Traverse summaries per candidate, rover settings, workload, mission length and day. */
  roverCache: Map<string, TraverseSummary>
}

export interface PlanPrepared {
  ice: { lat: number; lon: number }
  candidates: PlanCandidate[]
  internals: PlanInternals
}

/** Per-candidate sweep of the whole range: `dates[k][d]` is candidate k landing on day d. */
export interface PlanTables {
  dayMs: number[]
  dates: DateCandidate[][]
  /** % of the mission with the Sun up, same indexing (the sweep does not carry it). */
  sunlitPct: Float32Array[]
}

const round4 = (v: number) => Math.round(v * 1e4) / 1e4

/** Same rule as optimize.ts: under the safe slope with nothing ≥ caution in the 3×3 around. */
function safeAt(g: DemGrid, c: number, r: number): number | null {
  const s = slopeAtPixel(g, c, r)
  if (!(s < SLOPE_SAFE_DEG)) return null
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      const n = slopeAtPixel(g, c + dc, r + dr)
      if (!(n < SLOPE_CAUTION_DEG)) return null
    }
  return s
}

interface Raw {
  c: number
  r: number
  lat: number
  lon: number
  h: number
  s: number
  light: number
  iceM: number
}

/**
 * Stages 1–3: the ice cell, the safe lit ground around the target, a preselection of it (a third
 * by yearly light, a third by height, the rest by nearness to the ice; spaced out so they do not
 * all sit on the same crest) and, for each, its horizon, landing slope and rover route.
 * Throws Error(PLAN_NO_ICE) when the target has no permanently shadowed cell nearby and
 * Error(PLAN_NO_GROUND) when there is no safe lit ground around it at all.
 */
export function prepareCandidates(
  grids: readonly DemGrid[],
  illum: IllumGrid,
  problem: PlanProblem,
  { maxCandidates = PLAN_MAX_CANDIDATES } = {},
): PlanPrepared {
  const fine = grids[0]
  const { target } = problem
  const cell = nearestPsrCell(illum, target.lat, target.lon)
  if (!cell) throw new Error(PLAN_NO_ICE)
  const ice = { lat: cell.lat, lon: cell.lon }

  const { c: cc, r: rc } = latLonToPixel(fine, target.lat, target.lon)
  const radPx = problem.radiusM / fine.scaleM
  const stride = Math.max(1, Math.round(PLAN_SPACING_M / fine.scaleM))
  const safe: Raw[] = []
  for (let r = Math.ceil(rc - radPx); r <= rc + radPx; r += stride) {
    for (let c = Math.ceil(cc - radPx); c <= cc + radPx; c += stride) {
      if ((c - cc) ** 2 + (r - rc) ** 2 > radPx * radPx) continue
      if (c < 1 || r < 1 || c >= fine.width - 1 || r >= fine.height - 1) continue
      const s = safeAt(fine, c, r)
      if (s === null) continue
      const p = pixelToLatLon(fine, c, r)
      // 4 decimals (≤ 3 m): the coordinates a custom site keeps in its id and in a shared URL.
      const lat = round4(p.lat)
      const lon = round4(p.lon)
      if (!demCovers(fine, lat, lon, 2)) continue
      const ip = latLonToPixel(illum, lat, lon)
      const ic = Math.round(ip.c)
      const ir = Math.round(ip.r)
      if (ic < 0 || ir < 0 || ic >= illum.width || ir >= illum.height) continue
      const light = illum.data[ir * illum.width + ic]
      // Never in permanent shadow; cells without data cannot be told apart from it.
      if (light === 0 || light === ILLUM_NODATA) continue
      safe.push({
        c,
        r,
        lat,
        lon,
        h: fine.data[r * fine.width + c],
        s,
        light,
        iceM: surfaceDistance(lat, lon, ice.lat, ice.lon),
      })
    }
  }

  if (!safe.length) throw new Error(PLAN_NO_GROUND)

  const order = (a: Raw, b: Raw) => a.r - b.r || a.c - b.c
  const byLight = [...safe].sort((a, b) => b.light - a.light || b.h - a.h || order(a, b))
  const byHeight = [...safe].sort((a, b) => b.h - a.h || order(a, b))
  const byIce = [...safe].sort((a, b) => a.iceM - b.iceM || order(a, b))
  const picked: Raw[] = []
  const sepPx = PLAN_MIN_SEPARATION_M / fine.scaleM
  const take = (list: Raw[], upTo: number) => {
    for (const x of list) {
      if (picked.length >= upTo) return
      if (picked.some((p) => Math.hypot(p.c - x.c, p.r - x.r) < sepPx)) continue
      picked.push(x)
    }
  }
  take(byLight, Math.round(maxCandidates / 3))
  take(byHeight, Math.round((2 * maxCandidates) / 3))
  take(byIce, maxCandidates)

  const rover = problem.hardware.roverMaxSlopeDeg
  const candidates: PlanCandidate[] = []
  const internals: PlanInternals = {
    grids,
    illum,
    noRoute: 0,
    safeCount: safe.length,
    masks: [],
    slopeP90Deg: [],
    paths: [],
    scienceScore: [],
    traverses: new Map(),
    roverCache: new Map(),
  }
  for (const x of picked) {
    // The route first: it is cheaper than the horizon and many points have none.
    const route = computeIceAccess(fine, illum, x.lat, x.lon, { roverMaxSlopeDeg: rover, target })
    if (!route.reachable || route.routeM === null || !route.path.length) {
      internals.noRoute++
      continue
    }
    let horizon
    try {
      horizon = computeHorizonMask(grids, x.lat, x.lon, { azStepDeg: 1, growth: 0.01 })
    } catch {
      continue
    }
    candidates.push({
      id: candidates.length,
      lat: x.lat,
      lon: x.lon,
      heightM: horizon.terrainHeightM,
      slopeDeg: x.s,
      distToTargetM: surfaceDistance(x.lat, x.lon, target.lat, target.lon),
      routeM: route.routeM,
      routeMaxSlopeDeg: route.maxSlopeDeg ?? 0,
    })
    internals.masks.push({ azStepDeg: horizon.azStepDeg, elevDeg: horizon.elevDeg })
    internals.slopeP90Deg.push(slopeStats(fine, x.lat, x.lon, PLAN_SLOPE_RADIUS_M).p90)
    internals.paths.push(route.path)
    internals.scienceScore.push(scienceScore(route, rover))
  }
  return { ice, candidates, internals }
}

/** Days the series reach past each landing date: the mission, the light required, a lunar day. */
export const lightSpanDays = (p: PlanProblem) =>
  Math.max(p.missionDays, p.minSunDays, PLAN_LIGHT_LOOKAHEAD_DAYS)

/** Stage 4: one hourly series per candidate over the whole range, swept once per day. */
export function evaluateRange(prepared: PlanPrepared, problem: PlanProblem): PlanTables {
  const stepMs = HOUR_MS
  const capH = lightSpanDays(problem) * 24
  const count = Math.ceil(((problem.days + lightSpanDays(problem)) * DAY_MS) / stepMs) + 1
  const eph = cachedEphemeris(problem.fromMs, stepMs, count)
  const win = Math.round((problem.missionDays * DAY_MS) / stepMs)
  const dates: DateCandidate[][] = []
  const sunlitPct: Float32Array[] = []
  prepared.candidates.forEach((c, k) => {
    const series = evaluateSite(
      eph,
      { lat: c.lat, lon: c.lon, heightM: c.heightM },
      prepared.internals.masks[k],
      problem.linkMarginDeg,
      problem.requireDsn,
    )
    dates.push(
      sweepLandingDates(series, problem.missionDays, 24)
        .slice(0, problem.days)
        .map((d) => ({ ...d, sunFromLandingH: Math.min(d.sunFromLandingH, capH) })),
    )
    const lit = new Int32Array(count + 1)
    for (let i = 0; i < count; i++)
      lit[i + 1] = lit[i] + (series.sunFrac[i] >= VISIBLE_THRESHOLD ? 1 : 0)
    sunlitPct.push(
      Float32Array.from({ length: problem.days }, (_, d) => {
        const i0 = d * 24
        return (100 * (lit[Math.min(count, i0 + win)] - lit[i0])) / Math.max(1, win)
      }),
    )
  })
  return {
    dayMs: Array.from({ length: problem.days }, (_, d) => problem.fromMs + d * DAY_MS),
    dates,
    sunlitPct,
  }
}

/** The first cheap constraint a candidate fails on a date, or null (stage 5). */
export function cheapViolation(
  problem: PlanProblem,
  slopeP90Deg: number,
  d: DateCandidate,
): PlanViolation | null {
  if (!d.sunAtLanding) return 'no-sun-at-landing'
  if (d.sunFromLandingH < problem.minSunDays * 24) return 'short-light'
  const v = classifySite(problem.hardware, {
    slopeP90Deg,
    longestDarkH: d.longestDarkH,
    dtePct: d.dtePct,
  })
  return v.verdict === 'bad' ? v.failed[0] : null
}

function traverseJob(prepared: PlanPrepared, problem: PlanProblem, k: number, dayMs: number) {
  const energy = energyPreset(problem.roverId)?.profile
  if (!energy) throw new Error(`unknown rover ${problem.roverId}`)
  const c = prepared.candidates[k]
  const job: TraverseJobInput = {
    lat: c.lat,
    lon: c.lon,
    path: prepared.internals.paths[k],
    startMs: dayMs,
    energy,
    vehicleId: problem.roverId,
    roverMaxSlopeDeg: problem.hardware.roverMaxSlopeDeg,
    linkMarginDeg: problem.linkMarginDeg,
    requireDsn: problem.requireDsn,
    // The instrument's power comes with the rover's profile (`energy.sampleW`).
    samples: problem.samples,
    sampleH: problem.sampleH,
    // Back at the lander before the surface mission ends.
    deadlineMs: dayMs + problem.missionDays * DAY_MS,
  }
  return job
}

/**
 * The rover's round trip of candidate k leaving at `dayMs` (same job as the app's; cached per
 * run). The departure is the landing instant and the deadline the end of the surface mission.
 */
function roverSummary(prepared: PlanPrepared, problem: PlanProblem, k: number, dayMs: number) {
  const { internals } = prepared
  // The plan and its sky depend on the rover and the link settings, not on the date nor on the
  // work asked for; the simulated trip depends on all of them and on the deadline.
  const tKey = `${k}:${problem.roverId}:${problem.linkMarginDeg}:${problem.requireDsn}`
  const key = `${tKey}:${problem.samples}:${problem.sampleH}:${problem.missionDays}:${dayMs}`
  let s = internals.roverCache.get(key)
  if (!s) {
    const job = traverseJob(prepared, problem, k, dayMs)
    let t = internals.traverses.get(tKey)
    if (!t) {
      t = prepareTraverse(internals.grids, job, internals.illum)
      internals.traverses.set(tKey, t)
    }
    s = simulatePrepared(t, job).summary
    internals.roverCache.set(key, s)
  }
  return s
}

const roverOf = (s: TraverseSummary): PlanPick['rover'] => ({
  reaches: s.reaches,
  samplesDone: s.samplesDone,
  returns: s.returns,
  minSocPct: s.minSocPct,
  endSocPct: s.endSocPct,
  travelH: s.outDriveH + s.outWaitH,
  totalH: s.totalH,
  marginH: s.marginH,
  hoursInShadow: s.hoursInShadow,
  dtePct: s.dtePct,
})

/** Why a simulated round trip does not make a day viable, or null when it does. */
export function roverViolation(s: TraverseSummary, minRoverSocPct: number): PlanViolation | null {
  if (!s.reaches) return 'rover-unreachable'
  if (s.samplesDone < s.samples) return 'rover-samples'
  if (!s.returns) return 'rover-no-return'
  if (!s.onTime) return 'rover-late'
  if (s.minSocPct < minRoverSocPct) return 'rover-battery'
  return null
}

/** Verdict of a pick: a limit failed after the refinement is reported as tight, not dropped. */
function verdictOf(problem: PlanProblem, slopeP90Deg: number, longestDarkH: number, dte: number) {
  const v = classifySite(problem.hardware, { slopeP90Deg, longestDarkH, dtePct: dte })
  const tight: Constraint[] = [...v.failed, ...v.tight]
  return { verdict: v.verdict === 'good' ? ('good' as const) : ('warn' as const), tight }
}

/**
 * Stages 5–6 for one day: the cheap constraints for every candidate, the survivors ranked by
 * score (ties: shorter route), and the rover driven for the best of them until one passes.
 * The rover must do it all: reach the ice, take every sample, return before the mission ends
 * and stay above the minimum battery throughout (`roverViolation`).
 * At most PLAN_ROVER_TRIES traverses per day: after a failure the next try is the best-scored
 * survivor with a shorter route than every one that failed (a longer drive from a worse point
 * is not expected to do better: the round trip only doubles what the distance costs in time and
 * energy). Survivors never tried are not counted in `rejected`.
 */
export function planDay(
  prepared: PlanPrepared,
  tables: PlanTables,
  problem: PlanProblem,
  dayIndex: number,
): PlanDay {
  const { candidates, internals } = prepared
  const dayMs = tables.dayMs[dayIndex]
  const rejected: Partial<Record<PlanViolation, number>> = {}
  const count = (v: PlanViolation, n = 1) => {
    if (n > 0) rejected[v] = (rejected[v] ?? 0) + n
  }
  count('no-route', internals.noRoute)

  const survivors: { k: number; score: number }[] = []
  candidates.forEach((_, k) => {
    const d = tables.dates[k][dayIndex]
    const v = cheapViolation(problem, internals.slopeP90Deg[k], d)
    if (v) count(v)
    else {
      const score = combinedScore(d.score, internals.scienceScore[k], problem.scienceWeight)
      survivors.push({ k, score })
    }
  })
  survivors.sort(
    (a, b) => b.score - a.score || candidates[a.k].routeM - candidates[b.k].routeM || a.k - b.k,
  )

  let best: PlanPick | null = null
  let shortestFailedM = Infinity
  let tries = 0
  for (const { k, score } of survivors) {
    if (tries >= PLAN_ROVER_TRIES) break
    const c = candidates[k]
    if (c.routeM >= shortestFailedM) continue
    tries++
    const s = roverSummary(prepared, problem, k, dayMs)
    const failed = roverViolation(s, problem.minRoverSocPct)
    if (failed) {
      count(failed)
      shortestFailedM = c.routeM
      continue
    }
    const d = tables.dates[k][dayIndex]
    best = {
      candidateId: c.id,
      lat: c.lat,
      lon: c.lon,
      heightM: c.heightM,
      slopeDeg: c.slopeDeg,
      routeM: c.routeM,
      score,
      engineeringScore: d.score,
      scienceScore: internals.scienceScore[k],
      energyPct: d.energyPct,
      sunlitPct: tables.sunlitPct[k][dayIndex],
      dtePct: d.dtePct,
      longestDarkH: d.longestDarkH,
      sunFromLandingH: d.sunFromLandingH,
      ...verdictOf(problem, internals.slopeP90Deg[k], d.longestDarkH, d.dtePct),
      rover: roverOf(s),
    }
    break
  }

  // What stopped the day: the rover when some candidate got that far, otherwise the constraint
  // that rejected most candidates (ties: the later one).
  let mainViolation: PlanViolation | null = null
  if (!best) {
    const stages = tries > 0 ? PLAN_ROVER_STAGES : PLAN_STAGES
    let max = 0
    for (const v of stages) {
      const n = rejected[v] ?? 0
      if (n > 0 && n >= max) {
        max = n
        mainViolation = v
      }
    }
  }
  return { dayMs, best, rejected, mainViolation }
}

/** Negative when `a` ranks first: score, then the larger time margin, then the fuller battery. */
const better = (a: PlanPick, b: PlanPick) =>
  b.score - a.score ||
  (b.rover.marginH ?? 0) - (a.rover.marginH ?? 0) ||
  b.rover.minSocPct - a.rover.minSocPct

/**
 * Stage 7: the days with a solution, best first: score, then more time to spare at the lander
 * before the mission ends, then the higher minimum battery.
 */
export function rankDays(days: readonly PlanDay[]): number[] {
  return days
    .map((d, i) => ({ d, i }))
    .filter((x) => x.d.best)
    .sort((a, b) => better(a.d.best!, b.d.best!) || a.i - b.i)
    .slice(0, PLAN_TOP)
    .map((x) => x.i)
}

/**
 * Stage 8: the pick of a day recomputed the way the views do when it is opened as a custom site
 * on the tile: horizon at 0.5° (the `customHorizon` job) and `computeScenario` at its default
 * step. Score, energy, light, link, night and continuous light are overwritten; the rover
 * figures already come from the same traverse job as the app's. A pick that the finer figures
 * put over a hardware limit is kept (the day was chosen on the hourly series) with that limit
 * listed in `tight` and verdict 'warn'.
 */
export function refinePick(
  prepared: PlanPrepared,
  problem: PlanProblem,
  day: PlanDay,
): PlanPick | null {
  const pick = day.best
  if (!pick) return null
  const { internals } = prepared
  const k = pick.candidateId
  const h = computeHorizonMask(internals.grids, pick.lat, pick.lon, {
    azStepDeg: 0.5,
    growth: 0.006,
  })
  const mask = { azStepDeg: h.azStepDeg, elevDeg: Array.from(h.elevDeg) }
  const site = { lat: pick.lat, lon: pick.lon, heightM: h.terrainHeightM }
  const { linkMarginDeg, requireDsn, missionDays } = problem
  const m = computeScenario({
    site,
    mask,
    startMs: day.dayMs,
    missionDays,
    linkMarginDeg,
    requireDsn,
  }).metrics
  // Continuous light on the same fine step, as far as the hourly series looked.
  const stepMs = scenarioStepMinutes(missionDays) * 60_000
  const count = Math.ceil((lightSpanDays(problem) * DAY_MS) / stepMs) + 1
  const fine = evaluateSite(cachedEphemeris(day.dayMs, stepMs, count), site, mask)
  let lit = 0
  while (lit < count && fine.sunFrac[lit] >= VISIBLE_THRESHOLD) lit++
  return {
    ...pick,
    heightM: h.terrainHeightM,
    score: combinedScore(m.score, internals.scienceScore[k], problem.scienceWeight),
    engineeringScore: m.score,
    energyPct: m.energyPct,
    sunlitPct: m.sunlitPct,
    dtePct: m.dtePct,
    longestDarkH: m.longestDarkH,
    sunFromLandingH: (Math.min(lit, count - 1) * stepMs) / HOUR_MS,
    ...verdictOf(problem, internals.slopeP90Deg[k], m.longestDarkH, m.dtePct),
  }
}

/**
 * Puts the refined picks of the shortlist into the days and re-sorts the shortlist among itself
 * (the refined scores can swap neighbours; days outside it keep their hourly figures).
 */
export function withRefined(
  days: readonly PlanDay[],
  top: readonly number[],
  picks: readonly (PlanPick | null)[],
): { days: PlanDay[]; top: number[] } {
  const next = [...days]
  top.forEach((i, n) => {
    const pick = picks[n]
    if (pick && next[i]?.best) next[i] = { ...next[i], best: pick }
  })
  const sorted = [...top]
    .filter((i) => next[i]?.best)
    .sort((a, b) => better(next[a].best!, next[b].best!) || a - b)
  return { days: next, top: sorted }
}

/** The whole plan in one call (tests and the in-thread path). `onDay` sees each day as it lands. */
export function computePlan(
  grids: readonly DemGrid[],
  illum: IllumGrid,
  problem: PlanProblem,
  onDay?: (day: PlanDay, index: number) => void,
  options?: { maxCandidates?: number },
): PlanResult {
  const prepared = prepareCandidates(grids, illum, problem, options)
  const tables = evaluateRange(prepared, problem)
  const days: PlanDay[] = []
  for (let d = 0; d < problem.days; d++) {
    const day = planDay(prepared, tables, problem, d)
    days.push(day)
    onDay?.(day, d)
  }
  const top = rankDays(days)
  const refined = withRefined(
    days,
    top,
    top.map((i) => refinePick(prepared, problem, days[i])),
  )
  return {
    problem,
    ice: prepared.ice,
    candidates: prepared.candidates,
    days: refined.days,
    top: refined.top,
    complete: true,
  }
}
