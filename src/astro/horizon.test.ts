import { describe, expect, it } from 'vitest'
import {
  discVisibleFraction,
  maskAt,
  maskStats,
  sphericalHorizonDip,
  sphericalMask,
} from './horizon.ts'

describe('discVisibleFraction', () => {
  it('is 1 fully above, 0 fully below and 0.5 when centred on the horizon', () => {
    expect(discVisibleFraction(2, 0, 0.27)).toBe(1)
    expect(discVisibleFraction(-2, 0, 0.27)).toBe(0)
    expect(discVisibleFraction(1, 1, 0.27)).toBeCloseTo(0.5, 12)
  })

  it('grows monotonically as the disc rises', () => {
    let prev = -1
    for (let el = -0.3; el <= 0.3; el += 0.01) {
      const f = discVisibleFraction(el, 0, 0.27)
      expect(f).toBeGreaterThanOrEqual(prev)
      prev = f
    }
  })

  it('is symmetric: f(d) + f(-d) = 1', () => {
    expect(discVisibleFraction(0.1, 0, 0.27) + discVisibleFraction(-0.1, 0, 0.27)).toBeCloseTo(
      1,
      12,
    )
  })
})

describe('horizon masks', () => {
  it('interpolates between bins and wraps around north', () => {
    const mask = { azStepDeg: 90, elevDeg: [0, 4, 8, 4] }
    expect(maskAt(mask, 45)).toBeCloseTo(2)
    expect(maskAt(mask, 315)).toBeCloseTo(2)
    expect(maskAt(mask, 360)).toBeCloseTo(0)
    expect(maskAt(mask, -90)).toBeCloseTo(4)
  })

  it('the ideal horizon of a 2 m observer dips ~0.087°', () => {
    expect(sphericalHorizonDip(2)).toBeCloseTo(-0.0869, 3)
    const m = sphericalMask()
    expect(m.elevDeg).toHaveLength(360)
    expect(maskStats(m).max).toBeCloseTo(sphericalHorizonDip(2))
  })

  it('reports the highest bin', () => {
    expect(maskStats({ azStepDeg: 1, elevDeg: [1, 5, 2] })).toEqual({ min: 1, max: 5, maxAz: 1 })
  })
})
