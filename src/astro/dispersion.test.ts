import { describe, expect, it } from 'vitest'
import { type DemGrid, lolaProductMeta, pixelToMap } from './dem.ts'
import {
  computeDispersion,
  dispersionOffsets,
  insideEllipse,
  landingEllipse,
  range,
} from './dispersion.ts'
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
    const at = (d: number) => o.filter((x) => Math.abs(x.distM - d) < 1e-6)
    expect(at(500)).toHaveLength(8)
    expect(at(1000)).toHaveLength(8)
  })

  it('weights the points by landing probability: they add up to 1 and fall off outwards', () => {
    const o = dispersionOffsets(1000, 2, 8)
    expect(o.reduce((s, x) => s + x.weight, 0)).toBeCloseTo(1, 9)
    const inner = o[1].weight
    const outer = o[9].weight
    expect(inner).toBeGreaterThan(outer * 5)
    // 3σ boundary: the centre cell (r ≤ 0.25 → 0.75σ) holds 1 − exp(−0.75²/2) ≈ 24.5 %.
    expect(o[0].weight).toBeCloseTo((1 - Math.exp(-0.28125)) / (1 - Math.exp(-4.5)), 6)
  })

  it('lays an ellipse along the approach azimuth', () => {
    const e = landingEllipse(1000, 2, 90)
    expect(e).toEqual({ semiMajorM: 1000, semiMinorM: 500, orientationDeg: 90 })
    const o = dispersionOffsets(e.semiMajorM, 2, 8, e.semiMinorM, e.orientationDeg)
    // Outer ring: 1000 m east/west along the track, 500 m north/south across it.
    const outer = o.slice(9)
    const east = outer.reduce((a, b) => (Math.abs(b.azDeg - 90) < Math.abs(a.azDeg - 90) ? b : a))
    expect(Math.max(...outer.map((x) => x.distM))).toBeLessThanOrEqual(1000 + 1e-6)
    expect(Math.min(...outer.map((x) => x.distM))).toBeGreaterThanOrEqual(500 - 1e-6)
    expect(east.distM).toBeGreaterThan(900)
    for (const x of o) expect(insideEllipse(e, x.distM - 1e-6, x.azDeg)).toBe(true)
    expect(insideEllipse(e, 900, 90)).toBe(true)
    expect(insideEllipse(e, 900, 0)).toBe(false)
    expect(insideEllipse(e, 400, 0)).toBe(true)
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

describe('probability-weighted summary', { timeout: 30_000 }, () => {
  it('gives expected values and probabilities consistent with the points', () => {
    // Tilted plane: 5.7° everywhere, so P(slope < 10°) = 1 and the expected slope is that value.
    const r = computeDispersion([dem((x) => 0.1 * x)], {
      ...input,
      rings: 1,
      perRing: 6,
      semiMinorM: 500,
      orientationDeg: 45,
    })
    expect(r.points.reduce((s, p) => s + p.weight, 0)).toBeCloseTo(1, 9)
    expect(r.summary.pSafeSlope).toBeCloseTo(1, 9)
    expect(r.summary.expected.slopeDeg).toBeCloseTo(5.71, 1)
    expect(r.summary.expected.score).toBeGreaterThanOrEqual(r.summary.score.min)
    expect(r.summary.expected.score).toBeLessThanOrEqual(r.summary.score.max)
    expect(r.summary.pGoodScore).toBeGreaterThanOrEqual(0)
    expect(r.summary.pGoodScore).toBeLessThanOrEqual(1)
  })
})
