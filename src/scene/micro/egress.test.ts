import { describe, expect, it } from 'vitest'
import { EGRESS, egressPose, rampAngle } from './egress.ts'

describe('rover egress', () => {
  it('lowers the ramps first, from stowed to the slope down to the ground', () => {
    expect(rampAngle(0)).toBeCloseTo(EGRESS.stowedRad, 9)
    const down = rampAngle(EGRESS.deployShare)
    expect(down).toBeLessThan(0)
    expect(Math.tan(-down)).toBeCloseTo(EGRESS.palletH / (EGRESS.groundR - EGRESS.palletR), 9)
    expect(rampAngle(1)).toBeCloseTo(down, 9)
    for (let p = 0; p < EGRESS.deployShare; p += 0.02)
      expect(rampAngle(p + 0.02)).toBeLessThanOrEqual(rampAngle(p) + 1e-12)
  })

  it('keeps the rover on the pallet until the ramps are down, then rolls it to the ground', () => {
    for (const p of [0, EGRESS.deployShare / 2, EGRESS.deployShare]) {
      const pose = egressPose(p)
      expect(pose.r).toBeCloseTo(EGRESS.palletR, 9)
      expect(pose.h).toBeCloseTo(EGRESS.palletH, 9)
      expect(pose.pitch).toBeCloseTo(0, 9)
    }
    const end = egressPose(1)
    expect(end.r).toBeCloseTo(EGRESS.groundR, 9)
    expect(end.h).toBeCloseTo(0, 9)
    expect(end.pitch).toBeCloseTo(0, 6)
    let last = egressPose(EGRESS.deployShare)
    for (let p = EGRESS.deployShare + 0.05; p <= 1; p += 0.05) {
      const pose = egressPose(p)
      expect(pose.r).toBeGreaterThanOrEqual(last.r)
      expect(pose.h).toBeLessThanOrEqual(last.h)
      expect(pose.pitch).toBeLessThanOrEqual(0)
      last = pose
    }
    // Nose down in the middle of the ramp.
    expect(egressPose((1 + EGRESS.deployShare) / 2).pitch).toBeLessThan(-0.1)
  })
})
