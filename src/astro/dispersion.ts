import { DAY_MS } from './constants.ts'
import { type DemGrid, demCovers } from './dem.ts'
import { destination } from './frames.ts'
import { computeHorizonMask } from './horizonFromDem.ts'
import { computeMetrics } from './metrics.ts'
import { cachedEphemeris } from './scenario.ts'
import { evaluateSite } from './series.ts'
import { slopeAt } from './slope.ts'

/**
 * Landing-dispersion sensitivity: the same mission evaluated at points spread over a circle
 * around the target (centre + concentric rings). Answers "if we land a few hundred metres
 * off, is the site still viable?", which on polar ridges it often is not.
 */
export interface DispersionInput {
  lat: number
  lon: number
  radiusM: number
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
  }
}

export function range(values: readonly number[]): Range {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!v.length) return { min: NaN, median: NaN, max: NaN }
  const mid = v.length >> 1
  const median = v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2
  return { min: v[0], median, max: v[v.length - 1] }
}

/** Centre first, then `rings` rings of `perRing` points (alternate rings rotated half a step). */
export function dispersionOffsets(radiusM: number, rings = 2, perRing = 8) {
  const out = [{ distM: 0, azDeg: 0 }]
  for (let k = 1; k <= rings; k++) {
    const distM = (radiusM * k) / rings
    const rot = k % 2 ? 0 : 180 / perRing
    for (let j = 0; j < perRing; j++) out.push({ distM, azDeg: (j * 360) / perRing + rot })
  }
  return out
}

export function computeDispersion(
  grids: readonly DemGrid[],
  input: DispersionInput,
): DispersionResult {
  const stepMs = (input.stepMinutes ?? 30) * 60_000
  const count = Math.ceil((input.missionDays * DAY_MS) / stepMs) + 1
  const eph = cachedEphemeris(input.startMs, stepMs, count)
  const toMs = input.startMs + input.missionDays * DAY_MS + 1
  const points: DispersionPoint[] = []

  for (const off of dispersionOffsets(input.radiusM, input.rings, input.perRing)) {
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
      heightM: horizon.terrainHeightM,
      slopeDeg: slopeAt(fine, p.lat, p.lon),
      score: m.score,
      sunlitPct: m.sunlitPct,
      energyPct: m.energyPct,
      dtePct: m.dtePct,
      longestDarkH: m.longestDarkH,
    })
  }

  const pick = (k: keyof DispersionPoint) => points.map((x) => x[k])
  return {
    input,
    points,
    summary: {
      score: range(pick('score')),
      sunlitPct: range(pick('sunlitPct')),
      dtePct: range(pick('dtePct')),
      longestDarkH: range(pick('longestDarkH')),
      slopeDeg: range(pick('slopeDeg')),
    },
  }
}
