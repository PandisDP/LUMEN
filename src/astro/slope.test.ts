import { describe, expect, it } from 'vitest'
import { DEG } from './constants.ts'
import { DEM_NODATA, type DemGrid, lolaProductMeta, pixelToLatLon, pixelToMap } from './dem.ts'
import { slopeAt, slopeAtPixel, slopeClass, slopeStats } from './slope.ts'

/** 20 m/px synthetic tile around the pole with height = f(x, y) in map metres. */
function grid(f: (x: number, y: number) => number, size = 101): DemGrid {
  // Fine height quantum so the test measures the operator, not Int16 rounding.
  const meta = { ...lolaProductMeta(size, 20), heightScale: 0.01 }
  const data = new Int16Array(size * size)
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) {
      const { x, y } = pixelToMap(meta, c, r)
      data[r * size + c] = Math.round(f(x, y) / meta.heightScale)
    }
  return { ...meta, data }
}

describe('slopeAtPixel', () => {
  it('is 0 on flat ground', () => {
    expect(
      slopeAtPixel(
        grid(() => 100),
        50,
        50,
      ),
    ).toBeCloseTo(0, 6)
  })

  it('recovers the angle of a tilted plane in any direction', () => {
    for (const [deg, az] of [
      [5, 0],
      [12, 30],
      [25, 135],
    ]) {
      const g = Math.tan(deg * DEG)
      const dem = grid((x, y) => g * (x * Math.sin(az * DEG) + y * Math.cos(az * DEG)))
      expect(slopeAtPixel(dem, 50, 50)).toBeCloseTo(deg, 1)
    }
  })

  it('is NaN at the border and next to missing data', () => {
    const dem = grid(() => 0)
    expect(slopeAtPixel(dem, 0, 50)).toBeNaN()
    dem.data[50 * dem.width + 51] = DEM_NODATA
    expect(slopeAtPixel(dem, 50, 50)).toBeNaN()
  })
})

describe('slopeStats', () => {
  it('summarises a circle and splits safe vs steep ground', () => {
    // West half flat, east half at 20°.
    const t = Math.tan(20 * DEG)
    const dem = grid((x) => (x > 0 ? t * x : 0))
    const { lat, lon } = pixelToLatLon(dem, 50, 50)
    const s = slopeStats(dem, lat, lon, 400)
    expect(s.count).toBeGreaterThan(1000)
    expect(s.max).toBeCloseTo(20, 0)
    expect(s.safePct).toBeGreaterThan(40)
    expect(s.safePct).toBeLessThan(60)
    expect(s.resolutionM).toBe(20)
    expect(slopeAt(dem, lat, lon)).toBeCloseTo(s.center, 6)
  })

  it('classifies against the lander thresholds', () => {
    expect(slopeClass(4)).toBe('safe')
    expect(slopeClass(12)).toBe('caution')
    expect(slopeClass(18)).toBe('steep')
  })
})
