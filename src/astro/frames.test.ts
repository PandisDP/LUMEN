import { describe, expect, it } from 'vitest'
import {
  destination,
  enuBasis,
  horizontalToEnu,
  mapToSouthPolar,
  selenographicToVector,
  southPolarToMap,
  surfaceDistance,
  toHorizontal,
  wrap180,
  wrap360,
} from './frames.ts'

describe('angle wrapping', () => {
  it('wraps to [0, 360) and [-180, 180)', () => {
    expect(wrap360(-90)).toBe(270)
    expect(wrap360(720)).toBe(0)
    expect(wrap180(190)).toBe(-170)
    expect(wrap180(-180)).toBe(-180)
  })
})

describe('south polar stereographic (LOLA DSMAP_POLAR)', () => {
  it('puts longitude 0 up (towards Earth) and 90°E to the right', () => {
    const lon0 = southPolarToMap(-89, 0)
    expect(lon0.x).toBeCloseTo(0, 6)
    expect(lon0.y).toBeGreaterThan(0)
    const lon90 = southPolarToMap(-89, 90)
    expect(lon90.x).toBeGreaterThan(0)
    expect(lon90.y).toBeCloseTo(0, 6)
  })

  it('round-trips latitude and longitude', () => {
    for (const [lat, lon] of [
      [-89.45, -137.31],
      [-85.99, 2.7],
      [-76, 179],
    ]) {
      const { x, y } = southPolarToMap(lat, lon)
      const back = mapToSouthPolar(x, y)
      expect(back.lat).toBeCloseTo(lat, 9)
      expect(back.lon).toBeCloseTo(lon, 9)
    }
  })

  it('has unit scale near the pole (1° of latitude ≈ 30.3 km)', () => {
    const a = southPolarToMap(-89, 0)
    const b = southPolarToMap(-88, 0)
    expect(b.y - a.y).toBeCloseTo(30_323, -2)
  })
})

describe('spherical geometry', () => {
  it('destination and surfaceDistance agree', () => {
    const p = destination(-89.5, 40, 123, 12_345)
    expect(surfaceDistance(-89.5, 40, p.lat, p.lon)).toBeCloseTo(12_345, 3)
  })

  it('azimuth is measured clockwise from north', () => {
    const basis = enuBasis(-45, 30)
    const east = horizontalToEnu(90, 0)
    const v = [0, 1, 2].map(
      (k) => basis.east[k] * east[0] + basis.north[k] * east[1] + basis.up[k] * east[2],
    ) as [number, number, number]
    const h = toHorizontal(v, basis)
    expect(h.az).toBeCloseTo(90, 9)
    expect(h.el).toBeCloseTo(0, 9)
  })

  it('the local zenith is the radial direction', () => {
    const v = selenographicToVector(-80, 10, 1)
    const h = toHorizontal(v, enuBasis(-80, 10))
    expect(h.el).toBeCloseTo(90, 6)
  })
})
