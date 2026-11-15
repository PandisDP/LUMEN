/**
 * Per-frame rover readings. Written by RoverRig inside useFrame and polled by the DOM HUD (and
 * the Sun light, which follows the rover) so nothing here goes through React state.
 */
export const roverTelemetry = {
  /** A traverse is being shown. */
  active: false,
  /** Scene position of the rover, m. */
  x: 0,
  y: 0,
  z: 0,
  distM: NaN,
  lengthM: NaN,
  speedMs: 0,
  slopeDeg: NaN,
  gradeDeg: NaN,
  headingDeg: NaN,
  socPct: NaN,
  solarW: NaN,
  loadW: NaN,
  /** Visible fraction of the Sun / the Earth (link) at the rover, 0..1. */
  sunFrac: NaN,
  earthFrac: NaN,
  tempK: NaN,
  inPsr: false,
  driving: false,
  /** Mission time at the rover, ms UTC. */
  timeMs: NaN,
  /** Finished: at the ice (or stopped for good). */
  done: false,
}
