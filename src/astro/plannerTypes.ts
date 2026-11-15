import type { RoverId } from './traverse.ts'
import type { Constraint, HardwareLimits } from './hardware.ts'

/**
 * Contract of the mission planner (the surface part of docs/MISION.md): given a point with ice
 * and a range of landing dates, find for every day the best landing point around it for the
 * rover to complete the mission, subject to every constraint, and rank the days.
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
  /** The rover must reach the ice with at least this battery, % (lowest along the traverse). */
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
  | 'rover-battery' // it makes it, but below minRoverSocPct

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
  /** Drivable route to the ice, m, and its steepest slope, deg. */
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
  rover: {
    reaches: boolean
    minSocPct: number
    /** Driving plus waiting, h. */
    travelH: number
    hoursInShadow: number
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
