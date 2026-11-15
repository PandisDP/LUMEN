/**
 * Lander presets for the powered-descent simulation (`src/astro/descentPhysics.ts`).
 *
 * Illustrative values: orders of magnitude of each vehicle class, tuned so the simulated final
 * approach closes with margin. They are NOT the specifications of any real vehicle.
 */
export interface LanderVehicle {
  id: string
  /** Mass without descent propellant (structure + payload), kg. */
  dryKg: number
  /**
   * Usable descent propellant at powered-descent initiation (de-orbit), kg. The braking burn,
   * which the simulation does not integrate, is charged to it with the rocket equation.
   */
  propKg: number
  /** Maximum thrust of the descent engine(s), N. */
  thrustN: number
  /** Vacuum specific impulse, s. */
  ispS: number
  /** Maximum tilt from the vertical during the terminal descent, deg. */
  maxTiltDeg: number
  /** Lowest throttle setting of a running engine, as a fraction of `thrustN` (0..1). */
  minThrottle: number
}

export const LANDERS: readonly LanderVehicle[] = [
  // CLPS-class commercial lander (Nova-C / Peregrine order of magnitude).
  {
    id: 'clps',
    dryKg: 700,
    propKg: 1200,
    thrustN: 4000,
    ispS: 320,
    maxTiltDeg: 20,
    minThrottle: 0.2,
  },
  // Small precision lander (SLIM-like wet mass, with a more generous thrust-to-weight).
  {
    id: 'small',
    dryKg: 200,
    propKg: 520,
    thrustN: 2000,
    ispS: 320,
    maxTiltDeg: 25,
    minThrottle: 0.2,
  },
  // Heavy cargo / crew-class lander (Apollo LM descent stage order of magnitude).
  {
    id: 'heavy',
    dryKg: 6000,
    propKg: 8500,
    thrustN: 45_000,
    ispS: 311,
    maxTiltDeg: 15,
    minThrottle: 0.1,
  },
]

export const DEFAULT_LANDER_ID = 'clps'

/** Preset by id; unknown ids fall back to the default lander. */
export function landerPreset(id: string): LanderVehicle {
  return (
    LANDERS.find((l) => l.id === id) ??
    LANDERS.find((l) => l.id === DEFAULT_LANDER_ID) ??
    LANDERS[0]
  )
}
