import type { DateCandidate } from './metrics.ts'

/** One calendar month of landing-date candidates, summarised for the seasonal view. */
export interface MonthStat {
  year: number
  /** 0-based UTC month. */
  month: number
  /** First instant of the month, UTC. */
  startMs: number
  /** Number of candidate landing days in the month. */
  days: number
  /** Mean energy % of the missions landing in this month. */
  energyPct: number
  /** Mean DTE % of the missions landing in this month. */
  dtePct: number
  /** Highest Sun elevation reached by any mission landing in this month, degrees. */
  maxSunEl: number
  /** Fraction (0..1) of landing days with the Sun up at touchdown. */
  sunAtLandingFrac: number
  /** First landing day (ms) of the month with the Sun up at touchdown, or null. */
  firstSunlitMs: number | null
}

/**
 * Groups daily candidates by UTC calendar month: mean energy and DTE, max Sun elevation and
 * the share of days with a sunlit touchdown. Months are returned in chronological order;
 * months without candidates are skipped.
 */
export function aggregateByMonth(candidates: readonly DateCandidate[]): MonthStat[] {
  const out: MonthStat[] = []
  let cur: MonthStat | null = null
  const sorted = [...candidates].sort((a, b) => a.startMs - b.startMs)
  for (const c of sorted) {
    const d = new Date(c.startMs)
    const year = d.getUTCFullYear()
    const month = d.getUTCMonth()
    if (!cur || cur.year !== year || cur.month !== month) {
      cur = {
        year,
        month,
        startMs: Date.UTC(year, month, 1),
        days: 0,
        energyPct: 0,
        dtePct: 0,
        maxSunEl: -90,
        sunAtLandingFrac: 0,
        firstSunlitMs: null,
      }
      out.push(cur)
    }
    cur.days++
    cur.energyPct += c.energyPct
    cur.dtePct += c.dtePct
    if (c.maxSunEl > cur.maxSunEl) cur.maxSunEl = c.maxSunEl
    if (c.sunAtLanding) {
      cur.sunAtLandingFrac++
      if (cur.firstSunlitMs === null) cur.firstSunlitMs = c.startMs
    }
  }
  for (const m of out) {
    m.energyPct /= m.days
    m.dtePct /= m.days
    m.sunAtLandingFrac /= m.days
  }
  return out
}

/** Index of the best (highest mean energy) and worst month, or -1 when empty. */
export function extremeMonths(months: readonly MonthStat[]): { best: number; worst: number } {
  let best = -1
  let worst = -1
  months.forEach((m, i) => {
    if (best < 0 || m.energyPct > months[best].energyPct) best = i
    if (worst < 0 || m.energyPct < months[worst].energyPct) worst = i
  })
  return { best, worst }
}
