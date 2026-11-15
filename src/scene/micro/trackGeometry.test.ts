import { describe, expect, it } from 'vitest'
import { type DemGrid, lolaProductMeta, pixelToMap } from '../../astro/dem.ts'
import { groundSampler } from '../../astro/descent.ts'
import { buildTerrainGeometry } from '../../astro/terrainMesh.ts'
import {
  type PathPoint,
  ROVER_TRACKS,
  TRACK_BIAS_M,
  TRACK_INDICES_PER_STEP,
  TRACK_STEP_M,
  TRACK_VERTS_PER_SAMPLE,
  buildTrackRibbons,
  resamplePath,
  terrainMeshHeight,
  trackDrawCount,
} from './trackGeometry.ts'

/** Plan-like polyline: points every 10 m, `distM` a little longer than the ground distance. */
const polyline = (xz: [number, number][]): PathPoint[] => {
  let d = 0
  return xz.map(([x, z], i) => {
    if (i > 0) d += Math.hypot(x - xz[i - 1][0], z - xz[i - 1][1]) * 1.02
    return { x, z, distM: d }
  })
}
const straight = polyline([0, 10, 20, 30, 40].map((x) => [x, 0]))
/** North for 30 m, then a right-angle turn to the east. */
const corner = polyline([
  [0, 0],
  [0, -10],
  [0, -20],
  [0, -30],
  [10, -30],
  [20, -30],
  [30, -30],
])
const hill = (x: number, z: number) => 3 + 0.1 * x - 0.05 * z + 0.002 * x * z

/** Distance from a point to a polyline on the horizontal plane. */
function distanceTo(path: readonly PathPoint[], x: number, z: number) {
  let best = Infinity
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]
    const b = path[i + 1]
    const l2 = (b.x - a.x) ** 2 + (b.z - a.z) ** 2
    const t = Math.min(1, Math.max(0, ((x - a.x) * (b.x - a.x) + (z - a.z) * (b.z - a.z)) / l2))
    best = Math.min(best, Math.hypot(x - a.x - t * (b.x - a.x), z - a.z - t * (b.z - a.z)))
  }
  return best
}

describe('resamplePath', () => {
  it('samples a straight route about every half metre, end to end', () => {
    const s = resamplePath(straight)
    expect(s).toHaveLength(40 / TRACK_STEP_M + 1)
    expect(s[0]).toMatchObject({ x: 0, z: 0, distM: 0, tx: 1, tz: 0 })
    expect(s[s.length - 1].x).toBeCloseTo(40, 9)
    expect(s[s.length - 1].distM).toBeCloseTo(straight[4].distM, 9)
    for (let i = 1; i < s.length; i++) expect(s[i].x - s[i - 1].x).toBeCloseTo(TRACK_STEP_M, 9)
  })

  it('keeps the odometer of the plan: distM is interpolated, monotone and exact at its points', () => {
    const s = resamplePath(corner)
    for (let i = 1; i < s.length; i++) expect(s[i].distM).toBeGreaterThan(s[i - 1].distM)
    // 30 m of ground into the route (the corner) is 30.6 m driven.
    const at = s.find((p) => Math.abs(p.distM - corner[3].distM) < 1e-9)
    expect(at).toBeDefined()
    expect(s[s.length - 1].distM).toBeCloseTo(corner[6].distM, 9)
  })

  it('rounds a right-angle turn without leaving the route the rover follows', () => {
    const s = resamplePath(corner, TRACK_STEP_M, 0.6)
    let worst = 0
    for (const p of s) worst = Math.max(worst, distanceTo(corner, p.x, p.z))
    expect(worst).toBeGreaterThan(0.05)
    expect(worst).toBeLessThan(0.3)
    // Unit tangents that turn smoothly: never more than the whole corner between two samples.
    for (let i = 0; i < s.length; i++) {
      expect(Math.hypot(s[i].tx, s[i].tz)).toBeCloseTo(1, 9)
      if (i > 0) expect(s[i].tx * s[i - 1].tx + s[i].tz * s[i - 1].tz).toBeGreaterThan(0.5)
    }
    // Straight in, straight out.
    expect(s[10]).toMatchObject({ tx: 0, tz: -1 })
    expect(s[s.length - 10]).toMatchObject({ tx: 1, tz: 0 })
  })

  it('ignores repeated points and has nothing to draw for a route without length', () => {
    expect(resamplePath([])).toEqual([])
    expect(resamplePath([straight[0], { ...straight[0] }])).toEqual([])
    const doubled = [straight[0], straight[1], { ...straight[1] }, straight[2]]
    expect(resamplePath(doubled)).toHaveLength(20 / TRACK_STEP_M + 1)
  })
})

describe('buildTrackRibbons', () => {
  for (const id of ['rover', 'csa-rover'] as const) {
    const spec = ROVER_TRACKS[id]
    const samples = resamplePath(corner, TRACK_STEP_M, Math.max(0.6, 1.6 * spec.halfWidthM))
    const r = buildTrackRibbons(samples, spec, hill)
    const n = samples.length
    const vertex = (k: number, j: number) => {
      const i = (k * TRACK_VERTS_PER_SAMPLE + j) * 3
      return [r.positions[i], r.positions[i + 1], r.positions[i + 2]] as const
    }

    it(`${id}: four vertices per sample and two quads per step`, () => {
      expect(r.positions).toHaveLength(n * TRACK_VERTS_PER_SAMPLE * 3)
      expect(r.normals).toHaveLength(n * TRACK_VERTS_PER_SAMPLE * 3)
      expect(r.uvs).toHaveLength(n * TRACK_VERTS_PER_SAMPLE * 2)
      expect(r.dist).toHaveLength(n * TRACK_VERTS_PER_SAMPLE)
      expect(r.edge).toHaveLength(n * TRACK_VERTS_PER_SAMPLE * 2)
      expect(r.sampleDist).toHaveLength(n)
      expect(r.indices).toHaveLength((n - 1) * TRACK_INDICES_PER_STEP)
      expect(Math.max(...r.indices)).toBe(n * TRACK_VERTS_PER_SAMPLE - 1)
    })

    it(`${id}: dist grows along the route and is shared by a cross-section`, () => {
      for (let k = 0; k < n; k++) {
        if (k > 0) expect(r.sampleDist[k]).toBeGreaterThan(r.sampleDist[k - 1])
        for (let j = 0; j < 4; j++) {
          expect(r.dist[k * 4 + j]).toBe(r.sampleDist[k])
          expect(r.uvs[(k * 4 + j) * 2]).toBe(j % 2)
          expect(r.uvs[(k * 4 + j) * 2 + 1]).toBeCloseTo(samples[k].distM / spec.patternM, 3)
        }
      }
      // The index buffer follows the route: a prefix of it is a prefix of the tracks.
      for (let s = 0; s < n - 1; s++) {
        const quad = r.indices.subarray(
          s * TRACK_INDICES_PER_STEP,
          (s + 1) * TRACK_INDICES_PER_STEP,
        )
        expect(Math.min(...quad)).toBe(s * 4)
        expect(Math.max(...quad)).toBe(s * 4 + 7)
      }
    })

    it(`${id}: each ribbon is centred half a track from the route and one tread wide`, () => {
      for (let k = 0; k < n; k++) {
        const c = samples[k]
        for (const [a, b] of [
          [0, 1],
          [2, 3],
        ]) {
          const p = vertex(k, a)
          const q = vertex(k, b)
          expect(Math.hypot(q[0] - p[0], q[2] - p[2])).toBeCloseTo(spec.treadM, 5)
          const off = Math.hypot((p[0] + q[0]) / 2 - c.x, (p[2] + q[2]) / 2 - c.z)
          expect(off).toBeCloseTo(spec.halfWidthM, 5)
        }
        // Left ribbon on the left: on the first leg (driving north) that is the west side.
        if (k < 10) expect(vertex(k, 0)[0]).toBeLessThan(vertex(k, 3)[0])
      }
    })

    it(`${id}: lies on the ground plus the bias, with unit normals that point up`, () => {
      for (let i = 0; i < n * 4; i++) {
        const [x, y, z] = [r.positions[i * 3], r.positions[i * 3 + 1], r.positions[i * 3 + 2]]
        expect(y).toBeCloseTo(hill(x, z) + TRACK_BIAS_M, 4)
        const [nx, ny, nz] = [r.normals[i * 3], r.normals[i * 3 + 1], r.normals[i * 3 + 2]]
        expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 5)
        expect(ny).toBeGreaterThan(0.9)
        expect(Math.hypot(r.edge[i * 2], r.edge[i * 2 + 1])).toBeCloseTo(1, 5)
      }
      const flat = buildTrackRibbons(samples, spec, () => 7, 0.1, 0)
      expect(flat.positions[1]).toBeCloseTo(7.1, 6)
      expect([flat.normals[0], flat.normals[1], flat.normals[2]]).toEqual([0, 1, 0])
    })

    it(`${id}: follows the turn without folding or blowing up`, () => {
      // Both edges of both ribbons keep advancing, and no step is longer than a sample step
      // plus the extra arc of the outer wheel.
      for (let k = 1; k < n; k++) {
        const t = samples[k]
        for (let j = 0; j < 4; j++) {
          const a = vertex(k - 1, j)
          const b = vertex(k, j)
          const along = (b[0] - a[0]) * t.tx + (b[2] - a[2]) * t.tz
          expect(along).toBeGreaterThan(0)
          expect(Math.hypot(b[0] - a[0], b[2] - a[2])).toBeLessThan(3 * TRACK_STEP_M)
        }
      }
      // Triangles face up.
      for (let i = 0; i < r.indices.length; i += 3) {
        const a = r.indices[i] * 3
        const b = r.indices[i + 1] * 3
        const c = r.indices[i + 2] * 3
        const ux = r.positions[b] - r.positions[a]
        const uz = r.positions[b + 2] - r.positions[a + 2]
        const vx = r.positions[c] - r.positions[a]
        const vz = r.positions[c + 2] - r.positions[a + 2]
        expect(uz * vx - ux * vz).toBeGreaterThan(0)
      }
    })
  }
})

describe('trackDrawCount', () => {
  const samples = resamplePath(corner)
  const { sampleDist, indices } = buildTrackRibbons(samples, ROVER_TRACKS.rover, hill)
  const total = sampleDist[sampleDist.length - 1]

  it('draws nothing at the start and everything at the end', () => {
    expect(trackDrawCount(sampleDist, 0)).toBe(0)
    expect(trackDrawCount(sampleDist, -5)).toBe(0)
    expect(trackDrawCount(sampleDist, NaN)).toBe(0)
    expect(trackDrawCount(sampleDist, total)).toBe(indices.length)
    expect(trackDrawCount(sampleDist, total + 100)).toBe(indices.length)
    expect(trackDrawCount([], 10)).toBe(0)
    expect(trackDrawCount([0], 10)).toBe(0)
  })

  it('grows with the distance, one step at a time, and always covers it', () => {
    let last = 0
    for (let d = 0; d <= total; d += 0.07) {
      const count = trackDrawCount(sampleDist, d)
      expect(count % TRACK_INDICES_PER_STEP).toBe(0)
      expect(count).toBeGreaterThanOrEqual(last)
      expect(count - last).toBeLessThanOrEqual(TRACK_INDICES_PER_STEP)
      const steps = count / TRACK_INDICES_PER_STEP
      // The drawn steps reach d, and the last of them starts before it.
      expect(sampleDist[steps]).toBeGreaterThanOrEqual(Math.min(d, total) - 1e-4)
      if (steps > 0) expect(sampleDist[steps - 1]).toBeLessThan(d)
      last = count
    }
    // Just past a sample, the next step shows.
    expect(trackDrawCount(sampleDist, sampleDist[5])).toBe(5 * TRACK_INDICES_PER_STEP)
    expect(trackDrawCount(sampleDist, sampleDist[5] + 1e-3)).toBe(6 * TRACK_INDICES_PER_STEP)
  })
})

/** Rolling synthetic DEM around the pole (20 m posts, centimetre heights). */
function rollingDem(): DemGrid {
  const size = 400
  const meta = { ...lolaProductMeta(size, 20), heightScale: 0.01 }
  const data = new Int16Array(size * size)
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const { x, y } = pixelToMap(meta, c, r)
      const h = 30 * Math.sin(x / 130) * Math.cos(y / 90) + 0.01 * x
      data[r * size + c] = Math.round(h / meta.heightScale)
    }
  }
  return { ...meta, data }
}

describe('terrainMeshHeight', () => {
  const site = { lat: -89.95, lon: 30, heightM: 0 }
  const dem = rollingDem()
  const ground = groundSampler(site, [dem])
  const half = 2000
  const segments = 100
  const meshY = terrainMeshHeight(site, [dem], ground, half, segments)
  const terrain = buildTerrainGeometry([dem], site, half, segments)
  const p = terrain.positions

  // Centimetre tolerance: the ground sampler locates (x, z) on the tangent plane of the site.
  it('reproduces the vertices of the drawn terrain mesh', () => {
    for (let i = 0; i < p.length / 3; i += 37)
      expect(Math.abs(meshY(p[i * 3], p[i * 3 + 2]) - p[i * 3 + 1])).toBeLessThan(0.02)
  })

  it('lies on its flat triangles, which the bilinear DEM surface does not', () => {
    let apart = 0
    for (let t = 0; t < terrain.indices.length; t += 3 * 53) {
      const [a, b, c] = [terrain.indices[t], terrain.indices[t + 1], terrain.indices[t + 2]]
      const at = (k: number) => (p[a * 3 + k] + p[b * 3 + k] + p[c * 3 + k]) / 3
      expect(Math.abs(meshY(at(0), at(2)) - at(1))).toBeLessThan(0.02)
      apart = Math.max(apart, Math.abs(ground.groundY(at(0), at(2)) - at(1)))
    }
    // That gap is why the tracks cannot simply follow the DEM.
    expect(apart).toBeGreaterThan(0.2)
  })
})
