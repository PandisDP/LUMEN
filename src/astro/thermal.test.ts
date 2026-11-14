import { describe, expect, it } from 'vitest'
import { HOUR_MS } from './constants.ts'
import type { SiteSeries } from './series.ts'
import {
  FREEZE_K,
  T_NIGHT_K,
  T_PSR_K,
  earthRefractionDeg,
  equilibriumK,
  kelvinToC,
  litTemps,
  thermalSeries,
} from './thermal.ts'

function series(sunEl: number[], sunFrac: number[], stepH = 1): SiteSeries {
  const n = sunEl.length
  const f = (v: number[]) => Float32Array.from(v)
  return {
    startMs: 0,
    stepMs: stepH * HOUR_MS,
    count: n,
    sunAz: new Float32Array(n),
    sunEl: f(sunEl),
    sunFrac: f(sunFrac),
    earthAz: new Float32Array(n),
    earthEl: new Float32Array(n),
    earthFrac: new Float32Array(n),
  }
}

describe('equilibrium temperatures', () => {
  it('Sun at the zenith heats flat regolith to ~390 K (+115 °C)', () => {
    const t = litTemps(90, 1)
    expect(t.regolithK).toBeGreaterThan(380)
    expect(t.regolithK).toBeLessThan(400)
  })

  it('at the pole flat ground stays cold while a Sun-facing wall reaches ~+105 °C', () => {
    const t = litTemps(1.5, 1)
    expect(t.regolithK).toBeLessThan(200)
    expect(kelvinToC(t.faceK)).toBeGreaterThan(95)
    expect(kelvinToC(t.faceK)).toBeLessThan(120)
  })

  it('grows monotonically with the visible disc and is floored', () => {
    expect(litTemps(1.5, 0.3).faceK).toBeLessThan(litTemps(1.5, 0.8).faceK)
    expect(equilibriumK(0)).toBe(T_NIGHT_K)
    expect(equilibriumK(0, T_PSR_K)).toBe(T_PSR_K)
  })
})

describe('thermal series', () => {
  it('a site never lit sits at the PSR floor and is always below freezing', () => {
    const r = thermalSeries(series(Array(48).fill(-2), Array(48).fill(0)))
    expect(r.psr).toBe(true)
    expect(r.maxK).toBe(T_PSR_K)
    expect(r.hoursBelowFreeze).toBe(48)
  })

  it('cools towards the night floor after sunset', () => {
    const el = [...Array(10).fill(1.5), ...Array(72).fill(-1)]
    const frac = [...Array(10).fill(1), ...Array(72).fill(0)]
    const r = thermalSeries(series(el, frac))
    expect(r.psr).toBe(false)
    expect(r.faceK[9]).toBeGreaterThan(350)
    expect(r.faceK[81]).toBeLessThan(T_NIGHT_K + 1)
    expect(r.faceK[81]).toBeGreaterThanOrEqual(T_NIGHT_K)
    expect(r.faceK[12]).toBeLessThan(r.faceK[10])
    expect(r.longestFreezeH).toBeGreaterThan(60)
    expect(r.hoursBelowFreeze).toBe(r.longestFreezeH)
    expect(FREEZE_K).toBeGreaterThan(T_NIGHT_K)
  })
})

describe('Earth refraction (comparison only)', () => {
  it('lifts the Sun ~0.57° at the horizon and almost nothing high up', () => {
    expect(earthRefractionDeg(0)).toBeCloseTo(0.57, 1)
    expect(earthRefractionDeg(45)).toBeLessThan(0.02)
  })
})
