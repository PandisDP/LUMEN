import { DEG, MOON_RADIUS_M, RAD } from './constants.ts'
import { type DemGrid, sampleDemStack } from './dem.ts'
import { type Site } from './ephemeris.ts'
import {
  type Vec3,
  destination,
  dot,
  enuBasis,
  selenographicToVector,
  sub,
  vectorToSelenographic,
  wrap180,
  wrap360,
} from './frames.ts'
import { latLonToScene } from './terrainMesh.ts'

/**
 * Kinematic powered-descent profile for the landing view (not a guidance law): a braking
 * phase from ~3.5 km, an approach that pitches over towards the site, a hover ~100 m up and
 * a vertical drop to the lander's eye height. Distances are horizontal from the site, heights
 * above the site's ground; times are real-time seconds of the animation.
 */
export const DESCENT_PROFILE = [
  { distM: 7_500, altM: 3_500, tS: 0, clearM: 150 },
  { distM: 4_000, altM: 1_800, tS: 10, clearM: 150 },
  { distM: 1_500, altM: 500, tS: 20, clearM: 150 },
  { distM: 150, altM: 100, tS: 32, clearM: 20 },
  { distM: 0, altM: 30, tS: 40, clearM: 0 },
  { distM: 0, altM: 2, tS: 45, clearM: 0 },
] as const

export const DESCENT_DURATION_S = DESCENT_PROFILE[DESCENT_PROFILE.length - 1].tS
/** Same eye height as the surface view, so the descent ends exactly in its pose. */
export const DESCENT_EYE_M = DESCENT_PROFILE[DESCENT_PROFILE.length - 1].altM
/** The start must stay well inside the local tile so its border never shows. */
export const DESCENT_MAX_START_FRACTION = 0.8
/** Below this height the camera turns from the boresight-on-target pose to the lander's eye. */
export const TERMINAL_BLEND_M = 100

export type DescentPhase = 'braking' | 'approach' | 'terminal' | 'landed'

export function descentPhase(tS: number): DescentPhase {
  if (tS < DESCENT_PROFILE[2].tS) return 'braking'
  if (tS < DESCENT_PROFILE[3].tS) return 'approach'
  if (tS < DESCENT_DURATION_S) return 'terminal'
  return 'landed'
}

/** Nominal approach: Sun behind the craft (it comes from the Sun's azimuth). */
export const sunBehindApproach = (sunAz: number) => wrap360(sunAz)
/** Sun ahead: the worst case for optical navigation / hazard cameras. */
export const sunAheadApproach = (sunAz: number) => wrap360(sunAz + 180)

/**
 * Ground under a point of the surface scene (x = east, y = up, z = -north, origin on the
 * site's ground). Sites without topography follow the reference sphere.
 */
export function groundSampler(site: Site, grids: readonly DemGrid[]) {
  const basis = enuBasis(site.lat, site.lon)
  const origin = selenographicToVector(site.lat, site.lon, MOON_RADIUS_M + site.heightM)
  const latLon = (x: number, z: number) => {
    const n = -z
    const v: Vec3 = [
      origin[0] + x * basis.east[0] + n * basis.north[0],
      origin[1] + x * basis.east[1] + n * basis.north[1],
      origin[2] + x * basis.east[2] + n * basis.north[2],
    ]
    const { lat, lon } = vectorToSelenographic(v)
    return { lat, lon }
  }
  const heightAt = (lat: number, lon: number) => {
    const h = grids.length ? sampleDemStack(grids, lat, lon) : NaN
    return Number.isNaN(h) ? site.heightM : h
  }
  /** Scene y of the ground below (x, z). */
  const groundY = (x: number, z: number) => {
    const { lat, lon } = latLon(x, z)
    return dot(
      sub(selenographicToVector(lat, lon, MOON_RADIUS_M + heightAt(lat, lon)), origin),
      basis.up,
    )
  }
  return { latLon, heightAt, groundY }
}

export type GroundSampler = ReturnType<typeof groundSampler>

export interface DescentWaypoint {
  /** Scene position. */
  p: Vec3
  tS: number
  /** Horizontal distance to the site, m. */
  distM: number
  /** Height above the site's ground after terrain clearance, m. */
  altM: number
}

/**
 * Control points of the descent towards the site, arriving from `approachAzDeg` (the azimuth,
 * seen from the site, the craft comes from). Each point is raised if the terrain under its
 * stretch of the track would leave less than its clearance, and heights never increase.
 */
export function descentWaypoints(
  site: Site,
  grids: readonly DemGrid[],
  tileHalfSizeM: number,
  approachAzDeg: number,
): DescentWaypoint[] {
  const k = Math.min(1, (DESCENT_MAX_START_FRACTION * tileHalfSizeM) / DESCENT_PROFILE[0].distM)
  const dists = DESCENT_PROFILE.map((w) => w.distM * k)
  const heights = DESCENT_PROFILE.map((w) => site.heightM + w.altM)
  const n = DESCENT_PROFILE.length
  for (let i = 0; i < n; i++) {
    const { clearM } = DESCENT_PROFILE[i]
    if (!clearM || !grids.length) continue
    const lo = dists[Math.min(n - 1, i + 1)]
    const hi = i === 0 ? dists[0] : dists[i - 1]
    let top = -Infinity
    for (let s = 0; s <= 24; s++) {
      const d = lo + ((hi - lo) * s) / 24
      const p = destination(site.lat, site.lon, approachAzDeg, d)
      const h = sampleDemStack(grids, p.lat, p.lon)
      if (!Number.isNaN(h)) top = Math.max(top, h)
    }
    if (Number.isFinite(top)) heights[i] = Math.max(heights[i], top + clearM)
  }
  for (let i = n - 2; i >= 0; i--) heights[i] = Math.max(heights[i], heights[i + 1])
  return DESCENT_PROFILE.map((w, i) => {
    const ll =
      dists[i] > 0
        ? destination(site.lat, site.lon, approachAzDeg, dists[i])
        : { lat: site.lat, lon: site.lon }
    return {
      p: latLonToScene(site, ll.lat, ll.lon, heights[i]),
      tS: w.tS,
      distM: dists[i],
      altM: heights[i] - site.heightM,
    }
  })
}

/**
 * Monotone cubic (Fritsch–Carlson) through strictly increasing (xs, ys): smooth and never
 * overshoots, so the time → curve-parameter map has no backwards jumps.
 */
export function monotoneCubic(xs: readonly number[], ys: readonly number[]) {
  const n = xs.length
  const d = xs.slice(1).map((x, i) => (ys[i + 1] - ys[i]) / (x - xs[i]))
  const m = xs.map((_, i) =>
    i === 0 ? d[0] : i === n - 1 ? d[n - 2] : d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2,
  )
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0
      m[i + 1] = 0
      continue
    }
    const a = m[i] / d[i]
    const b = m[i + 1] / d[i]
    const s = a * a + b * b
    if (s > 9) {
      const t = 3 / Math.sqrt(s)
      m[i] = t * a * d[i]
      m[i + 1] = t * b * d[i]
    }
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0]
    if (x >= xs[n - 1]) return ys[n - 1]
    let i = 0
    while (x > xs[i + 1]) i++
    const h = xs[i + 1] - xs[i]
    const t = (x - xs[i]) / h
    const t2 = t * t
    const t3 = t2 * t
    return (
      (2 * t3 - 3 * t2 + 1) * ys[i] +
      (t3 - 2 * t2 + t) * h * m[i] +
      (-2 * t3 + 3 * t2) * ys[i + 1] +
      (t3 - t2) * h * m[i + 1]
    )
  }
}

/** Animation time (s) → parameter in [0, 1] of a curve through the waypoints (uniform knots). */
export function descentTimeMap(waypoints: readonly DescentWaypoint[]) {
  const last = waypoints.length - 1
  return monotoneCubic(
    waypoints.map((w) => w.tS),
    waypoints.map((_, i) => i / last),
  )
}

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * Camera attitude during the descent: heading to the site with the boresight 15–25° below the
 * horizon (keeps the ground, not the tile's edge, in view), then turning to the surface view's
 * pose during the last TERMINAL_BLEND_M of the drop.
 */
export function descentAttitude(
  altM: number,
  distM: number,
  headingAz: number,
  final: { az: number; el: number },
): { az: number; el: number } {
  const down = Math.min(25, Math.max(15, Math.atan2(altM, Math.max(distM, 1)) * RAD))
  const w = smoothstep(TERMINAL_BLEND_M, DESCENT_EYE_M, altM)
  return {
    az: wrap360(headingAz + wrap180(final.az - headingAz) * w),
    el: -down + (final.el + down) * w,
  }
}

/** Half of the diagonal field of view of a perspective camera, deg. */
export function halfDiagonalFovDeg(verticalFovDeg: number, aspect: number): number {
  return Math.atan(Math.tan((verticalFovDeg / 2) * DEG) * Math.hypot(1, aspect)) * RAD
}

export function angleBetweenDeg(a: Vec3, b: Vec3): number {
  const c = dot(a, b) / (Math.hypot(...a) * Math.hypot(...b))
  return Math.acos(Math.min(1, Math.max(-1, c))) * RAD
}

/** Unit vector (scene frame) towards a sky direction. */
export function skyDirection(azDeg: number, elDeg: number): Vec3 {
  const az = azDeg * DEG
  const el = elDeg * DEG
  return [Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)]
}

/**
 * First intersection of a ray with the ground (adaptive march + bisection on the DEM), or
 * null if it leaves `maxDistM` without hitting. Cheap enough to run at 10 Hz, unlike a
 * raycast against the 250k-quad terrain mesh.
 */
export function rayGround(
  ground: GroundSampler,
  origin: Vec3,
  dir: Vec3,
  maxDistM = 30_000,
): { point: Vec3; distM: number } | null {
  const len = Math.hypot(...dir)
  const u: Vec3 = [dir[0] / len, dir[1] / len, dir[2] / len]
  const at = (d: number): Vec3 => [origin[0] + u[0] * d, origin[1] + u[1] * d, origin[2] + u[2] * d]
  const below = (p: Vec3) => p[1] <= ground.groundY(p[0], p[2])
  if (below(origin)) return { point: origin, distM: 0 }
  let prev = 0
  let d = 0
  while (d < maxDistM) {
    d = Math.min(maxDistM, d + Math.max(2, d * 0.015))
    if (below(at(d))) {
      let lo = prev
      let hi = d
      for (let i = 0; i < 14; i++) {
        const mid = (lo + hi) / 2
        if (below(at(mid))) hi = mid
        else lo = mid
      }
      return { point: at(hi), distM: hi }
    }
    prev = d
  }
  return null
}

/**
 * Direct sunlight on the lander's panels relative to a panel facing the Sun squarely (%):
 * a flat top deck and a vertical side panel turned to the Sun's azimuth.
 */
export function panelIllumination(sunElDeg: number, sunFrac: number) {
  const el = sunElDeg * DEG
  return {
    topPct: 100 * sunFrac * Math.max(0, Math.sin(el)),
    sidePct: 100 * sunFrac * Math.max(0, Math.cos(el)),
  }
}
