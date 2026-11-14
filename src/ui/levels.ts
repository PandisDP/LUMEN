import type { BatteryResult } from '../astro/energy.ts'
import { SLOPE_CAUTION_DEG, SLOPE_SAFE_DEG } from '../astro/slope.ts'

/** Traffic-light thresholds shared by the metrics panel and the comparison view. */
export type Level = 'good' | 'warn' | 'bad'

export const energyLevel = (pct: number): Level => (pct >= 70 ? 'good' : pct >= 40 ? 'warn' : 'bad')
export const dteLevel = (pct: number): Level => (pct >= 70 ? 'good' : pct >= 30 ? 'warn' : 'bad')
/** A night longer than ~5 days is beyond what small landers survive on batteries. */
export const nightLevel = (hours: number): Level =>
  hours > 120 ? 'bad' : hours > 48 ? 'warn' : 'good'
export const scoreLevel = (score: number): Level =>
  score >= 60 ? 'good' : score >= 35 ? 'warn' : 'bad'
/** Lander slope tolerance (see astro/slope.ts): <10° nominal, 10–15° marginal, >15° unsafe. */
export const slopeLevel = (deg: number): Level =>
  deg < SLOPE_SAFE_DEG ? 'good' : deg < SLOPE_CAUTION_DEG ? 'warn' : 'bad'
/** Ice-access (science) score. */
export const scienceLevel = (score: number): Level =>
  score >= 60 ? 'good' : score >= 20 ? 'warn' : 'bad'
/** Continuous hours of unheated equipment below the freeze limit (PSR: always critical). */
export const thermalLevel = (longestFreezeH: number, psr = false): Level =>
  psr || longestFreezeH > 120 ? 'bad' : longestFreezeH > 24 ? 'warn' : 'good'
/** Out of power at any point is critical; a deep discharge (< 40 %) is a warning. */
export const batteryLevel = (b: BatteryResult): Level =>
  b.depletedAtMs != null ? 'bad' : b.minSocPct < 40 ? 'warn' : 'good'
