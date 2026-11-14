import { describe, expect, it } from 'vitest'
import { type DemGrid, lolaProductMeta, pixelToMap } from './dem.ts'
import { computeDispersion, dispersionOffsets, range } from './dispersion.ts'
import { surfaceDistance } from './frames.ts'

/** 200 m/px synthetic polar DEM, ±40 km, height = f(x, y). */
function dem(f: (x: number, y: number) => number): DemGrid {
  const size = 400
  const meta = lolaProductMeta(size, 200)
  const data = new Int16Array(size * size)
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) {
      const { x, y } = pixelToMap(meta, c, r)
      data[r * size + c] = Math.round(f(x, y) / meta.heightScale)
    }
  return { ...meta, data }
}

const input = {
  lat: -89.6,
  lon: 0,
  radiusM: 1000,
  startMs: Date.UTC(2026, 0, 1),
  missionDays: 3,
  stepMinutes: 120,
}

describe('dispersionOffsets', () => {
  it('is the centre plus rings of points at the right distances', () => {
    const o = dispersionOffsets(1000, 2, 8)
    expect(o).toHaveLength(17)
    expect(o[0].distM).toBe(0)
    expect(o.filter((x) => x.distM === 500)).toHaveLength(8)
    expect(o.filter((x) => x.distM === 1000)).toHaveLength(8)
  })
})

describe('range', () => {
  it('ignores non-finite values and computes the median', () => {
    expect(range([3, NaN, 1, 2, 10])).toEqual({ min: 1, median: 2.5, max: 10 })
    expect(range([]).median).toBeNaN()
  })
})

// Each point marches a full horizon: keep the point count small and allow for slow CI machines.
describe('computeDispersion', { timeout: 30_000 }, () => {
  it('evaluates every point on flat ground with consistent results', () => {
    const r = computeDispersion([dem(() => 0)], { ...input, rings: 1, perRing: 6 })
    expect(r.points).toHaveLength(7)
    for (const p of r.points.slice(1)) {
      const d = surfaceDistance(input.lat, input.lon, p.lat, p.lon)
      expect(Math.abs(d - p.distM)).toBeLessThan(1)
      expect(p.slopeDeg).toBeCloseTo(0, 3)
    }
    // Flat Moon: moving 1 km barely changes the sky.
    expect(r.summary.sunlitPct.max - r.summary.sunlitPct.min).toBeLessThan(5)
  })

  it('reports the slope of a tilted plane at every point', () => {
    const r = computeDispersion([dem((x) => 0.1 * x)], {
      ...input,
      radiusM: 500,
      rings: 1,
      perRing: 4,
    })
    expect(r.points).toHaveLength(5)
    for (const p of r.points) expect(p.slopeDeg).toBeCloseTo(5.71, 1)
  })

  it('skips points outside every DEM', () => {
    const r = computeDispersion([dem(() => 0)], { ...input, lat: -89.0, rings: 1, perRing: 2 })
    // -89.0 is ~30 km from the pole, inside the ±40 km grid; push it out:
    const out = computeDispersion([dem(() => 0)], { ...input, lat: -88.0, rings: 1, perRing: 2 })
    expect(r.points.length).toBeGreaterThan(0)
    expect(out.points).toHaveLength(0)
    expect(out.summary.score.min).toBeNaN()
  })
})
