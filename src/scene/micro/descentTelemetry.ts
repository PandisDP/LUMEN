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
}
