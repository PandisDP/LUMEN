import { type DemGrid, type DemMeta, downsampleGrid, latLonToPixel, pixelToLatLon } from './dem.ts'
import type { EphemerisSeries } from './ephemeris.ts'
import { computeHorizonMask } from './horizonFromDem.ts'
import { evaluateSite } from './series.ts'

/**
 * Illumination map of a terrain tile: for every cell, the mean visible fraction of the solar
 * disc over a year. One byte per cell: 0 = never lit (permanently shadowed region, PSR),
 * 1..201 = 1 + round(2 × mean lit %), 255 = no data. Same georeferencing rules as a DemGrid.
 */
/** Georeferencing as for a DemGrid (heightScale is unused). */
export type IllumMeta = DemMeta

export interface IllumGrid extends IllumMeta {
  data: Uint8Array
}

/** Sun disc fraction below which a whole year still counts as "never lit". */
export const PSR_MAX_FRAC = 0.01
export const ILLUM_NODATA = 255

export const encodeIllum = (meanPct: number, maxFrac: number) =>
  maxFrac < PSR_MAX_FRAC ? 0 : Math.min(201, 1 + Math.round(2 * Math.max(0, meanPct)))

/** Mean lit % of a cell (0 for a PSR). */
export const illumPct = (v: number) => (v === 0 ? 0 : (v - 1) / 2)

export function illumAt(g: IllumGrid, lat: number, lon: number): number | undefined {
  const { c, r } = latLonToPixel(g, lat, lon)
  const ci = Math.round(c)
  const ri = Math.round(r)
  if (ci < 0 || ri < 0 || ci >= g.width || ri >= g.height) return undefined
  const v = g.data[ri * g.width + ci]
  return v === ILLUM_NODATA ? undefined : v
}

export const isPsrAt = (g: IllumGrid, lat: number, lon: number) => illumAt(g, lat, lon) === 0

/**
 * Builds the map offline (scripts/data/build-derived.ts). The tile is downsampled by `factor`
 * and used as the near-field DEM, so the horizon march takes cell-sized steps; `far` provides
 * the terrain out to 300 km.
 */
export function computeIlluminationMap(
  tile: DemGrid,
  far: DemGrid,
  year: EphemerisSeries,
  factor: number,
  onRow?: (done: number, total: number) => void,
  { azStepDeg = 3, growth = 0.02 } = {},
): IllumGrid {
  const near = downsampleGrid(tile, factor)
  const { data: _d, ...meta } = near
  void _d
  const out = new Uint8Array(near.width * near.height).fill(ILLUM_NODATA)
  for (let r = 0; r < near.height; r++) {
    for (let c = 0; c < near.width; c++) {
      const { lat, lon } = pixelToLatLon(near, c, r)
      let h
      try {
        h = computeHorizonMask([near, far], lat, lon, { azStepDeg, growth })
      } catch {
        continue
      }
      const s = evaluateSite(year, { lat, lon, heightM: h.terrainHeightM }, h)
      let sum = 0
      let max = 0
      for (let i = 0; i < s.count; i++) {
        sum += s.sunFrac[i]
        if (s.sunFrac[i] > max) max = s.sunFrac[i]
      }
      out[r * near.width + c] = encodeIllum((100 * sum) / s.count, max)
    }
    onRow?.(r + 1, near.height)
  }
  return { ...meta, data: out }
}
