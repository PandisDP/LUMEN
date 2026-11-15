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
  /** Count the link only while a DSN complex sees the Moon. */
  requireDsn?: boolean
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

/**
 * Sampling step for a mission of `missionDays`: 10 min up to two months, then coarser, so a
 * year-long window costs about the same (~8 700 samples) as a 60-day one. The Sun and the Earth
 * move < 0.6° per hour seen from the Moon, so events are still timed to a few minutes after the
 * interpolation of windows.ts.
 */
export const scenarioStepMinutes = (missionDays: number) =>
  missionDays <= 60 ? 10 : missionDays <= 180 ? 30 : 60

export function computeScenario(input: ScenarioInput): ScenarioResult {
  const stepMs = (input.stepMinutes ?? scenarioStepMinutes(input.missionDays)) * 60_000
  const count = Math.ceil((input.missionDays * DAY_MS) / stepMs) + 1
  const series = evaluateSite(
    cachedEphemeris(input.startMs, stepMs, count),
    input.site,
    input.mask,
    input.linkMarginDeg,
    input.requireDsn,
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
  /** Count the link only while a DSN complex sees the Moon. */
  requireDsn?: boolean
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
    input.requireDsn,
  )
  return sweepLandingDates(series, input.missionDays, 24)
}
