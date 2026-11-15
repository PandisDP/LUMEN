import type { DescentPhase } from '../../astro/descent.ts'

/**
 * Per-frame descent readings. Written by DescentControls / DescentReticle inside useFrame and
 * polled by the DOM HUD at 10 Hz, so nothing here goes through React state.
 */
export const descentTelemetry = {
  phase: 'braking' as DescentPhase,
  /** Height above the ground right below the camera, m. */
  altAglM: NaN,
  /** Horizontal distance to the target, m. */
  distM: NaN,
  /** Vertical speed, m/s of animation (negative = descending). */
  vSpeed: 0,
  /** Slope where the boresight meets the ground, deg (NaN: no hit / no DEM). */
  reticleSlopeDeg: NaN,
  /** Distance from the camera to that point, m. */
  reticleRangeM: NaN,
  /** Angle between the boresight and the Sun, deg. */
  sunOffAxisDeg: NaN,
  /** The Sun's disc is inside the camera frame and not hidden by the horizon. */
  sunInFov: false,
  // Physical model only (NaN in the kinematic fly-down).
  /** Horizontal speed, m/s. */
  hSpeed: NaN,
  /** Propellant on board, kg, and as a fraction of what the approach started with. */
  propKg: NaN,
  propFrac: NaN,
  /** Δv spent so far in the simulated approach, m/s. */
  dvMs: NaN,
  /** Thrust as a fraction of the maximum, 0..1. */
  throttle: NaN,
  /** Tilt of the thrust axis from the vertical, deg. */
  tiltDeg: NaN,
}
