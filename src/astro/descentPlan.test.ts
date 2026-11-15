import { describe, expect, it } from 'vitest'
import { landerPreset } from '../config/landers.ts'
import { START_ALTITUDES_M, planDescent } from './descentPlan.ts'

const clps = landerPreset('clps')
const flat = () => 0

describe('planDescent', () => {
  it('lands at the origin from the default height on open ground', () => {
    const p = planDescent(clps, { ground: flat }, 90, 10_000)
    expect(p.result.summary.ok).toBe(true)
    expect(p.startAltM).toBe(START_ALTITUDES_M[0])
    expect(p.hazard).toBeNull()
    expect(Math.hypot(p.result.summary.target[0], p.result.summary.target[2])).toBeLessThan(1e-6)
  })

  it('starts higher when a ridge blocks the default approach', () => {
    // A 4 km wall across the track, 5 km up-range (approach from the east: +x).
    const ridge = (x: number) => (x > 4_800 && x < 5_200 ? 4_000 : 0)
    const p = planDescent(clps, { ground: (x) => ridge(x) }, 90, 10_000)
    expect(p.startAltM).toBeGreaterThan(START_ALTITUDES_M[0])
    expect(p.result.summary.ok).toBe(true)
  })

  it('keeps the start inside a small tile', () => {
    const p = planDescent(clps, { ground: flat }, 0, 4_000)
    const s = p.result.samples
    expect(Math.hypot(s.pos[0], s.pos[2])).toBeLessThanOrEqual(3_000 + 1)
    expect(p.result.summary.ok).toBe(true)
  })

  it('advises a divert, with its Δv cost, when the target is steep, without flying it', () => {
    const slopeAt = (x: number, z: number) => (Math.hypot(x, z) < 150 ? 20 : 3)
    const p = planDescent(clps, { ground: flat, slopeAt }, 90, 10_000)
    expect(p.hazard).not.toBeNull()
    expect(p.hazard!.divertM).toBeGreaterThan(0)
    expect(p.hazard!.extraDvMs).toBeGreaterThan(0)
    expect(slopeAt(p.hazard!.x, p.hazard!.z)).toBeLessThan(10)
    // The flown descent still ends at the evaluated site.
    expect(p.result.summary.divertM).toBe(0)
    expect(p.noSafeGround).toBe(false)
  })

  it('flags a target with no safe ground in reach', () => {
    const p = planDescent(clps, { ground: flat, slopeAt: () => 25 }, 90, 10_000)
    expect(p.noSafeGround).toBe(true)
    expect(p.hazard).toBeNull()
  })
})
