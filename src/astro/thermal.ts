import { DEG, HOUR_MS } from './constants.ts'
import type { SiteSeries } from './series.ts'

/**
 * First-order radiative temperature estimate, to make the lunar extremes tangible. Each surface
 * is in instantaneous radiative equilibrium while lit, εσT⁴ = (1 − A)·S·f·cos i, and cools
 * exponentially towards a night floor in shadow. No conduction, no regolith thermal inertia
 * beyond that time constant, no internal heaters: an order of magnitude, not a thermal model.
 */
export const SOLAR_CONSTANT_W_M2 = 1361
export const REGOLITH_ALBEDO = 0.12
export const EMISSIVITY = 0.95
const SIGMA = 5.670374419e-8

/** Typical lunar night surface temperature (Diviner, mid latitudes). */
export const T_NIGHT_K = 95
/** Floor of permanently shadowed craters (Diviner measured 25–40 K in the coldest ones). */
export const T_PSR_K = 40
/** Default "critical freeze" limit for unheated equipment (−100 °C). */
export const FREEZE_K = 173
/** Shadow cooling time constant (h). */
export const COOLING_TAU_H = 4

export const kelvinToC = (k: number) => k - 273.15

/** Equilibrium temperature of a surface absorbing `fluxWm2` (W/m²), floored at `floorK`. */
export function equilibriumK(fluxWm2: number, floorK = T_NIGHT_K): number {
  const t = Math.pow(Math.max(0, fluxWm2) / (EMISSIVITY * SIGMA), 0.25)
  return Math.max(t, floorK)
}

export interface SurfaceTemps {
  /** Flat regolith: the Sun arrives at grazing incidence (cos i = sin el). */
  regolithK: number
  /** Vertical face pointed at the Sun (lander side, radiator, panel): cos i = cos el. */
  faceK: number
}

/** Lit equilibrium temperatures for a Sun at elevation `elDeg` with `frac` of its disc visible. */
export function litTemps(elDeg: number, frac: number, floorK = T_NIGHT_K): SurfaceTemps {
  const s = (1 - REGOLITH_ALBEDO) * SOLAR_CONSTANT_W_M2 * Math.max(0, Math.min(1, frac))
  const el = elDeg * DEG
  return {
    regolithK: equilibriumK(s * Math.max(0, Math.sin(el)), floorK),
    faceK: equilibriumK(s * Math.max(0, Math.cos(el)), floorK),
  }
}

export interface ThermalSeries {
  regolithK: Float32Array
  faceK: Float32Array
  /** No sunlight at all in the window: treated as a permanently shadowed spot. */
  psr: boolean
  minK: number
  maxK: number
  /** Hours the Sun-facing equipment spends below `freezeK`. */
  hoursBelowFreeze: number
  /** Longest continuous stretch below `freezeK` (h). */
  longestFreezeH: number
}

/** Temperatures along a site series: equilibrium while lit, exponential cooling in shadow. */
export function thermalSeries(
  s: SiteSeries,
  { freezeK = FREEZE_K, tauH = COOLING_TAU_H } = {},
): ThermalSeries {
  let psr = true
  for (let i = 0; i < s.count; i++) {
    if (s.sunFrac[i] > 0) {
      psr = false
      break
    }
  }
  const floor = psr ? T_PSR_K : T_NIGHT_K
  const regolithK = new Float32Array(s.count)
  const faceK = new Float32Array(s.count)
  const decay = Math.exp(-s.stepMs / (tauH * HOUR_MS))
  let reg = floor
  let face = floor
  let minK = Infinity
  let maxK = -Infinity
  let below = 0
  let run = 0
  let longest = 0
  for (let i = 0; i < s.count; i++) {
    if (s.sunFrac[i] > 0) {
      const lit = litTemps(s.sunEl[i], s.sunFrac[i], floor)
      // Heating is fast compared with cooling: take the larger of equilibrium and decay.
      reg = Math.max(lit.regolithK, floor + (reg - floor) * decay)
      face = Math.max(lit.faceK, floor + (face - floor) * decay)
    } else {
      reg = floor + (reg - floor) * decay
      face = floor + (face - floor) * decay
    }
    regolithK[i] = reg
    faceK[i] = face
    minK = Math.min(minK, reg, face)
    maxK = Math.max(maxK, reg, face)
    if (face < freezeK) {
      below++
      run++
      longest = Math.max(longest, run)
    } else run = 0
  }
  const h = s.stepMs / HOUR_MS
  return {
    regolithK,
    faceK,
    psr,
    minK: s.count ? minK : NaN,
    maxK: s.count ? maxK : NaN,
    hoursBelowFreeze: below * h,
    longestFreezeH: longest * h,
  }
}

/**
 * Earth's atmospheric refraction (Bennett 1982, standard conditions), deg: ~0.57° at the
 * horizon. Used only for the Earth-vs-Moon comparison: the Moon has none, so its polar Sun
 * vanishes behind a ridge without any twilight.
 */
export function earthRefractionDeg(elDeg: number): number {
  const e = Math.max(elDeg, -1)
  return 1 / Math.tan((e + 7.31 / (e + 4.4)) * DEG) / 60
}
