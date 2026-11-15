import { DAY_MS } from './constants.ts'
import { type DemGrid, demCovers } from './dem.ts'
import { destination } from './frames.ts'
import { computeHorizonMask } from './horizonFromDem.ts'
import { computeMetrics } from './metrics.ts'
import { cachedEphemeris } from './scenario.ts'
import { evaluateSite } from './series.ts'
import { SLOPE_SAFE_DEG, slopeAt } from './slope.ts'

/**
 * Landing-dispersion sensitivity: the same mission evaluated at points spread over the landing
 * ellipse around the target (centre + concentric rings). Answers "if we land a few hundred
 * metres off, is the site still viable?", which on polar ridges it often is not.
 *
 * The ellipse is the 3σ footprint of a bivariate normal landing error: `radiusM` is its
 * semi-major axis, along the approach track (`orientationDeg`), and `semiMinorM` the
 * cross-track one. Each sample point carries the probability of the cell it stands for, so the
 * summary gives expected values and probabilities besides the plain min / median / max.
 */
export interface DispersionInput {
  lat: number
  lon: number
  /** Semi-major axis (3σ along-track), m. With no `semiMinorM` the footprint is a circle. */
  radiusM: number
  /** Semi-minor axis (3σ cross-track), m. */
  semiMinorM?: number
  /** Azimuth of the major axis = approach track, deg clockwise from north. */
  orientationDeg?: number
  startMs: number
  missionDays: number
  linkMarginDeg?: number
  /** Count the link only while a DSN complex sees the Moon. */
  requireDsn?: boolean
  rings?: number
  perRing?: number
  /** Coarser than the main scenario on purpose: N horizons must stay interactive. */
  stepMinutes?: number
}

export interface DispersionPoint {
  lat: number
  lon: number
  /** Offset from the target, metres and degrees clockwise from north. */
  distM: number
  azDeg: number
  /** Probability of landing in the cell this point represents (the points add up to 1). */
  weight: number
  heightM: number
  slopeDeg: number
  score: number
  sunlitPct: number
  energyPct: number
  dtePct: number
  longestDarkH: number
}

export interface Range {
  min: number
  median: number
  max: number
}

export interface DispersionResult {
  input: DispersionInput
  points: DispersionPoint[]
  summary: {
    score: Range
    sunlitPct: Range
    dtePct: Range
    longestDarkH: Range
    slopeDeg: Range
    /** Probability-weighted means over the ellipse. */
    expected: {
      score: number
      sunlitPct: number
      dtePct: number
      longestDarkH: number
      slopeDeg: number
    }
    /** P(slope below the safe landing limit). */
    pSafeSlope: number
    /** P(mission score at or above `GOOD_SCORE`). */
    pGoodScore: number
  }
}

/** Score from which a mission counts as good (same threshold as the UI traffic light). */
export const GOOD_SCORE = 60
/** The ellipse boundary is this many standard deviations of the landing error. */
export const ELLIPSE_SIGMAS = 3

export function range(values: readonly number[]): Range {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!v.length) return { min: NaN, median: NaN, max: NaN }
  const mid = v.length >> 1
  const median = v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2
  return { min: v[0], median, max: v[v.length - 1] }
}

/** Landing ellipse on the ground: 3σ semi-axes and the azimuth of the major one. */
export interface LandingEllipse {
  semiMajorM: number
  semiMinorM: number
  orientationDeg: number
}

/**
 * The ellipse for a 3σ along-track error of `semiMajorM` and an along/cross ratio of `aspect`
 * (downrange errors are larger than crossrange ones), laid along the approach track.
 */
export const landingEllipse = (
  semiMajorM: number,
  aspect: number,
  approachAzDeg: number,
): LandingEllipse => ({
  semiMajorM,
  semiMinorM: semiMajorM / Math.max(1, aspect),
  orientationDeg: ((approachAzDeg % 360) + 360) % 360,
})

/** Whether an offset (metres, azimuth from north) from the centre falls inside the ellipse. */
export function insideEllipse(e: LandingEllipse, distM: number, azDeg: number): boolean {
  const t = ((azDeg - e.orientationDeg) * Math.PI) / 180
  const along = distM * Math.cos(t)
  const cross = distM * Math.sin(t)
  return (along / e.semiMajorM) ** 2 + (cross / e.semiMinorM) ** 2 <= 1
}

export interface DispersionOffset {
  distM: number
  azDeg: number
  weight: number
}

/** P(normalised radius ≤ r) for a bivariate normal whose `ELLIPSE_SIGMAS`σ contour is r = 1. */
const within = (r: number) => 1 - Math.exp(-0.5 * (ELLIPSE_SIGMAS * r) ** 2)

/**
 * Centre first, then `rings` elliptical rings of `perRing` points (alternate rings rotated half
 * a step). Ring k stands for the band of normalised radius (k − ½)/rings … (k + ½)/rings (the
 * outer one up to the boundary) and shares its probability among its points; the centre takes
 * the inner disc. Weights are renormalised to 1 (the ~1 % beyond 3σ is dropped).
 */
export function dispersionOffsets(
  radiusM: number,
  rings = 2,
  perRing = 8,
  semiMinorM = radiusM,
  orientationDeg = 0,
): DispersionOffset[] {
  const total = within(1)
  const out: DispersionOffset[] = [{ distM: 0, azDeg: 0, weight: within(0.5 / rings) / total }]
  for (let k = 1; k <= rings; k++) {
    const r = k / rings
    const band = within(Math.min(1, (k + 0.5) / rings)) - within((k - 0.5) / rings)
    const rot = k % 2 ? 0 : 180 / perRing
    for (let j = 0; j < perRing; j++) {
      const t = (((j * 360) / perRing + rot) * Math.PI) / 180
      const along = radiusM * r * Math.cos(t)
      const cross = semiMinorM * r * Math.sin(t)
      const azDeg = (orientationDeg + (Math.atan2(cross, along) * 180) / Math.PI + 360) % 360
      out.push({ distM: Math.hypot(along, cross), azDeg, weight: band / total / perRing })
    }
  }
  return out
}

export function computeDispersion(
  grids: readonly DemGrid[],
  input: DispersionInput,
): DispersionResult {
  const stepMs = (input.stepMinutes ?? (input.missionDays > 180 ? 60 : 30)) * 60_000
  const count = Math.ceil((input.missionDays * DAY_MS) / stepMs) + 1
  const eph = cachedEphemeris(input.startMs, stepMs, count)
  const toMs = input.startMs + input.missionDays * DAY_MS + 1
  const points: DispersionPoint[] = []

  const offsets = dispersionOffsets(
    input.radiusM,
    input.rings,
    input.perRing,
    input.semiMinorM ?? input.radiusM,
    input.orientationDeg ?? 0,
  )
  for (const off of offsets) {
    const p =
      off.distM === 0
        ? { lat: input.lat, lon: input.lon }
        : destination(input.lat, input.lon, off.azDeg, off.distM)
    if (!grids.some((g) => demCovers(g, p.lat, p.lon, 2))) continue
    let horizon
    try {
      horizon = computeHorizonMask(grids, p.lat, p.lon, { azStepDeg: 1, growth: 0.01 })
    } catch {
      continue
    }
    const site = { lat: p.lat, lon: p.lon, heightM: horizon.terrainHeightM }
    const mask = { azStepDeg: horizon.azStepDeg, elevDeg: horizon.elevDeg }
    const m = computeMetrics(
      evaluateSite(eph, site, mask, input.linkMarginDeg ?? 0, input.requireDsn),
      input.startMs,
      toMs,
    )
    const fine = grids.find((g) => demCovers(g, p.lat, p.lon, 2))!
    points.push({
      lat: p.lat,
      lon: p.lon,
      distM: off.distM,
      azDeg: off.azDeg,
      weight: off.weight,
      heightM: horizon.terrainHeightM,
      slopeDeg: slopeAt(fine, p.lat, p.lon),
      score: m.score,
      sunlitPct: m.sunlitPct,
      energyPct: m.energyPct,
      dtePct: m.dtePct,
      longestDarkH: m.longestDarkH,
    })
  }

  // Points off the DEM are skipped: share their probability among the ones evaluated.
  const sum = points.reduce((s, x) => s + x.weight, 0)
  if (sum > 0) for (const x of points) x.weight /= sum
  const pick = (k: keyof DispersionPoint) => points.map((x) => x[k])
  const mean = (k: keyof DispersionPoint) =>
    points.length ? points.reduce((s, x) => s + x.weight * x[k], 0) : NaN
  const prob = (test: (x: DispersionPoint) => boolean) =>
    points.reduce((s, x) => s + (test(x) ? x.weight : 0), 0)
  return {
    input,
    points,
    summary: {
      score: range(pick('score')),
      sunlitPct: range(pick('sunlitPct')),
      dtePct: range(pick('dtePct')),
      longestDarkH: range(pick('longestDarkH')),
      slopeDeg: range(pick('slopeDeg')),
      expected: {
        score: mean('score'),
        sunlitPct: mean('sunlitPct'),
        dtePct: mean('dtePct'),
        longestDarkH: mean('longestDarkH'),
        slopeDeg: mean('slopeDeg'),
      },
      pSafeSlope: prob((x) => x.slopeDeg < SLOPE_SAFE_DEG),
      pGoodScore: prob((x) => x.score >= GOOD_SCORE),
    },
  }
}
