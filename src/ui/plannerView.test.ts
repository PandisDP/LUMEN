import { describe, expect, it } from 'vitest'
import { DAY_MS } from '../astro/constants.ts'
import { PLAN_MAX_DAYS } from '../astro/plannerTypes.ts'
import { scoreLevel } from './levels.ts'
import { FIXTURE_FROM, fixtureProblem, fixtureResult } from './plannerFixture.ts'
import { assembleProblem, effectiveFromMs } from './plannerInputs.ts'
import {
  DEFAULT_DIR,
  MARGIN_WARN_H,
  PLAN_CSV_COLUMNS,
  PLAN_RANGE,
  type SortKey,
  VIOLATIONS,
  VIOLATION_FIX,
  VIOLATION_KEY,
  calendarLayout,
  clampDays,
  clampFrom,
  dayState,
  formatPlanDate,
  formatSampleHours,
  formatSpan,
  fromDateInput,
  marginLevel,
  planCsv,
  planSummary,
  problemChanged,
  rangeEndMs,
  rankByDay,
  roundTripM,
  samplesKey,
  scoreColor,
  scoreStroke,
  sortDays,
  toDateInput,
  topDays,
  violationHistogram,
  violationsByDay,
  weekdayNames,
} from './plannerView.ts'
import { es } from '../i18n/es.ts'

const day = (ms: number | null) => (ms === null ? null : new Date(ms).getUTCDate())

describe('date range', () => {
  it('clamps the days and keeps the range inside the ephemeris span', () => {
    expect(clampDays(0)).toBe(1)
    expect(clampDays(500)).toBe(PLAN_MAX_DAYS)
    expect(clampDays(NaN)).toBe(1)
    expect(clampFrom(Date.UTC(2020, 0, 1), 30)).toBe(PLAN_RANGE.minMs)
    expect(clampFrom(Date.UTC(2031, 0, 1), 30)).toBe(PLAN_RANGE.maxMs - 29 * DAY_MS)
    // Any time of day snaps to 00:00 UTC.
    expect(clampFrom(Date.UTC(2027, 2, 1, 17, 30), 5)).toBe(Date.UTC(2027, 2, 1))
    expect(rangeEndMs(Date.UTC(2027, 2, 1), 30)).toBe(Date.UTC(2027, 2, 30))
    expect(fromDateInput(toDateInput(Date.UTC(2027, 2, 1)))).toBe(Date.UTC(2027, 2, 1))
    expect(fromDateInput('nope')).toBeNull()
  })

  it('defaults to today (UTC) and builds the problem only with a target', () => {
    const now = Date.UTC(2027, 4, 4, 13)
    expect(effectiveFromMs(null, 30, now)).toBe(Date.UTC(2027, 4, 4))
    const inputs = {
      target: null,
      tileSiteId: null,
      fromMs: null,
      days: 30,
      minSunDays: 15,
      minRoverSocPct: 20,
      radiusM: 2000,
    }
    const mission = {
      missionDays: 14,
      hardwareLimits: fixtureProblem().hardware,
      linkMarginDeg: 3,
      requireDsn: false,
      scienceWeight: 0,
    }
    expect(
      assembleProblem(inputs, mission, { roverId: 'rover', samples: 3, sampleH: 2 }, now),
    ).toBeNull()
    const p = assembleProblem(
      { ...inputs, target: { lat: -89.4, lon: 10 }, tileSiteId: 'x' },
      mission,
      { roverId: 'csa-rover', samples: 4, sampleH: 1.5 },
      now,
    )
    expect(p).toMatchObject({
      fromMs: Date.UTC(2027, 4, 4),
      days: 30,
      roverId: 'csa-rover',
      samples: 4,
      sampleH: 1.5,
    })
  })
})

describe('calendarLayout', () => {
  it('lays a range that crosses a month boundary in Monday-first weeks', () => {
    // Wed 25 Nov 2026 … Fri 4 Dec 2026.
    const weeks = calendarLayout(FIXTURE_FROM, 10)
    expect(weeks).toHaveLength(2)
    expect(weeks[0].cells.map(day)).toEqual([null, null, 25, 26, 27, 28, 29])
    expect(weeks[1].cells.map(day)).toEqual([30, 1, 2, 3, 4, null, null])
    // The first week is labelled with its month, the second with the month that starts in it.
    expect(new Date(weeks[0].labelMs!).getUTCMonth()).toBe(10)
    expect(new Date(weeks[1].labelMs!).getUTCMonth()).toBe(11)
    expect(weeks.flatMap((w) => w.cells).filter((x) => x !== null)).toHaveLength(10)
  })

  it('starts a new row every Monday and labels only where a month begins', () => {
    const weeks = calendarLayout(Date.UTC(2026, 10, 16), 30) // a Monday
    expect(weeks).toHaveLength(5)
    expect(weeks[0].cells[0]).toBe(Date.UTC(2026, 10, 16))
    expect(weeks.map((w) => w.labelMs !== null)).toEqual([true, false, true, false, false])
    expect(calendarLayout(Date.UTC(2026, 10, 22), 1)[0].cells.map(day)[6]).toBe(22) // Sunday
    expect(weekdayNames('es').map((d) => d.long)[0]).toBe('lunes')
    expect(weekdayNames('en').map((d) => d.short)).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S'])
  })
})

describe('colours and levels', () => {
  it('follows the scoreLevel thresholds and never relies on a single hue', () => {
    const r = fixtureResult([20, 48, 80, 'short-light'])
    expect(r.days.map((d) => dayState(d))).toEqual(['bad', 'warn', 'good', 'none'])
    expect(dayState(undefined)).toBe('pending')
    // Three steps on the scoreLevel thresholds (35 / 60), from the band tokens: no custom ramp.
    const fills = [0, 34, 35, 59, 60, 100].map(scoreColor)
    expect(fills[0]).toBe('hsl(var(--band-deficit-fill))')
    expect(fills[1]).toBe(fills[0])
    expect(fills[2]).toBe('hsl(var(--band-excess-fill))')
    expect(fills[3]).toBe(fills[2])
    expect(fills[4]).toBe('hsl(var(--band-ok-fill))')
    expect(fills[5]).toBe(fills[4])
    expect([20, 48, 80].map(scoreStroke)).toEqual([
      'hsl(var(--band-deficit))',
      'hsl(var(--band-excess))',
      'hsl(var(--band-ok))',
    ])
    expect(new Set(Array.from({ length: 101 }, (_, s) => scoreColor(s))).size).toBe(3)
    expect(scoreLevel(60)).toBe('good')
  })
})

describe('violationsByDay', () => {
  it('puts first what stops most days, then what rejects most points', () => {
    // Many dark candidates every day, but each day ends at the rover: the rover comes first.
    const r = fixtureResult(['rover-samples', 'rover-samples', 'night'])
    for (const d of r.days) d.rejected = { ...d.rejected, 'no-sun-at-landing': 200 }
    const bars = violationHistogram(r.days)
    expect(bars[0].violation).toBe('no-sun-at-landing')
    expect(violationsByDay(bars)).toEqual(['rover-samples', 'night', 'no-sun-at-landing', 'slope'])
  })
})

describe('round trip', () => {
  it('doubles the route and flags a return with less than a day to spare', () => {
    expect(roundTripM({ routeM: 1390 })).toBe(2780)
    expect(marginLevel(322.9)).toBe('good')
    expect(marginLevel(MARGIN_WARN_H)).toBe('good')
    expect(marginLevel(23.9)).toBe('warn')
    expect(marginLevel(null)).toBe('warn')
    expect(samplesKey(1)).toBe('plan.samples.one')
    expect(samplesKey(3)).toBe('plan.samples.many')
    expect(formatSampleHours(2)).toBe('2 h')
    expect(formatSampleHours(0.5)).toBe('0.5 h')
  })

  it('sorts by the samples and by the margin of the return, unsolved days last', () => {
    const r = fixtureResult([40, 'night', 88, 61])
    r.days[0].best!.rover = { ...r.days[0].best!.rover, marginH: 10, samplesDone: 2 }
    r.days[3].best!.rover = { ...r.days[3].best!.rover, marginH: 400 }
    const order = (key: SortKey) =>
      sortDays(r.days, key, DEFAULT_DIR[key]).map((d) => d.best?.score ?? null)
    expect(order('return')).toEqual([61, 88, 40, null])
    expect(order('samples')).toEqual([88, 61, 40, null])
  })
})

describe('sortDays', () => {
  const r = fixtureResult([40, 'night', 88, 61, 'short-light', 75])
  const scores = (key: SortKey, dir: 'asc' | 'desc') =>
    sortDays(r.days, key, dir).map((d) => d.best?.score ?? null)

  it('by date keeps every day in place', () => {
    expect(scores('date', 'asc')).toEqual([40, null, 88, 61, null, 75])
    expect(scores('date', 'desc')).toEqual([75, null, 61, 88, null, 40])
  })

  it('by any figure puts the days without a solution last, in both directions', () => {
    expect(scores('score', 'desc')).toEqual([88, 75, 61, 40, null, null])
    expect(scores('score', 'asc')).toEqual([40, 61, 75, 88, null, null])
    // The fixture ties every figure to the score: route and night fall as it rises.
    expect(scores('route', 'asc')).toEqual([88, 75, 61, 40, null, null])
    expect(scores('energy', 'desc')).toEqual([88, 75, 61, 40, null, null])
    expect(scores('dte', 'desc')).toEqual([40, 61, 75, 88, null, null])
    expect(scores('night', 'asc')).toEqual([88, 75, 61, 40, null, null])
    expect(scores('light', 'desc')).toEqual([88, 75, 61, 40, null, null])
    expect(scores('battery', 'asc')).toEqual([40, 61, 75, 88, null, null])
    // Verdict: viable first, then "at the limit"; ties by date.
    expect(scores('verdict', 'asc')).toEqual([88, 61, 75, 40, null, null])
    const last = sortDays(r.days, 'score', 'asc').slice(-2)
    expect(last.map((d) => d.mainViolation)).toEqual(['night', 'short-light'])
  })
})

describe('ranking and summary', () => {
  it('ranks the shortlist and counts the days with a solution', () => {
    const r = fixtureResult([40, 'night', 88, 61, 'short-light', 75], {}, 10)
    expect(topDays(r).map((d) => d.best!.score)).toEqual([88, 75, 61, 40])
    const rank = rankByDay(r)
    expect(rank.get(r.days[2].dayMs)).toBe(1)
    expect(rank.get(r.days[1].dayMs)).toBeUndefined()
    expect(planSummary(r)).toEqual({
      total: 10,
      computed: 6,
      solved: 4,
      bestDayMs: r.days[2].dayMs,
      bestScore: 88,
    })
    expect(planSummary(fixtureResult(['night']))).toMatchObject({ solved: 0, bestDayMs: null })
    expect(formatPlanDate(r.days[2].dayMs, 'es')).toBe('27 nov 2026')
    expect(formatSpan(22.4)).toBe('22 h')
    expect(formatSpan(84)).toBe('3.5 d')
  })
})

describe('violationHistogram', () => {
  it('adds up the rejections of the days without a solution; the first bar dominates', () => {
    const r = fixtureResult(['short-light', 'short-light', 'night', 70])
    const bars = violationHistogram(r.days)
    // short-light: 10 + 11, night: 12, slope: 3 × 3 (the solved day is not counted).
    expect(bars.map((b) => [b.violation, b.count, b.days])).toEqual([
      ['short-light', 21, 2],
      ['night', 12, 1],
      ['slope', 9, 0],
    ])
    expect(bars[0].share).toBeCloseTo(21 / 42)
    expect(violationHistogram(fixtureResult([70, 80]).days)).toEqual([])
    // A day that only reports its main reason still counts.
    const bare = violationHistogram([{ dayMs: 0, best: null, rejected: {}, mainViolation: 'dte' }])
    expect(bare).toEqual([{ violation: 'dte', count: 1, share: 1, days: 1 }])
  })

  it('every violation has a message and a suggestion', () => {
    for (const v of VIOLATIONS) {
      expect(es[VIOLATION_KEY[v]], v).toBeTruthy()
      expect(es[VIOLATION_FIX[v]], v).toBeTruthy()
    }
    expect(es[VIOLATION_FIX['short-light']]).toMatch(/luz continua mínima.*rango de fechas/)
    // The five ways the rover's round trip fails each have their own words.
    const rover = VIOLATIONS.filter((v) => v.startsWith('rover-'))
    expect(rover).toHaveLength(5)
    expect(new Set(rover.map((v) => VIOLATION_KEY[v])).size).toBe(5)
    expect(new Set(rover.map((v) => VIOLATION_FIX[v])).size).toBe(5)
    expect(es[VIOLATION_KEY['rover-samples']]).toMatch(/no hay Sol para recargar/)
    expect(es[VIOLATION_KEY['rover-late']]).toMatch(/después del fin de la misión/)
  })
})

describe('planCsv', () => {
  it('writes the parameters as comments, a header and one row per day', () => {
    const r = fixtureResult([40, 'night', 88])
    const lines = planCsv(r).trimEnd().split('\n')
    const meta = lines.filter((l) => l.startsWith('# '))
    expect(meta[0]).toBe('# Killa Landing export: mission plan')
    expect(meta).toContain('# ice_target_lat_deg: -89.44033')
    expect(meta).toContain('# first_landing_utc: 2026-11-25T00:00:00.000Z')
    expect(meta).toContain('# min_continuous_sun_days: 15')
    expect(meta).toContain('# max_night_h: 120')
    expect(meta).toContain('# rover: csa-rover')
    expect(meta).toContain('# samples_requested: 3')
    expect(meta).toContain('# sample_hours: 2')
    const body = lines.slice(meta.length)
    expect(body[0]).toBe(PLAN_CSV_COLUMNS.join(','))
    expect(body).toHaveLength(1 + 3)
    const rows = body.slice(1).map((l) => l.split(','))
    for (const row of rows) expect(row).toHaveLength(PLAN_CSV_COLUMNS.length)
    const col = (name: (typeof PLAN_CSV_COLUMNS)[number]) => PLAN_CSV_COLUMNS.indexOf(name)
    expect(rows[0][col('landing_utc')]).toBe('2026-11-25T00:00:00.000Z')
    expect(rows[0][col('score')]).toBe('40.0')
    expect(rows[0][col('verdict')]).toBe('warn')
    expect(rows[0][col('tight_limits')]).toBe('night|dte')
    expect(rows[0][col('top_rank')]).toBe('2')
    expect(rows[2][col('top_rank')]).toBe('1')
    // The round trip: both distances, the samples and how the rover gets back.
    expect(rows[0][col('route_to_ice_m')]).toBe('1600')
    expect(rows[0][col('route_round_trip_m')]).toBe('3200')
    expect(rows[0][col('rover_samples_done')]).toBe('3')
    expect(rows[0][col('rover_returns')]).toBe('1')
    expect(rows[0][col('rover_total_h')]).toBe('16.0')
    expect(rows[0][col('rover_margin_h')]).toBe('320.0')
    expect(rows[0][col('rover_end_battery_pct')]).toBe('45.0')
    expect(rows[0][col('rover_travel_h')]).toBe('5.0')
    expect(PLAN_CSV_COLUMNS[PLAN_CSV_COLUMNS.length - 1]).toBe('rejection_reason')
    // No solution: empty cells and the reason.
    expect(rows[1][col('has_solution')]).toBe('0')
    expect(rows[1][col('rejection_reason')]).toBe('night')
    expect(rows[1].slice(2, -1).every((c) => c === '')).toBe(true)
  })
})

describe('stale results', () => {
  it('detects any input that differs from the problem that was run', () => {
    const p = fixtureProblem()
    expect(problemChanged(p, fixtureProblem())).toBe(false)
    expect(problemChanged(p, fixtureProblem({ minSunDays: 10 }))).toBe(true)
    expect(problemChanged(p, fixtureProblem({ target: { lat: -89.4, lon: 1 } }))).toBe(true)
    expect(problemChanged(p, fixtureProblem({ hardware: { ...p.hardware, maxNightH: 60 } }))).toBe(
      true,
    )
  })
})
