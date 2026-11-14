import type { DemMeta } from './dem.ts'

/**
 * Orbital imagery published by scripts/data/build-imagery.ts (public/data/imagery/index.json).
 * Every product is a grid of image tiles that the app draws into one canvas: the files are
 * kept exactly as the servers sent them (no re-encoding in the pipeline).
 *
 *   globe: Moon Trek WMTS, LRO WAC global mosaic, equirectangular (lon −180…180, lat 90…−90).
 *   cap:   Moon Trek WMTS, LRO WAC south pole mosaic, polar stereographic (same plane as LOLA).
 *   sites: LROC QuickMap WMS, LROC NAC south pole mosaic (over WAC), one per 20 m terrain tile.
 */
export type MapExtent = readonly [minX: number, minY: number, maxX: number, maxY: number]

export interface MosaicRef {
  /** Attribution shown in the UI. */
  source: string
  /** Path under public/ with `{r}` and `{c}` placeholders (row 0 = top). */
  path: string
  rows: number
  cols: number
  /** Pixels per tile side. */
  tileSize: number
  /** Polar stereographic metres covered by the whole grid (edges, not pixel centres). */
  extent?: MapExtent
}

export interface ImageryIndex {
  globe?: MosaicRef
  cap?: MosaicRef
  sites: Record<string, MosaicRef>
}

export const tilePath = (m: MosaicRef, r: number, c: number) =>
  m.path.replace('{r}', String(r)).replace('{c}', String(c))

/** Outer edges of a raster whose origin is the centre of its top-left pixel (dem.ts). */
export function rasterExtent(g: Omit<DemMeta, 'heightScale'>): MapExtent {
  const h = g.scaleM / 2
  return [
    g.originX - h,
    g.originY - (g.height - 1) * g.scaleM - h,
    g.originX + (g.width - 1) * g.scaleM + h,
    g.originY + h,
  ]
}

/**
 * Texture coordinates of a map point inside an extent, for a texture with flipY (v = 0 at the
 * bottom edge). Outside the extent the values leave [0, 1] and the sampler clamps them.
 */
export function mapUv(e: MapExtent, x: number, y: number): [number, number] {
  return [(x - e[0]) / (e[2] - e[0]), (y - e[1]) / (e[3] - e[1])]
}

/**
 * UVs into a polar stereographic image for the vertices of buildTerrainGeometry (same regular
 * map-plane grid, row 0 along the edge of largest map y).
 */
export function terrainGridUv(
  center: { x: number; y: number },
  halfSizeM: number,
  segments: number,
  extent: MapExtent,
): Float32Array {
  const n = segments + 1
  const out = new Float32Array(n * n * 2)
  const step = (2 * halfSizeM) / segments
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const uv = mapUv(extent, center.x - halfSizeM + c * step, center.y + halfSizeM - r * step)
      out.set(uv, (r * n + c) * 2)
    }
  }
  return out
}
