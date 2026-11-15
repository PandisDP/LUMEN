import { MOON_RADIUS_M } from '../../astro/constants.ts'
import {
  type DemGrid,
  projectLatLon,
  sameProjection,
  sampleDem,
  sampleMap,
  unprojectMap,
} from '../../astro/dem.ts'
import type { GroundSampler } from '../../astro/descent.ts'
import type { Site } from '../../astro/ephemeris.ts'
import { dot, enuBasis, selenographicToVector, sub } from '../../astro/frames.ts'

/**
 * Decorative close-range ground: what the 20 m DEM cannot show from a camera 5 m away. Everything
 * here is a pure, deterministic function of the WORLD (scene) position — x east, z −north, metres
 * from the site — so the relief and the rocks stay put when the patch re-centres on the rover.
 * None of it feeds the mission numbers: slopes, shadows and energy still come from the DEM.
 */

// ── Hashing and noise ───────────────────────────────────────────────────────────────────────

/** Integer hash of a lattice cell (and a salt) → [0, 1). */
export function hash2(ix: number, iz: number, salt = 0): number {
  let h =
    Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iz | 0, 0x165667b1) ^ Math.imul(salt, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

const smooth = (t: number) => t * t * (3 - 2 * t)

/** 1 below `a`, 0 above `b` … the usual smoothstep, rising from a to b. */
export function smoothstep(a: number, b: number, x: number): number {
  if (x <= a) return 0
  if (x >= b) return 1
  return smooth((x - a) / (b - a))
}

/** Value noise in [−1, 1] on a lattice of the given spacing. */
function valueNoise(x: number, z: number, spacing: number, salt: number): number {
  const fx = x / spacing
  const fz = z / spacing
  const ix = Math.floor(fx)
  const iz = Math.floor(fz)
  const sx = smooth(fx - ix)
  const sz = smooth(fz - iz)
  const a = hash2(ix, iz, salt)
  const b = hash2(ix + 1, iz, salt)
  const c = hash2(ix, iz + 1, salt)
  const d = hash2(ix + 1, iz + 1, salt)
  const top = a + (b - a) * sx
  const bottom = c + (d - c) * sx
  return (top + (bottom - top) * sz) * 2 - 1
}

// ── Micro-relief ────────────────────────────────────────────────────────────────────────────

/** Hard bound of |microRelief|, m. */
export const RELIEF_MAX_M = 0.6

const UNDULATION = [
  // [lattice spacing m (≈ half the wavelength), amplitude m, salt]
  [4, 0.15, 11],
  [1.6, 0.045, 23],
  [1, 0.025, 37],
] as const

const CRATER_CELL_M = 12
const CRATER_PROBABILITY = 0.6
const CRATER_R_MIN = 0.5
const CRATER_R_MAX = 2.4
/** Depth of a small degraded crater over its radius. */
const CRATER_DEPTH_RATIO = 0.17
/** A crater touches the ground out to this many radii (the rim's outer flank). */
const CRATER_REACH = 1.6

export interface Crater {
  x: number
  z: number
  radiusM: number
  depthM: number
}

const craterRadius = (ix: number, iz: number) =>
  // Squared: many small ones, few of the largest.
  CRATER_R_MIN + (CRATER_R_MAX - CRATER_R_MIN) * hash2(ix, iz, 104) ** 2
const craterDepth = (ix: number, iz: number, radiusM: number) =>
  radiusM * CRATER_DEPTH_RATIO * (0.75 + 0.25 * hash2(ix, iz, 105))

/** The crater of a 12 m cell, if it has one (all from the integer hash of the cell). */
export function craterInCell(ix: number, iz: number): Crater | null {
  if (hash2(ix, iz, 101) >= CRATER_PROBABILITY) return null
  const radiusM = craterRadius(ix, iz)
  return {
    x: (ix + hash2(ix, iz, 102)) * CRATER_CELL_M,
    z: (iz + hash2(ix, iz, 103)) * CRATER_CELL_M,
    radiusM,
    depthM: craterDepth(ix, iz, radiusM),
  }
}

/** Bowl with a raised rim; d = distance over radius. Zero (and smooth) at CRATER_REACH. */
function craterProfile(d: number, depthM: number): number {
  if (d >= CRATER_REACH) return 0
  const bowl = d < 1 ? (d * d - 1) * depthM : 0
  const k = (d - 1) / 0.24
  const window = 1 - smoothstep(1.25, CRATER_REACH, d)
  return bowl + Math.exp(-k * k) * depthM * 0.28 * window
}

/**
 * Height of the small-scale relief at a scene position, m: gentle undulation (±0.15 m over
 * ~8 m, ±0.045 m over ~3 m, ±0.025 m over ~2 m) plus small craters on a jittered 12 m grid.
 * Bounded by RELIEF_MAX_M.
 */
export function microRelief(x: number, z: number): number {
  let h = 0
  for (let k = 0; k < UNDULATION.length; k++) {
    const o = UNDULATION[k]
    h += valueNoise(x, z, o[0], o[2]) * o[1]
  }
  const reach = CRATER_R_MAX * CRATER_REACH
  const ix0 = Math.floor((x - reach) / CRATER_CELL_M)
  const ix1 = Math.floor((x + reach) / CRATER_CELL_M)
  const iz0 = Math.floor((z - reach) / CRATER_CELL_M)
  const iz1 = Math.floor((z + reach) / CRATER_CELL_M)
  for (let iz = iz0; iz <= iz1; iz++) {
    for (let ix = ix0; ix <= ix1; ix++) {
      if (hash2(ix, iz, 101) >= CRATER_PROBABILITY) continue
      const radiusM = craterRadius(ix, iz)
      const dx = x - (ix + hash2(ix, iz, 102)) * CRATER_CELL_M
      const dz = z - (iz + hash2(ix, iz, 103)) * CRATER_CELL_M
      const lim = radiusM * CRATER_REACH
      const d2 = dx * dx + dz * dz
      if (d2 >= lim * lim) continue
      h += craterProfile(Math.sqrt(d2) / radiusM, craterDepth(ix, iz, radiusM))
    }
  }
  return Math.max(-RELIEF_MAX_M, Math.min(RELIEF_MAX_M, h))
}

/** Fraction of the patch radius, from the rim inwards, over which the relief fades out. */
export const EDGE_FADE_FRACTION = 0.35

/** 1 in the middle of the patch → 0 (exactly) at `radius` and beyond, smooth in between. */
export function edgeFade(dist: number, radius: number): number {
  return 1 - smoothstep(radius * (1 - EDGE_FADE_FRACTION), radius, dist)
}

// ── Keep-outs: the rover's route and the lander ─────────────────────────────────────────────

export type RoutePoint = readonly [number, number, number]

/** No rocks closer than this to the centreline of the rover's route, m. */
export const ROUTE_CLEARANCE_M = 1.5
/** The relief is back to full strength this far from the route, m. */
export const ROUTE_RELIEF_M = 4.5
/** No rocks within this of the lander at the origin (footpads at 2.2 m), m. */
export const LANDER_CLEARANCE_M = 3.2
const LANDER_RELIEF_M = 6.5

function segmentDistSq(
  x: number,
  z: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const ux = bx - ax
  const uz = bz - az
  const len2 = ux * ux + uz * uz
  let t = len2 > 0 ? ((x - ax) * ux + (z - az) * uz) / len2 : 0
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const dx = x - (ax + ux * t)
  const dz = z - (az + uz * t)
  return dx * dx + dz * dz
}

/** Horizontal distance from (x, z) to the route polyline, m (∞ without a route). */
export function routeDistance(x: number, z: number, route: readonly RoutePoint[] | undefined) {
  if (!route?.length) return Infinity
  if (route.length === 1) return Math.hypot(x - route[0][0], z - route[0][2])
  let best = Infinity
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1]
    const b = route[i]
    const d = segmentDistSq(x, z, a[0], a[2], b[0], b[2])
    if (d < best) best = d
  }
  return Math.sqrt(best)
}

export function clearOfRoute(
  x: number,
  z: number,
  route: readonly RoutePoint[] | undefined,
  clearanceM = ROUTE_CLEARANCE_M,
): boolean {
  return routeDistance(x, z, route) >= clearanceM
}

export function clearOfLander(x: number, z: number, clearanceM = LANDER_CLEARANCE_M): boolean {
  return x * x + z * z >= clearanceM * clearanceM
}

/** Relief multiplier for a distance to the route: 0 on the wheel corridor, 1 away from it. */
export function corridorMask(routeDistM: number): number {
  return smoothstep(ROUTE_CLEARANCE_M, ROUTE_RELIEF_M, routeDistM)
}

/** Relief multiplier around the lander: 0 under it and its footpads, 1 a few metres out. */
export function landerMask(x: number, z: number): number {
  return smoothstep(LANDER_CLEARANCE_M, LANDER_RELIEF_M, Math.sqrt(x * x + z * z))
}

const INDEX_CELL_M = 8

/**
 * The route in buckets, so the distance to it costs one lookup per query instead of a walk over
 * the whole polyline. Distances beyond `reachM` come back as `reachM` (all the masks saturate).
 */
export function routeIndex(route: readonly RoutePoint[] | undefined, reachM = ROUTE_RELIEF_M) {
  const buckets = new Map<number, number[]>()
  const key = (ix: number, iz: number) => (ix + 32768) * 65536 + (iz + 32768)
  const n = route?.length ?? 0
  const seg = new Float64Array(Math.max(0, n - 1) * 4)
  for (let i = 1; i < n; i++) {
    const a = route![i - 1]
    const b = route![i]
    seg.set([a[0], a[2], b[0], b[2]], (i - 1) * 4)
    const ix0 = Math.floor((Math.min(a[0], b[0]) - reachM) / INDEX_CELL_M)
    const ix1 = Math.floor((Math.max(a[0], b[0]) + reachM) / INDEX_CELL_M)
    const iz0 = Math.floor((Math.min(a[2], b[2]) - reachM) / INDEX_CELL_M)
    const iz1 = Math.floor((Math.max(a[2], b[2]) + reachM) / INDEX_CELL_M)
    for (let iz = iz0; iz <= iz1; iz++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        // Long diagonal legs: only the cells the leg really comes near.
        const cx = (ix + 0.5) * INDEX_CELL_M
        const cz = (iz + 0.5) * INDEX_CELL_M
        const far = reachM + INDEX_CELL_M * 0.7072
        if (segmentDistSq(cx, cz, a[0], a[2], b[0], b[2]) > far * far) continue
        const k = key(ix, iz)
        const list = buckets.get(k)
        if (list) list.push(i - 1)
        else buckets.set(k, [i - 1])
      }
    }
  }
  const reach2 = reachM * reachM
  return {
    reachM,
    /** Distance to the route, capped at `reachM`. */
    distance(x: number, z: number): number {
      const list = buckets.get(key(Math.floor(x / INDEX_CELL_M), Math.floor(z / INDEX_CELL_M)))
      if (!list) return reachM
      let best = reach2
      for (let j = 0; j < list.length; j++) {
        const o = list[j] * 4
        const d = segmentDistSq(x, z, seg[o], seg[o + 1], seg[o + 2], seg[o + 3])
        if (d < best) best = d
      }
      return Math.sqrt(best)
    },
  }
}

export type RouteIndex = ReturnType<typeof routeIndex>

// ── Rocks ───────────────────────────────────────────────────────────────────────────────────

export const ROCK_CELL_M = 4
export const ROCK_MIN_M = 0.06
export const ROCK_MAX_M = 0.6
export const ROCK_SHAPES = 4
/** Exponent of the size distribution (pdf ∝ size^−α): many pebbles, few boulders. */
const ROCK_ALPHA = 1.7

export interface Rock {
  x: number
  z: number
  /** Largest dimension, m. */
  sizeM: number
  yaw: number
  /** Tilt off the vertical, rad, and its azimuth. */
  tilt: number
  tiltAz: number
  /** 0..ROCK_SHAPES−1. */
  shape: number
  /** Fraction of its height below the surface. */
  sink: number
  /** Brightness multiplier around 1. */
  tone: number
  /** Height over width of this rock (flat slabs to rounder blocks). */
  squash: number
}

/** The rocks of a 4 m cell (0–3), all derived from the integer hash of the cell. */
export function rocksInCell(ix: number, iz: number): Rock[] {
  const u = hash2(ix, iz, 201)
  const count = u < 0.3 ? 0 : u < 0.68 ? 1 : u < 0.9 ? 2 : 3
  const rocks: Rock[] = []
  const span = 1 - (ROCK_MIN_M / ROCK_MAX_M) ** (ROCK_ALPHA - 1)
  for (let k = 0; k < count; k++) {
    const s = 210 + k * 16
    const sizeM = ROCK_MIN_M * (1 - hash2(ix, iz, s) * span) ** (-1 / (ROCK_ALPHA - 1))
    rocks.push({
      x: (ix + hash2(ix, iz, s + 1)) * ROCK_CELL_M,
      z: (iz + hash2(ix, iz, s + 2)) * ROCK_CELL_M,
      sizeM: Math.min(ROCK_MAX_M, Math.max(ROCK_MIN_M, sizeM)),
      yaw: hash2(ix, iz, s + 3) * Math.PI * 2,
      tilt: hash2(ix, iz, s + 4) * 0.35,
      tiltAz: hash2(ix, iz, s + 5) * Math.PI * 2,
      shape: Math.min(ROCK_SHAPES - 1, Math.floor(hash2(ix, iz, s + 6) * ROCK_SHAPES)),
      sink: 0.2 + 0.3 * hash2(ix, iz, s + 7),
      tone: 0.82 + 0.3 * hash2(ix, iz, s + 8),
      squash: 0.5 + 0.4 * hash2(ix, iz, s + 9),
    })
  }
  return rocks
}

// ── The coarse terrain mesh under the patch ─────────────────────────────────────────────────

/** Segments per side of the terrain mesh drawn by the surface view (see MicroScene `Ground`). */
export const terrainSegments = (fine: boolean) => (fine ? 500 : 160)

/** out: [height, nx, ny, nz] of the terrain mesh under a point. */
export type MeshSample = Float64Array

/**
 * Height and shading normal of the triangulated terrain (astro/terrainMesh buildTerrainGeometry,
 * 40 m quads) under a scene point: the same vertices, the same triangles, the same smooth vertex
 * normals. The patch must land exactly on it at its rim, and the DEM surface the rover drives on
 * (bilinear on 20 m posts) is up to a metre off it between vertices.
 */
export function terrainMeshSampler(
  site: Site,
  grids: readonly DemGrid[],
  ground: GroundSampler,
  halfSizeM: number,
  segments: number,
) {
  const projection = grids[0]?.projection
  const center = projectLatLon(projection, site.lat, site.lon)
  const basis = enuBasis(site.lat, site.lon)
  const origin = selenographicToVector(site.lat, site.lon, MOON_RADIUS_M + site.heightM)
  const step = (2 * halfSizeM) / segments
  /** Fractional (column, row) of the mesh grid for a scene point (exact). */
  const gridCoords = (x: number, z: number): [number, number] => {
    const { lat, lon } = ground.latLon(x, z)
    const m = projectLatLon(projection, lat, lon)
    return [(m.x - (center.x - halfSizeM)) / step, (center.y + halfSizeM - m.y) / step]
  }
  const vertex = (c: number, r: number, out: Float64Array, o: number) => {
    const x = center.x - halfSizeM + c * step
    const y = center.y + halfSizeM - r * step
    const { lat, lon } = unprojectMap(projection, x, y)
    let h = NaN
    for (const g of grids) {
      h = sameProjection(g.projection, projection) ? sampleMap(g, x, y) : sampleDem(g, lat, lon)
      if (!Number.isNaN(h)) break
    }
    if (Number.isNaN(h)) h = site.heightM
    const v = sub(selenographicToVector(lat, lon, MOON_RADIUS_M + h), origin)
    out[o] = dot(v, basis.east)
    out[o + 1] = dot(v, basis.up)
    out[o + 2] = -dot(v, basis.north)
  }

  // Window of mesh vertices around the last prepared centre, and the local affine map from
  // scene (x, z) to mesh grid coordinates (the projection is as good as linear over 100 m).
  let c0 = 0
  let r0 = 0
  let cols = 0
  let rows = 0
  let pos = new Float64Array(0)
  let nrm = new Float64Array(0)
  let px = 0
  let pz = 0
  let fc0 = 0
  let fcx = 0
  let fcz = 0
  let fr0 = 0
  let frx = 0
  let frz = 0

  const accumulate = (a: number, b: number, c: number) => {
    const ax = pos[a * 3]
    const ay = pos[a * 3 + 1]
    const az = pos[a * 3 + 2]
    const ux = pos[b * 3] - ax
    const uy = pos[b * 3 + 1] - ay
    const uz = pos[b * 3 + 2] - az
    const vx = pos[c * 3] - ax
    const vy = pos[c * 3 + 1] - ay
    const vz = pos[c * 3 + 2] - az
    // Area-weighted face normal, as BufferGeometry.computeVertexNormals does.
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    for (const i of [a, b, c]) {
      nrm[i * 3] += nx
      nrm[i * 3 + 1] += ny
      nrm[i * 3 + 2] += nz
    }
  }

  const corner = new Float64Array(12)
  return {
    /**
     * Height of the mesh under any point, exactly (no `prepare` needed; a few trig calls). With
     * `groundY` it gives the surface the eye sees: max(groundY, heightAt).
     */
    heightAt(x: number, z: number): number {
      const [fc, fr] = gridCoords(x, z)
      const c = Math.floor(fc)
      const r = Math.floor(fr)
      const first = fc - c + (fr - r) <= 1
      vertex(first ? c : c + 1, first ? r : r + 1, corner, 0)
      vertex(c + 1, r, corner, 3)
      vertex(c, r + 1, corner, 6)
      const ux = corner[3] - corner[0]
      const uz = corner[5] - corner[2]
      const vx = corner[6] - corner[0]
      const vz = corner[8] - corner[2]
      const qx = x - corner[0]
      const qz = z - corner[2]
      const det = ux * vz - uz * vx
      const s = (qx * vz - qz * vx) / det
      const t = (ux * qz - uz * qx) / det
      return corner[1] * (1 - s - t) + corner[4] * s + corner[7] * t
    },
    /** Loads the mesh vertices within `radiusM` of (cx, cz). */
    prepare(cx: number, cz: number, radiusM: number) {
      const [fc, fr] = gridCoords(cx, cz)
      const [fcE, frE] = gridCoords(cx + radiusM, cz)
      const [fcW, frW] = gridCoords(cx - radiusM, cz)
      const [fcS, frS] = gridCoords(cx, cz + radiusM)
      const [fcN, frN] = gridCoords(cx, cz - radiusM)
      px = cx
      pz = cz
      fc0 = fc
      fr0 = fr
      fcx = (fcE - fcW) / (2 * radiusM)
      fcz = (fcS - fcN) / (2 * radiusM)
      frx = (frE - frW) / (2 * radiusM)
      frz = (frS - frN) / (2 * radiusM)
      const reach = (radiusM * 1.5) / step + 1
      // One extra ring of vertices so the normals of the ones in use see all their triangles.
      c0 = Math.floor(fc - reach) - 1
      r0 = Math.floor(fr - reach) - 1
      cols = Math.ceil(fc + reach) + 2 - c0
      rows = Math.ceil(fr + reach) + 2 - r0
      if (pos.length < cols * rows * 3) {
        pos = new Float64Array(cols * rows * 3)
        nrm = new Float64Array(cols * rows * 3)
      }
      nrm.fill(0)
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) vertex(c0 + c, r0 + r, pos, (r * cols + c) * 3)
      }
      for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
          const a = r * cols + c
          accumulate(a, a + cols, a + 1)
          accumulate(a + 1, a + cols, a + cols + 1)
        }
      }
      for (let i = 0; i < cols * rows; i++) {
        const len = Math.hypot(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]) || 1
        nrm[i * 3] /= len
        nrm[i * 3 + 1] /= len
        nrm[i * 3 + 2] /= len
      }
    },
    /** Height and (unnormalised) interpolated normal of the mesh under (x, z). */
    sample(x: number, z: number, out: MeshSample) {
      const dx = x - px
      const dz = z - pz
      const fc = fc0 + fcx * dx + fcz * dz - c0
      const fr = fr0 + frx * dx + frz * dz - r0
      const c = Math.max(0, Math.min(cols - 2, Math.floor(fc)))
      const r = Math.max(0, Math.min(rows - 2, Math.floor(fr)))
      const a = r * cols + c
      // Triangles (a, d, b) and (b, d, e), split along the b–d diagonal.
      const first = fc - c + (fr - r) <= 1
      const i0 = (first ? a : a + cols + 1) * 3
      const i1 = (a + 1) * 3
      const i2 = (a + cols) * 3
      const ux = pos[i1] - pos[i0]
      const uz = pos[i1 + 2] - pos[i0 + 2]
      const vx = pos[i2] - pos[i0]
      const vz = pos[i2 + 2] - pos[i0 + 2]
      const qx = x - pos[i0]
      const qz = z - pos[i0 + 2]
      const det = ux * vz - uz * vx
      const s = (qx * vz - qz * vx) / det
      const t = (ux * qz - uz * qx) / det
      const w = 1 - s - t
      out[0] = pos[i0 + 1] * w + pos[i1 + 1] * s + pos[i2 + 1] * t
      out[1] = nrm[i0] * w + nrm[i1] * s + nrm[i2] * t
      out[2] = nrm[i0 + 1] * w + nrm[i1 + 1] * s + nrm[i2 + 1] * t
      out[3] = nrm[i0 + 2] * w + nrm[i1 + 2] * s + nrm[i2 + 2] * t
    },
  }
}

export type TerrainMeshSampler = ReturnType<typeof terrainMeshSampler>

// ── The patch surface ───────────────────────────────────────────────────────────────────────

/** The patch floats this far above the surface it follows, m (no z-fighting with the terrain). */
export const PATCH_BIAS_M = 0.03
/**
 * Away from the route the patch stays at least this far above the coarse mesh, m, so hollows of
 * the relief are not swallowed by the terrain triangles underneath.
 */
const PATCH_LIFT_M = 0.25
/** Spacing of the local grid the DEM surface is sampled on before interpolating, m. */
const DEM_GRID_M = 2

/** out: [height, fade, mesh nx, ny, nz, relief mask]. */
export type SurfaceSample = Float64Array

/**
 * The surface of the close-range patch around a centre: the DEM surface the rover and the lander
 * stand on, plus the micro-relief (flattened along the route and under the lander), blended
 * into the coarse terrain mesh over the outer part of the patch so that it meets it exactly.
 */
export function patchSurface(
  ground: Pick<GroundSampler, 'groundY'>,
  mesh: Pick<TerrainMeshSampler, 'prepare' | 'sample'> | null,
  route: Pick<RouteIndex, 'distance'>,
  radiusM: number,
) {
  const half = Math.ceil(radiusM / DEM_GRID_M) + 1
  const n = half * 2 + 1
  const dem = new Float64Array(n * n)
  const m = new Float64Array(4)
  let cx = 0
  let cz = 0
  const demAt = (x: number, z: number) => {
    const fx = Math.max(0, Math.min(n - 1.000001, (x - cx) / DEM_GRID_M + half))
    const fz = Math.max(0, Math.min(n - 1.000001, (z - cz) / DEM_GRID_M + half))
    const ix = Math.floor(fx)
    const iz = Math.floor(fz)
    const tx = fx - ix
    const tz = fz - iz
    const i = iz * n + ix
    const top = dem[i] + (dem[i + 1] - dem[i]) * tx
    const bottom = dem[i + n] + (dem[i + n + 1] - dem[i + n]) * tx
    return top + (bottom - top) * tz
  }
  return {
    radiusM,
    prepare(x: number, z: number) {
      cx = x
      cz = z
      for (let iz = 0; iz < n; iz++) {
        for (let ix = 0; ix < n; ix++) {
          dem[iz * n + ix] = ground.groundY(
            cx + (ix - half) * DEM_GRID_M,
            cz + (iz - half) * DEM_GRID_M,
          )
        }
      }
      mesh?.prepare(cx, cz, radiusM)
    },
    sample(x: number, z: number, out: SurfaceSample) {
      const fade = edgeFade(Math.hypot(x - cx, z - cz), radiusM)
      const d = demAt(x, z)
      let base = d
      if (mesh) {
        mesh.sample(x, z, m)
        base = m[0]
        out[2] = m[1]
        out[3] = m[2]
        out[4] = m[3]
      } else {
        out[2] = 0
        out[3] = 1
        out[4] = 0
      }
      let h = base
      let mask = 0
      if (fade > 0) {
        mask = corridorMask(route.distance(x, z)) * landerMask(x, z)
        const top = Math.max(d, base + PATCH_LIFT_M * mask) + mask * microRelief(x, z)
        h = Math.max(base, base + fade * (top - base))
      }
      out[0] = h + PATCH_BIAS_M
      out[1] = fade
      out[5] = mask
    },
  }
}

export type PatchSurface = ReturnType<typeof patchSurface>

// ── Layout of the patch mesh ────────────────────────────────────────────────────────────────

/**
 * Radii of the rings of the polar grid: `innerStepM` apart out to `denseRadiusM` (where the
 * camera is), then growing geometrically so the outer rings keep roughly square cells.
 */
export function ringRadii(radiusM: number, innerStepM: number, denseRadiusM: number): number[] {
  const radii: number[] = []
  let r = innerStepM
  while (r < radiusM - 1e-6) {
    radii.push(r)
    r += Math.max(innerStepM, (r / denseRadiusM) * innerStepM)
  }
  radii.push(radiusM)
  return radii
}

/** Timing of the last rebuilds of the patch (read by the dev tools / the visual checks). */
export const nearGroundStats = { builds: 0, lastMs: 0, maxMs: 0, vertices: 0, rocks: 0 }
