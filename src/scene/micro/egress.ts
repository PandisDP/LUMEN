import type { RoverId } from '../../astro/traverse.ts'

/**
 * Geometry of the rover's way off the lander (decorative: it takes no mission time). The rover
 * rides a pallet on the side of the lander that faces its route and rolls down two ramps.
 * Distances are measured from the lander's axis along the first heading of the route, heights
 * above the ground at the lander.
 */
export const EGRESS = {
  /** Pallet (and upper ramp hinge): distance from the axis and height, m. */
  palletR: 1.55,
  palletH: 0.8,
  /** Where the ramps meet the ground, m from the axis. */
  groundR: 4.6,
  /** Real seconds of the whole sequence, and the share spent lowering the ramps first. */
  durationS: 7,
  deployShare: 0.22,
  /** Ramp angle when stowed (folded up against the lander), rad above the horizontal. */
  stowedRad: 1.35,
} as const

/** Half the distance between wheel lines and the ramp channel width, m, per vehicle. */
export const RAMP_TRACK: Record<RoverId, { half: number; width: number }> = {
  rover: { half: 0.24, width: 0.16 },
  'csa-rover': { half: 0.52, width: 0.26 },
}

const smooth = (t: number) => t * t * (3 - 2 * t)
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** Angle of the ramps (rad above the horizontal; negative = sloping down to the ground). */
export function rampAngle(progress: number): number {
  const down = -Math.atan2(EGRESS.palletH, EGRESS.groundR - EGRESS.palletR)
  const k = smooth(clamp01(progress / EGRESS.deployShare))
  return EGRESS.stowedRad + (down - EGRESS.stowedRad) * k
}

/**
 * Rover on the ramps at `progress` (0..1): distance from the lander's axis, height above the
 * ground and pitch (rad, negative = nose down). It waits on the pallet while the ramps lower,
 * rolls down them and levels out on the ground at `groundR`.
 */
export function egressPose(progress: number): { r: number; h: number; pitch: number } {
  const p = clamp01((progress - EGRESS.deployShare) / (1 - EGRESS.deployShare))
  const s = smooth(p)
  const r = EGRESS.palletR + (EGRESS.groundR - EGRESS.palletR) * s
  const h = EGRESS.palletH * (1 - s)
  const slope = -Math.atan2(EGRESS.palletH, EGRESS.groundR - EGRESS.palletR)
  // Nose down while on the ramp, level on the pallet and on the ground.
  const onRamp = Math.sin(Math.PI * p)
  return { r, h, pitch: slope * Math.min(1, onRamp * 1.6) }
}
