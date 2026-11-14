import { type DemGrid, latLonToPixel, mapToPixel, pixelToLatLon, pixelToMap } from './dem.ts'
import { ILLUM_NODATA, type IllumGrid } from './illumination.ts'
import { slopeAtPixel } from './slope.ts'

/**
 * Science access: how far a rover has to drive from the landing point to reach permanently
 * shadowed terrain (where water ice can survive), over the 20 m DEM. Dijkstra on the pixel
 * grid with 8 neighbours; pixels steeper than the rover limit are impassable and the cost
 * grows with slope, so the route goes around crater walls instead of down them.
 */
export interface IceAccess {
  /** Straight-line distance to the nearest PSR cell within the search radius (m). */
  straightM: number | null
  /** Driving distance along the cheapest passable route (m). */
  routeM: number | null
  /** Steepest slope met along that route (deg). */
  maxSlopeDeg: number | null
  reachable: boolean
  /** The landing point itself is permanently shadowed. */
  insidePsr: boolean
  target: { lat: number; lon: number } | null
  /** Route vertices (every few pixels), landing point first. */
  path: { lat: number; lon: number }[]
  radiusM: number
}

export const ICE_RADIUS_M = 2000

class MinHeap {
  private k: number[] = []
  private v: number[] = []
  get size() {
    return this.k.length
  }
  push(key: number, val: number) {
    const k = this.k
    const v = this.v
    let i = k.length
    k.push(key)
    v.push(val)
    while (i > 0) {
      const p = (i - 1) >> 1
      if (k[p] <= k[i]) break
      ;[k[p], k[i]] = [k[i], k[p]]
      ;[v[p], v[i]] = [v[i], v[p]]
      i = p
    }
  }
  pop(): [number, number] {
    const k = this.k
    const v = this.v
    const top: [number, number] = [k[0], v[0]]
    const lk = k.pop()!
    const lv = v.pop()!
    if (k.length) {
      k[0] = lk
      v[0] = lv
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < k.length && k[l] < k[m]) m = l
        if (r < k.length && k[r] < k[m]) m = r
        if (m === i) break
        ;[k[m], k[i]] = [k[i], k[m]]
        ;[v[m], v[i]] = [v[i], v[m]]
        i = m
      }
    }
    return top
  }
}

export function computeIceAccess(
  tile: DemGrid,
  illum: IllumGrid,
  lat: number,
  lon: number,
  { radiusM = ICE_RADIUS_M, roverMaxSlopeDeg = 20 } = {},
): IceAccess {
  const empty: IceAccess = {
    straightM: null,
    routeM: null,
    maxSlopeDeg: null,
    reachable: false,
    insidePsr: false,
    target: null,
    path: [],
    radiusM,
  }
  const { c: fc, r: fr } = latLonToPixel(tile, lat, lon)
  const c0 = Math.round(fc)
  const r0 = Math.round(fr)
  if (c0 < 0 || r0 < 0 || c0 >= tile.width || r0 >= tile.height) return empty
  const rad = Math.ceil(radiusM / tile.scaleM)
  const minC = Math.max(1, c0 - rad)
  const maxC = Math.min(tile.width - 2, c0 + rad)
  const minR = Math.max(1, r0 - rad)
  const maxR = Math.min(tile.height - 2, r0 + rad)
  const w = maxC - minC + 1
  const h = maxR - minR + 1
  const n = w * h
  const at = (c: number, r: number) => (r - minR) * w + (c - minC)

  // Per-pixel PSR flag and slope inside the search window.
  const psr = new Uint8Array(n)
  const slope = new Float32Array(n)
  let straight = Infinity
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      const d = Math.hypot(c - c0, r - r0) * tile.scaleM
      if (d > radiusM) continue
      const { x, y } = pixelToMap(tile, c, r)
      const ip = mapToPixel(illum, x, y)
      const ic = Math.round(ip.c)
      const ir = Math.round(ip.r)
      const v =
        ic >= 0 && ir >= 0 && ic < illum.width && ir < illum.height
          ? illum.data[ir * illum.width + ic]
          : ILLUM_NODATA
      const i = at(c, r)
      if (v === 0) {
        psr[i] = 1
        straight = Math.min(straight, d)
      }
      slope[i] = slopeAtPixel(tile, c, r)
    }
  }
  if (!Number.isFinite(straight)) return empty
  const start = at(c0, r0)
  if (psr[start]) {
    return {
      ...empty,
      straightM: 0,
      routeM: 0,
      maxSlopeDeg: Number.isFinite(slope[start]) ? slope[start] : 0,
      reachable: true,
      insidePsr: true,
      target: { lat, lon },
      path: [{ lat, lon }],
    }
  }

  const dist = new Float64Array(n).fill(Infinity)
  const prev = new Int32Array(n).fill(-1)
  const heap = new MinHeap()
  dist[start] = 0
  heap.push(0, start)
  const passable = (i: number) => Number.isFinite(slope[i]) && slope[i] <= roverMaxSlopeDeg
  let goal = -1
  while (heap.size) {
    const [d, i] = heap.pop()
    if (d > dist[i]) continue
    if (psr[i]) {
      goal = i
      break
    }
    const c = (i % w) + minC
    const r = Math.floor(i / w) + minR
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue
        const nc = c + dc
        const nr = r + dr
        if (nc < minC || nc > maxC || nr < minR || nr > maxR) continue
        if (Math.hypot(nc - c0, nr - r0) * tile.scaleM > radiusM) continue
        const j = at(nc, nr)
        // Crater floors can be steep at the edge: entering the PSR itself is always allowed
        // if the step onto it is passable from where the rover stands.
        if (!passable(j) && !psr[j]) continue
        const len = (dr && dc ? Math.SQRT2 : 1) * tile.scaleM
        const s = Number.isFinite(slope[j]) ? slope[j] : roverMaxSlopeDeg
        const nd = d + len * (1 + s / roverMaxSlopeDeg)
        if (nd < dist[j]) {
          dist[j] = nd
          prev[j] = i
          heap.push(nd, j)
        }
      }
    }
  }
  if (goal < 0) return { ...empty, straightM: straight }

  const chain: number[] = []
  for (let i = goal; i >= 0; i = prev[i]) chain.push(i)
  chain.reverse()
  let routeM = 0
  let maxSlope = 0
  const path: { lat: number; lon: number }[] = []
  const toLatLon = (i: number) => pixelToLatLon(tile, (i % w) + minC, Math.floor(i / w) + minR)
  for (let k = 0; k < chain.length; k++) {
    const i = chain[k]
    if (k) {
      const a = chain[k - 1]
      routeM += Math.hypot((i % w) - (a % w), Math.floor(i / w) - Math.floor(a / w)) * tile.scaleM
    }
    if (!psr[i] && Number.isFinite(slope[i])) maxSlope = Math.max(maxSlope, slope[i])
    if (k % 4 === 0 || k === chain.length - 1) path.push(toLatLon(i))
  }
  return {
    straightM: straight,
    routeM,
    maxSlopeDeg: maxSlope,
    reachable: true,
    insidePsr: false,
    target: toLatLon(goal),
    path,
    radiusM,
  }
}

/** Compact form stored per curated site in index.json (no path). */
export interface IceSummary {
  straightM: number | null
  routeM: number | null
  maxSlopeDeg: number | null
  reachable: boolean
  insidePsr: boolean
  /** Rover limit the summary was computed with (deg). */
  roverMaxSlopeDeg: number
}

/**
 * 0..100 science score: 100 for ice within 500 m of driving, falling linearly to 0 at the
 * search radius, and up to halved by a route close to the rover's slope limit.
 */
export function scienceScore(
  a: Pick<IceSummary, 'routeM' | 'maxSlopeDeg' | 'reachable'> | undefined,
  roverMaxSlopeDeg = 20,
  radiusM = ICE_RADIUS_M,
): number {
  if (!a?.reachable || a.routeM == null) return 0
  const near = 500
  const dist = a.routeM <= near ? 1 : Math.max(0, 1 - (a.routeM - near) / (radiusM - near))
  const steep = Math.min(1, (a.maxSlopeDeg ?? 0) / roverMaxSlopeDeg)
  return Math.round(100 * dist * (1 - 0.5 * steep))
}

/** Engineering score blended with science: (1 − w)·engineering + w·science. */
export const combinedScore = (engineering: number, science: number, w: number) =>
  Math.round((1 - w) * engineering + w * science)
