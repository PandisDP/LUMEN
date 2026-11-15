import { describe, expect, it } from 'vitest'
import { type DemGrid, lolaProductMeta } from '../../astro/dem.ts'
import { groundSampler } from '../../astro/descent.ts'
import { buildTerrainGeometry } from '../../astro/terrainMesh.ts'
import {
  LANDER_CLEARANCE_M,
  PATCH_BIAS_M,
  RELIEF_MAX_M,
  ROCK_CELL_M,
  ROCK_MAX_M,
  ROCK_MIN_M,
  ROCK_SHAPES,
  ROUTE_CLEARANCE_M,
  type RoutePoint,
  clearOfLander,
  clearOfRoute,
  corridorMask,
  craterInCell,
  edgeFade,
  landerMask,
  microRelief,
  patchSurface,
  ringRadii,
  rocksInCell,
  routeDistance,
  routeIndex,
  terrainMeshSampler,
} from './nearGroundField.ts'

const ROUTE: RoutePoint[] = [
  [0, 0, 0],
  [40, 1, 10],
  [55, 2, 60],
  [140, 3, 75],
]

describe('microRelief', () => {
  it('is a deterministic function of the position', () => {
    for (const [x, z] of [
      [0, 0],
      [3.7, -12.2],
      [-1234.5, 987.6],
    ]) {
      expect(microRelief(x, z)).toBe(microRelief(x, z))
    }
    expect(microRelief(3.7, -12.2)).not.toBe(microRelief(13.7, -12.2))
  })

  it('stays within its bound and actually has relief', () => {
    let lo = Infinity
    let hi = -Infinity
    for (let z = -300; z <= 300; z += 0.7) {
      for (let x = -300; x <= 300; x += 0.7) {
        const h = microRelief(x, z)
        if (h < lo) lo = h
        if (h > hi) hi = h
      }
    }
    expect(lo).toBeGreaterThanOrEqual(-RELIEF_MAX_M)
    expect(hi).toBeLessThanOrEqual(RELIEF_MAX_M)
    expect(lo).toBeLessThan(-0.25)
    expect(hi).toBeGreaterThan(0.12)
  })

  it('is continuous (no steps at cell borders)', () => {
    let worst = 0
    for (let x = -60; x < 60; x += 0.01) {
      worst = Math.max(worst, Math.abs(microRelief(x + 0.01, 7.3) - microRelief(x, 7.3)))
    }
    expect(worst).toBeLessThan(0.02)
  })

  it('digs a bowl with a raised rim where a cell has a crater', () => {
    let found = 0
    for (let ix = -20; ix < 20 && found < 5; ix++) {
      const c = craterInCell(ix, 3)
      if (!c || c.radiusM < 1.2) continue
      found++
      expect(c.radiusM).toBeLessThanOrEqual(2.4)
      expect(c.depthM).toBeLessThanOrEqual(c.radiusM * 0.2)
      const centre = microRelief(c.x, c.z)
      const rim = microRelief(c.x + c.radiusM * 1.02, c.z)
      expect(rim - centre).toBeGreaterThan(c.depthM * 0.5)
      expect(craterInCell(ix, 3)).toEqual(c)
    }
    expect(found).toBeGreaterThan(0)
  })
})

describe('edgeFade', () => {
  it('is 1 in the middle and exactly 0 from the rim outwards', () => {
    expect(edgeFade(0, 60)).toBe(1)
    expect(edgeFade(38, 60)).toBe(1)
    expect(edgeFade(60, 60)).toBe(0)
    expect(edgeFade(75, 60)).toBe(0)
    const mid = edgeFade(50, 60)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
    expect(edgeFade(45, 60)).toBeGreaterThan(edgeFade(55, 60))
  })

  it('takes the relief to exactly zero at the rim of the patch', () => {
    for (let a = 0; a < 6.28; a += 0.1) {
      const x = 100 + 60 * Math.cos(a)
      const z = -40 + 60 * Math.sin(a)
      expect(microRelief(x, z) * edgeFade(Math.hypot(x - 100, z + 40), 60)).toBeCloseTo(0, 12)
    }
    expect(microRelief(160, -40) * edgeFade(60, 60)).toBe(0)
  })
})

describe('rocks', () => {
  const cells: [number, number][] = []
  for (let iz = -40; iz < 40; iz++) for (let ix = -40; ix < 40; ix++) cells.push([ix, iz])

  it('gives every cell the same rocks every time, and different cells different rocks', () => {
    expect(rocksInCell(5, -9)).toEqual(rocksInCell(5, -9))
    const signatures = new Set(cells.map(([ix, iz]) => JSON.stringify(rocksInCell(ix, iz))))
    // All the empty cells share one signature; the rest are unique.
    const filled = cells.filter(([ix, iz]) => rocksInCell(ix, iz).length > 0).length
    expect(signatures.size).toBe(filled + 1)
  })

  it('keeps them inside their cell, within the size range, mostly small', () => {
    let small = 0
    let big = 0
    let total = 0
    for (const [ix, iz] of cells) {
      const rocks = rocksInCell(ix, iz)
      expect(rocks.length).toBeLessThanOrEqual(3)
      for (const r of rocks) {
        total++
        expect(r.x).toBeGreaterThanOrEqual(ix * ROCK_CELL_M)
        expect(r.x).toBeLessThan((ix + 1) * ROCK_CELL_M)
        expect(r.z).toBeGreaterThanOrEqual(iz * ROCK_CELL_M)
        expect(r.z).toBeLessThan((iz + 1) * ROCK_CELL_M)
        expect(r.sizeM).toBeGreaterThanOrEqual(ROCK_MIN_M)
        expect(r.sizeM).toBeLessThanOrEqual(ROCK_MAX_M)
        expect(Number.isInteger(r.shape)).toBe(true)
        expect(r.shape).toBeGreaterThanOrEqual(0)
        expect(r.shape).toBeLessThan(ROCK_SHAPES)
        expect(r.sink).toBeGreaterThan(0)
        expect(r.sink).toBeLessThan(0.6)
        if (r.sizeM < 0.15) small++
        if (r.sizeM > 0.3) big++
      }
    }
    // 0–3 per cell, about one on average; a power law: many pebbles, few boulders.
    expect(total / cells.length).toBeGreaterThan(0.7)
    expect(total / cells.length).toBeLessThan(1.5)
    expect(small).toBeGreaterThan(big * 3)
    expect(big).toBeGreaterThan(0)
  })

  it('leaves the route corridor and the lander clear', () => {
    const index = routeIndex(ROUTE)
    let kept = 0
    let dropped = 0
    for (const [ix, iz] of cells) {
      for (const r of rocksInCell(ix, iz)) {
        const ok = clearOfRoute(r.x, r.z, ROUTE) && clearOfLander(r.x, r.z)
        if (!ok) {
          dropped++
          continue
        }
        kept++
        expect(routeDistance(r.x, r.z, ROUTE)).toBeGreaterThanOrEqual(ROUTE_CLEARANCE_M)
        expect(Math.hypot(r.x, r.z)).toBeGreaterThanOrEqual(LANDER_CLEARANCE_M)
        // The bucketed distance agrees with the walk over the whole polyline.
        expect(index.distance(r.x, r.z)).toBeCloseTo(
          Math.min(index.reachM, routeDistance(r.x, r.z, ROUTE)),
          9,
        )
      }
    }
    expect(kept).toBeGreaterThan(1000)
    expect(dropped).toBeGreaterThan(5)
  })
})

describe('route and lander masks', () => {
  it('measures the distance to the polyline', () => {
    expect(routeDistance(20, 5 + 3, ROUTE)).toBeCloseTo(3 * Math.cos(Math.atan2(10, 40)), 9)
    expect(routeDistance(-3, 4, ROUTE)).toBeCloseTo(5, 9)
    expect(routeDistance(1, 1, undefined)).toBe(Infinity)
    expect(clearOfRoute(1, 1, undefined)).toBe(true)
    expect(clearOfRoute(20, 5.5, ROUTE)).toBe(false)
    expect(clearOfRoute(20, 9, ROUTE)).toBe(true)
  })

  it('matches the bucketed index everywhere near the route', () => {
    const index = routeIndex(ROUTE)
    for (let z = -20; z <= 100; z += 1.3) {
      for (let x = -20; x <= 160; x += 1.3) {
        expect(index.distance(x, z)).toBeCloseTo(
          Math.min(index.reachM, routeDistance(x, z, ROUTE)),
          9,
        )
      }
    }
    expect(routeIndex(undefined).distance(3, 4)).toBe(routeIndex(undefined).reachM)
  })

  it('flattens the relief on the route and under the lander', () => {
    expect(corridorMask(0)).toBe(0)
    expect(corridorMask(ROUTE_CLEARANCE_M)).toBe(0)
    expect(corridorMask(10)).toBe(1)
    expect(landerMask(0, 0)).toBe(0)
    expect(landerMask(2.2, 2.2)).toBe(0)
    expect(landerMask(20, 0)).toBe(1)
    for (let i = 1; i < ROUTE.length; i++) {
      for (let t = 0; t <= 1; t += 0.05) {
        const x = ROUTE[i - 1][0] + (ROUTE[i][0] - ROUTE[i - 1][0]) * t
        const z = ROUTE[i - 1][2] + (ROUTE[i][2] - ROUTE[i - 1][2]) * t
        // Under the wheels too (0.8 m either side).
        expect(
          Math.abs(microRelief(x, z + 0.8) * corridorMask(routeDistance(x, z + 0.8, ROUTE))),
        ).toBe(0)
      }
    }
  })
})

/** A rolling DEM (20 m posts, 0.5 m height steps) around a site 2 km from the pole. */
const rollingDem = (): DemGrid => {
  const size = 400
  const meta = lolaProductMeta(size, 20)
  const data = new Int16Array(size * size)
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      data[r * size + c] = Math.round(
        40 * Math.sin(c / 7) * Math.cos(r / 9) + 12 * Math.sin((c + r) / 2.3),
      )
    }
  }
  return { ...meta, data }
}

describe('terrainMeshSampler', () => {
  const site = { lat: -89.95, lon: 30, heightM: 0 }
  const dem = rollingDem()
  const ground = groundSampler(site, [dem])
  const half = 2000
  const segments = 100
  const sampler = terrainMeshSampler(site, [dem], ground, half, segments)
  const terrain = buildTerrainGeometry([dem], site, half, segments)

  it('reproduces the vertices of the terrain mesh', () => {
    sampler.prepare(120, -60, 64)
    const out = new Float64Array(4)
    const n = segments + 1
    let checked = 0
    for (let i = 0; i < n * n; i++) {
      const x = terrain.positions[i * 3]
      const z = terrain.positions[i * 3 + 2]
      if (Math.hypot(x - 120, z + 60) > 64) continue
      sampler.sample(x, z, out)
      expect(out[0]).toBeCloseTo(terrain.positions[i * 3 + 1], 3)
      checked++
    }
    expect(checked).toBeGreaterThan(5)
  })

  it('lies on the triangles in between (edges and faces)', () => {
    sampler.prepare(120, -60, 64)
    const out = new Float64Array(4)
    const p = terrain.positions
    let checked = 0
    for (let t = 0; t < terrain.indices.length; t += 3) {
      const [a, b, c] = [terrain.indices[t], terrain.indices[t + 1], terrain.indices[t + 2]]
      for (const [wa, wb, wc] of [
        [1 / 3, 1 / 3, 1 / 3],
        [0.5, 0.5, 0],
        [0.1, 0.2, 0.7],
      ]) {
        const x = p[a * 3] * wa + p[b * 3] * wb + p[c * 3] * wc
        const y = p[a * 3 + 1] * wa + p[b * 3 + 1] * wb + p[c * 3 + 1] * wc
        const z = p[a * 3 + 2] * wa + p[b * 3 + 2] * wb + p[c * 3 + 2] * wc
        if (Math.hypot(x - 120, z + 60) > 64) continue
        sampler.sample(x, z, out)
        expect(out[0]).toBeCloseTo(y, 3)
        expect(sampler.heightAt(x, z)).toBeCloseTo(y, 3)
        expect(out[2]).toBeGreaterThan(0)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(20)
  })
})

describe('patchSurface', () => {
  // A tilted plane for the DEM, and a "coarse mesh" that is off it by a varying amount.
  const ground = { groundY: (x: number, z: number) => 0.02 * x - 0.01 * z }
  const offset = (x: number, z: number) => 0.4 * Math.sin(x / 9) * Math.cos(z / 11)
  const mesh = {
    prepare: () => {},
    sample: (x: number, z: number, out: Float64Array) => {
      out[0] = ground.groundY(x, z) + offset(x, z)
      out[1] = 0
      out[2] = 1
      out[3] = 0
    },
  }
  const index = routeIndex(ROUTE)
  const surface = patchSurface(ground, mesh, index, 60)
  const out = new Float64Array(6)

  it('meets the coarse mesh exactly at the rim, wherever the centre is', () => {
    for (const [cx, cz] of [
      [0, 0],
      [48, 36],
    ]) {
      surface.prepare(cx, cz)
      for (let a = 0; a < 6.28; a += 0.05) {
        const x = cx + 60 * Math.cos(a)
        const z = cz + 60 * Math.sin(a)
        surface.sample(x, z, out)
        expect(out[0]).toBeCloseTo(ground.groundY(x, z) + offset(x, z) + PATCH_BIAS_M, 9)
        expect(out[1]).toBe(0)
      }
    }
  })

  it('never dips under the coarse mesh, and carries relief in the middle', () => {
    surface.prepare(48, 36)
    let rough = 0
    for (let z = -20; z <= 90; z += 0.9) {
      for (let x = -10; x <= 105; x += 0.9) {
        if (Math.hypot(x - 48, z - 36) > 60) continue
        surface.sample(x, z, out)
        const m = ground.groundY(x, z) + offset(x, z)
        expect(out[0]).toBeGreaterThanOrEqual(m + PATCH_BIAS_M - 1e-9)
        expect(out[0]).toBeLessThanOrEqual(Math.max(m, ground.groundY(x, z)) + 0.25 + 0.6 + 0.04)
        if (Math.abs(out[0] - Math.max(m, ground.groundY(x, z))) > 0.1) rough++
      }
    }
    expect(rough).toBeGreaterThan(500)
  })

  it('lies on the DEM surface along the route and under the lander', () => {
    surface.prepare(48, 36)
    const check = (x: number, z: number) => {
      surface.sample(x, z, out)
      const d = ground.groundY(x, z)
      expect(out[0]).toBeCloseTo(Math.max(d, d + offset(x, z)) + PATCH_BIAS_M, 6)
      expect(out[5]).toBe(0)
    }
    for (let i = 1; i < 3; i++) {
      for (let t = 0; t <= 1; t += 0.1) {
        const x = ROUTE[i - 1][0] + (ROUTE[i][0] - ROUTE[i - 1][0]) * t
        const z = ROUTE[i - 1][2] + (ROUTE[i][2] - ROUTE[i - 1][2]) * t
        if (Math.hypot(x - 48, z - 36) < 38) check(x, z + 0.7)
      }
    }
    surface.prepare(0, 0)
    check(1.5, -1.5)
    check(-2.2, 0)
  })

  it('works without a mesh (sites with no topography)', () => {
    const flat = patchSurface(ground, null, routeIndex(undefined), 40)
    flat.prepare(0, 0)
    flat.sample(40, 0, out)
    expect(out[0]).toBeCloseTo(ground.groundY(40, 0) + PATCH_BIAS_M, 9)
    expect(out[3]).toBe(1)
  })
})

describe('ringRadii', () => {
  it('is dense near the centre, ends on the radius and never shrinks its step', () => {
    const radii = ringRadii(64, 0.5, 18)
    expect(radii[0]).toBe(0.5)
    expect(radii[radii.length - 1]).toBe(64)
    expect(radii[20] - radii[19]).toBeCloseTo(0.5, 9)
    for (let i = 1; i < radii.length; i++) expect(radii[i]).toBeGreaterThan(radii[i - 1])
    expect(radii.length).toBeLessThan(120)
  })
})
