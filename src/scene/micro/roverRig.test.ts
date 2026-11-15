import { describe, expect, it } from 'vitest'
import {
  ROVER_RIGS,
  approachAngle,
  solveSide,
  solveSuspension,
  steerAngle,
  turnPerM,
  wheelLayout,
  yawTowards,
} from './roverRig.ts'

const utility = ROVER_RIGS['csa-rover']
const micro = ROVER_RIGS.rover

/** Height of the three axles of one side for a solution (forward kinematics, exact). */
function axleHeights(spec: typeof utility, s: { rocker: number; bogie: number; lift: number }) {
  const R = spec.wheelR
  const P = spec.pivot
  const at = (u: number, y: number, a: number) => u * Math.sin(a) + y * Math.cos(a)
  const pivotY = P.y + s.lift
  const front = pivotY + at(spec.frontU - P.u, R - P.y, s.rocker)
  if (!spec.bogie) return [front, pivotY + at(spec.rearU - P.u, R - P.y, s.rocker)]
  const B = spec.bogie.pivot
  const bogieY = pivotY + at(B.u - P.u, B.y - P.y, s.rocker)
  return [
    front,
    bogieY + at(spec.bogie.midU - B.u, R - B.y, s.bogie),
    bogieY + at(spec.rearU - B.u, R - B.y, s.bogie),
  ]
}

describe('wheelLayout', () => {
  it('lists six wheels for the rocker-bogie and four for the micro-rover, left side first', () => {
    const six = wheelLayout(utility)
    expect(six.map((w) => `${w.side}${w.station}`)).toEqual([
      '-1front',
      '-1mid',
      '-1rear',
      '1front',
      '1mid',
      '1rear',
    ])
    expect(six.filter((w) => w.steers).map((w) => w.station)).toEqual([
      'front',
      'rear',
      'front',
      'rear',
    ])
    expect(wheelLayout(micro)).toHaveLength(4)
    expect(wheelLayout(micro).some((w) => w.steers)).toBe(false)
  })

  it('matches the stated overall size', () => {
    for (const spec of [utility, micro]) {
      expect(spec.frontU - spec.rearU + 2 * spec.wheelR).toBeCloseTo(spec.lengthM, 1)
      expect(2 * spec.trackHalf + spec.wheelW).toBeCloseTo(spec.widthM, 1)
    }
  })
})

describe('solveSide', () => {
  it('is level on flat ground', () => {
    for (const spec of [utility, micro]) {
      const s = solveSide(spec, 0, 0, 0)
      expect(s.rocker).toBeCloseTo(0, 12)
      expect(s.bogie).toBeCloseTo(0, 12)
      expect(s.lift).toBeCloseTo(0, 12)
    }
  })

  it('rises as a whole on ground that is uniformly higher', () => {
    const s = solveSide(utility, 0.07, 0.07, 0.07)
    expect(s.rocker).toBeCloseTo(0, 12)
    expect(s.bogie).toBeCloseTo(0, 12)
    expect(s.lift).toBeCloseTo(0.07, 12)
  })

  it('a step under the front wheel tips the rocker nose-up and lifts the pivot', () => {
    for (const spec of [utility, micro]) {
      const s = solveSide(spec, 0.08, 0, 0)
      expect(s.rocker).toBeGreaterThan(0.02)
      expect(s.bogie).toBeCloseTo(0, 12)
      expect(s.lift).toBeGreaterThan(0)
      expect(s.lift).toBeLessThan(0.08)
      expect(solveSide(spec, -0.08, 0, 0).rocker).toBeLessThan(-0.02)
    }
  })

  it('a step under the middle wheel tips the bogie nose-up and the rocker nose-down', () => {
    const s = solveSide(utility, 0, 0.06, 0)
    expect(s.bogie).toBeGreaterThan(0.02)
    expect(s.rocker).toBeLessThan(0)
    expect(solveSide(utility, 0, 0, 0.06).bogie).toBeLessThan(-0.02)
  })

  it('puts every wheel on its ground height (within the travel limits)', () => {
    const cases = [
      [0.08, 0, 0],
      [0, 0.06, -0.03],
      [-0.05, 0.02, 0.07],
    ]
    for (const h of cases) {
      const y = axleHeights(utility, solveSide(utility, h[0], h[1], h[2]))
      h.forEach((v, i) => expect(y[i]).toBeCloseTo(v + utility.wheelR, 9))
    }
    const y = axleHeights(micro, solveSide(micro, 0.03, 0, -0.02))
    expect(y[0]).toBeCloseTo(0.03 + micro.wheelR, 9)
    expect(y[1]).toBeCloseTo(-0.02 + micro.wheelR, 9)
  })

  it('clamps to the travel limits', () => {
    const s = solveSide(utility, 5, 0, 0)
    expect(s.rocker).toBeCloseTo(utility.maxRockerRad, 12)
    expect(solveSide(utility, -5, 0, 0).rocker).toBeCloseTo(-utility.maxRockerRad, 12)
    expect(solveSide(utility, 0, 5, 0).bogie).toBeCloseTo(utility.maxBogieRad, 12)
    expect(solveSide(utility, 0, 0, 5).bogie).toBeCloseTo(-utility.maxBogieRad, 12)
    expect(Number.isFinite(s.lift)).toBe(true)
    expect(solveSide(micro, 9, 0, 0).rocker).toBeCloseTo(micro.maxRockerRad, 12)
  })
})

describe('solveSuspension', () => {
  it('is all zero on flat ground', () => {
    const s = solveSuspension(utility, [0, 0, 0, 0, 0, 0])
    expect(s.heave).toBeCloseTo(0, 12)
    expect(s.pitch).toBeCloseTo(0, 12)
    expect(s.roll).toBeCloseTo(0, 12)
    expect(s.diff).toBeCloseTo(0, 12)
  })

  it('the differential gives the body half the pitch of a rocker climbing alone', () => {
    const s = solveSuspension(utility, [0.1, 0, 0, 0, 0, 0])
    expect(s.sides[0].rocker).toBeGreaterThan(0)
    expect(s.sides[1].rocker).toBeCloseTo(0, 12)
    expect(s.pitch).toBeCloseTo(s.sides[0].rocker / 2, 12)
    expect(s.diff).toBeCloseTo(s.sides[0].rocker / 2, 12)
    // Left side up: the body rolls to the right (negative roll = right side down).
    expect(s.roll).toBeLessThan(0)
    expect(solveSuspension(utility, [0, 0, 0, 0.1, 0, 0]).roll).toBeGreaterThan(0)
  })

  it('reads four heights for the micro-rover (front, rear per side)', () => {
    const s = solveSuspension(micro, [0.03, 0, 0, 0.03])
    expect(s.sides[0].rocker).toBeGreaterThan(0)
    expect(s.sides[1].rocker).toBeCloseTo(-s.sides[0].rocker, 12)
    expect(s.pitch).toBeCloseTo(0, 12)
    expect(s.sides[0].bogie).toBe(0)
  })
})

describe('steerAngle', () => {
  const max = utility.maxSteerRad
  const x = utility.trackHalf
  const u = utility.frontU

  it('is zero without a turn, and for the middle wheels', () => {
    expect(steerAngle(0, x, u, max)).toBe(0)
    expect(steerAngle(0.2, x, 0, max)).toBe(0)
  })

  it('front wheels steer into the turn, rear wheels against it', () => {
    expect(steerAngle(0.2, x, u, max)).toBeGreaterThan(0)
    expect(steerAngle(0.2, -x, u, max)).toBeGreaterThan(0)
    expect(steerAngle(-0.2, x, u, max)).toBeLessThan(0)
    expect(steerAngle(0.2, x, -u, max)).toBeCloseTo(-steerAngle(0.2, x, u, max), 12)
  })

  it('is mirror-symmetric: a left turn is a right turn seen from the other side', () => {
    expect(steerAngle(-0.2, -x, u, max)).toBeCloseTo(-steerAngle(0.2, x, u, max), 12)
    expect(steerAngle(-0.2, x, u, max)).toBeCloseTo(-steerAngle(0.2, -x, u, max), 12)
  })

  it('the inner wheel steers more than the outer one', () => {
    // Turning right: the right wheel (x > 0) is the inner one.
    const inner = steerAngle(0.3, x, u, max)
    const outer = steerAngle(0.3, -x, u, max)
    expect(inner).toBeGreaterThan(outer)
    expect(outer).toBeGreaterThan(0)
    // All axles meet at the turn centre, 1/κ to the right.
    expect(Math.tan(inner)).toBeCloseTo(u / (1 / 0.3 - x), 12)
  })

  it('clamps to the lock, also when the turn centre falls inside the track', () => {
    expect(steerAngle(1.5, x, u, max)).toBe(max)
    expect(steerAngle(-1.5, -x, u, max)).toBe(-max)
    expect(steerAngle(50, x, u, max)).toBe(max)
    expect(steerAngle(50, x, -u, max)).toBe(-max)
  })
})

describe('pointing helpers', () => {
  it('turnPerM is the heading change per metre, through north', () => {
    expect(turnPerM(10, 20, 5)).toBeCloseTo((10 * Math.PI) / 180 / 5, 12)
    expect(turnPerM(355, 5, 2)).toBeCloseTo((10 * Math.PI) / 180 / 2, 12)
    expect(turnPerM(5, 355, 2)).toBeLessThan(0)
    expect(turnPerM(10, 20, 0)).toBe(0)
    expect(turnPerM(NaN, 20, 0)).toBe(0)
  })

  it('yawTowards turns a forward-facing part to an azimuth (three.js yaw: left positive)', () => {
    expect(yawTowards(90, 90)).toBeCloseTo(0, 12)
    // Target due east while heading north: 90° to the right = −90° about +y.
    expect(yawTowards(90, 0)).toBeCloseTo(-Math.PI / 2, 12)
    expect(yawTowards(350, 10)).toBeCloseTo((20 * Math.PI) / 180, 12)
  })

  it('approachAngle takes the short way round', () => {
    const a = approachAngle(3, -3, 0.1, 0.5)
    expect(a).toBeGreaterThan(3)
  })
})
