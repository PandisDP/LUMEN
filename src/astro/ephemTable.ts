import { DEG } from './constants.ts'
import type { Vec3 } from './frames.ts'

/**
 * Precomputed Sun/Earth ephemeris in the Moon body-fixed (Mean Earth) frame, built from JPL
 * Horizons (DE441) by scripts/data/build-ephem.ts and published as public/data/ephem/*.
 *
 * Binary layout: Float32, 6 values per sample (sun xyz, earth xyz), km from the Moon centre.
 * Float32 is enough: its relative precision (6e-8) is ~1e-5° in direction.
 */
export interface EphemTableMeta {
  source: string
  startMs: number
  stepMs: number
  count: number
}

export interface EphemTable extends EphemTableMeta {
  data: Float32Array
}

/** Body-fixed vector (km) from planetodetic lon/lat (deg, east positive) and range (km). */
export function subPointToVector(lonDeg: number, latDeg: number, rangeKm: number): Vec3 {
  const lon = lonDeg * DEG
  const lat = latDeg * DEG
  const c = Math.cos(lat)
  return [rangeKm * c * Math.cos(lon), rangeKm * c * Math.sin(lon), rangeKm * Math.sin(lat)]
}

export function tableCovers(t: EphemTableMeta, timeMs: number): boolean {
  // Cubic interpolation needs one sample on each side of the bracketing pair.
  return timeMs >= t.startMs + t.stepMs && timeMs <= t.startMs + (t.count - 3) * t.stepMs
}

/**
 * 4-point Lagrange interpolation of the sun/earth vectors. Writes 6 numbers into `out`.
 * Returns false (and leaves `out` untouched) outside the table.
 */
export function sampleTable(t: EphemTable, timeMs: number, out: Float64Array | number[]): boolean {
  if (!tableCovers(t, timeMs)) return false
  const x = (timeMs - t.startMs) / t.stepMs
  const i = Math.floor(x)
  const u = x - i
  // Weights for samples i-1, i, i+1, i+2 at u in [0, 1).
  const w0 = (-u * (u - 1) * (u - 2)) / 6
  const w1 = ((u + 1) * (u - 1) * (u - 2)) / 2
  const w2 = (-(u + 1) * u * (u - 2)) / 2
  const w3 = ((u + 1) * u * (u - 1)) / 6
  const d = t.data
  const b = (i - 1) * 6
  for (let k = 0; k < 6; k++) {
    out[k] = w0 * d[b + k] + w1 * d[b + 6 + k] + w2 * d[b + 12 + k] + w3 * d[b + 18 + k]
  }
  return true
}
