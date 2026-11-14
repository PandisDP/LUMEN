import { MOON_RADIUS_M, OBSERVER_HEIGHT_M, RAD } from './constants.ts'
import { wrap360 } from './frames.ts'

/**
 * Local horizon: for each azimuth, the elevation angle (deg) of the highest terrain seen
 * from the observer. Without an atmosphere there is no refraction, so this mask is the
 * whole story: a body is visible when it rises above it.
 */
export interface HorizonMask {
  /** Azimuth bin width, degrees. Bin k is centred on k * azStepDeg. */
  azStepDeg: number
  elevDeg: ArrayLike<number>
}

/** Dip of the ideal spherical horizon for an observer `heightM` above a smooth Moon. */
export function sphericalHorizonDip(heightM = OBSERVER_HEIGHT_M): number {
  return -Math.acos(MOON_RADIUS_M / (MOON_RADIUS_M + heightM)) * RAD
}

/** Mask of a perfectly smooth Moon (used when no topography is available). */
export function sphericalMask(heightM = OBSERVER_HEIGHT_M, azStepDeg = 1): HorizonMask {
  const bins = Math.round(360 / azStepDeg)
  return { azStepDeg, elevDeg: new Array<number>(bins).fill(sphericalHorizonDip(heightM)) }
}

/** Horizon elevation at an azimuth, linearly interpolated with wrap-around. */
export function maskAt(mask: HorizonMask, azDeg: number): number {
  const n = mask.elevDeg.length
  const f = wrap360(azDeg) / mask.azStepDeg
  const i0 = Math.floor(f) % n
  const i1 = (i0 + 1) % n
  const t = f - Math.floor(f)
  return mask.elevDeg[i0] * (1 - t) + mask.elevDeg[i1] * t
}

/**
 * Fraction (0..1) of a disc of angular radius `radiusDeg`, centred at `centerElDeg`,
 * that lies above a locally straight horizon at `horizonElDeg`.
 * This is what matters for solar power: at the pole the Sun often grazes the ridges.
 */
export function discVisibleFraction(
  centerElDeg: number,
  horizonElDeg: number,
  radiusDeg: number,
): number {
  const d = (centerElDeg - horizonElDeg) / radiusDeg
  if (d >= 1) return 1
  if (d <= -1) return 0
  return 1 - (Math.acos(d) - d * Math.sqrt(1 - d * d)) / Math.PI
}

/** Horizon mask statistics used in the UI. */
export function maskStats(mask: HorizonMask): { min: number; max: number; maxAz: number } {
  let min = Infinity
  let max = -Infinity
  let maxAz = 0
  for (let i = 0; i < mask.elevDeg.length; i++) {
    const v = mask.elevDeg[i]
    if (v < min) min = v
    if (v > max) {
      max = v
      maxAz = i * mask.azStepDeg
    }
  }
  return { min, max, maxAz }
}
