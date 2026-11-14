import { DAY_MS, HOUR_MS } from './constants.ts'
import { type EphemerisSeries, type Site, ephemerisSeries } from './ephemeris.ts'
import type { HorizonMask } from './horizon.ts'
import {
  type DateCandidate,
  type ScenarioMetrics,
  computeMetrics,
  sweepLandingDates,
} from './metrics.ts'
import { type SiteSeries, evaluateSite } from './series.ts'

/** Everything needed to evaluate one site + landing date. Plain data (worker-friendly). */
export interface ScenarioInput {
  site: Site
  mask: HorizonMask
  startMs: number
  missionDays: number
  stepMinutes?: number
  /** Minimum Earth elevation above the terrain horizon for a DTE link (deg). */
  linkMarginDeg?: number
}

export interface ScenarioResult {
  series: SiteSeries
  metrics: ScenarioMetrics
}

/** The ephemeris does not depend on the site, so it is shared across scenarios. */
const ephCache = new Map<string, EphemerisSeries>()

export function cachedEphemeris(startMs: number, stepMs: number, count: number) {
  const key = `${startMs}:${stepMs}:${count}`
  let eph = ephCache.get(key)
  if (!eph) {
    eph = ephemerisSeries(startMs, stepMs, count)
    if (ephCache.size > 16) ephCache.delete(ephCache.keys().next().value as string)
    ephCache.set(key, eph)
  }
  return eph
}

export function computeScenario(input: ScenarioInput): ScenarioResult {
  const stepMs = (input.stepMinutes ?? 10) * 60_000
  const count = Math.ceil((input.missionDays * DAY_MS) / stepMs) + 1
  const series = evaluateSite(
    cachedEphemeris(input.startMs, stepMs, count),
    input.site,
    input.mask,
    input.linkMarginDeg,
  )
  return {
    series,
    metrics: computeMetrics(series, input.startMs, input.startMs + input.missionDays * DAY_MS + 1),
  }
}

export interface SweepInput {
  site: Site
  mask: HorizonMask
  fromMs: number
  days: number
  missionDays: number
  linkMarginDeg?: number
}

/** Candidate landing dates, one per day, each evaluated over the mission duration. */
export function computeDateSweep(input: SweepInput): DateCandidate[] {
  const stepMs = HOUR_MS
  const count = Math.ceil(((input.days + input.missionDays) * DAY_MS) / stepMs) + 1
  const series = evaluateSite(
    cachedEphemeris(input.fromMs, stepMs, count),
    input.site,
    input.mask,
    input.linkMarginDeg,
  )
  return sweepLandingDates(series, input.missionDays, 24)
}
