import { describe, expect, it } from 'vitest'
import { MOON_RADIUS_M } from './constants.ts'
import { type DemGrid, lolaProductMeta, pixelToMap } from './dem.ts'
import { sphericalHorizonDip } from './horizon.ts'
import { computeHorizonMask, elevationAngle } from './horizonFromDem.ts'

/** Synthetic polar DEM (200 m/px, ±40 km) whose height is f(distance from the pole). */
function radialDem(height: (rM: number) => number): DemGrid {
  const size = 400
  const meta = lolaProductMeta(size, 200)
  const data = new Int16Array(size * size)
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const { x, y } = pixelToMap(meta, c, r)
      data[r * size + c] = Math.round(height(Math.hypot(x, y)) / meta.heightScale)
    }
  }
  return { ...meta, data }
}

describe('elevationAngle', () => {
  it('reduces to atan(dh/d) at short range (curvature costs ~0.017° at 1 km)', () => {
    expect(elevationAngle(0, 100, 1000)).toBeCloseTo((Math.atan(0.1) * 180) / Math.PI, 1)
  })

  it('includes the curvature drop d²/2R', () => {
    // A point at the same height 50 km away sits below the observer by ~720 m.
    const d = 50_000
    const expected = (Math.atan(-(d * d) / (2 * MOON_RADIUS_M) / d) * 180) / Math.PI
    expect(elevationAngle(0, 0, d)).toBeCloseTo(expected, 2)
  })
})

describe('computeHorizonMask', () => {
  it('on a flat Moon returns roughly the spherical horizon', () => {
    const h = computeHorizonMask([radialDem(() => 0)], -89.9, 0, {
      maxDistM: 30_000,
      azStepDeg: 10,
    })
    for (const v of h.elevDeg) {
      expect(v).toBeLessThan(0)
      expect(v).toBeGreaterThan(sphericalHorizonDip(2) - 0.6)
    }
  })

  it('sees a crater wall at the right angle', () => {
    // Observer at the pole on the floor of a 10 km radius, 1 km deep crater.
    const dem = radialDem((r) => (r < 10_000 ? -1000 : 0))
    const h = computeHorizonMask([dem], -90, 0, { maxDistM: 35_000, azStepDeg: 30 })
    const expected = elevationAngle(-998, 0, 10_000)
    for (const v of h.elevDeg) expect(v).toBeCloseTo(expected, 0)
    expect(h.terrainHeightM).toBeCloseTo(-1000, 0)
  })

  it('from a summit the horizon lies below 0°', () => {
    // A 2 km high, 30 km wide dome: the true horizon dips far below the ideal one.
    const dem = radialDem((r) => Math.max(0, 2000 * (1 - r / 15_000)))
    const h = computeHorizonMask([dem], -90, 0, { maxDistM: 35_000, azStepDeg: 45 })
    for (const v of h.elevDeg) expect(v).toBeLessThan(-1)
  })

  it('throws without DEM coverage', () => {
    expect(() => computeHorizonMask([radialDem(() => 0)], -80, 0)).toThrow(/No DEM/)
  })
})
