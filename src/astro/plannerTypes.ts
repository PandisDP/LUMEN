import { type RoverId, SAMPLING_DEFAULTS } from './traverse.ts'
import type { Constraint, HardwareLimits } from './hardware.ts'

/**
 * Contract of the mission planner (the surface part of docs/MISSION.md): given a point with ice
 * and a range of landing dates, find for every day the best landing point around it for the
 * rover to complete the mission, subject to every constraint, and rank the days.
 * The rover's mission: drive to the ice, take every sample, and be back at the lander before
 * the surface mission ends, never below the minimum battery. All of it is required.
 * Plain data throughout (worker-friendly).
 */
export interface PlanProblem {
  /** The ice the mission is after (a point on permanently shadowed ground, or next to it). */
  target: { lat: number; lon: number }
  /** Curated site whose 20 m LOLA tile and illumination map cover the target. */
  tileSiteId: string
  /** First candidate landing date (00:00 UTC) and number of consecutive days, 1..PLAN_MAX_DAYS. */
  fromMs: number
  days: number
  /** Surface mission length, days. */
  missionDays: number
  /** Continuous sunlight required from touchdown, days (constraint g1). */
  minSunDays: number
  roverId: RoverId
  /** Samples the rover must take at the ice (integer, SAMPLING_LIMITS.samples). */
  samples: number
  /** Hours of work per sample: drilling plus analysis (SAMPLING_LIMITS.sampleH). */
  sampleH: number
  /**
   * The rover must never drop below this battery, %: the lowest over the whole trip (out,
   * sampling and back).
   */
  minRoverSocPct: number
  /** Landing points are searched within this distance of the target, m. */
  radiusM: number
  hardware: HardwareLimits
  linkMarginDeg: number
  requireDsn: boolean
  /** 0 = engineering score only … 1 = science (ice access) only. */
  scienceWeight: number
}

export const PLAN_MAX_DAYS = 90
export const PLAN_RADII_M = [1000, 2000, 3000] as const
export const PLAN_DEFAULTS = {
  days: 30,
  minSunDays: 15,
  minRoverSocPct: 20,
  radiusM: 2000,
  /** Same defaults as the rover store (both read SAMPLING_DEFAULTS). */
  samples: SAMPLING_DEFAULTS.samples,
  sampleH: SAMPLING_DEFAULTS.sampleH,
} as const
/** How many days make the shortlist. */
export const PLAN_TOP = 5

/** Why a landing point is rejected on a given day (or altogether). */
export type PlanViolation =
  | 'no-route' // no drivable route from the point to the ice
  | 'no-sun-at-landing' // touchdown in the dark
  | 'short-light' // fewer than minSunDays of continuous sunlight from touchdown
  | 'night' // longest night over the hardware limit
  | 'dte' // direct-to-Earth link under the hardware minimum
  | 'slope' // landing slope (p90 in the ellipse) over the hardware limit
  | 'rover-unreachable' // the rover does not make it to the ice
  | 'rover-samples' // it reaches the ice but cannot finish the sampling
  | 'rover-no-return' // it samples, but the battery fails on the way back
  | 'rover-late' // it comes back after the end of the surface mission
  | 'rover-battery' // it completes the round trip in time, but dips below minRoverSocPct

/** A safe landing point near the target; its horizon and route do not depend on the date. */
export interface PlanCandidate {
  id: number
  lat: number
  lon: number
  heightM: number
  /** Terrain slope at the point, deg. */
  slopeDeg: number
  /** Straight distance to the target, m. */
  distToTargetM: number
  /** Drivable ONE-WAY route to the ice, m, and its steepest slope, deg. */
  routeM: number
  routeMaxSlopeDeg: number
}

/** The landing point chosen for a day, with what the mission gets there. */
export interface PlanPick {
  candidateId: number
  lat: number
  lon: number
  heightM: number
  slopeDeg: number
  /** ONE-WAY drivable route from the landing point to the ice, m (the round trip is twice it). */
  routeM: number
  /** Ranking score (engineering blended with science by scienceWeight), 0..100. */
  score: number
  engineeringScore: number
  scienceScore: number
  energyPct: number
  sunlitPct: number
  dtePct: number
  longestDarkH: number
  /** Continuous sunlight from touchdown, h. */
  sunFromLandingH: number
  /** Against the hardware limits: never 'bad' (those are rejected). */
  verdict: 'good' | 'warn'
  /** Limits within 20 % of failing. */
  tight: Constraint[]
  /**
   * The rover's round trip from this point on this day. On a pick it is always a success: it
   * reaches the ice, takes every sample and is back in time.
   */
  rover: {
    /** It arrives at the ice. */
    reaches: boolean
    /** Samples completed (equal to the problem's `samples` on a pick). */
    samplesDone: number
    /** It is back at the lander. */
    returns: boolean
    /** Lowest battery over the whole trip, %. */
    minSocPct: number
    /** Battery on arriving back at the lander, %. */
    endSocPct: number
    /** OUTBOUND only: driving plus recharge stops from the lander to the ice, h. */
    travelH: number
    /** Whole trip, h: touchdown (departure) to back at the lander, sampling included. */
    totalH: number
    /** Time to spare at the lander before the end of the surface mission, h (≥ 0 on a pick). */
    marginH: number | null
    /** Time without direct sunlight over the whole trip, h. */
    hoursInShadow: number
    /** Share of the whole trip with a usable link to Earth, %. */
    dtePct: number
  }
}

export interface PlanDay {
  /** Landing date, 00:00 UTC, ms. */
  dayMs: number
  /** Best landing point of the day, or null when no candidate meets every constraint. */
  best: PlanPick | null
  /** Candidates rejected on this day, by the first constraint each one failed. */
  rejected: Partial<Record<PlanViolation, number>>
  /** With no solution: the constraint that rejected most candidates. */
  mainViolation: PlanViolation | null
}

export interface PlanResult {
  problem: PlanProblem
  /** The permanently shadowed cell the routes go to (nearest to the target). */
  ice: { lat: number; lon: number }
  candidates: PlanCandidate[]
  /** One entry per day of the range, in date order (grows while the plan is running). */
  days: PlanDay[]
  /** Indices into `days` of the best days, best first, at most PLAN_TOP. */
  top: number[]
  /** False while days are still being evaluated. */
  complete: boolean
}

export type PlanStatus = 'idle' | 'running' | 'done' | 'cancelled' | 'error'
