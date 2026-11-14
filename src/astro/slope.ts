import { MOON_RADIUS_M, RAD } from './constants.ts'
import { DEM_NODATA, type DemGrid, latLonToPixel, mapToPixel, pixelToMap } from './dem.ts'

/** Typical lander limits: below SAFE is nominal, SAFE..CAUTION needs care, above is unsafe. */
export const SLOPE_SAFE_DEG = 10
export const SLOPE_CAUTION_DEG = 15

export type SlopeClass = 'safe' | 'caution' | 'steep'

export const slopeClass = (deg: number): SlopeClass =>
  deg < SLOPE_SAFE_DEG ? 'safe' : deg < SLOPE_CAUTION_DEG ? 'caution' : 'steep'

/**
 * Point scale factor of the polar stereographic map at map radius ρ (true scale at the pole):
 * k = 1 + (ρ / 2R)². Map distances are k times ground distances, so map gradients are scaled
 * by k to get ground gradients (≤ 0.05 % inside 85°S, ~1.6 % at 75°S).
 */
const scaleFactor = (x: number, y: number) => 1 + (x * x + y * y) / (4 * MOON_RADIUS_M ** 2)

/**
 * Local slope (deg) at integer pixel (c, r) with Horn's 3×3 operator (the same one GDAL and
 * ArcGIS use), i.e. over a 2-pixel baseline: 40 m on the 20 m tiles. NaN at the border or
 * when any neighbour is missing.
 */
export function slopeAtPixel(g: DemGrid, c: number, r: number): number {
  if (c < 1 || r < 1 || c > g.width - 2 || r > g.height - 2) return NaN
  const w = g.width
  const d = g.data
  const i = r * w + c
  const z1 = d[i - w - 1]
  const z2 = d[i - w]
  const z3 = d[i - w + 1]
  const z4 = d[i - 1]
  const z6 = d[i + 1]
  const z7 = d[i + w - 1]
  const z8 = d[i + w]
  const z9 = d[i + w + 1]
  for (const z of [z1, z2, z3, z4, z6, z7, z8, z9]) if (z === DEM_NODATA) return NaN
  const s = g.heightScale / (8 * g.scaleM)
  const dzdx = (z3 + 2 * z6 + z9 - (z1 + 2 * z4 + z7)) * s
  const dzdy = (z7 + 2 * z8 + z9 - (z1 + 2 * z2 + z3)) * s
  const { x, y } = pixelToMap(g, c, r)
  return Math.atan(Math.hypot(dzdx, dzdy) * scaleFactor(x, y)) * RAD
}

/** Slope at map coordinates (nearest pixel). */
export function slopeAtMap(g: DemGrid, x: number, y: number): number {
  const { c, r } = mapToPixel(g, x, y)
  return slopeAtPixel(g, Math.round(c), Math.round(r))
}

export function slopeAt(g: DemGrid, lat: number, lon: number): number {
  if (lat > -45) return NaN
  const { c, r } = latLonToPixel(g, lat, lon)
  return slopeAtPixel(g, Math.round(c), Math.round(r))
}

/** Slope from the first grid (finest first) that has data around the point. */
export function slopeAtStack(grids: readonly DemGrid[], lat: number, lon: number): number {
  for (const g of grids) {
    const s = slopeAt(g, lat, lon)
    if (!Number.isNaN(s)) return s
  }
  return NaN
}

export interface SlopeStats {
  /** Slope at the site itself. */
  center: number
  mean: number
  p90: number
  max: number
  /** % of the area below SLOPE_SAFE_DEG. */
  safePct: number
  /** Pixels inside the circle that had data. */
  count: number
  /** DEM resolution used, m/px: slopes on coarse DEMs are smoothed (underestimated). */
  resolutionM: number
}

/** Slope statistics over a circle of `radiusM` around the site (landing-ellipse proxy). */
export function slopeStats(g: DemGrid, lat: number, lon: number, radiusM: number): SlopeStats {
  const { c: cc, r: rc } = latLonToPixel(g, lat, lon)
  const radPx = Math.max(radiusM / g.scaleM, 0.5)
  const values: number[] = []
  for (let r = Math.floor(rc - radPx); r <= Math.ceil(rc + radPx); r++) {
    for (let c = Math.floor(cc - radPx); c <= Math.ceil(cc + radPx); c++) {
      if ((c - cc) ** 2 + (r - rc) ** 2 > radPx * radPx) continue
      const s = slopeAtPixel(g, c, r)
      if (!Number.isNaN(s)) values.push(s)
    }
  }
  const center = slopeAtPixel(g, Math.round(cc), Math.round(rc))
  if (!values.length) {
    return {
      center,
      mean: center,
      p90: center,
      max: center,
      safePct: Number.isNaN(center) ? NaN : center < SLOPE_SAFE_DEG ? 100 : 0,
      count: 0,
      resolutionM: g.scaleM,
    }
  }
  values.sort((a, b) => a - b)
  const sum = values.reduce((a, b) => a + b, 0)
  return {
    center,
    mean: sum / values.length,
    p90: values[Math.min(values.length - 1, Math.floor(values.length * 0.9))],
    max: values[values.length - 1],
    safePct: (100 * values.filter((v) => v < SLOPE_SAFE_DEG).length) / values.length,
    count: values.length,
    resolutionM: g.scaleM,
  }
}
