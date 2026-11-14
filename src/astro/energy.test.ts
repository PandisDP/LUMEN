import { describe, expect, it } from 'vitest'
import { type EnergyProfile, incidenceFactor, simulateBattery } from './energy.ts'
import type { SiteSeries } from './series.ts'

const HOUR = 3_600_000

/** Hourly series with the Sun at elevation 1.5°, azimuth `az(i)`, lit while lit(i). */
function series(hours: number, lit: (i: number) => boolean, az: (i: number) => number = () => 0) {
  const f = (fn: (i: number) => number) => Float32Array.from({ length: hours + 1 }, (_, i) => fn(i))
  return {
    startMs: 0,
    stepMs: HOUR,
    count: hours + 1,
    sunAz: f(az),
    sunEl: f(() => 1.5),
    sunFrac: f((i) => (lit(i) ? 1 : 0)),
    earthAz: f(() => 0),
    earthEl: f(() => 5),
    earthFrac: f(() => 1),
  } satisfies SiteSeries
}

const base: EnergyProfile = {
  panel: 'tracking',
  panelAzDeg: 0,
  peakW: 100,
  batteryWh: 1000,
  activeW: 50,
  hibernateW: 10,
  hibernateBelowPct: 20,
  initialSocPct: 50,
}

describe('incidenceFactor', () => {
  it('tracking is 1; a fixed panel only sees a Sun in front of it', () => {
    expect(incidenceFactor(base, 123, 1.5)).toBe(1)
    const fixed = { panel: 'vertical-fixed' as const, panelAzDeg: 90 }
    expect(incidenceFactor(fixed, 90, 0)).toBeCloseTo(1, 6)
    expect(incidenceFactor(fixed, 150, 0)).toBeCloseTo(0.5, 6)
    expect(incidenceFactor(fixed, 270, 0)).toBe(0)
  })

  it('a box always has 1 to √2 faces worth of light; a flat deck almost none', () => {
    const box = { panel: 'vertical-box' as const, panelAzDeg: 0 }
    expect(incidenceFactor(box, 0, 0)).toBeCloseTo(1, 6)
    expect(incidenceFactor(box, 45, 0)).toBeCloseTo(Math.SQRT2, 6)
    expect(incidenceFactor({ panel: 'horizontal', panelAzDeg: 0 }, 0, 1.5)).toBeCloseTo(0.026, 3)
  })
})

describe('simulateBattery', () => {
  it('charges under constant Sun and saturates at 100 %', () => {
    const r = simulateBattery(
      series(100, () => true),
      base,
    )
    // +50 W net from 500 Wh: full after 10 h.
    expect(r.socPct[10]).toBeCloseTo(100, 3)
    expect(r.socPct[100]).toBeCloseTo(100, 3)
    expect(r.depletedAtMs).toBeNull()
    expect(r.minSocPct).toBeCloseTo(50, 3)
    expect(r.activePct).toBe(100)
  })

  it('runs out during a long night at the analytic time', () => {
    // Full battery, dark from the start: 1000 Wh / 10 W survival load (active needs Sun).
    const r = simulateBattery(
      series(200, () => false),
      { ...base, initialSocPct: 100 },
    )
    expect(r.depletedAtMs).toBeCloseTo(100 * HOUR, -3)
    expect(r.hoursAtZero).toBeCloseTo(100, 3)
    expect(r.minSocPct).toBe(0)
    expect(r.activePct).toBe(0)
  })

  it('a fixed panel facing away from the Sun produces nothing', () => {
    const r = simulateBattery(
      series(
        24,
        () => true,
        () => 180,
      ),
      {
        ...base,
        panel: 'vertical-fixed',
        panelAzDeg: 0,
      },
    )
    expect(Math.max(...r.powerW)).toBe(0)
    expect(r.socPct[24]).toBeLessThan(r.socPct[0])
  })

  it('drops to survival mode below the threshold', () => {
    const r = simulateBattery(
      series(50, () => true),
      {
        ...base,
        peakW: 0,
        initialSocPct: 30,
      },
    )
    // 300 Wh, 50 W active until 20 % (200 Wh) → 2 h active, then 10 W survival.
    expect(r.active[0]).toBe(1)
    expect(r.active[3]).toBe(0)
    expect(r.socPct[3]).toBeCloseTo(19, 0)
  })
})
