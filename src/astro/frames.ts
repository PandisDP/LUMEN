import { DEG, MOON_RADIUS_M, RAD } from './constants.ts'

export type Vec3 = readonly [number, number, number]

export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const norm = (a: Vec3) => Math.hypot(a[0], a[1], a[2])

/** Wraps an angle in degrees to [0, 360). */
export const wrap360 = (deg: number) => ((deg % 360) + 360) % 360
/** Wraps an angle in degrees to [-180, 180). */
export const wrap180 = (deg: number) => wrap360(deg + 180) - 180

/**
 * Selenographic (planetocentric) latitude/longitude to a Moon body-fixed vector.
 * Frame: +Z north pole, +X towards lon 0 (mean sub-Earth point), +Y towards lon 90°E.
 */
export function selenographicToVector(latDeg: number, lonDeg: number, radius: number): Vec3 {
  const lat = latDeg * DEG
  const lon = lonDeg * DEG
  const c = Math.cos(lat)
  return [radius * c * Math.cos(lon), radius * c * Math.sin(lon), radius * Math.sin(lat)]
}

export function vectorToSelenographic(v: Vec3): { lat: number; lon: number; radius: number } {
  const radius = norm(v)
  return {
    lat: Math.asin(v[2] / radius) * RAD,
    lon: Math.atan2(v[1], v[0]) * RAD,
    radius,
  }
}

/** Local East-North-Up unit vectors at a surface point, in the body-fixed frame. */
export interface EnuBasis {
  east: Vec3
  north: Vec3
  up: Vec3
}

export function enuBasis(latDeg: number, lonDeg: number): EnuBasis {
  const lat = latDeg * DEG
  const lon = lonDeg * DEG
  const sLat = Math.sin(lat)
  const cLat = Math.cos(lat)
  const sLon = Math.sin(lon)
  const cLon = Math.cos(lon)
  return {
    east: [-sLon, cLon, 0],
    north: [-sLat * cLon, -sLat * sLon, cLat],
    up: [cLat * cLon, cLat * sLon, sLat],
  }
}

export interface Horizontal {
  /** Azimuth in degrees, clockwise from local north (0 = N, 90 = E). */
  az: number
  /** Elevation above the ideal (spherical) horizon plane, degrees. */
  el: number
  /** Distance to the target, in the same units as the input vectors. */
  dist: number
}

/** Converts a direction (target - observer) to azimuth/elevation in the local frame. */
export function toHorizontal(v: Vec3, basis: EnuBasis): Horizontal {
  const dist = norm(v)
  const e = dot(v, basis.east)
  const n = dot(v, basis.north)
  const u = dot(v, basis.up)
  return { az: wrap360(Math.atan2(e, n) * RAD), el: Math.asin(u / dist) * RAD, dist }
}

/** Unit vector in ENU components (east, north, up) for an azimuth/elevation. */
export function horizontalToEnu(azDeg: number, elDeg: number): Vec3 {
  const az = azDeg * DEG
  const el = elDeg * DEG
  return [Math.cos(el) * Math.sin(az), Math.cos(el) * Math.cos(az), Math.sin(el)]
}

/**
 * Great-circle destination on the reference sphere.
 * Returns the point reached travelling `distM` metres from (lat, lon) along `bearingDeg`.
 */
export function destination(
  latDeg: number,
  lonDeg: number,
  bearingDeg: number,
  distM: number,
): { lat: number; lon: number } {
  const d = distM / MOON_RADIUS_M
  const lat1 = latDeg * DEG
  const lon1 = lonDeg * DEG
  const brg = bearingDeg * DEG
  const sLat2 = Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brg)
  const lat2 = Math.asin(Math.max(-1, Math.min(1, sLat2)))
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(brg) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    )
  return { lat: lat2 * RAD, lon: wrap180(lon2 * RAD) }
}

/** Great-circle distance on the reference sphere, metres. */
export function surfaceDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const a = selenographicToVector(lat1, lon1, 1)
  const b = selenographicToVector(lat2, lon2, 1)
  return Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) * MOON_RADIUS_M
}

/** Distance (m) and initial bearing (deg clockwise from north) from point 1 to point 2. */
export function bearingDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const p1 = lat1 * DEG
  const p2 = lat2 * DEG
  const dl = (lon2 - lon1) * DEG
  const az = Math.atan2(
    Math.sin(dl) * Math.cos(p2),
    Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl),
  )
  return { distM: surfaceDistance(lat1, lon1, lat2, lon2), azDeg: (az * RAD + 360) % 360 }
}

/**
 * South polar stereographic projection used by the LOLA polar products (DSMAP_POLAR.CAT):
 * lon 0 points "up" the image (towards Earth), lon 90°E to the right.
 * Returns map coordinates in metres: x to the right, y up.
 */
export function southPolarToMap(latDeg: number, lonDeg: number): { x: number; y: number } {
  const r = 2 * MOON_RADIUS_M * Math.tan(((90 - Math.abs(latDeg)) * DEG) / 2)
  const lon = lonDeg * DEG
  return { x: r * Math.sin(lon), y: r * Math.cos(lon) }
}

export function mapToSouthPolar(x: number, y: number): { lat: number; lon: number } {
  const r = Math.hypot(x, y)
  return {
    lat: -90 + 2 * Math.atan(r / (2 * MOON_RADIUS_M)) * RAD,
    lon: wrap180(Math.atan2(x, y) * RAD),
  }
}
