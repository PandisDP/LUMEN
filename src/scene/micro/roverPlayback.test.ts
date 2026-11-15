import { describe, expect, it } from 'vitest'
import type { TraversePlan } from '../../astro/traverse.ts'
import { poseWindowMs, timeAtDistanceMs } from './roverPlayback.ts'

const MIN = 60_000
const t0 = 5_000_000
/**
 * 100 m out at 10 m/min, an hour at the ice, 100 m back: the odometer keeps growing and holds
 * still while sampling.
 */
const trip = () => {
  const t: number[] = []
  const distM: number[] = []
  for (let k = 0; k <= 10; k++) {
    t.push(t0 + k * MIN)
    distM.push(k * 10)
  }
  for (let k = 1; k <= 6; k++) {
    t.push(t0 + (10 + k * 10) * MIN)
    distM.push(100)
  }
  for (let k = 1; k <= 10; k++) {
    t.push(t0 + (70 + k) * MIN)
    distM.push(100 + k * 10)
  }
  return { t, distM, plan: { lengthM: 200, outLengthM: 100 } as TraversePlan }
}

describe('timeAtDistanceMs', () => {
  const r = trip()
  it('interpolates between the samples of the trip', () => {
    expect(timeAtDistanceMs(r, 0)).toBe(0)
    expect(timeAtDistanceMs(r, 30)).toBe(3 * MIN)
    expect(timeAtDistanceMs(r, 4.6)).toBeCloseTo(0.46 * MIN, 6)
    expect(timeAtDistanceMs(r, 193)).toBeCloseTo(79.3 * MIN, 6)
  })

  it('is the first instant at a distance the rover waits at', () => {
    expect(timeAtDistanceMs(r, 100)).toBe(10 * MIN)
  })

  it('is the whole duration for a distance never reached, and 0 without samples', () => {
    expect(timeAtDistanceMs(r, 250)).toBe(80 * MIN)
    expect(timeAtDistanceMs({ t: [], distM: [] }, 10)).toBe(0)
  })
})

describe('poseWindowMs', () => {
  it('holds the rover at the foot of the ramps at both ends of a round trip', () => {
    const w = poseWindowMs(trip(), 4.6, 7)
    expect(w.fromMs).toBeCloseTo(0.46 * MIN, 6)
    // 7 m short of the lander on the way back: 193 m driven.
    expect(w.toMs).toBeCloseTo(79.3 * MIN, 6)
  })

  it('has nothing to hold at the end of a trip that does not come back', () => {
    const r = trip()
    const dead = { t: r.t.slice(0, 14), distM: r.distM.slice(0, 14), plan: r.plan }
    expect(poseWindowMs(dead, 4.6, 7).toMs).toBe(dead.t[13] - t0)
    const oneWay = {
      t: r.t.slice(0, 11),
      distM: r.distM.slice(0, 11),
      plan: { lengthM: 100, outLengthM: 100 } as TraversePlan,
    }
    expect(poseWindowMs(oneWay, 4.6, 7)).toEqual({ fromMs: 0.46 * MIN, toMs: 10 * MIN })
  })

  it('never parks beyond the ice on a route shorter than the parking distance', () => {
    const r = {
      t: [t0, t0 + MIN, t0 + 2 * MIN, t0 + 3 * MIN],
      distM: [0, 3, 3, 6],
      plan: { lengthM: 6, outLengthM: 3 } as TraversePlan,
    }
    const w = poseWindowMs(r, 4.6, 7)
    expect(w.fromMs).toBe(MIN)
    expect(w.toMs).toBe(MIN)
  })
})
