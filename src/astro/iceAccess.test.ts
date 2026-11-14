import { describe, expect, it } from 'vitest'
import { DEG } from './constants.ts'
import { type DemGrid, lolaProductMeta, pixelToLatLon, pixelToMap } from './dem.ts'
import { combinedScore, computeIceAccess, scienceScore } from './iceAccess.ts'
import { type IllumGrid, encodeIllum, illumPct, isPsrAt } from './illumination.ts'
import { computeOptimize } from './optimize.ts'

const SIZE = 241 // ±2.4 km at 20 m/px, centred on the pole
const meta = lolaProductMeta(SIZE, 20)

function dem(f: (x: number, y: number) => number): DemGrid {
  const data = new Int16Array(SIZE * SIZE)
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) {
      const { x, y } = pixelToMap(meta, c, r)
      data[r * SIZE + c] = Math.round(f(x, y) / meta.heightScale)
    }
  return { ...meta, data }
}

/** Permanent shadow east of x = 1000 m, 75 % mean light elsewhere. */
function illum(): IllumGrid {
  const data = new Uint8Array(SIZE * SIZE)
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) {
      const { x } = pixelToMap(meta, c, r)
      data[r * SIZE + c] = x > 1000 ? 0 : encodeIllum(75, 1)
    }
  return { ...meta, data }
}

const centre = pixelToLatLon(meta, (SIZE - 1) / 2, (SIZE - 1) / 2)

describe('illumination encoding', () => {
  it('stores PSR as 0 and the mean lit % in half-percent steps', () => {
    expect(encodeIllum(80, 0.005)).toBe(0)
    expect(illumPct(encodeIllum(37.5, 1))).toBe(37.5)
    const g = illum()
    expect(isPsrAt(g, centre.lat, centre.lon)).toBe(false)
  })
})

describe('computeIceAccess', () => {
  it('drives straight to the shadow over flat ground', () => {
    const a = computeIceAccess(
      dem(() => 0),
      illum(),
      centre.lat,
      centre.lon,
    )
    expect(a.reachable).toBe(true)
    expect(a.straightM).toBeCloseTo(1020, -1)
    expect(a.routeM!).toBeLessThan(1100)
    expect(a.maxSlopeDeg).toBeCloseTo(0, 3)
    expect(a.path[0].lat).toBeCloseTo(centre.lat, 6)
  })

  it('detours around a wall steeper than the rover limit', () => {
    // A 40° ridge between x = 400 and 600 m, open only for 800 < y < 1000.
    const t = Math.tan(40 * DEG)
    const wall = (x: number, y: number) =>
      x > 400 && x < 600 && !(y > 800 && y < 1000) ? (100 - Math.abs(x - 500)) * t : 0
    const a = computeIceAccess(dem(wall), illum(), centre.lat, centre.lon)
    expect(a.reachable).toBe(true)
    expect(a.routeM!).toBeGreaterThan(a.straightM! + 400)
    expect(a.maxSlopeDeg!).toBeLessThanOrEqual(20)
  })

  it('reports unreachable ice behind a closed wall, and nothing without PSR in range', () => {
    const t = Math.tan(40 * DEG)
    const closed = (x: number) => (x > 400 && x < 600 ? (100 - Math.abs(x - 500)) * t : 0)
    const a = computeIceAccess(dem(closed), illum(), centre.lat, centre.lon)
    expect(a.reachable).toBe(false)
    expect(a.straightM).not.toBeNull()
    const far = computeIceAccess(
      dem(() => 0),
      illum(),
      centre.lat,
      centre.lon,
      { radiusM: 800 },
    )
    expect(far.straightM).toBeNull()
  })
})

describe('science score', () => {
  it('is 100 close by, 0 out of reach, and blends linearly', () => {
    expect(scienceScore({ routeM: 300, maxSlopeDeg: 0, reachable: true })).toBe(100)
    expect(scienceScore({ routeM: 2000, maxSlopeDeg: 0, reachable: true })).toBe(0)
    expect(scienceScore({ routeM: 300, maxSlopeDeg: 20, reachable: true })).toBe(50)
    expect(scienceScore({ routeM: null, maxSlopeDeg: null, reachable: false })).toBe(0)
    expect(combinedScore(80, 20, 0)).toBe(80)
    expect(combinedScore(80, 20, 0.5)).toBe(50)
  })
})

describe('computeOptimize', () => {
  it('only suggests safe ground, best score first', () => {
    // Gentle dome plus a high, steep slab to the east that must never be suggested.
    const f = (x: number, y: number) =>
      300 - 0.05 * Math.hypot(x, y) + (x > 300 ? (x - 300) * Math.tan(25 * DEG) : 0)
    const r = computeOptimize([dem(f)], {
      lat: centre.lat,
      lon: centre.lon,
      radiusM: 1000,
      startMs: Date.UTC(2026, 0, 1),
      missionDays: 2,
      stepMinutes: 180,
      maxCandidates: 8,
    })
    expect(r.safeCount).toBeGreaterThan(0)
    expect(r.best.length).toBeGreaterThan(0)
    for (const c of r.best) {
      expect(c.slopeDeg).toBeLessThan(10)
      expect(c.distM).toBeLessThanOrEqual(1000 + 30)
    }
    for (let i = 1; i < r.best.length; i++) {
      expect(r.best[i - 1].score).toBeGreaterThanOrEqual(r.best[i].score)
    }
    expect(r.target).not.toBeNull()
  })
})
