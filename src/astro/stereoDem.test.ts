import { describe, expect, it } from 'vitest'
import { DEG, MOON_RADIUS_M } from './constants.ts'
import {
  type DemGrid,
  type DemMeta,
  demCovers,
  latLonToPixel,
  lolaProductMeta,
  pixelToLatLon,
  pixelToMap,
  sampleDem,
  sampleDemStack,
} from './dem.ts'
import {
  destination,
  mapToSouthPolar,
  mapToStereo,
  southPolarToMap,
  stereoToMap,
  wrap180,
} from './frames.ts'
import { computeHorizonMask, elevationAngle } from './horizonFromDem.ts'
import { slopeAt, slopeAtPixel, slopeStats } from './slope.ts'
import { buildTerrainGeometry } from './terrainMesh.ts'

/** Hadley–Apennine (Apollo 15): a mid-latitude, northern-hemisphere centre. */
const LAT0 = 26.1322
const LON0 = 3.6339

/** Local raster in the oblique stereographic centred on (lat0, lon0), site on the centre pixel. */
function localMeta(size: number, scaleM: number, lat0 = LAT0, lon0 = LON0): DemMeta {
  const half = (size / 2) * scaleM
  return {
    originX: -half,
    originY: half,
    scaleM,
    width: size,
    height: size,
    heightScale: 0.5,
    projection: { kind: 'stereo', lat0, lon0 },
  }
}

/** Grid whose height is f(x, y) in map metres (x east, y north at the centre). */
function localGrid(
  f: (x: number, y: number) => number,
  size: number,
  scaleM: number,
  heightScale = 0.5,
): DemGrid {
  const meta = { ...localMeta(size, scaleM), heightScale }
  const data = new Int16Array(size * size)
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const { x, y } = pixelToMap(meta, c, r)
      data[r * size + c] = Math.round(f(x, y) / heightScale)
    }
  }
  return { ...meta, data }
}

describe('oblique stereographic projection', () => {
  it('reduces to the LOLA south polar projection for lat0 = -90, lon0 = 0', () => {
    for (const [lat, lon] of [
      [-89.9, 0],
      [-85, 37],
      [-80.13, -123.4],
      [-75, 179],
      [-60, -45],
    ]) {
      const polar = southPolarToMap(lat, lon)
      const stereo = stereoToMap(-90, 0, lat, lon)
      expect(stereo.x).toBeCloseTo(polar.x, 5)
      expect(stereo.y).toBeCloseTo(polar.y, 5)
      const back = mapToStereo(-90, 0, polar.x, polar.y)
      const ref = mapToSouthPolar(polar.x, polar.y)
      expect(back.lat).toBeCloseTo(ref.lat, 9)
      expect(back.lon).toBeCloseTo(ref.lon, 9)
    }
  })

  it('maps the centre to the origin, north to +y and east to +x', () => {
    const o = stereoToMap(LAT0, LON0, LAT0, LON0)
    expect(o.x).toBeCloseTo(0, 6)
    expect(o.y).toBeCloseTo(0, 6)
    // 1° along the central meridian: 2R·tan(0.5°) = 30 324.1 m.
    const n = stereoToMap(LAT0, LON0, LAT0 + 1, LON0)
    expect(n.x).toBeCloseTo(0, 6)
    expect(n.y).toBeCloseTo(2 * MOON_RADIUS_M * Math.tan(0.5 * DEG), 4)
    expect(n.y).toBeCloseTo(30_324.1, 0)
    // A quarter of the way around the equator from (0, 0): ρ = 2R·tan(45°) = 2R, due east.
    const e = stereoToMap(0, 0, 0, 90)
    expect(e.x).toBeCloseTo(2 * MOON_RADIUS_M, 3)
    expect(e.y).toBeCloseTo(0, 3)
    // 10 km due east of the centre lands on +x (to first order).
    const p = destination(LAT0, LON0, 90, 10_000)
    const m = stereoToMap(LAT0, LON0, p.lat, p.lon)
    expect(m.x).toBeCloseTo(10_000, 0)
    expect(Math.abs(m.y)).toBeLessThan(0.1)
  })

  it('round-trips, also across the 180° meridian and for both hemispheres', () => {
    for (const [lat0, lon0] of [
      [LAT0, LON0],
      [-45.4446, 177.5991],
      [0.6741, 23.473],
      [-80.13, 1.44],
    ]) {
      for (const [dLat, dLon] of [
        [0, 0],
        [0.7, -1.3],
        [-5, 8],
        [9, -9.5],
      ]) {
        const lat = lat0 + dLat
        const lon = lon0 + dLon
        const { x, y } = stereoToMap(lat0, lon0, lat, lon)
        const back = mapToStereo(lat0, lon0, x, y)
        expect(back.lat).toBeCloseTo(lat, 9)
        expect(wrap180(back.lon - lon)).toBeCloseTo(0, 9)
      }
    }
  })

  it('has the scale factor k = 1 + (ρ/2R)² used by the slopes (same as the polar map)', () => {
    // 500 km from the centre: map distances are k times the ground ones, in any direction.
    const far = destination(LAT0, LON0, 60, 500_000)
    const a = stereoToMap(LAT0, LON0, far.lat, far.lon)
    const k = 1 + (a.x * a.x + a.y * a.y) / (4 * MOON_RADIUS_M ** 2)
    expect(k).toBeCloseTo(2 / (1 + Math.cos(500_000 / MOON_RADIUS_M)), 9)
    for (const brg of [0, 90, 200]) {
      const q = destination(far.lat, far.lon, brg, 1000)
      const b = stereoToMap(LAT0, LON0, q.lat, q.lon)
      expect(Math.hypot(b.x - a.x, b.y - a.y) / 1000).toBeCloseTo(k, 3)
    }
  })
})

describe('DEM in a local (non-polar) projection', () => {
  // Height as a smooth function of latitude and longitude, sampled through the projection.
  const f = (lat: number, lon: number) => 1000 * (lat - LAT0) - 600 * (lon - LON0)
  const meta = localMeta(256, 500)
  const data = new Int16Array(meta.width * meta.height)
  for (let r = 0; r < meta.height; r++) {
    for (let c = 0; c < meta.width; c++) {
      const { lat, lon } = pixelToLatLon(meta, c, r)
      data[r * meta.width + c] = Math.round(f(lat, lon) / meta.heightScale)
    }
  }
  const g: DemGrid = { ...meta, data }

  it('puts the site on the centre pixel and round-trips pixels', () => {
    const { c, r } = latLonToPixel(meta, LAT0, LON0)
    expect(c).toBeCloseTo(128, 6)
    expect(r).toBeCloseTo(128, 6)
    const ll = pixelToLatLon(meta, 40.25, 200.5)
    const px = latLonToPixel(meta, ll.lat, ll.lon)
    expect(px.c).toBeCloseTo(40.25, 6)
    expect(px.r).toBeCloseTo(200.5, 6)
    // Rows grow southwards, columns eastwards.
    expect(pixelToLatLon(meta, 128, 0).lat).toBeGreaterThan(LAT0)
    expect(pixelToLatLon(meta, 255, 128).lon).toBeGreaterThan(LON0)
  })

  it('samples by latitude/longitude in the northern hemisphere', () => {
    expect(sampleDem(g, LAT0, LON0)).toBeCloseTo(0, 6)
    for (const [lat, lon] of [
      [LAT0 + 0.9, LON0 - 0.4],
      [LAT0 - 1.5, LON0 + 1.7],
      [LAT0 + 0.01, LON0 + 2],
    ]) {
      expect(Math.abs(sampleDem(g, lat, lon) - f(lat, lon))).toBeLessThan(1)
    }
    expect(sampleDem(g, LAT0 + 5, LON0)).toBeNaN()
    expect(sampleDem(g, -LAT0, LON0 + 180)).toBeNaN()
  })

  it('knows what it covers; a polar raster still rejects the northern hemisphere', () => {
    expect(demCovers(g, LAT0 + 1, LON0 + 1)).toBe(true)
    expect(demCovers(g, LAT0 + 3, LON0)).toBe(false)
    expect(demCovers(g, -LAT0, LON0 + 180)).toBe(false)
    expect(demCovers(g, -89, 0)).toBe(false)
    const polar: DemGrid = { ...lolaProductMeta(64, 1000), data: new Int16Array(64 * 64).fill(20) }
    expect(sampleDem(polar, 89.9, 0)).toBeNaN()
    expect(demCovers(polar, 89.9, 0)).toBe(false)
    // Mixed stack (local tile over a polar DEM): each raster answers in its own projection.
    expect(sampleDemStack([g, polar], LAT0, LON0)).toBeCloseTo(0, 6)
    expect(sampleDemStack([g, polar], -89.9, 0)).toBe(10)
    expect(sampleDemStack([g, polar], 60, 100)).toBeNaN()
  })
})

describe('slope in a mid-latitude grid', () => {
  it('recovers the angle of a tilted plane', () => {
    for (const [angle, dir] of [
      [10, 0],
      [10, 130],
      [22, 285],
    ]) {
      const t = Math.tan(angle * DEG)
      const g = localGrid(
        (x, y) => t * (x * Math.sin(dir * DEG) + y * Math.cos(dir * DEG)),
        201,
        60,
        0.01,
      )
      expect(slopeAtPixel(g, 100, 100)).toBeCloseTo(angle, 2)
      expect(slopeAt(g, LAT0, LON0)).toBeCloseTo(angle, 2)
      // 4 km away the stereographic scale factor is still 1 to a part in a million.
      const p = destination(LAT0, LON0, 40, 4000)
      expect(slopeAt(g, p.lat, p.lon)).toBeCloseTo(angle, 2)
      const s = slopeStats(g, LAT0, LON0, 500)
      expect(s.center).toBeCloseTo(angle, 2)
      expect(s.p90).toBeCloseTo(angle, 2)
      expect(s.resolutionM).toBe(60)
    }
  })
})

describe('horizon from a non-polar grid', () => {
  // 2 km high, 1 km thick ridge running east–west, 10 km north of the site (±40 km raster).
  const ridge = localGrid((_x, y) => (y >= 10_000 && y <= 11_000 ? 2000 : 0), 400, 200)
  const h = computeHorizonMask([ridge], LAT0, LON0, { maxDistM: 35_000, azStepDeg: 5 })
  const at = (az: number) => h.elevDeg[az / 5]

  it('sees the ridge to the north at atan(h/d) minus the curvature', () => {
    expect(h.terrainHeightM).toBe(0)
    expect(Math.abs(at(0) - elevationAngle(2, 2000, 10_000))).toBeLessThan(0.4)
    expect(at(0)).toBeGreaterThan(10.5)
    expect(Math.abs(h.obstructionDistM[0] - 10_000)).toBeLessThan(400)
    // Obliquely the same ridge is √2 further away, hence lower.
    expect(Math.abs(at(45) - elevationAngle(2, 2000, 14_142))).toBeLessThan(0.4)
    expect(Math.abs(at(315) - at(45))).toBeLessThan(0.2)
  })

  it('and open ground everywhere else', () => {
    for (const az of [90, 135, 180, 225, 270]) expect(at(az)).toBeLessThan(0)
  })
})

describe('terrain mesh on a local grid', () => {
  it('centres the site and keeps east = +x, north = -z', () => {
    const flat = localGrid(() => 0, 400, 200)
    const site = { lat: LAT0, lon: LON0, heightM: 0 }
    const geo = buildTerrainGeometry([flat], site, 10_000, 20)
    const n = 21
    const v = (r: number, c: number) =>
      Array.from(geo.positions.subarray((r * n + c) * 3, (r * n + c) * 3 + 3))
    const centre = v(10, 10)
    for (const k of centre) expect(Math.abs(k)).toBeLessThan(1)
    const east = v(10, 20)
    expect(east[0]).toBeCloseTo(10_000, -1)
    expect(Math.abs(east[2])).toBeLessThan(5)
    expect(east[1]).toBeCloseTo(-(10_000 ** 2) / (2 * MOON_RADIUS_M), 0)
    const north = v(0, 10)
    expect(north[2]).toBeCloseTo(-10_000, -1)
    expect(Math.abs(north[0])).toBeLessThan(5)
    expect(Array.from(geo.slopeDeg!).every((s) => s === 0)).toBe(true)
  })

  it('falls back to a raster in another projection by latitude/longitude', () => {
    // A tiny local tile (±1 km) over a polar DEM of constant 100 m: the patch beyond the tile
    // must take the polar heights instead of smearing the tile's.
    const lat = -88
    const tile: DemGrid = {
      ...localMeta(20, 100, lat, 30),
      data: new Int16Array(400).fill(0),
    }
    const polar: DemGrid = {
      ...lolaProductMeta(800, 200),
      data: new Int16Array(800 * 800).fill(200),
    }
    const geo = buildTerrainGeometry([tile, polar], { lat, lon: 30, heightM: 0 }, 5000, 10)
    // Corner vertex: ~7 km away, on the 100 m polar surface minus ~14 m of curvature.
    expect(geo.positions[1]).toBeGreaterThan(70)
    expect(Math.abs(geo.positions[(5 * 11 + 5) * 3 + 1])).toBeLessThan(1)
  })
})
