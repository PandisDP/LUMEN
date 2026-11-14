import { BufferAttribute, BufferGeometry, SphereGeometry } from 'three'
import { DEG, HOUR_MS, MOON_RADIUS_M } from '../../astro/constants.ts'
import { type DemGrid, pixelToLatLon, pixelToMap, samplePixel } from '../../astro/dem.ts'
import { type MapExtent, mapUv } from '../../astro/imagery.ts'
import { type Vec3, selenographicToVector } from '../../astro/frames.ts'

/**
 * Orbital view convention: 1 unit = 1 lunar radius. Body-fixed (x to lon 0, z north) maps
 * to the scene as (x, z, -y) so that north is +Y (three.js "up").
 */
export const bodyToScene = (v: Vec3): [number, number, number] => [v[0], v[2], -v[1]]

export function surfacePoint(lat: number, lon: number, heightM: number, exaggeration: number) {
  return bodyToScene(selenographicToVector(lat, lon, 1 + (heightM * exaggeration) / MOON_RADIUS_M))
}

/** Latitude where the textured globe stops and the LOLA relief cap takes over. */
export const CAP_EDGE_LAT = -75.5

/**
 * Globe without its south cap. Three.js stretches the UVs over a partial sphere, so the
 * v coordinate is recomputed from the real polar angle to keep the texture registered.
 */
export function globeGeometry(): SphereGeometry {
  const thetaLength = (90 - CAP_EDGE_LAT) * DEG
  const g = new SphereGeometry(1, 192, 96, 0, Math.PI * 2, 0, thetaLength)
  const pos = g.attributes.position
  const uv = g.attributes.uv
  for (let i = 0; i < pos.count; i++) {
    const theta = Math.acos(Math.max(-1, Math.min(1, pos.getY(i))))
    uv.setY(i, 1 - theta / Math.PI)
  }
  uv.needsUpdate = true
  return g
}

/**
 * LOLA relief for the south polar cap (from the 960 m DEM), with vertical exaggeration. With
 * `imageExtent` it also gets UVs into a polar stereographic image (Moon Trek WAC mosaic).
 */
export function polarCapGeometry(
  dem: DemGrid,
  stride: number,
  exaggeration: number,
  imageExtent?: MapExtent,
): BufferGeometry {
  const cols = Math.floor((dem.width - 1) / stride) + 1
  const rows = Math.floor((dem.height - 1) / stride) + 1
  const positions = new Float32Array(cols * rows * 3)
  const inside = new Uint8Array(cols * rows)
  const uvs = imageExtent ? new Float32Array(cols * rows * 2) : null
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const pc = c * stride
      const pr = r * stride
      const { lat, lon } = pixelToLatLon(dem, pc, pr)
      let h = samplePixel(dem, pc, pr)
      if (Number.isNaN(h)) h = 0
      const k = r * cols + c
      inside[k] = lat <= CAP_EDGE_LAT ? 1 : 0
      positions.set(surfacePoint(lat, lon, h, exaggeration), k * 3)
      if (uvs) {
        const { x, y } = pixelToMap(dem, pc, pr)
        uvs.set(mapUv(imageExtent!, x, y), k * 2)
      }
    }
  }
  const idx: number[] = []
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c
      const b = a + 1
      const d = a + cols
      const e = d + 1
      if (!(inside[a] && inside[b] && inside[d] && inside[e])) continue
      // Map axes (x, y) and the outward normal form a right-handed set: (a, d, b) faces out.
      idx.push(a, d, b, b, d, e)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(positions, 3))
  if (uvs) g.setAttribute('uv', new BufferAttribute(uvs, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

const DAY_MS = 24 * HOUR_MS

/**
 * Rotation about +Y that puts the Earth texture's sub-solar longitude under the Sun. `sunDir` is
 * the scene-frame Sun direction (the Sun is so far that it is the same from the Earth and Moon).
 * The equation of time (±4 min) and the Earth's tilt are ignored: this only orients a not-to-scale
 * marker so its day side and city lights look right.
 */
export function earthSpin(timeMs: number, sunDir: { x: number; z: number }): number {
  const utcHours = (((timeMs % DAY_MS) + DAY_MS) % DAY_MS) / HOUR_MS
  const subSolarLon = -(utcHours - 12) * 15 * DEG
  // SphereGeometry puts longitude L at local (cos L, 0, -sin L); a Y-rotation adds to that angle.
  return Math.atan2(-sunDir.z, sunDir.x) - subSolarLon
}
