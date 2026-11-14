import { DAY_MS } from './constants.ts'
import { type DemGrid, demCovers, latLonToPixel, pixelToLatLon } from './dem.ts'
import { bearingDistance } from './frames.ts'
import { computeHorizonMask } from './horizonFromDem.ts'
import { combinedScore, computeIceAccess, scienceScore } from './iceAccess.ts'
import type { IllumGrid } from './illumination.ts'
import { computeMetrics } from './metrics.ts'
import { cachedEphemeris } from './scenario.ts'
import { evaluateSite } from './series.ts'
import { SLOPE_CAUTION_DEG, SLOPE_SAFE_DEG, slopeAtPixel } from './slope.ts'

/**
 * "Suggest a better point": searches the landing ellipse for safe ground (slope < 10°, and no
 * pixel ≥ 15° in the 3×3 neighbourhood), keeps the highest candidates (on polar terrain height
 * is the best cheap predictor of light) and evaluates the full mission at each of them.
 */
export interface OptimizeInput {
  lat: number
  lon: number
  radiusM: number
  startMs: number
  missionDays: number
  linkMarginDeg?: number
  /** Blend with the ice-access score (needs an illumination map). */
  scienceWeight?: number
  roverMaxSlopeDeg?: number
  spacingM?: number
  maxCandidates?: number
  top?: number
  stepMinutes?: number
}

export interface OptimizeCandidate {
  lat: number
  lon: number
  distM: number
  azDeg: number
  heightM: number
  slopeDeg: number
  score: number
  engineeringScore: number
  scienceScore: number | null
  sunlitPct: number
  energyPct: number
  dtePct: number
  longestDarkH: number
}

export interface OptimizeResult {
  input: OptimizeInput
  /** Best first. */
  best: OptimizeCandidate[]
  /** The target itself, evaluated the same way (for the "+N points" comparison). */
  target: OptimizeCandidate | null
  /** Safe-slope grid points found / evaluated. */
  safeCount: number
  evaluated: number
}

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

export function computeOptimize(
  grids: readonly DemGrid[],
  input: OptimizeInput,
  illum?: IllumGrid,
): OptimizeResult {
  const fine = grids[0]
  const spacingM = input.spacingM ?? 40
  const stepMs = (input.stepMinutes ?? 30) * 60_000
  const count = Math.ceil((input.missionDays * DAY_MS) / stepMs) + 1
  const eph = cachedEphemeris(input.startMs, stepMs, count)
  const toMs = input.startMs + input.missionDays * DAY_MS + 1
  const w = illum ? (input.scienceWeight ?? 0) : 0
  const rover = input.roverMaxSlopeDeg ?? 20

  const evaluate = (lat: number, lon: number, slopeDeg: number): OptimizeCandidate | null => {
    let horizon
    try {
      horizon = computeHorizonMask(grids, lat, lon, { azStepDeg: 1, growth: 0.01 })
    } catch {
      return null
    }
    const mask = { azStepDeg: horizon.azStepDeg, elevDeg: horizon.elevDeg }
    const site = { lat, lon, heightM: horizon.terrainHeightM }
    const m = computeMetrics(
      evaluateSite(eph, site, mask, input.linkMarginDeg ?? 0),
      input.startMs,
      toMs,
    )
    const sci =
      illum && w > 0
        ? scienceScore(computeIceAccess(fine, illum, lat, lon, { roverMaxSlopeDeg: rover }), rover)
        : null
    const { distM, azDeg } = bearingDistance(input.lat, input.lon, lat, lon)
    return {
      lat,
      lon,
      distM,
      azDeg,
      heightM: horizon.terrainHeightM,
      slopeDeg,
      engineeringScore: m.score,
      scienceScore: sci,
      score: sci === null ? m.score : combinedScore(m.score, sci, w),
      sunlitPct: m.sunlitPct,
      energyPct: m.energyPct,
      dtePct: m.dtePct,
      longestDarkH: m.longestDarkH,
    }
  }

  const { c: cc, r: rc } = latLonToPixel(fine, input.lat, input.lon)
  const radPx = input.radiusM / fine.scaleM
  const stride = Math.max(1, Math.round(spacingM / fine.scaleM))
  const safe: { c: number; r: number; h: number; s: number }[] = []
  for (let r = Math.ceil(rc - radPx); r <= rc + radPx; r += stride) {
    for (let c = Math.ceil(cc - radPx); c <= cc + radPx; c += stride) {
      if ((c - cc) ** 2 + (r - rc) ** 2 > radPx * radPx) continue
      if (c < 1 || r < 1 || c >= fine.width - 1 || r >= fine.height - 1) continue
      const s = safeAt(fine, c, r)
      if (s === null) continue
      safe.push({ c, r, h: fine.data[r * fine.width + c], s })
    }
  }
  safe.sort((a, b) => b.h - a.h)

  const out: OptimizeCandidate[] = []
  for (const cand of safe.slice(0, input.maxCandidates ?? 40)) {
    const { lat, lon } = pixelToLatLon(fine, cand.c, cand.r)
    if (!demCovers(fine, lat, lon, 2)) continue
    const e = evaluate(lat, lon, cand.s)
    if (e) out.push(e)
  }
  out.sort((a, b) => b.score - a.score || a.distM - b.distM)

  const target = evaluate(input.lat, input.lon, slopeAtPixel(fine, Math.round(cc), Math.round(rc)))
  return {
    input,
    best: out.slice(0, input.top ?? 3),
    target,
    safeCount: safe.length,
    evaluated: out.length,
  }
}
