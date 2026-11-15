import { mapToSouthPolar, mapToStereo, southPolarToMap, stereoToMap } from './frames.ts'

/** Missing-data sentinel used by our Int16 products. */
export const DEM_NODATA = -32768

/**
 * Map projection of a raster. Absent = the LOLA south polar stereographic of the polar
 * products (frames.southPolarToMap); 'stereo' = oblique stereographic centred on
 * (lat0, lon0), used by the tiles cut from the LOLA global products (frames.stereoToMap).
 */
export interface DemProjection {
  kind: 'stereo'
  lat0: number
  lon0: number
}

/**
 * A raster in a stereographic map projection (south polar unless `projection` says otherwise).
 * Pixel (c, r) has its centre at map x = originX + c * scaleM, y = originY - r * scaleM.
 * Heights are stored as LOLA DNs: height_m = DN * heightScale (0.5 m for LOLA).
 */
export interface DemGrid {
  originX: number
  originY: number
  scaleM: number
  width: number
  height: number
  heightScale: number
  projection?: DemProjection
  data: Int16Array
}

/** Metadata stored next to the binary DEM files in public/data. */
export type DemMeta = Omit<DemGrid, 'data'>

/** Georeferencing of a full LOLA polar product (square, N pixels per side). */
export function lolaProductMeta(size: number, scaleM: number): DemMeta {
  const half = (size / 2 - 0.5) * scaleM
  return { originX: -half, originY: half, scaleM, width: size, height: size, heightScale: 0.5 }
}

export function mapToPixel(g: DemMeta, x: number, y: number) {
  return { c: (x - g.originX) / g.scaleM, r: (g.originY - y) / g.scaleM }
}

export function pixelToMap(g: DemMeta, c: number, r: number) {
  return { x: g.originX + c * g.scaleM, y: g.originY - r * g.scaleM }
}

/** Map coordinates (m) of a point in a raster projection (undefined = south polar). */
export function projectLatLon(projection: DemProjection | undefined, lat: number, lon: number) {
  return projection
    ? stereoToMap(projection.lat0, projection.lon0, lat, lon)
    : southPolarToMap(lat, lon)
}

/** Inverse of projectLatLon. */
export function unprojectMap(projection: DemProjection | undefined, x: number, y: number) {
  return projection ? mapToStereo(projection.lat0, projection.lon0, x, y) : mapToSouthPolar(x, y)
}

export const sameProjection = (a: DemProjection | undefined, b: DemProjection | undefined) =>
  a === b || (!!a && !!b && a.kind === b.kind && a.lat0 === b.lat0 && a.lon0 === b.lon0)

/**
 * The south polar formula folds the northern hemisphere onto the southern one, so polar
 * rasters only answer for the south; an oblique stereographic has no such alias.
 */
const outOfDomain = (g: DemMeta, lat: number) => !g.projection && lat > -45

export function latLonToPixel(g: DemMeta, lat: number, lon: number) {
  const { x, y } = projectLatLon(g.projection, lat, lon)
  return mapToPixel(g, x, y)
}

export function pixelToLatLon(g: DemMeta, c: number, r: number) {
  const { x, y } = pixelToMap(g, c, r)
  return unprojectMap(g.projection, x, y)
}

/** Height (m above the reference sphere) at fractional pixel (c, r), bilinear. NaN outside. */
export function samplePixel(g: DemGrid, c: number, r: number): number {
  if (!(c >= 0 && r >= 0 && c <= g.width - 1 && r <= g.height - 1)) return NaN
  const c0 = Math.min(Math.floor(c), g.width - 2)
  const r0 = Math.min(Math.floor(r), g.height - 2)
  const tc = c - c0
  const tr = r - r0
  const w = g.width
  const d = g.data
  const a = d[r0 * w + c0]
  const b = d[r0 * w + c0 + 1]
  const e = d[(r0 + 1) * w + c0]
  const f = d[(r0 + 1) * w + c0 + 1]
  if (a === DEM_NODATA || b === DEM_NODATA || e === DEM_NODATA || f === DEM_NODATA) return NaN
  const top = a + (b - a) * tc
  const bottom = e + (f - e) * tc
  return (top + (bottom - top) * tr) * g.heightScale
}

export function sampleMap(g: DemGrid, x: number, y: number): number {
  const { c, r } = mapToPixel(g, x, y)
  return samplePixel(g, c, r)
}

/** Height at (lat, lon); NaN outside the raster (polar products: southern hemisphere only). */
export function sampleDem(g: DemGrid, lat: number, lon: number): number {
  if (outOfDomain(g, lat)) return NaN
  const { x, y } = projectLatLon(g.projection, lat, lon)
  return sampleMap(g, x, y)
}

/** Samples the first grid (finest first) that covers the point. */
export function sampleDemStack(grids: readonly DemGrid[], lat: number, lon: number): number {
  for (const g of grids) {
    const h = sampleDem(g, lat, lon)
    if (!Number.isNaN(h)) return h
  }
  return NaN
}

/** True if (lat, lon) falls inside the grid with at least `marginPx` pixels to spare. */
export function demCovers(g: DemMeta, lat: number, lon: number, marginPx = 1): boolean {
  if (outOfDomain(g, lat)) return false
  const { c, r } = latLonToPixel(g, lat, lon)
  return (
    c >= marginPx && r >= marginPx && c <= g.width - 1 - marginPx && r <= g.height - 1 - marginPx
  )
}

/** Copies a window [c0, c0+w) x [r0, r0+h) out of a grid. */
export function cropGrid(g: DemGrid, c0: number, r0: number, w: number, h: number): DemGrid {
  const data = new Int16Array(w * h).fill(DEM_NODATA)
  for (let r = 0; r < h; r++) {
    const sr = r0 + r
    if (sr < 0 || sr >= g.height) continue
    for (let c = 0; c < w; c++) {
      const sc = c0 + c
      if (sc >= 0 && sc < g.width) data[r * w + c] = g.data[sr * g.width + sc]
    }
  }
  const { x, y } = pixelToMap(g, c0, r0)
  return { ...g, originX: x, originY: y, width: w, height: h, data }
}

/** Box-filter downsampling by an integer factor. */
export function downsampleGrid(g: DemGrid, factor: number): DemGrid {
  const w = Math.floor(g.width / factor)
  const h = Math.floor(g.height / factor)
  const data = new Int16Array(w * h)
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      let sum = 0
      let n = 0
      for (let dr = 0; dr < factor; dr++) {
        for (let dc = 0; dc < factor; dc++) {
          const v = g.data[(r * factor + dr) * g.width + c * factor + dc]
          if (v !== DEM_NODATA) {
            sum += v
            n++
          }
        }
      }
      data[r * w + c] = n ? Math.round(sum / n) : DEM_NODATA
    }
  }
  const shift = ((factor - 1) / 2) * g.scaleM
  return {
    ...g,
    originX: g.originX + shift,
    originY: g.originY - shift,
    scaleM: g.scaleM * factor,
    width: w,
    height: h,
    data,
  }
}
