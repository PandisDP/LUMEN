import { describe, expect, it } from 'vitest'
import fixtures from './__fixtures__/horizons-dsn.json'
import { ephemerisSeries } from './ephemeris.ts'
import { wrap180 } from './frames.ts'
import { sphericalMask } from './horizon.ts'
import { evaluateSite } from './series.ts'
import {
  DSN_MIN_EL_DEG,
  MEAN_EARTH_MOON_KM,
  DSN_STATIONS,
  anyStationSeesMoon,
  dsnVisibility,
  fsplDb,
  primaryStation,
  relativeFsplDb,
} from './dsn.ts'

const HOUR = 3_600_000

describe('DSN geometry', () => {
  it('reports the three complexes with consistent visibility flags', () => {
    const s = dsnVisibility(new Date(Date.UTC(2026, 0, 15, 12)))
    expect(s.map((x) => x.id)).toEqual(['goldstone', 'madrid', 'canberra'])
    for (const x of s) {
      expect(x.el).toBeGreaterThanOrEqual(-90)
      expect(x.el).toBeLessThanOrEqual(90)
      expect(x.visible).toBe(x.el >= DSN_MIN_EL_DEG)
    }
  })

  it('keeps the Moon in view of at least one station almost all the time', () => {
    const t0 = Date.UTC(2026, 2, 1)
    let covered = 0
    const n = 30 * 24
    for (let i = 0; i < n; i++) {
      if (dsnVisibility(new Date(t0 + i * HOUR)).some((x) => x.visible)) covered++
    }
    // The three sites are ~120° apart in longitude; gaps only appear at extreme declinations.
    expect(covered / n).toBeGreaterThan(0.9)
  })

  it('the Moon rises and sets at each station within a day', () => {
    const t0 = Date.UTC(2026, 4, 10)
    for (let k = 0; k < 3; k++) {
      const els = Array.from({ length: 25 }, (_, i) => dsnVisibility(new Date(t0 + i * HOUR))[k].el)
      expect(Math.max(...els)).toBeGreaterThan(0)
      expect(Math.min(...els)).toBeLessThan(0)
    }
  })

  it('picks the visible station with the highest Moon', () => {
    const p = primaryStation([
      { id: 'goldstone', el: 5, az: 0, visible: false },
      { id: 'madrid', el: 30, az: 0, visible: true },
      { id: 'canberra', el: 50, az: 0, visible: true },
    ])
    expect(p?.id).toBe('canberra')
    expect(primaryStation([{ id: 'madrid', el: 2, az: 0, visible: false }])).toBeUndefined()
  })
})

describe('path loss', () => {
  it('matches the X-band free-space loss at the mean distance', () => {
    expect(fsplDb(MEAN_EARTH_MOON_KM)).toBeCloseTo(222.7, 1)
    expect(relativeFsplDb(MEAN_EARTH_MOON_KM)).toBeCloseTo(0, 6)
    // Perigee (~363 000 km) vs apogee (~405 000 km): about 1 dB of swing.
    expect(relativeFsplDb(405_000) - relativeFsplDb(363_000)).toBeCloseTo(0.95, 1)
  })
})

// Reference values from JPL Horizons (npm run validate): Moon seen from each complex.
describe('DSN geometry against JPL Horizons', () => {
  it.each(fixtures.map((f) => [`${f.station} ${f.date}`, f] as const))('%s', (_, f) => {
    const k = DSN_STATIONS.findIndex((s) => s.id === f.station)
    const mine = dsnVisibility(new Date(`${f.date}Z`))[k]
    expect(Math.abs(mine.el - f.el)).toBeLessThan(0.01)
    expect(Math.abs(wrap180(mine.az - f.az)) * Math.cos((f.el * Math.PI) / 180)).toBeLessThan(0.01)
  })
})

describe('requiring a DSN station for the link', () => {
  // A far-side-free equatorial site: the Earth is always up, so only the DSN can cut the link.
  const site = { lat: 0, lon: 0, heightM: 0 }
  const mask = sphericalMask(2, 1)
  const startMs = Date.UTC(2026, 0, 1)
  const eph = ephemerisSeries(startMs, 600_000, 30 * 144)

  it('leaves the series untouched when the option is off', () => {
    const base = evaluateSite(eph, site, mask, 0)
    expect(Array.from(evaluateSite(eph, site, mask, 0, false).earthFrac)).toEqual(
      Array.from(base.earthFrac),
    )
  })

  it('drops the link exactly when no complex sees the Moon', () => {
    const base = evaluateSite(eph, site, mask, 0)
    const dsn = evaluateSite(eph, site, mask, 0, true)
    let cut = 0
    for (let i = 0; i < eph.count; i++) {
      const seen = anyStationSeesMoon(startMs + i * 600_000)
      expect(dsn.earthFrac[i]).toBe(seen ? base.earthFrac[i] : 0)
      if (!seen) cut++
    }
    // Some gaps in a month, but a small share of the time.
    expect(cut).toBeGreaterThan(0)
    expect(cut / eph.count).toBeLessThan(0.05)
    // The Sun is not affected.
    expect(Array.from(dsn.sunFrac)).toEqual(Array.from(base.sunFrac))
  })
})
