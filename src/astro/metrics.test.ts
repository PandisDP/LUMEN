import { describe, expect, it } from 'vitest'
import { DAY_MS, HOUR_MS } from './constants.ts'
import { sphericalMask } from './horizon.ts'
import { computeMetrics, scoreOf, sweepLandingDates } from './metrics.ts'
import { computeScenario } from './scenario.ts'
import type { SiteSeries } from './series.ts'

/** Hand-made hourly series: Sun up for the first `litH` hours, Earth always up. */
function fakeSeries(hours: number, litH: number): SiteSeries {
  const f = (fn: (i: number) => number) => Float32Array.from({ length: hours }, (_, i) => fn(i))
  return {
    startMs: 0,
    stepMs: HOUR_MS,
    count: hours,
    sunAz: f(() => 0),
    sunEl: f((i) => (i < litH ? 1 : -1)),
    sunFrac: f((i) => (i < litH ? 1 : 0)),
    earthAz: f(() => 0),
    earthEl: f(() => 5),
    earthFrac: f(() => 1),
  }
}

describe('computeMetrics', () => {
  it('summarises light, link and the longest night', () => {
    const m = computeMetrics(fakeSeries(100, 40), 0, 100 * HOUR_MS)
    expect(m.sunlitPct).toBeCloseTo(40)
    expect(m.energyPct).toBeCloseTo(40)
    expect(m.dtePct).toBe(100)
    expect(m.bothPct).toBeCloseTo(40)
    expect(m.longestDarkH).toBeCloseTo(59.5, 0)
    expect(m.sunWindows).toHaveLength(1)
    expect(m.score).toBe(scoreOf(m.energyPct, m.dtePct, m.longestDarkH))
  })

  it('scores between 0 and 100', () => {
    expect(scoreOf(100, 100, 0)).toBe(100)
    expect(scoreOf(0, 0, 1000)).toBe(0)
  })
})

describe('sweepLandingDates', () => {
  it('evaluates one candidate per day over the mission length', () => {
    const c = sweepLandingDates(fakeSeries(24 * 10, 24 * 3), 2, 24)
    expect(c).toHaveLength(9)
    expect(c[0].energyPct).toBeCloseTo(100)
    expect(c[0].sunAtLanding).toBe(true)
    expect(c[5].energyPct).toBe(0)
    expect(c[5].longestDarkH).toBe(48)
  })

  it('reports the max and mean-lit Sun elevation of each window', () => {
    const c = sweepLandingDates(fakeSeries(24 * 10, 24 * 3), 2, 24)
    expect(c[0].maxSunEl).toBe(1)
    expect(c[0].meanSunElLit).toBe(1)
    expect(c[5].maxSunEl).toBe(-1)
    expect(c[5].meanSunElLit).toBeNaN()
  })
})

describe('computeScenario (real ephemeris, ideal horizon)', () => {
  it('an equatorial site is lit about half of a lunar month and always sees the Earth', () => {
    const start = Date.UTC(2026, 0, 1)
    const r = computeScenario({
      site: { lat: 0.67, lon: 23.47, heightM: 0 },
      mask: sphericalMask(),
      startMs: start,
      missionDays: 59,
      stepMinutes: 60,
    })
    expect(r.metrics.sunlitPct).toBeGreaterThan(45)
    expect(r.metrics.sunlitPct).toBeLessThan(56)
    expect(r.metrics.dtePct).toBe(100)
    // Nights last about 14.8 days.
    expect(r.metrics.longestDarkH).toBeGreaterThan(13 * 24)
    expect(r.metrics.longestDarkH).toBeLessThan(16 * 24)
    expect(r.series.count).toBe(59 * 24 + 1)
    expect(r.metrics.toMs - r.metrics.fromMs).toBeGreaterThan(59 * DAY_MS)
  })
})

describe('DTE link margin', () => {
  const base = {
    site: { lat: -89.5, lon: 0, heightM: 0 },
    mask: sphericalMask(),
    startMs: Date.UTC(2026, 0, 1),
    missionDays: 30,
    stepMinutes: 60,
  }

  it('margin 0 matches the bare-horizon result', () => {
    const a = computeScenario(base)
    const b = computeScenario({ ...base, linkMarginDeg: 0 })
    expect(b.metrics.dtePct).toBe(a.metrics.dtePct)
  })

  it('a larger margin never increases DTE time and leaves the Sun untouched', () => {
    const pcts = [0, 2, 5].map((m) => computeScenario({ ...base, linkMarginDeg: m }).metrics)
    expect(pcts[1].dtePct).toBeLessThanOrEqual(pcts[0].dtePct)
    expect(pcts[2].dtePct).toBeLessThan(pcts[0].dtePct)
    expect(pcts[2].sunlitPct).toBe(pcts[0].sunlitPct)
  })
})
