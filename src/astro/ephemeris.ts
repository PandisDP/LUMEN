import { Body, GeoMoon, GeoVector, MakeTime, RotationAxis } from 'astronomy-engine'
import {
  AU_KM,
  DEG,
  EARTH_RADIUS_KM,
  MOON_RADIUS_KM,
  OBSERVER_HEIGHT_M,
  RAD,
  SUN_RADIUS_KM,
} from './constants.ts'
import { type EphemTable, sampleTable, tableCovers } from './ephemTable.ts'
import {
  type Horizontal,
  type Vec3,
  dot,
  enuBasis,
  norm,
  selenographicToVector,
  sub,
  toHorizontal,
} from './frames.ts'

type Mat3 = readonly [Vec3, Vec3, Vec3]

const mul = (m: Mat3, v: Vec3): Vec3 => [dot(m[0], v), dot(m[1], v), dot(m[2], v)]

function mulMat(a: Mat3, b: Mat3): Mat3 {
  const col = (j: number): Vec3 => [b[0][j], b[1][j], b[2][j]]
  const c0 = col(0)
  const c1 = col(1)
  const c2 = col(2)
  return [
    [dot(a[0], c0), dot(a[0], c1), dot(a[0], c2)],
    [dot(a[1], c0), dot(a[1], c1), dot(a[1], c2)],
    [dot(a[2], c0), dot(a[2], c1), dot(a[2], c2)],
  ]
}

/** Frame rotation about Z (passive). */
function rotZ(a: number): Mat3 {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [
    [c, s, 0],
    [-s, c, 0],
    [0, 0, 1],
  ]
}

/** Frame rotation about X (passive). */
function rotX(a: number): Mat3 {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [
    [1, 0, 0],
    [0, c, s],
    [0, -s, c],
  ]
}

/**
 * Rotation from the J2000 equatorial frame (EQJ) to the Moon body-fixed frame, using the
 * IAU/WGCCRE rotation model (pole RA/Dec + prime meridian angle W). The IAU model is a
 * close approximation of the Mean Earth/Polar Axis frame in which LOLA data is published,
 * and already contains the Moon's physical libration terms.
 */
export function moonBodyRotation(date: Date): Mat3 {
  const axis = RotationAxis(Body.Moon, MakeTime(date))
  const alpha = axis.ra * 15 * DEG
  const delta = axis.dec * DEG
  const w = axis.spin * DEG
  return mulMat(rotZ(w), mulMat(rotX(Math.PI / 2 - delta), rotZ(Math.PI / 2 + alpha)))
}

/** Sun and Earth centre positions relative to the Moon centre, body-fixed frame, km. */
export interface BodyFixedEphemeris {
  sun: Vec3
  earth: Vec3
}

let table: EphemTable | null = null
const scratch = new Float64Array(6)

/**
 * Installs a JPL Horizons (DE441) table. Inside its time span every computation in the app
 * (and in the data pipeline) uses it; outside, the IAU model below is used. Pass null to
 * remove it.
 */
export function setEphemerisTable(t: EphemTable | null): void {
  table = t
}

export type EphemerisSource = 'horizons' | 'iau'

/** Which model `bodyFixedEphemeris` uses for an instant. */
export function ephemerisSource(timeMs: number): EphemerisSource {
  return table && tableCovers(table, timeMs) ? 'horizons' : 'iau'
}

export function bodyFixedEphemeris(date: Date): BodyFixedEphemeris {
  if (table && sampleTable(table, date.getTime(), scratch)) {
    return {
      sun: [scratch[0], scratch[1], scratch[2]],
      earth: [scratch[3], scratch[4], scratch[5]],
    }
  }
  return iauEphemeris(date)
}

/** Analytic model: astronomy-engine positions rotated with the IAU lunar orientation. */
export function iauEphemeris(date: Date): BodyFixedEphemeris {
  const time = MakeTime(date)
  const moon = GeoMoon(time)
  const sunGeo = GeoVector(Body.Sun, time, false)
  const rot = moonBodyRotation(date)
  const sunEq: Vec3 = [
    (sunGeo.x - moon.x) * AU_KM,
    (sunGeo.y - moon.y) * AU_KM,
    (sunGeo.z - moon.z) * AU_KM,
  ]
  const earthEq: Vec3 = [-moon.x * AU_KM, -moon.y * AU_KM, -moon.z * AU_KM]
  return { sun: mul(rot, sunEq), earth: mul(rot, earthEq) }
}

/**
 * Sampled ephemeris: 6 numbers per sample (sun xyz, earth xyz), body-fixed km.
 * Independent of the site, so it is computed once and shared by every site evaluated.
 */
export interface EphemerisSeries {
  startMs: number
  stepMs: number
  count: number
  data: Float64Array
}

export function ephemerisSeries(startMs: number, stepMs: number, count: number): EphemerisSeries {
  const data = new Float64Array(count * 6)
  for (let i = 0; i < count; i++) {
    const { sun, earth } = bodyFixedEphemeris(new Date(startMs + i * stepMs))
    data.set(sun, i * 6)
    data.set(earth, i * 6 + 3)
  }
  return { startMs, stepMs, count, data }
}

export interface Site {
  lat: number
  lon: number
  /** Terrain height above the 1737.4 km reference sphere, metres. */
  heightM: number
}

export interface Observer {
  position: Vec3
  basis: ReturnType<typeof enuBasis>
}

export function makeObserver(site: Site): Observer {
  const radiusKm = MOON_RADIUS_KM + (site.heightM + OBSERVER_HEIGHT_M) / 1000
  return {
    position: selenographicToVector(site.lat, site.lon, radiusKm),
    basis: enuBasis(site.lat, site.lon),
  }
}

export interface SkyBody extends Horizontal {
  /** Apparent angular radius, degrees. */
  radiusDeg: number
}

export interface SkyState {
  sun: SkyBody
  earth: SkyBody
  /** Sun-Earth separation seen from the site, degrees. 180 = "full Earth". */
  sunEarthAngleDeg: number
  /** Illuminated fraction of the Earth disc seen from the Moon (0 = new, 1 = full). */
  earthPhase: number
}

export function skyFromVectors(sun: Vec3, earth: Vec3, observer: Observer): SkyState {
  const s = toHorizontal(sub(sun, observer.position), observer.basis)
  const e = toHorizontal(sub(earth, observer.position), observer.basis)
  const toSun = sub(sun, observer.position)
  const toEarth = sub(earth, observer.position)
  const cosSep = dot(toSun, toEarth) / (norm(toSun) * norm(toEarth))
  const sepDeg = Math.acos(Math.max(-1, Math.min(1, cosSep))) * RAD
  // Phase angle at Earth ~ 180° - separation seen from the Moon (Sun is at infinity).
  const phaseAngle = (180 - sepDeg) * DEG
  return {
    sun: { ...s, radiusDeg: Math.asin(SUN_RADIUS_KM / s.dist) * RAD },
    earth: { ...e, radiusDeg: Math.asin(EARTH_RADIUS_KM / e.dist) * RAD },
    sunEarthAngleDeg: sepDeg,
    earthPhase: (1 + Math.cos(phaseAngle)) / 2,
  }
}

/** Topocentric Sun and Earth positions for a site at a given instant. */
export function skyAt(date: Date, site: Site): SkyState {
  const { sun, earth } = bodyFixedEphemeris(date)
  return skyFromVectors(sun, earth, makeObserver(site))
}
