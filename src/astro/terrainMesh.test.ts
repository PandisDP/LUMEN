import { describe, expect, it } from 'vitest'
import { MOON_RADIUS_M } from './constants.ts'
import { type DemGrid, lolaProductMeta } from './dem.ts'
import {
  buildFlatGeometry,
  buildHorizonRing,
  buildTerrainGeometry,
  skyPoint,
} from './terrainMesh.ts'

const flatDem = (): DemGrid => {
  const size = 300
  return { ...lolaProductMeta(size, 200), data: new Int16Array(size * size) }
}

describe('buildTerrainGeometry', () => {
  it('centres the site at the origin and shows the lunar curvature', () => {
    const site = { lat: -89.8, lon: 45, heightM: 0 }
    const g = buildTerrainGeometry(flatDem(), site, 10_000, 20)
    const n = 21
    const centre = (10 * n + 10) * 3
    expect(Math.abs(g.positions[centre])).toBeLessThan(1)
    expect(Math.abs(g.positions[centre + 1])).toBeLessThan(1)
    expect(Math.abs(g.positions[centre + 2])).toBeLessThan(1)
    // A corner ~14 km away sits ~57 m below the tangent plane (d²/2R).
    const corner = g.positions[1]
    const d = Math.hypot(g.positions[0], g.positions[2])
    expect(corner).toBeCloseTo(-(d * d) / (2 * MOON_RADIUS_M), -1)
    expect(g.indices).toHaveLength(20 * 20 * 6)
  })
})

describe('buildFlatGeometry', () => {
  it('drops away from the centre', () => {
    const g = buildFlatGeometry(1000, 2)
    expect(g.positions[4 * 3 + 1]).toBe(-0) // centre vertex of a 3x3 grid
    expect(g.positions[1]).toBeLessThan(0)
  })
})

describe('horizon ring and sky points', () => {
  it('puts the top of the ring on the mask elevation', () => {
    const mask = { azStepDeg: 90, elevDeg: [3, 3, 3, 3] }
    const ring = buildHorizonRing(mask, { lat: -89.8, lon: 45, heightM: 0 }, [], 10_000, {
      outerM: 30_000,
      azStepDeg: 90,
    })
    // Second vertex = outer edge at azimuth 0 (north = -z).
    const [x, y, z] = ring.positions.slice(3, 6)
    expect(x).toBeCloseTo(0, 6)
    expect(z).toBeCloseTo(-30_000, 6)
    expect(Math.atan((y - 2) / 30_000) * (180 / Math.PI)).toBeCloseTo(3, 6)
  })

  it('maps azimuth 90° to +x (east) and elevation to +y', () => {
    const [x, y, z] = skyPoint(90, 30, 1000, 0)
    expect(x).toBeCloseTo(866.03, 1)
    expect(y).toBeCloseTo(500, 6)
    expect(z).toBeCloseTo(0, 6)
  })
})

describe('scene ↔ lat/lon', () => {
  it('sceneToLatLon inverts latLonToScene to well under a metre', async () => {
    const { latLonToScene, sceneToLatLon } = await import('./terrainMesh.ts')
    const { destination, surfaceDistance } = await import('./frames.ts')
    const site = { lat: -89.45, lon: 222.7, heightM: 1200 }
    for (const [az, d] of [
      [0, 500],
      [77, 2000],
      [200, 8000],
    ]) {
      const p = destination(site.lat, site.lon, az, d)
      const back = sceneToLatLon(site, latLonToScene(site, p.lat, p.lon, 1200))
      expect(surfaceDistance(back.lat, back.lon, p.lat, p.lon)).toBeLessThan(0.5)
    }
  })

  it('returns per-vertex slopes (0 on flat ground)', () => {
    const g = buildTerrainGeometry(flatDem(), { lat: -89.8, lon: 45, heightM: 0 }, 5_000, 10)
    expect(g.slopeDeg).toHaveLength(11 * 11)
    expect(Math.max(...g.slopeDeg!)).toBeCloseTo(0, 6)
  })
})
