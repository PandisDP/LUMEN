import { HOUR_MS } from './constants.ts'
import { type SiteSeries, indexRange } from './series.ts'
import { complement, durationMs, findWindows, longest, type Interval } from './windows.ts'

/** A body counts as "up" when at least half of its disc clears the local horizon. */
export const VISIBLE_THRESHOLD = 0.5

export interface ScenarioMetrics {
  fromMs: number
  toMs: number
  /** % of time with the Sun (disc centre) above the local horizon. */
  sunlitPct: number
  /**
   * Mean visible fraction of the solar disc (%). Proxy for the energy a vertical,
   * Sun-tracking panel collects relative to permanent full sunlight (cos(el) ~ 1 at the pole).
   */
  energyPct: number
  /** Mean Sun elevation while lit, degrees. */
  meanSunElLit: number
  maxSunEl: number
  /** % of time with direct-to-Earth line of sight. */
  dtePct: number
  /** % of time with Sun AND Earth visible (power and comms at once). */
  bothPct: number
  longestDarkH: number
  longestLightH: number
  longestNoDteH: number
  sunWindows: Interval[]
  dteWindows: Interval[]
  /** 0..100 synthetic viability score (see scoreOf). */
  score: number
}

/**
 * Synthetic viability score, documented in the UI:
 * 50 % energy + 35 % Earth link + 15 % survival (penalises nights longer than 5 days).
 */
export function scoreOf(energyPct: number, dtePct: number, longestDarkH: number): number {
  const survival = 1 - Math.min(longestDarkH / 120, 1)
  return Math.round(0.5 * energyPct + 0.35 * dtePct + 15 * survival)
}

const hours = (w: Interval | null) => (w ? durationMs(w) / HOUR_MS : 0)

export function computeMetrics(s: SiteSeries, fromMs: number, toMs: number): ScenarioMetrics {
  const [i0, i1] = indexRange(s, fromMs, toMs)
  const n = Math.max(1, i1 - i0)
  let lit = 0
  let energy = 0
  let elLitSum = 0
  let maxSunEl = -90
  let dte = 0
  let both = 0
  for (let i = i0; i < i1; i++) {
    const sunUp = s.sunFrac[i] >= VISIBLE_THRESHOLD
    const earthUp = s.earthFrac[i] >= VISIBLE_THRESHOLD
    energy += s.sunFrac[i]
    if (sunUp) {
      lit++
      elLitSum += s.sunEl[i]
    }
    if (earthUp) dte++
    if (sunUp && earthUp) both++
    if (s.sunEl[i] > maxSunEl) maxSunEl = s.sunEl[i]
  }
  const sunWindows = findWindows(
    { startMs: s.startMs, stepMs: s.stepMs, values: s.sunFrac },
    VISIBLE_THRESHOLD,
    i0,
    i1,
  )
  const dteWindows = findWindows(
    { startMs: s.startMs, stepMs: s.stepMs, values: s.earthFrac },
    VISIBLE_THRESHOLD,
    i0,
    i1,
  )
  const end = s.startMs + (i1 - 1) * s.stepMs
  const start = s.startMs + i0 * s.stepMs
  const longestDarkH = hours(longest(complement(sunWindows, start, end)))
  const longestNoDteH = hours(longest(complement(dteWindows, start, end)))
  const energyPct = (100 * energy) / n
  const dtePct = (100 * dte) / n
  return {
    fromMs,
    toMs,
    sunlitPct: (100 * lit) / n,
    energyPct,
    meanSunElLit: lit ? elLitSum / lit : NaN,
    maxSunEl,
    dtePct,
    bothPct: (100 * both) / n,
    longestDarkH,
    longestLightH: hours(longest(sunWindows)),
    longestNoDteH,
    sunWindows,
    dteWindows,
    score: scoreOf(energyPct, dtePct, longestDarkH),
  }
}

export interface DateCandidate {
  startMs: number
  energyPct: number
  dtePct: number
  longestDarkH: number
  /** Sun and Earth visible at touchdown (needed for a safe landing & first contact). */
  sunAtLanding: boolean
  earthAtLanding: boolean
  score: number
  /** Highest Sun elevation inside the window, degrees (shows the ±1.54° seasonal swing). */
  maxSunEl: number
  /** Mean Sun elevation while lit, degrees (NaN when the window is never lit). */
  meanSunElLit: number
  /**
   * Continuous sunlight from touchdown, h: time to the first dark sample after it (0 when
   * touchdown is in the dark). It looks past the mission window and is capped at the end of the
   * series, so a long requirement needs a series that long.
   */
  sunFromLandingH: number
}

/**
 * Slides a mission window of `missionDays` across a long series, one candidate landing date
 * every `everyH` hours. Answers "if we slip the launch, which dates still work here?".
 */
export function sweepLandingDates(
  s: SiteSeries,
  missionDays: number,
  everyH = 24,
): DateCandidate[] {
  const win = Math.round((missionDays * 24 * HOUR_MS) / s.stepMs)
  const stride = Math.max(1, Math.round((everyH * HOUR_MS) / s.stepMs))
  // Prefix sums make each candidate O(1) for the averages.
  const pe = new Float64Array(s.count + 1)
  const pd = new Float64Array(s.count + 1)
  for (let i = 0; i < s.count; i++) {
    pe[i + 1] = pe[i] + s.sunFrac[i]
    pd[i + 1] = pd[i] + (s.earthFrac[i] >= VISIBLE_THRESHOLD ? 1 : 0)
  }
  // Lit samples in a row from each sample on (one backward pass).
  const run = new Int32Array(s.count + 1)
  for (let i = s.count - 1; i >= 0; i--)
    run[i] = s.sunFrac[i] >= VISIBLE_THRESHOLD ? run[i + 1] + 1 : 0
  const out: DateCandidate[] = []
  for (let i0 = 0; i0 + win <= s.count; i0 += stride) {
    const i1 = i0 + win
    let dark = 0
    let maxDark = 0
    let maxSunEl = -90
    let lit = 0
    let elLitSum = 0
    for (let i = i0; i < i1; i++) {
      if (s.sunFrac[i] < VISIBLE_THRESHOLD) {
        dark++
        if (dark > maxDark) maxDark = dark
      } else {
        dark = 0
        lit++
        elLitSum += s.sunEl[i]
      }
      if (s.sunEl[i] > maxSunEl) maxSunEl = s.sunEl[i]
    }
    const energyPct = (100 * (pe[i1] - pe[i0])) / win
    const dtePct = (100 * (pd[i1] - pd[i0])) / win
    const longestDarkH = (maxDark * s.stepMs) / HOUR_MS
    out.push({
      startMs: s.startMs + i0 * s.stepMs,
      energyPct,
      dtePct,
      longestDarkH,
      sunAtLanding: s.sunFrac[i0] >= VISIBLE_THRESHOLD,
      earthAtLanding: s.earthFrac[i0] >= VISIBLE_THRESHOLD,
      score: scoreOf(energyPct, dtePct, longestDarkH),
      maxSunEl,
      meanSunElLit: lit ? elLitSum / lit : NaN,
      sunFromLandingH: (Math.min(run[i0], s.count - 1 - i0) * s.stepMs) / HOUR_MS,
    })
  }
  return out
}
