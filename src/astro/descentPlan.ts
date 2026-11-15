import type { LanderVehicle } from '../config/landers.ts'
import {
  type DescentResult,
  START_ALT_M,
  START_RANGE_M,
  powerDescentStart,
  retarget,
  simulateDescent,
} from './descentPhysics.ts'
import type { Vec3 } from './frames.ts'

/** Start heights tried in turn when relief under the approach track blocks the lower ones, m. */
export const START_ALTITUDES_M = [START_ALT_M, 5_000, 7_000] as const
/** The start stays inside the terrain tile: this share of its half-size at most. */
export const START_MAX_TILE_FRACTION = 0.75

/** A safer touchdown point near the target and what flying there instead would cost. */
export interface HazardAdvice {
  /** Scene position of the suggested point. */
  x: number
  z: number
  divertM: number
  /** Extra Δv of the diverted descent, m/s (NaN when that descent does not close). */
  extraDvMs: number
}

export interface DescentPlan {
  result: DescentResult
  /** Start height actually used, m above the target. */
  startAltM: number
  /** Set when the target itself is not safe ground; `null` = safe, or nothing safe in reach. */
  hazard: HazardAdvice | null
  /** The target is unsafe and no safe ground is within reach of the divert. */
  noSafeGround: boolean
}

/**
 * The powered descent to the scene origin for the landing view: the lowest of
 * `START_ALTITUDES_M` whose approach clears the terrain, flown straight to the target, plus the
 * advice of the hazard-avoidance logic (where it would divert and at what Δv). The divert is
 * reported rather than flown so the view always ends at the site being evaluated; the user can
 * accept it by moving the site there.
 */
export function planDescent(
  vehicle: LanderVehicle,
  env: { ground: (x: number, z: number) => number; slopeAt?: (x: number, z: number) => number },
  approachAzDeg: number,
  tileHalfSizeM: number,
): DescentPlan {
  const target: Vec3 = [0, env.ground(0, 0), 0]
  const rangeM = Math.min(START_RANGE_M, tileHalfSizeM * START_MAX_TILE_FRACTION)
  const fly = (altM: number, slopeAt?: (x: number, z: number) => number) =>
    simulateDescent(vehicle, powerDescentStart(target, approachAzDeg, { rangeM, altM }), target, {
      ground: env.ground,
      slopeAt,
    })

  let startAltM: number = START_ALTITUDES_M[0]
  let result = fly(startAltM)
  for (const altM of START_ALTITUDES_M.slice(1)) {
    if (result.summary.ok || result.summary.reason !== 'terrain') break
    startAltM = altM
    result = fly(altM)
  }

  let hazard: HazardAdvice | null = null
  let noSafeGround = false
  if (env.slopeAt) {
    const to = retarget(target, env.slopeAt)
    if (!to) noSafeGround = true
    else if (to.divertM > 0) {
      const diverted = fly(startAltM, env.slopeAt).summary
      hazard = {
        x: to.x,
        z: to.z,
        divertM: to.divertM,
        extraDvMs: diverted.ok ? diverted.dvMs - result.summary.dvMs : NaN,
      }
    }
  }
  return { result, startAltM, hazard, noSafeGround }
}
