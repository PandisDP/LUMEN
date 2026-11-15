import { DAY_MS } from '../astro/constants.ts'
import type {
  PlanDay,
  PlanPick,
  PlanProblem,
  PlanResult,
  PlanViolation,
} from '../astro/plannerTypes.ts'

/** Synthetic plan results for the planner tests (the engine is not needed to draw the screen). */
export const FIXTURE_FROM = Date.UTC(2026, 10, 25)

export const fixtureProblem = (over: Partial<PlanProblem> = {}): PlanProblem => ({
  target: { lat: -89.44033, lon: -137.38793 },
  tileSiteId: 'shackleton-rim',
  fromMs: FIXTURE_FROM,
  days: 10,
  missionDays: 14,
  minSunDays: 15,
  roverId: 'rover',
  samples: 3,
  sampleH: 2,
  minRoverSocPct: 20,
  radiusM: 2000,
  hardware: { maxSlopeDeg: 15, maxNightH: 120, minDtePct: 30, roverMaxSlopeDeg: 20 },
  linkMarginDeg: 3,
  requireDsn: false,
  scienceWeight: 0,
  ...over,
})

export const fixturePick = (score: number, over: Partial<PlanPick> = {}): PlanPick => ({
  candidateId: 0,
  lat: -89.45 + score / 10_000,
  lon: -137.2,
  heightM: 1950,
  slopeDeg: 4,
  routeM: 2000 - score * 10,
  score,
  engineeringScore: score,
  scienceScore: 50,
  energyPct: score,
  sunlitPct: score,
  dtePct: 100 - score,
  longestDarkH: 100 - score,
  sunFromLandingH: 300 + score,
  verdict: 'good',
  tight: [],
  rover: {
    reaches: true,
    samplesDone: 3,
    returns: true,
    minSocPct: 20 + score / 2,
    endSocPct: 25 + score / 2,
    travelH: 5,
    totalH: 16,
    marginH: 320,
    hoursInShadow: 1,
    dtePct: 60,
  },
  ...over,
})

/**
 * One day per entry, from FIXTURE_FROM: a number is the score of the day's best point, a
 * violation means no solution for that reason.
 */
export function fixtureResult(
  spec: readonly (number | PlanViolation)[],
  over: Partial<PlanProblem> = {},
  totalDays = spec.length,
): PlanResult {
  const days: PlanDay[] = spec.map((x, i) =>
    typeof x === 'number'
      ? {
          dayMs: FIXTURE_FROM + i * DAY_MS,
          best: fixturePick(
            x,
            x < 50 ? { verdict: 'warn', tight: ['night', 'dte'], candidateId: i } : {},
          ),
          rejected: { slope: 2 },
          mainViolation: null,
        }
      : {
          dayMs: FIXTURE_FROM + i * DAY_MS,
          best: null,
          rejected: { [x]: 10 + i, slope: 3 },
          mainViolation: x,
        },
  )
  const top = days
    .map((d, i) => ({ d, i }))
    .filter((x) => x.d.best)
    .sort((a, b) => b.d.best!.score - a.d.best!.score)
    .slice(0, 5)
    .map((x) => x.i)
  return {
    problem: fixtureProblem({ days: totalDays, ...over }),
    ice: { lat: -89.445, lon: -137.3 },
    candidates: [
      {
        id: 0,
        lat: -89.45,
        lon: -137.2,
        heightM: 1950,
        slopeDeg: 4,
        distToTargetM: 800,
        routeM: 900,
        routeMaxSlopeDeg: 12,
      },
    ],
    days,
    top,
    complete: totalDays === spec.length,
  }
}
