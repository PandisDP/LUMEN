import { DEG, MOON_RADIUS_M } from './constants.ts'
import { type DemGrid, sampleDemStack, sampleMap } from './dem.ts'
import { type Site } from './ephemeris.ts'
import { elevationAngle } from './horizonFromDem.ts'
import {
  type Vec3,
  destination,
  dot,
  enuBasis,
  mapToSouthPolar,
  selenographicToVector,
  southPolarToMap,
  sub,
  vectorToSelenographic,
} from './frames.ts'
import { type HorizonMask, maskAt } from './horizon.ts'
import { slopeAtMap } from './slope.ts'

/**
 * Scene convention for the surface view (metres, right-handed, Y up):
 *   x = east, y = up, z = -north. The origin is the ground point under the lander.
 */
export const enuToScene = (e: number, n: number, u: number): Vec3 => [e, u, -n]

export interface TerrainGeometry {
  positions: Float32Array
  indices: Uint32Array
  segments: number
  halfSizeM: number
  /** Local slope per vertex (deg, Horn on the DEM that supplied the height); 0 if unknown. */
  slopeDeg?: Float32Array
}

/** Ground point in the site's scene frame for a (lat, lon, height). */
export function latLonToScene(site: Site, lat: number, lon: number, heightM: number): Vec3 {
  const basis = enuBasis(site.lat, site.lon)
  const origin = selenographicToVector(site.lat, site.lon, MOON_RADIUS_M + site.heightM)
  const v = sub(selenographicToVector(lat, lon, MOON_RADIUS_M + heightM), origin)
  return enuToScene(dot(v, basis.east), dot(v, basis.north), dot(v, basis.up))
}

/** Inverse of the scene mapping for a picked point: scene (x, y, z) → selenographic lat/lon. */
export function sceneToLatLon(site: Site, p: Vec3): { lat: number; lon: number } {
  const basis = enuBasis(site.lat, site.lon)
  const origin = selenographicToVector(site.lat, site.lon, MOON_RADIUS_M + site.heightM)
  const [e, u, mn] = p
  const n = -mn
  const v: Vec3 = [
    origin[0] + e * basis.east[0] + n * basis.north[0] + u * basis.up[0],
    origin[1] + e * basis.east[1] + n * basis.north[1] + u * basis.up[1],
    origin[2] + e * basis.east[2] + n * basis.north[2] + u * basis.up[2],
  ]
  const { lat, lon } = vectorToSelenographic(v)
  return { lat, lon }
}

/**
 * Samples a DEM on a regular map-plane grid around the site and places every vertex in
 * the local ENU frame using exact spherical geometry (so lunar curvature is visible:
 * ~30 m of drop at 10 km).
 */
export function buildTerrainGeometry(
  grids: DemGrid | readonly DemGrid[],
  site: Site,
  halfSizeM: number,
  segments: number,
): TerrainGeometry {
  // Finest first: a relocated site can sit near the edge of its 20 m tile, so the rest of the
  // patch falls back to the coarse DEM instead of a flat smear.
  const stack: readonly DemGrid[] = Array.isArray(grids) ? grids : [grids as DemGrid]
  const center = southPolarToMap(site.lat, site.lon)
  const basis = enuBasis(site.lat, site.lon)
  const origin = selenographicToVector(site.lat, site.lon, MOON_RADIUS_M + site.heightM)
  const n = segments + 1
  const positions = new Float32Array(n * n * 3)
  const slopeDeg = new Float32Array(n * n)
  const step = (2 * halfSizeM) / segments
  let fallback = site.heightM
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const x = center.x - halfSizeM + c * step
      const y = center.y + halfSizeM - r * step
      let h = NaN
      for (const g of stack) {
        h = sampleMap(g, x, y)
        if (!Number.isNaN(h)) {
          const s = slopeAtMap(g, x, y)
          slopeDeg[r * n + c] = Number.isNaN(s) ? 0 : s
          break
        }
      }
      if (Number.isNaN(h)) h = fallback
      else fallback = h
      const { lat, lon } = mapToSouthPolar(x, y)
      const v = sub(selenographicToVector(lat, lon, MOON_RADIUS_M + h), origin)
      const p = enuToScene(dot(v, basis.east), dot(v, basis.north), dot(v, basis.up))
      positions.set(p, (r * n + c) * 3)
    }
  }
  const indices = new Uint32Array(segments * segments * 6)
  let k = 0
  for (let r = 0; r < segments; r++) {
    for (let c = 0; c < segments; c++) {
      const a = r * n + c
      const b = a + 1
      const d = a + n
      const e = d + 1
      indices.set([a, d, b, b, d, e], k)
      k += 6
    }
  }
  return { positions, indices, segments, halfSizeM, slopeDeg }
}

/** Smooth, gently curved plain for sites without topography. */
export function buildFlatGeometry(halfSizeM: number, segments: number): TerrainGeometry {
  const n = segments + 1
  const positions = new Float32Array(n * n * 3)
  const step = (2 * halfSizeM) / segments
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const e = -halfSizeM + c * step
      const north = halfSizeM - r * step
      const drop = (e * e + north * north) / (2 * MOON_RADIUS_M)
      positions.set(enuToScene(e, north, -drop), (r * n + c) * 3)
    }
  }
  const indices = new Uint32Array(segments * segments * 6)
  let k = 0
  for (let r = 0; r < segments; r++) {
    for (let c = 0; c < segments; c++) {
      const a = r * n + c
      indices.set([a, a + n, a + 1, a + 1, a + n, a + n + 1], k)
      k += 6
    }
  }
  return { positions, indices, segments, halfSizeM }
}

export interface RingGeometry {
  positions: Float32Array
  indices: Uint32Array
}

/**
 * The far horizon (up to 300 km away) cannot be meshed at full resolution, so it is drawn as
 * a ring whose top edge is the computed horizon mask. The bottom edge is aligned with the
 * silhouette of the local tile's border, so the two surfaces join seamlessly for the eye.
 */
export function buildHorizonRing(
  mask: HorizonMask,
  site: Site,
  tileGrids: readonly DemGrid[],
  tileHalfSizeM: number,
  options: { innerM?: number; outerM?: number; azStepDeg?: number; eyeHeightM?: number } = {},
): RingGeometry {
  const innerM = options.innerM ?? tileHalfSizeM * 1.45
  const outerM = options.outerM ?? tileHalfSizeM * 3
  const azStep = options.azStepDeg ?? 0.5
  const eyeH = site.heightM + (options.eyeHeightM ?? 2)
  const bins = Math.round(360 / azStep)
  const positions = new Float32Array((bins + 1) * 2 * 3)
  for (let k = 0; k <= bins; k++) {
    const az = (k % bins) * azStep
    const top = maskAt(mask, az)
    // Elevation angle of the tile border along this azimuth.
    const s = Math.sin(az * DEG)
    const c = Math.cos(az * DEG)
    const edgeD = (tileHalfSizeM * 0.97) / Math.max(Math.abs(s), Math.abs(c))
    const p = destination(site.lat, site.lon, az, edgeD)
    const h = tileGrids.length ? sampleDemStack(tileGrids, p.lat, p.lon) : NaN
    const edgeEl = Number.isNaN(h) ? elevationAngle(eyeH, 0, edgeD) : elevationAngle(eyeH, h, edgeD)
    const bottom = Math.min(edgeEl - 0.02, top - 0.05)
    const put = (i: number, d: number, elDeg: number) => {
      const u = d * Math.tan(elDeg * DEG) + 2
      positions.set(enuToScene(d * s, d * c, u), i * 3)
    }
    put(k * 2, innerM, bottom)
    put(k * 2 + 1, outerM, top)
  }
  const indices = new Uint32Array(bins * 6)
  for (let k = 0; k < bins; k++) {
    const a = k * 2
    indices.set([a, a + 2, a + 1, a + 1, a + 2, a + 3], k * 6)
  }
  return { positions, indices }
}

/** Point in the scene for a sky direction at a given distance (Sun, Earth, labels). */
export function skyPoint(azDeg: number, elDeg: number, distM: number, eyeHeightM = 2): Vec3 {
  const az = azDeg * DEG
  const el = elDeg * DEG
  return enuToScene(
    distM * Math.cos(el) * Math.sin(az),
    distM * Math.cos(el) * Math.cos(az),
    distM * Math.sin(el) + eyeHeightM,
  )
}
