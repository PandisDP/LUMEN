import { DAY_MS } from '../astro/constants.ts'
import type { HardwareLimits } from '../astro/hardware.ts'
import {
  PLAN_MAX_DAYS,
  type PlanDay,
  type PlanProblem,
  type PlanResult,
  type PlanViolation,
} from '../astro/plannerTypes.ts'
import type { MsgKey } from '../i18n/index.ts'
import { LEVEL_FILL_VAR, LEVEL_INK_VAR } from './chartTheme.ts'
import { type Level, scoreLevel } from './levels.ts'

/**
 * Pure helpers of the planner screen: date range, calendar layout, colours, sorting, the CSV
 * export and the "why is there no solution" breakdown. No React, no stores.
 */

/** Landing dates the planner accepts: the span of the DE441 ephemeris table. */
export const PLAN_RANGE = { minMs: Date.UTC(2026, 0, 1), maxMs: Date.UTC(2030, 11, 31) } as const

export const utcMidnight = (ms: number) => Math.floor(ms / DAY_MS) * DAY_MS

export const clampDays = (days: number) =>
  Number.isFinite(days) ? Math.round(Math.min(PLAN_MAX_DAYS, Math.max(1, days))) : 1

/** First day of the range kept inside the ephemeris span, leaving room for `days`. */
export function clampFrom(fromMs: number, days: number): number {
  const last = PLAN_RANGE.maxMs - (clampDays(days) - 1) * DAY_MS
  return Math.min(last, Math.max(PLAN_RANGE.minMs, utcMidnight(fromMs)))
}

/** Value of an <input type="date"> read as UTC. */
export const toDateInput = (ms: number) => new Date(ms).toISOString().slice(0, 10)
export function fromDateInput(v: string): number | null {
  const ms = Date.parse(`${v}T00:00:00Z`)
  return Number.isFinite(ms) ? ms : null
}

export const rangeEndMs = (fromMs: number, days: number) => fromMs + (clampDays(days) - 1) * DAY_MS

// ---------------------------------------------------------------- calendar

export interface CalendarWeek {
  /** Seven slots, Monday first: the day (00:00 UTC, ms) or null outside the range. */
  cells: (number | null)[]
  /** Day whose month labels the week: the first week, and every week where a month starts. */
  labelMs: number | null
}

/** Monday = 0 … Sunday = 6. */
export const weekdayMonFirst = (ms: number) => (new Date(ms).getUTCDay() + 6) % 7

/** The range laid out in weeks (Monday first), with a month label where a month begins. */
export function calendarLayout(fromMs: number, days: number): CalendarWeek[] {
  const n = clampDays(days)
  const start = utcMidnight(fromMs)
  const weeks: CalendarWeek[] = []
  let week: CalendarWeek = { cells: new Array<number | null>(7).fill(null), labelMs: start }
  for (let i = 0; i < n; i++) {
    const ms = start + i * DAY_MS
    const col = weekdayMonFirst(ms)
    if (col === 0 && i > 0) {
      weeks.push(week)
      week = { cells: new Array<number | null>(7).fill(null), labelMs: null }
    }
    week.cells[col] = ms
    if (i > 0 && new Date(ms).getUTCDate() === 1) week.labelMs = ms
  }
  weeks.push(week)
  return weeks
}

// ---------------------------------------------------------------- colours

export type DayState = Level | 'none' | 'pending'

/** How a day reads in the calendar: the level of its best score, no solution, or not computed. */
export const dayState = (day: PlanDay | undefined): DayState =>
  !day ? 'pending' : day.best ? scoreLevel(day.best.score) : 'none'

/**
 * Colour of a score, in the three steps of scoreLevel (60 / 35): band-ok, band-excess (the
 * system's warning is blue) and band-deficit. CSS expressions, so they follow the theme; the
 * fills are mid-tones that hold white text (the score is printed on the calendar cells).
 */
export const scoreColor = (score: number) => LEVEL_FILL_VAR[scoreLevel(score)]
export const scoreStroke = (score: number) => LEVEL_INK_VAR[scoreLevel(score)]

// ---------------------------------------------------------------- ranking & summary

/** Rank (1-based) of each shortlisted day, by its date. */
export function rankByDay(result: PlanResult | null): Map<number, number> {
  const out = new Map<number, number>()
  result?.top.forEach((i, k) => {
    const d = result.days[i]
    if (d?.best) out.set(d.dayMs, k + 1)
  })
  return out
}

/** The shortlisted days, best first. */
export const topDays = (result: PlanResult | null): PlanDay[] =>
  result ? result.top.map((i) => result.days[i]).filter((d): d is PlanDay => !!d?.best) : []

export interface PlanSummary {
  /** Days asked for, evaluated so far, and with a solution. */
  total: number
  computed: number
  solved: number
  bestDayMs: number | null
  bestScore: number | null
}

export function planSummary(result: PlanResult): PlanSummary {
  let best: PlanDay | null = null
  let solved = 0
  for (const d of result.days) {
    if (!d.best) continue
    solved++
    if (!best?.best || d.best.score > best.best.score) best = d
  }
  return {
    total: result.problem.days,
    computed: result.days.length,
    solved,
    bestDayMs: best?.dayMs ?? null,
    bestScore: best?.best?.score ?? null,
  }
}

// ---------------------------------------------------------------- table

export type SortKey =
  | 'date'
  | 'route'
  | 'samples'
  | 'return'
  | 'score'
  | 'energy'
  | 'dte'
  | 'night'
  | 'light'
  | 'battery'
  | 'verdict'
export type SortDir = 'asc' | 'desc'

/** Direction a column starts with: best first (scores and margins down, nights and routes up). */
export const DEFAULT_DIR: Record<SortKey, SortDir> = {
  date: 'asc',
  route: 'asc',
  samples: 'desc',
  return: 'desc',
  score: 'desc',
  energy: 'desc',
  dte: 'desc',
  night: 'asc',
  light: 'desc',
  battery: 'desc',
  verdict: 'asc',
}

const VALUE: Record<Exclude<SortKey, 'date'>, (p: NonNullable<PlanDay['best']>) => number> = {
  route: (p) => p.routeM,
  samples: (p) => p.rover.samplesDone,
  // "Return" sorts by the time left when the rover is back: the widest margin first.
  return: (p) => p.rover.marginH ?? -Infinity,
  score: (p) => p.score,
  energy: (p) => p.energyPct,
  dte: (p) => p.dtePct,
  night: (p) => p.longestDarkH,
  light: (p) => p.sunFromLandingH,
  battery: (p) => p.rover.minSocPct,
  verdict: (p) => (p.verdict === 'good' ? 0 : 1),
}

/**
 * Days in table order. By date every day keeps its place; by any figure the days without a
 * solution go last (in date order) whatever the direction, and ties fall back to the date.
 */
export function sortDays(days: readonly PlanDay[], key: SortKey, dir: SortDir): PlanDay[] {
  const sign = dir === 'asc' ? 1 : -1
  if (key === 'date') return [...days].sort((a, b) => sign * (a.dayMs - b.dayMs))
  const value = VALUE[key]
  return [...days].sort((a, b) => {
    if (!a.best || !b.best) return a.best ? -1 : b.best ? 1 : a.dayMs - b.dayMs
    return sign * (value(a.best) - value(b.best)) || a.dayMs - b.dayMs
  })
}

// ---------------------------------------------------------------- round trip

/** Metres the rover drives in all: to the ice and back by the same route. */
export const roundTripM = (pick: Pick<NonNullable<PlanDay['best']>, 'routeM'>) => 2 * pick.routeM

/** "3 muestras" / "1 muestra": the key that agrees with the number. */
export const samplesKey = (n: number): MsgKey =>
  n === 1 ? 'plan.samples.one' : 'plan.samples.many'

/** Under a day of spare time when the rover is back at the lander: worth a warning. */
export const MARGIN_WARN_H = 24

/** How the time left at the end of the round trip reads: tight under a day, fine otherwise. */
export const marginLevel = (marginH: number | null): Level =>
  marginH !== null && marginH >= MARGIN_WARN_H ? 'good' : 'warn'

// ---------------------------------------------------------------- violations

export const VIOLATIONS: readonly PlanViolation[] = [
  'no-route',
  'no-sun-at-landing',
  'short-light',
  'night',
  'dte',
  'slope',
  'rover-unreachable',
  'rover-samples',
  'rover-no-return',
  'rover-late',
  'rover-battery',
]

/** Why a day (or a candidate) is rejected, and what to change about it. */
export const VIOLATION_KEY: Record<PlanViolation, MsgKey> = {
  'no-route': 'plan.why.noRoute',
  'no-sun-at-landing': 'plan.why.noSun',
  'short-light': 'plan.why.shortLight',
  night: 'plan.why.night',
  dte: 'plan.why.dte',
  slope: 'plan.why.slope',
  'rover-unreachable': 'plan.why.roverUnreachable',
  'rover-samples': 'plan.why.roverSamples',
  'rover-no-return': 'plan.why.roverNoReturn',
  'rover-late': 'plan.why.roverLate',
  'rover-battery': 'plan.why.roverBattery',
}
export const VIOLATION_FIX: Record<PlanViolation, MsgKey> = {
  'no-route': 'plan.fix.noRoute',
  'no-sun-at-landing': 'plan.fix.noSun',
  'short-light': 'plan.fix.shortLight',
  night: 'plan.fix.night',
  dte: 'plan.fix.dte',
  slope: 'plan.fix.slope',
  'rover-unreachable': 'plan.fix.roverUnreachable',
  'rover-samples': 'plan.fix.roverSamples',
  'rover-no-return': 'plan.fix.roverNoReturn',
  'rover-late': 'plan.fix.roverLate',
  'rover-battery': 'plan.fix.roverBattery',
}

export interface ViolationBar {
  violation: PlanViolation
  /** Candidate rejections over the days counted. */
  count: number
  /** Share of all the rejections, 0..1. */
  share: number
  /** Days whose main reason is this one. */
  days: number
}

/**
 * Rejections of the days without a solution, most frequent first: the first bar is the
 * constraint to relax. Days that report only a main reason count as one rejection.
 */
export function violationHistogram(days: readonly PlanDay[]): ViolationBar[] {
  const count = new Map<PlanViolation, number>()
  const dayCount = new Map<PlanViolation, number>()
  for (const d of days) {
    if (d.best) continue
    let any = false
    for (const v of VIOLATIONS) {
      const n = d.rejected[v] ?? 0
      if (n > 0) {
        any = true
        count.set(v, (count.get(v) ?? 0) + n)
      }
    }
    if (d.mainViolation) {
      dayCount.set(d.mainViolation, (dayCount.get(d.mainViolation) ?? 0) + 1)
      if (!any) count.set(d.mainViolation, (count.get(d.mainViolation) ?? 0) + 1)
    }
  }
  const total = [...count.values()].reduce((a, b) => a + b, 0)
  return VIOLATIONS.filter((v) => count.has(v))
    .map((v) => ({
      violation: v,
      count: count.get(v)!,
      share: count.get(v)! / total,
      days: dayCount.get(v) ?? 0,
    }))
    .sort((a, b) => b.count - a.count)
}

/**
 * The reasons in the order the fixes should attack them: first what sinks the best point of
 * most days (the day's main reason: with the rover it is the last hurdle, after the cheap
 * filters have thinned the candidates), then whatever rejects most points.
 */
export const violationsByDay = (bars: readonly ViolationBar[]): PlanViolation[] =>
  [...bars].sort((a, b) => b.days - a.days || b.count - a.count).map((b) => b.violation)

// ---------------------------------------------------------------- stale results

const LIMIT_KEYS: (keyof HardwareLimits)[] = [
  'maxSlopeDeg',
  'maxNightH',
  'minDtePct',
  'roverMaxSlopeDeg',
]

/** True when the inputs on screen are no longer the ones the results were computed with. */
export function problemChanged(a: PlanProblem, b: PlanProblem): boolean {
  return (
    a.target.lat !== b.target.lat ||
    a.target.lon !== b.target.lon ||
    a.tileSiteId !== b.tileSiteId ||
    a.fromMs !== b.fromMs ||
    a.days !== b.days ||
    a.missionDays !== b.missionDays ||
    a.minSunDays !== b.minSunDays ||
    a.roverId !== b.roverId ||
    a.samples !== b.samples ||
    a.sampleH !== b.sampleH ||
    a.minRoverSocPct !== b.minRoverSocPct ||
    a.radiusM !== b.radiusM ||
    a.linkMarginDeg !== b.linkMarginDeg ||
    a.requireDsn !== b.requireDsn ||
    a.scienceWeight !== b.scienceWeight ||
    LIMIT_KEYS.some((k) => a.hardware[k] !== b.hardware[k])
  )
}

// ---------------------------------------------------------------- CSV

export const PLAN_CSV_COLUMNS = [
  'landing_utc',
  'has_solution',
  'lat_deg',
  'lon_deg',
  'height_m',
  'landing_slope_deg',
  'route_to_ice_m',
  'route_round_trip_m',
  'score',
  'engineering_score',
  'science_score',
  'energy_pct',
  'sunlit_pct',
  'dte_pct',
  'longest_night_h',
  'sun_from_landing_h',
  'rover_reaches',
  'rover_min_battery_pct',
  'rover_travel_h',
  'rover_hours_in_shadow',
  'rover_samples_done',
  'rover_returns',
  'rover_total_h',
  'rover_margin_h',
  'rover_end_battery_pct',
  'verdict',
  'tight_limits',
  'top_rank',
  'rejection_reason',
] as const

const fix = (v: number, digits: number) => (Number.isFinite(v) ? v.toFixed(digits) : '')

/** One row per day; the problem's parameters go in a `#` header, as in the series export. */
export function planCsv(result: PlanResult): string {
  const p = result.problem
  const meta = [
    'Killa Landing export: mission plan',
    `ice_target_lat_deg: ${p.target.lat}`,
    `ice_target_lon_deg: ${p.target.lon}`,
    `ice_cell_lat_deg: ${result.ice.lat}`,
    `ice_cell_lon_deg: ${result.ice.lon}`,
    `terrain_tile: ${p.tileSiteId}`,
    `first_landing_utc: ${new Date(p.fromMs).toISOString()}`,
    `days_analysed: ${p.days}`,
    `days_computed: ${result.days.length}`,
    `mission_days: ${p.missionDays}`,
    `min_continuous_sun_days: ${p.minSunDays}`,
    `rover: ${p.roverId}`,
    `samples_requested: ${p.samples}`,
    `sample_hours: ${p.sampleH}`,
    `rover_min_battery_pct: ${p.minRoverSocPct}`,
    `search_radius_m: ${p.radiusM}`,
    `candidate_landing_points: ${result.candidates.length}`,
    `max_landing_slope_deg: ${p.hardware.maxSlopeDeg}`,
    `max_night_h: ${p.hardware.maxNightH}`,
    `min_dte_pct: ${p.hardware.minDtePct}`,
    `rover_max_slope_deg: ${p.hardware.roverMaxSlopeDeg}`,
    `dte_link_margin_deg: ${p.linkMarginDeg}`,
    `require_dsn: ${p.requireDsn}`,
    `science_weight: ${p.scienceWeight}`,
  ]
  const rank = rankByDay(result)
  const out = meta.map((l) => `# ${l}`)
  out.push(PLAN_CSV_COLUMNS.join(','))
  for (const d of result.days) {
    const b = d.best
    const date = new Date(d.dayMs).toISOString()
    if (!b) {
      const row = new Array<string>(PLAN_CSV_COLUMNS.length).fill('')
      row[0] = date
      row[1] = '0'
      row[row.length - 1] = d.mainViolation ?? ''
      out.push(row.join(','))
      continue
    }
    out.push(
      [
        date,
        '1',
        fix(b.lat, 5),
        fix(b.lon, 5),
        fix(b.heightM, 1),
        fix(b.slopeDeg, 2),
        fix(b.routeM, 0),
        fix(roundTripM(b), 0),
        fix(b.score, 1),
        fix(b.engineeringScore, 1),
        fix(b.scienceScore, 1),
        fix(b.energyPct, 1),
        fix(b.sunlitPct, 1),
        fix(b.dtePct, 1),
        fix(b.longestDarkH, 1),
        fix(b.sunFromLandingH, 1),
        b.rover.reaches ? '1' : '0',
        fix(b.rover.minSocPct, 1),
        fix(b.rover.travelH, 1),
        fix(b.rover.hoursInShadow, 1),
        String(b.rover.samplesDone),
        b.rover.returns ? '1' : '0',
        fix(b.rover.totalH, 1),
        b.rover.marginH === null ? '' : fix(b.rover.marginH, 1),
        fix(b.rover.endSocPct, 1),
        b.verdict,
        b.tight.join('|'),
        String(rank.get(d.dayMs) ?? ''),
        '',
      ].join(','),
    )
  }
  return out.join('\n') + '\n'
}

export const planFileName = (result: PlanResult) =>
  `lumen3d_plan_${result.problem.tileSiteId.replace(/[^a-z0-9.-]+/gi, '_')}_${toDateInput(result.problem.fromMs)}_${result.problem.days}d.csv`

// ---------------------------------------------------------------- dates as text

const LOCALES = { es: 'es-MX', en: 'en-US' } as const
type PlanLang = keyof typeof LOCALES
const fmtCache = new Map<string, Intl.DateTimeFormat>()

function fmt(lang: PlanLang, name: string, options: Intl.DateTimeFormatOptions) {
  const key = `${lang}|${name}`
  let f = fmtCache.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat(LOCALES[lang], { timeZone: 'UTC', ...options })
    fmtCache.set(key, f)
  }
  return f
}

/** "14 dic 2026" / "Dec 14, 2026" (UTC). */
export const formatPlanDate = (ms: number, lang: PlanLang) =>
  fmt(lang, 'date', { day: 'numeric', month: 'short', year: 'numeric' }).format(ms)
/** "lun 14 dic" / "Mon, Dec 14" (UTC). */
export const formatPlanWeekday = (ms: number, lang: PlanLang) =>
  fmt(lang, 'weekday', { weekday: 'short', day: 'numeric', month: 'short' })
    .format(ms)
    .replace(' de ', ' ')

/** Compact duration for table cells: "22 h", "3.5 d". */
export const formatSpan = (hours: number) =>
  !Number.isFinite(hours)
    ? '—'
    : hours < 48
      ? `${Math.round(hours)} h`
      : `${(hours / 24).toFixed(1)} d`
/** Hours of work per sample, in half-hour steps: "2 h", "1.5 h". */
export const formatSampleHours = (hours: number) =>
  Number.isFinite(hours) ? `${+hours.toFixed(1)} h` : '—'
export const formatPlanMonth = (ms: number, lang: PlanLang) =>
  fmt(lang, 'month', { month: 'short' }).format(ms)

/** Narrow weekday names, Monday first. */
export function weekdayNames(lang: PlanLang): { short: string; long: string }[] {
  const monday = Date.UTC(2026, 0, 5)
  return Array.from({ length: 7 }, (_, i) => ({
    short: fmt(lang, 'wd-narrow', { weekday: 'narrow' }).format(monday + i * DAY_MS),
    long: fmt(lang, 'wd-long', { weekday: 'long' }).format(monday + i * DAY_MS),
  }))
}
