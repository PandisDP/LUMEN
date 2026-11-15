import type { TraverseLeg, TraversePhase } from '../../astro/traverse.ts'

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
  /** Odometer of the model, m (it keeps growing on the way back), and the whole round trip. */
  distM: NaN,
  lengthM: NaN,
  /** One way, lander → ice, m. */
  outLengthM: NaN,
  /** Odometer of where the rover is DRAWN (held at the ramps at both ends of the trip), m. */
  poseDistM: NaN,
  /** Phase and leg of the trip, and the sampling work: sample in progress (1-based; 0 = none). */
  phase: 'out' as TraversePhase,
  leg: 'out' as TraverseLeg,
  sampleIndex: 0,
  samplesDone: 0,
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
  /** Wheels turning (not while sampling, recharging or parked). */
  driving: false,
  /** Mission time at the rover, ms UTC. */
  timeMs: NaN,
  /** The playback is at its end: back at the lander, or stopped for good on the way. */
  done: false,
  /** Egress down the lander's ramps: 0 = stowed on the lander, 1 = on the ground, driving. */
  egress: 1,
}
