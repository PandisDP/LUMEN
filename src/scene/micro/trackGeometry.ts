import { type DemGrid, projectLatLon, unprojectMap } from '../../astro/dem.ts'
import type { GroundSampler } from '../../astro/descent.ts'
import { latLonToScene } from '../../astro/terrainMesh.ts'
import type { RoverId } from '../../astro/traverse.ts'
import type { Site } from '../../astro/ephemeris.ts'
import { PATCH_BIAS_M } from './nearGroundField.ts'

/**
 * Wheel tracks of the rover as geometry: the route is resampled finely, its corners are rounded
 * and one ribbon per wheel line is laid on the ground. Pure (no three.js, no DOM): the scene
 * component turns the arrays into a BufferGeometry and reveals them up to the rover.
 */

export interface TrackSpec {
  /** Distance from the centre line of the vehicle to each wheel line, m. */
  halfWidthM: number
  /** Width of the tread (and of the imprint), m. */
  treadM: number
  /** Length of one repeat of the grouser pattern along the track, m. */
  patternM: number
  /** Front and rear axles, m ahead of / behind the vehicle's reference point. */
  frontM: number
  rearM: number
}

/**
 * Wheel lines per vehicle: the same half-widths as the ramp channels of the lander (egress.ts)
 * and the same wheels as the rover models (roverRig.ts: trackHalf, wheelW, frontU / rearU).
 * One repeat of the grouser pattern is five tread widths long (see trackMaterial.ts).
 */
export const ROVER_TRACKS: Record<RoverId, TrackSpec> = {
  rover: { halfWidthM: 0.24, treadM: 0.08, patternM: 0.4, frontM: 0.27, rearM: 0.27 },
  'csa-rover': { halfWidthM: 0.52, treadM: 0.18, patternM: 0.9, frontM: 0.56, rearM: 0.56 },
}

/** Spacing of the ribbon cross-sections along the route, m. */
export const TRACK_STEP_M = 0.5
/**
 * Height of the ribbons above the ground they lie on, m: just over the close-range patch
 * (NearGround), which floats PATCH_BIAS_M above the same surface and is flat along the route.
 */
export const TRACK_BIAS_M = PATCH_BIAS_M + 0.02
/**
 * Sideways lean of the normals at the two edges of a ribbon (tangent of the angle), towards its
 * axis: the imprint is a shallow trough, so with the Sun on the horizon one of its walls catches
 * the light and the other goes dark. That is what shows a track from afar near the poles.
 */
export const TRACK_WALL_TILT = 0.08
/**
 * The way back runs over the way out. So that both pairs of tracks can be told apart (and their
 * ribbons never lie on the same surface), the rover returns this many tread widths to the right
 * of its outbound line — like keeping to its side of a road — and its ribbons sit a hair higher.
 * The shift builds up over the first metres after the turn-around, on the rover and its tracks.
 */
export const RETURN_SHIFT_TREADS = 1.4
export const RETURN_SHIFT_EASE_M = 4
export const RETURN_LIFT_M = 0.002

/**
 * Sideways shift of the return leg, m to the right of the direction of travel, `backM` metres
 * after turning around at the ice (0 on the way out and at the turn itself).
 */
export function returnShiftM(spec: Pick<TrackSpec, 'treadM'>, backM: number): number {
  if (!(backM > 0)) return 0
  const t = Math.min(1, backM / RETURN_SHIFT_EASE_M)
  return RETURN_SHIFT_TREADS * spec.treadM * t * t * (3 - 2 * t)
}

/** Indices drawn per step of the route: two ribbons, one quad (two triangles) each. */
export const TRACK_INDICES_PER_STEP = 12
/** Vertices per cross-section: both edges of the left and of the right ribbon. */
export const TRACK_VERTS_PER_SAMPLE = 4

export interface PathPoint {
  /** Scene coordinates on the horizontal plane, m (x = east, z = −north). */
  x: number
  z: number
  /** Distance driven from the start, m. */
  distM: number
}

export interface PathSample extends PathPoint {
  /** Unit direction of travel on the horizontal plane. */
  tx: number
  tz: number
}

/**
 * Resamples the route about every `stepM`. The rover follows the plan polyline (straight between
 * points ~10 m apart), so the tracks stay on it too, except within `cornerM` of each vertex,
 * where the corner is replaced by a quadratic Bézier: the ribbons turn smoothly instead of
 * kinking and never leave the polyline by more than ~cornerM / 3 (a right angle).
 * `distM` is interpolated linearly along each leg, so it stays the rover's own odometer.
 */
export function resamplePath(
  points: readonly PathPoint[],
  stepM = TRACK_STEP_M,
  cornerM = 0.6,
): PathSample[] {
  // Drop repeated points: a leg needs a direction.
  const pts: PathPoint[] = []
  for (const p of points) {
    const last = pts[pts.length - 1]
    if (!last || Math.hypot(p.x - last.x, p.z - last.z) > 1e-6) pts.push(p)
  }
  const n = pts.length
  if (n < 2) return []
  const len = new Float64Array(n - 1)
  const dx = new Float64Array(n - 1)
  const dz = new Float64Array(n - 1)
  /** Horizontal arc length of the polyline up to each point. */
  const s = new Float64Array(n)
  for (let i = 0; i < n - 1; i++) {
    len[i] = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z)
    dx[i] = (pts[i + 1].x - pts[i].x) / len[i]
    dz[i] = (pts[i + 1].z - pts[i].z) / len[i]
    s[i + 1] = s[i] + len[i]
  }
  /** Length cut off each leg around vertex i. */
  const cut = new Float64Array(n)
  for (let i = 1; i < n - 1; i++) cut[i] = Math.min(cornerM, 0.45 * len[i - 1], 0.45 * len[i])

  const total = s[n - 1]
  const steps = Math.max(1, Math.ceil(total / stepM))
  const out: PathSample[] = []
  let leg = 0
  for (let k = 0; k <= steps; k++) {
    const at = k === steps ? total : (k * total) / steps
    while (leg < n - 2 && at > s[leg + 1]) leg++
    const f = (at - s[leg]) / len[leg]
    const distM = pts[leg].distM + (pts[leg + 1].distM - pts[leg].distM) * f
    // The vertex whose rounded corner covers this arc length, if any.
    const v = at - s[leg] < cut[leg] ? leg : s[leg + 1] - at < cut[leg + 1] ? leg + 1 : -1
    if (v > 0 && v < n - 1 && cut[v] > 0) {
      const c = cut[v]
      const t = (at - (s[v] - c)) / (2 * c)
      const ax = pts[v].x - dx[v - 1] * c
      const az = pts[v].z - dz[v - 1] * c
      const bx = pts[v].x + dx[v] * c
      const bz = pts[v].z + dz[v] * c
      const u = 1 - t
      let tx = u * dx[v - 1] + t * dx[v]
      let tz = u * dz[v - 1] + t * dz[v]
      const tl = Math.hypot(tx, tz)
      // A full reversal has no tangent half-way: keep the incoming direction.
      if (tl < 1e-9) {
        tx = dx[v - 1]
        tz = dz[v - 1]
      } else {
        tx /= tl
        tz /= tl
      }
      out.push({
        x: u * u * ax + 2 * u * t * pts[v].x + t * t * bx,
        z: u * u * az + 2 * u * t * pts[v].z + t * t * bz,
        distM,
        tx,
        tz,
      })
    } else {
      out.push({
        x: pts[leg].x + dx[leg] * len[leg] * f,
        z: pts[leg].z + dz[leg] * len[leg] * f,
        distM,
        tx: dx[leg],
        tz: dz[leg],
      })
    }
  }
  return out
}

export interface TrackRibbons {
  /** Scene positions, 4 vertices per sample: left ribbon (outer, inner), right (inner, outer). */
  positions: Float32Array
  normals: Float32Array
  /** u across the tread (0..1), v = distance / pattern length. */
  uvs: Float32Array
  /** Distance driven at each vertex, m. */
  dist: Float32Array
  /** Horizontal unit vector (x, z) pointing out of the ribbon at each vertex (to widen it). */
  edge: Float32Array
  /** Two quads per step, in route order: a draw range is a prefix of the route. */
  indices: Uint32Array
  /** Distance driven at each sample, m (non-decreasing). */
  sampleDist: Float32Array
}

/**
 * Lays one ribbon per wheel line on the ground: `surfaceY(x, z)` is the height of whatever is
 * drawn there and the ribbons sit `biasM` above it. Normals follow the local slope, so that the
 * imprint is lit like the ground under it, and lean by `wallTilt` towards the axis of each ribbon.
 */
export function buildTrackRibbons(
  samples: readonly PathSample[],
  spec: Pick<TrackSpec, 'halfWidthM' | 'treadM' | 'patternM'>,
  surfaceY: (x: number, z: number) => number,
  biasM = TRACK_BIAS_M,
  wallTilt = TRACK_WALL_TILT,
  /** Shift of the whole pair of ribbons to the right of travel, m, by distance driven. */
  lateralM: (distM: number) => number = () => 0,
): TrackRibbons {
  const n = samples.length
  const positions = new Float32Array(n * 4 * 3)
  const normals = new Float32Array(n * 4 * 3)
  const uvs = new Float32Array(n * 4 * 2)
  const dist = new Float32Array(n * 4)
  const edge = new Float32Array(n * 4 * 2)
  const sampleDist = new Float32Array(n)
  const half = spec.treadM / 2
  /** Lateral offset and outward side of each of the 4 vertices. */
  const lanes = [
    [-spec.halfWidthM - half, -1],
    [-spec.halfWidthM + half, 1],
    [spec.halfWidthM - half, -1],
    [spec.halfWidthM + half, 1],
  ] as const
  const d = 1
  for (let k = 0; k < n; k++) {
    const p = samples[k]
    // Right of the direction of travel (forward north → right east).
    const rx = -p.tz
    const rz = p.tx
    const dydx = (surfaceY(p.x + d, p.z) - surfaceY(p.x - d, p.z)) / (2 * d)
    const dydz = (surfaceY(p.x, p.z + d) - surfaceY(p.x, p.z - d)) / (2 * d)
    const nl = Math.hypot(dydx, 1, dydz)
    sampleDist[k] = p.distM
    const shift = lateralM(p.distM)
    for (let j = 0; j < 4; j++) {
      const [off, side] = lanes[j]
      const i = k * 4 + j
      const x = p.x + rx * (off + shift)
      const z = p.z + rz * (off + shift)
      positions[i * 3] = x
      positions[i * 3 + 1] = surfaceY(x, z) + biasM
      positions[i * 3 + 2] = z
      const nx = -dydx / nl - rx * side * wallTilt
      const ny = 1 / nl
      const nz = -dydz / nl - rz * side * wallTilt
      const l = Math.hypot(nx, ny, nz)
      normals[i * 3] = nx / l
      normals[i * 3 + 1] = ny / l
      normals[i * 3 + 2] = nz / l
      uvs[i * 2] = side < 0 ? 0 : 1
      uvs[i * 2 + 1] = p.distM / spec.patternM
      dist[i] = p.distM
      edge[i * 2] = rx * side
      edge[i * 2 + 1] = rz * side
    }
  }
  const steps = Math.max(0, n - 1)
  const indices = new Uint32Array(steps * TRACK_INDICES_PER_STEP)
  for (let k = 0; k < steps; k++) {
    const a = k * 4
    // Counter-clockwise seen from above (the ribbons face up).
    indices.set(
      [a, a + 1, a + 4, a + 1, a + 5, a + 4, a + 2, a + 3, a + 6, a + 3, a + 7, a + 6],
      k * TRACK_INDICES_PER_STEP,
    )
  }
  return { positions, normals, uvs, dist, edge, indices, sampleDist }
}

/**
 * Number of indices to draw so that the ribbons reach `distM`: every step that starts before it
 * (the shader trims the last one to the exact distance). 0 at the start, everything at the end.
 */
export function trackDrawCount(sampleDist: ArrayLike<number>, distM: number): number {
  const steps = sampleDist.length - 1
  if (steps <= 0 || !(distM > sampleDist[0])) return 0
  // First sample at or beyond distM (lower bound).
  let lo = 0
  let hi = sampleDist.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sampleDist[mid] < distM) lo = mid + 1
    else hi = mid
  }
  return Math.min(steps, lo) * TRACK_INDICES_PER_STEP
}

export interface TrackReveal {
  /** Visible stretch of each leg's ribbons, in metres driven (nothing when to ≤ from). */
  out: { fromM: number; toM: number }
  back: { fromM: number; toM: number }
}

/**
 * What to show of the two sets of tracks with the rover drawn `poseDistM` along its round trip
 * (the odometer: it keeps growing on the way back). Each leg is revealed by its own distance:
 * the outbound ribbons from where the ramps touch the ground (`startM`) up to the front wheels
 * and whole once the rover has turned around; the return ribbons from the ice up to the front
 * wheels, and not at all before the turn.
 */
export function trackReveal(
  poseDistM: number,
  outLengthM: number,
  spec: Pick<TrackSpec, 'frontM' | 'rearM'>,
  startM: number,
): TrackReveal {
  const fromM = startM - spec.rearM
  if (!Number.isFinite(poseDistM))
    return { out: { fromM, toM: fromM }, back: { fromM: outLengthM, toM: outLengthM } }
  const returning = poseDistM > outLengthM
  return {
    out: { fromM, toM: returning ? outLengthM : Math.max(fromM, poseDistM + spec.frontM) },
    back: { fromM: outLengthM, toM: returning ? poseDistM + spec.frontM : outLengthM },
  }
}

/**
 * Height of the terrain mesh as drawn (MicroScene's Ground): the DEM sampled on a regular grid
 * of `segments` cells over ±halfSizeM on the map plane of the finest raster, each cell split
 * into two flat triangles. The cells are wider than the DEM posts, so the drawn surface and
 * `ground.groundY` (bilinear on the DEM) differ by decimetres on curved ground: anything that
 * must be seen lying ON the terrain has to follow this one. (nearGroundField.ts has a sampler of
 * the same mesh built for a moving patch; this one answers anywhere along the route.)
 */
export function terrainMeshHeight(
  site: Site,
  grids: readonly DemGrid[],
  ground: Pick<GroundSampler, 'latLon' | 'heightAt'>,
  halfSizeM: number,
  segments: number,
) {
  const projection = grids[0]?.projection
  const center = projectLatLon(projection, site.lat, site.lon)
  const step = (2 * halfSizeM) / segments
  const n = segments + 1
  const cache = new Map<number, number>()
  /** Scene y of the mesh vertex at (row, column). */
  const vertexY = (r: number, c: number) => {
    const key = r * n + c
    let y = cache.get(key)
    if (y === undefined) {
      const { lat, lon } = unprojectMap(
        projection,
        center.x - halfSizeM + c * step,
        center.y + halfSizeM - r * step,
      )
      y = latLonToScene(site, lat, lon, ground.heightAt(lat, lon))[1]
      cache.set(key, y)
    }
    return y
  }
  return (x: number, z: number): number => {
    const { lat, lon } = ground.latLon(x, z)
    const m = projectLatLon(projection, lat, lon)
    const gc = Math.min(segments - 1e-9, Math.max(0, (m.x - (center.x - halfSizeM)) / step))
    const gr = Math.min(segments - 1e-9, Math.max(0, (center.y + halfSizeM - m.y) / step))
    const c = Math.floor(gc)
    const r = Math.floor(gr)
    const fc = gc - c
    const fr = gr - r
    // Same split as buildTerrainGeometry: (a, d, b) and (b, d, e).
    const yb = vertexY(r, c + 1)
    const yd = vertexY(r + 1, c)
    if (fc + fr <= 1) {
      const ya = vertexY(r, c)
      return ya + (yb - ya) * fc + (yd - ya) * fr
    }
    const ye = vertexY(r + 1, c + 1)
    return ye + (yd - ye) * (1 - fc) + (yb - ye) * (1 - fr)
  }
}
