import { describe, expect, it } from 'vitest'
import { DEFAULT_LANDER_ID, LANDERS, landerPreset } from '../config/landers.ts'
import { groundSampler } from './descent.ts'
import {
  BRAKING_DV_MS,
  DESCENT_PHASES,
  type DescentResult,
  G0,
  START_ALT_M,
  START_RANGE_M,
  START_SPEED_H_MS,
  START_SPEED_V_MS,
  TOUCHDOWN_MAX_VH_MS,
  TOUCHDOWN_MAX_VZ_MS,
  powerDescentStart,
  propellantAfterBraking,
  retarget,
  sampleDescent,
  simulateDescent,
  thrustTiltDeg,
  totalDescentDvMs,
} from './descentPhysics.ts'
import { type Vec3 } from './frames.ts'
import { SLOPE_SAFE_DEG } from './slope.ts'

const origin: Vec3 = [0, 0, 0]
const flat = { ground: () => 0 }
const clps = landerPreset('clps')
const horiz = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2])
const touchdown = (r: DescentResult) => sampleDescent(r, Infinity)

function expectSoftLanding(r: DescentResult, tolM = 5) {
  const s = r.summary
  expect(s.reason).toBeUndefined()
  expect(s.ok).toBe(true)
  expect(Math.abs(s.touchdownVzMs)).toBeLessThanOrEqual(TOUCHDOWN_MAX_VZ_MS)
  expect(s.touchdownVhMs).toBeLessThanOrEqual(TOUCHDOWN_MAX_VH_MS)
  expect(horiz(touchdown(r).pos, s.target)).toBeLessThan(tolM)
  expect(s.propLeftKg).toBeGreaterThan(0)
  expect(s.propMarginPct).toBeGreaterThan(0)
}

describe('landers', () => {
  it('has the documented presets and falls back to the default', () => {
    expect(LANDERS.map((l) => l.id)).toEqual(['clps', 'small', 'heavy'])
    expect(landerPreset('nope').id).toBe(DEFAULT_LANDER_ID)
  })

  it('keeps propellant for the approach after the braking burn', () => {
    for (const v of LANDERS) {
      const left = propellantAfterBraking(v)
      expect(left).toBeGreaterThan(0)
      expect(left).toBeLessThan(v.propKg)
      // Rocket equation: the burn's Δv is the reference one.
      const dv = v.ispS * G0 * Math.log((v.dryKg + v.propKg) / (v.dryKg + left))
      expect(dv).toBeCloseTo(BRAKING_DV_MS, 6)
    }
    expect(totalDescentDvMs(300)).toBe(BRAKING_DV_MS + 300)
  })
})

describe('powerDescentStart', () => {
  it('lies up-range along the approach azimuth at the documented range and altitude', () => {
    const target: Vec3 = [120, -40, 310]
    for (const az of [0, 90, 225, 330]) {
      const s = powerDescentStart(target, az)
      const dx = s.pos[0] - target[0]
      const dn = -(s.pos[2] - target[2])
      expect(Math.hypot(dx, dn)).toBeCloseTo(START_RANGE_M, 6)
      expect(s.pos[1] - target[1]).toBeCloseTo(START_ALT_M, 9)
      // Azimuth of the start seen from the target (clockwise from north).
      const seen = (Math.atan2(dx, dn) * 180) / Math.PI
      expect(((seen - az + 540) % 360) - 180).toBeCloseTo(0, 6)
      // Flying towards the target, descending.
      expect(Math.hypot(s.vel[0], s.vel[2])).toBeCloseTo(START_SPEED_H_MS, 9)
      expect(s.vel[0] * dx - s.vel[2] * dn).toBeCloseTo(-START_SPEED_H_MS * START_RANGE_M, 3)
      expect(s.vel[1]).toBe(START_SPEED_V_MS)
    }
    // From the east: +x, no north component (same convention as descentWaypoints).
    const east = powerDescentStart(origin, 90)
    expect(east.pos[0]).toBeCloseTo(START_RANGE_M, 6)
    expect(Math.abs(east.pos[2])).toBeLessThan(1e-6)
    expect(east.vel[0]).toBeLessThan(0)
  })

  it('scales the speed with a shortened range', () => {
    const s = powerDescentStart(origin, 0, { rangeM: START_RANGE_M / 4 })
    expect(Math.hypot(s.pos[0], s.pos[2])).toBeCloseTo(START_RANGE_M / 4, 6)
    expect(Math.hypot(s.vel[0], s.vel[2])).toBeCloseTo(START_SPEED_H_MS / 2, 9)
  })
})

describe('simulateDescent', () => {
  it('lands every preset softly on the target over flat ground', () => {
    for (const v of LANDERS) {
      const r = simulateDescent(v, powerDescentStart(origin, 120), origin, flat)
      expectSoftLanding(r)
      const s = r.summary
      expect(s.divertM).toBe(0)
      expect(s.hazard).toBe(false)
      expect(touchdown(r).pos[1]).toBeCloseTo(0, 3)
      expect(s.propUsedKg + s.propLeftKg).toBeCloseTo(s.propStartKg, 6)
      // A final approach, not a de-orbit: a couple of minutes and a few hundred m/s.
      expect(s.durationS).toBeGreaterThan(60)
      expect(s.durationS).toBeLessThan(200)
      expect(s.dvMs).toBeGreaterThan(Math.hypot(START_SPEED_H_MS, START_SPEED_V_MS))
      expect(s.dvMs).toBeLessThan(450)
      // Phases in order.
      expect(s.phaseTimes.approachS).toBeGreaterThan(0)
      expect(s.phaseTimes.terminalS).toBeGreaterThan(s.phaseTimes.approachS)
      expect(s.phaseTimes.terminalS).toBeLessThan(s.durationS)
      // Peak thrust acceleration within what the engine can give the dry vehicle.
      expect(s.maxDecelG).toBeGreaterThan(1.62 / G0)
      expect(s.maxDecelG).toBeLessThanOrEqual(v.thrustN / v.dryKg / G0)
    }
  })

  it('is robust to the approach azimuth and to a target above or below the start reference', () => {
    for (const v of LANDERS)
      for (const az of [0, 90, 225])
        for (const y of [0, 300, -300]) {
          const target: Vec3 = [50, y, -80]
          // Start computed from the reference height 0: 3.2 / 3.5 / 3.8 km above the target.
          const start = powerDescentStart([50, 0, -80], az)
          const r = simulateDescent(v, start, target, { ground: () => y })
          expectSoftLanding(r)
          expect(r.summary.target[1]).toBe(y)
        }
  })

  it('agrees with the rocket equation', () => {
    for (const v of LANDERS) {
      const { summary: s } = simulateDescent(v, powerDescentStart(origin, 0), origin, flat)
      const m0 = v.dryKg + s.propStartKg
      const m1 = v.dryKg + s.propLeftKg
      const ideal = v.ispS * G0 * Math.log(m0 / m1)
      expect(Math.abs(s.dvMs - ideal) / ideal).toBeLessThan(0.01)
    }
  })

  it('burns mass monotonically, stays above the ground and respects the throttle range', () => {
    const r = simulateDescent(clps, powerDescentStart(origin, 45), origin, flat)
    const { samples: s, summary } = r
    expect(s.n).toBeGreaterThan(100)
    for (let i = 1; i < s.n; i++) {
      expect(s.t[i]).toBeGreaterThan(s.t[i - 1])
      expect(s.massKg[i]).toBeLessThanOrEqual(s.massKg[i - 1])
      expect(s.phase[i]).toBeGreaterThanOrEqual(s.phase[i - 1])
    }
    for (let i = 0; i < s.n - 1; i++) {
      expect(s.pos[i * 3 + 1]).toBeGreaterThan(0)
      expect(s.throttle[i]).toBeGreaterThanOrEqual(clps.minThrottle - 1e-6)
      expect(s.throttle[i]).toBeLessThanOrEqual(1 + 1e-6)
      // Thrust never points below the horizon; near-vertical in the terminal phase.
      const dir: Vec3 = [s.thrustDir[i * 3], s.thrustDir[i * 3 + 1], s.thrustDir[i * 3 + 2]]
      expect(Math.hypot(...dir)).toBeCloseTo(1, 5)
      expect(dir[1]).toBeGreaterThanOrEqual(0)
      if (DESCENT_PHASES[s.phase[i]] === 'terminal')
        expect(thrustTiltDeg(dir)).toBeLessThanOrEqual(clps.maxTiltDeg + 1e-3)
    }
    expect(s.massKg[0]).toBeCloseTo(clps.dryKg + summary.propStartKg, 2)
    expect(s.massKg[s.n - 1]).toBeCloseTo(clps.dryKg + summary.propLeftKg, 2)
    expect(DESCENT_PHASES[s.phase[0]]).toBe('braking')
  })

  it('does not depend on the integration step', () => {
    const start = powerDescentStart(origin, 200)
    const a = simulateDescent(clps, start, origin, flat).summary
    const b = simulateDescent(clps, start, origin, flat, { dtS: 0.02 }).summary
    expect(b.ok).toBe(true)
    expect(Math.abs(a.dvMs - b.dvMs) / b.dvMs).toBeLessThan(0.01)
    expect(Math.abs(a.durationS - b.durationS)).toBeLessThan(1)
  })

  it('lands on the reference sphere seen through the scene ground sampler', () => {
    // Curvature drops the ground ~16 m at the start; the site itself is the scene origin.
    const ground = groundSampler({ lat: -89.5, lon: 30, heightM: 0 }, []).groundY
    expect(ground(START_RANGE_M, 0)).toBeLessThan(-10)
    const r = simulateDescent(clps, powerDescentStart(origin, 90), origin, { ground })
    expectSoftLanding(r)
    expect(Math.abs(touchdown(r).pos[1])).toBeLessThan(0.01)
  })

  it('reports a ridge across the approach path as a terrain impact', () => {
    // A wall higher than the start, 3–4 km up-range (approach from the east: +x).
    const wallM = START_ALT_M + 500
    const ground = (x: number) => (x > 3_000 && x < 4_000 ? wallM : 0)
    const r = simulateDescent(clps, powerDescentStart(origin, 90), origin, { ground })
    expect(r.summary.ok).toBe(false)
    expect(r.summary.reason).toBe('terrain')
    const end = touchdown(r)
    // It stops at the wall's face, still moving fast, well before the nominal landing time.
    expect(end.pos[0]).toBeGreaterThan(3_990)
    expect(end.pos[0]).toBeLessThan(4_010)
    expect(end.phase).not.toBe('landed')
    expect(Math.hypot(...end.vel)).toBeGreaterThan(50)
    expect(r.summary.durationS).toBeLessThan(60)
    expect(r.summary.phaseTimes.terminalS).toBe(r.summary.durationS)
  })

  it('clears a hill that stays under the glide path', () => {
    // 300 m hill 2–3 km up-range; the nominal path is ~1.5 km up there.
    const ground = (x: number) => (x > 2_000 && x < 3_000 ? 300 : 0)
    const r = simulateDescent(clps, powerDescentStart(origin, 90), origin, { ground })
    expectSoftLanding(r)
  })

  it('runs out of propellant with too small a load', () => {
    const start = powerDescentStart(origin, 0)
    // Too little even for the braking burn: no propellant at the start, ballistic fall.
    const dry = simulateDescent({ ...clps, propKg: 200 }, start, origin, flat)
    expect(dry.summary.propStartKg).toBe(0)
    expect(dry.summary.ok).toBe(false)
    expect(dry.summary.reason).toBe('propellant')
    expect(dry.summary.dvMs).toBe(0)
    // Enough to brake but not to finish the approach.
    const short = simulateDescent(clps, start, origin, flat, { startPropKg: 60 })
    expect(short.summary.ok).toBe(false)
    expect(short.summary.reason).toBe('propellant')
    expect(short.summary.propLeftKg).toBe(0)
    expect(short.summary.propUsedKg).toBeCloseTo(60, 6)
    expect(short.summary.propMarginPct).toBe(0)
    expect(Math.abs(short.summary.touchdownVzMs)).toBeGreaterThan(TOUCHDOWN_MAX_VZ_MS)
    const last = short.samples.n - 1
    expect(short.samples.throttle[last]).toBe(0)
  })

  it('times out', () => {
    const r = simulateDescent(clps, powerDescentStart(origin, 0), origin, flat, { maxTimeS: 30 })
    expect(r.summary.ok).toBe(false)
    expect(r.summary.reason).toBe('timeout')
    expect(r.summary.durationS).toBeCloseTo(30, 6)
  })

  it('flags a hard landing', () => {
    // A lander that can barely tilt in the terminal phase cannot null the horizontal speed
    // left at the handover before it reaches the ground.
    const stiff = { ...clps, maxTiltDeg: 1 }
    const r = simulateDescent(stiff, powerDescentStart(origin, 0), origin, flat)
    expect(r.summary.ok).toBe(false)
    expect(r.summary.reason).toBe('hard-landing')
    expect(r.summary.touchdownVhMs).toBeGreaterThan(TOUCHDOWN_MAX_VH_MS)
    expect(Math.abs(r.summary.touchdownVzMs)).toBeLessThanOrEqual(TOUCHDOWN_MAX_VZ_MS)
    expect(touchdown(r).phase).toBe('terminal')
  })

  it('never lands with an engine that cannot throttle below the landing weight', () => {
    const r = simulateDescent(
      { ...clps, minThrottle: 0.6 },
      powerDescentStart(origin, 0),
      origin,
      flat,
    )
    expect(r.summary.ok).toBe(false)
    expect(['timeout', 'propellant']).toContain(r.summary.reason)
  })
})

describe('hazard avoidance', () => {
  // A 150 m boulder field / crater rim around the target, benign ground elsewhere.
  const slopeAt = (x: number, z: number) => (Math.hypot(x, z) < 150 ? 20 : 3)

  it('diverts to the nearest safe ground at a modest cost', () => {
    for (const v of LANDERS)
      for (const az of [0, 90, 225]) {
        const start = powerDescentStart(origin, az)
        const nominal = simulateDescent(v, start, origin, flat)
        const r = simulateDescent(v, start, origin, { ...flat, slopeAt })
        expectSoftLanding(r)
        const s = r.summary
        expect(s.hazard).toBe(false)
        expect(s.divertM).toBeGreaterThan(150)
        expect(s.divertM).toBeLessThanOrEqual(300 * Math.SQRT2 + 1e-6)
        expect(horiz(s.target, origin)).toBeCloseTo(s.divertM, 6)
        const end = touchdown(r).pos
        expect(slopeAt(end[0], end[2])).toBeLessThan(SLOPE_SAFE_DEG)
        expect(horiz(end, origin)).toBeGreaterThan(150)
        const extra = s.dvMs - nominal.summary.dvMs
        expect(extra).toBeGreaterThan(0)
        expect(extra).toBeLessThan(60)
      }
  })

  it('keeps a safe target', () => {
    const start = powerDescentStart(origin, 0)
    const r = simulateDescent(clps, start, origin, { ...flat, slopeAt: () => 4 })
    expectSoftLanding(r)
    expect(r.summary.divertM).toBe(0)
    expect(r.summary.target).toEqual([0, 0, 0])
    expect(r.summary.dvMs).toBeCloseTo(simulateDescent(clps, start, origin, flat).summary.dvMs, 9)
  })

  it('flags the hazard when nothing in reach is safe', () => {
    const r = simulateDescent(clps, powerDescentStart(origin, 0), origin, {
      ...flat,
      slopeAt: () => 18,
    })
    expect(r.summary.hazard).toBe(true)
    expect(r.summary.divertM).toBe(0)
    expect(r.summary.target).toEqual([0, 0, 0])
    // The guidance still lands where it was told to.
    expect(r.summary.ok).toBe(true)
  })

  it('retarget applies the safe-ground rule (slope < 10°, neighbours < 15°)', () => {
    expect(retarget(origin, () => 5)).toEqual({ x: 0, z: 0, divertM: 0 })
    expect(retarget(origin, () => 12)).toBeNull()
    expect(retarget(origin, () => NaN)).toBeNull()
    // Gentle target next to a steep neighbour to the east: not safe, moves away from it.
    const pick = retarget(origin, (x) => (x > 50 ? 30 : 2))
    expect(pick).not.toBeNull()
    expect(pick!.x).toBe(-100)
    expect(pick!.divertM).toBe(100)
    // Ties go to the candidate closest to the lander.
    const tie = retarget(origin, slopeAt, [0, 400, 5_000])
    expect(tie).toEqual({ x: 0, z: 300, divertM: 300 })
  })
})

describe('sampleDescent', () => {
  const start = powerDescentStart(origin, 60)
  const r = simulateDescent(clps, start, origin, flat)

  it('matches the start state at t = 0 and before', () => {
    for (const t of [0, -5]) {
      const s = sampleDescent(r, t)
      for (let k = 0; k < 3; k++) {
        expect(s.pos[k]).toBeCloseTo(start.pos[k], 2)
        expect(s.vel[k]).toBeCloseTo(start.vel[k], 3)
      }
      expect(s.massKg).toBeCloseTo(clps.dryKg + r.summary.propStartKg, 2)
      expect(s.phase).toBe('braking')
      expect(s.throttle).toBeGreaterThan(0)
    }
  })

  it('holds the touchdown state from the end on', () => {
    const end = sampleDescent(r, r.summary.durationS)
    const later = sampleDescent(r, r.summary.durationS + 100)
    expect(later).toEqual(end)
    expect(end.phase).toBe('landed')
    expect(end.throttle).toBe(0)
    expect(end.pos[1]).toBeCloseTo(0, 3)
    expect(horiz(end.pos, r.summary.target)).toBeLessThan(5)
    expect(end.vel[1]).toBeCloseTo(r.summary.touchdownVzMs, 5)
    expect(end.massKg).toBeCloseTo(clps.dryKg + r.summary.propLeftKg, 2)
  })

  it('interpolates continuously in between', () => {
    let prev = sampleDescent(r, 0)
    const seen = new Set([prev.phase])
    for (let t = 0.1; t < r.summary.durationS; t += 0.1) {
      const s = sampleDescent(r, t)
      // No jump larger than the speed allows (≤ ~180 m/s · 0.1 s).
      expect(
        Math.hypot(s.pos[0] - prev.pos[0], s.pos[1] - prev.pos[1], s.pos[2] - prev.pos[2]),
      ).toBeLessThan(20)
      expect(Math.hypot(...s.thrustDir)).toBeCloseTo(1, 6)
      expect(s.throttle).toBeGreaterThan(0)
      expect(s.massKg).toBeLessThanOrEqual(prev.massKg + 1e-3)
      seen.add(s.phase)
      prev = s
    }
    expect([...seen]).toEqual(['braking', 'approach', 'terminal'])
  })
})
