import { describe, expect, it } from 'vitest'
import { anyStationSeesMoon, dsnMask } from './dsn.ts'
import { sphericalMask } from './horizon.ts'
import { computeScenario, scenarioStepMinutes } from './scenario.ts'

describe('long missions', () => {
  it('samples coarser as the window grows, keeping the series under ~9 000 points', () => {
    expect(scenarioStepMinutes(14)).toBe(10)
    expect(scenarioStepMinutes(60)).toBe(10)
    expect(scenarioStepMinutes(90)).toBe(30)
    expect(scenarioStepMinutes(365)).toBe(60)
    for (const days of [60, 180, 365]) {
      expect((days * 1440) / scenarioStepMinutes(days)).toBeLessThanOrEqual(8_760)
    }
  })

  it('evaluates a full year: twelve to thirteen lunar days at the equator', () => {
    const startMs = Date.UTC(2027, 0, 1)
    const r = computeScenario({
      site: { lat: 0, lon: 0, heightM: 0 },
      mask: sphericalMask(2, 1),
      startMs,
      missionDays: 365,
    })
    expect(r.series.stepMs).toBe(3_600_000)
    expect(r.series.count).toBe(365 * 24 + 1)
    expect(r.metrics.sunlitPct).toBeGreaterThan(48)
    expect(r.metrics.sunlitPct).toBeLessThan(52)
    const days = r.metrics.sunWindows.length
    expect(days).toBeGreaterThanOrEqual(12)
    expect(days).toBeLessThanOrEqual(14)
    // Near side: the Earth never sets.
    expect(r.metrics.dtePct).toBeCloseTo(100, 5)
  })

  it('caches the DSN mask of a time grid and matches the per-instant check', () => {
    const startMs = Date.UTC(2027, 0, 1)
    const mask = dsnMask(startMs, 3_600_000, 200)
    expect(dsnMask(startMs, 3_600_000, 200)).toBe(mask)
    for (let i = 0; i < 200; i += 7)
      expect(mask[i]).toBe(anyStationSeesMoon(startMs + i * 3_600_000) ? 1 : 0)
  })
})
