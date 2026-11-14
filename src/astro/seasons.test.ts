import { describe, expect, it } from 'vitest'
import { DAY_MS } from './constants.ts'
import type { DateCandidate } from './metrics.ts'
import { aggregateByMonth, extremeMonths } from './seasons.ts'

function candidate(startMs: number, patch: Partial<DateCandidate> = {}): DateCandidate {
  return {
    startMs,
    energyPct: 50,
    dtePct: 60,
    longestDarkH: 0,
    sunAtLanding: true,
    earthAtLanding: true,
    score: 70,
    maxSunEl: 1,
    meanSunElLit: 0.5,
    ...patch,
  }
}

describe('aggregateByMonth', () => {
  it('groups daily candidates by UTC month and averages them', () => {
    const jan1 = Date.UTC(2026, 0, 1)
    const list: DateCandidate[] = []
    // January: 31 days, alternating energy 40/60 and Sun up only on odd days.
    for (let i = 0; i < 31; i++)
      list.push(
        candidate(jan1 + i * DAY_MS, {
          energyPct: i % 2 ? 60 : 40,
          sunAtLanding: i % 2 === 1,
          maxSunEl: i === 10 ? 1.6 : 1,
        }),
      )
    // February: 3 days only.
    const feb1 = Date.UTC(2026, 1, 1)
    for (let i = 0; i < 3; i++)
      list.push(candidate(feb1 + i * DAY_MS, { energyPct: 10, dtePct: 100, maxSunEl: -0.5 }))

    const months = aggregateByMonth(list.reverse()) // order must not matter
    expect(months).toHaveLength(2)
    const [jan, feb] = months
    expect(jan).toMatchObject({ year: 2026, month: 0, startMs: jan1, days: 31 })
    expect(jan.energyPct).toBeCloseTo((16 * 40 + 15 * 60) / 31)
    expect(jan.dtePct).toBe(60)
    expect(jan.maxSunEl).toBe(1.6)
    expect(jan.sunAtLandingFrac).toBeCloseTo(15 / 31)
    expect(jan.firstSunlitMs).toBe(jan1 + DAY_MS)
    expect(feb).toMatchObject({ year: 2026, month: 1, days: 3, energyPct: 10, dtePct: 100 })
    expect(feb.maxSunEl).toBe(-0.5)
    expect(feb.sunAtLandingFrac).toBe(1)
    expect(feb.firstSunlitMs).toBe(feb1)
  })

  it('reports no sunlit day when the Sun is never up at touchdown', () => {
    const m = aggregateByMonth([candidate(Date.UTC(2027, 5, 3), { sunAtLanding: false })])
    expect(m[0].sunAtLandingFrac).toBe(0)
    expect(m[0].firstSunlitMs).toBeNull()
  })

  it('returns an empty list for no candidates', () => {
    expect(aggregateByMonth([])).toEqual([])
    expect(extremeMonths([])).toEqual({ best: -1, worst: -1 })
  })
})

describe('extremeMonths', () => {
  it('finds the months with the highest and lowest mean energy', () => {
    const months = aggregateByMonth([
      candidate(Date.UTC(2026, 0, 1), { energyPct: 30 }),
      candidate(Date.UTC(2026, 1, 1), { energyPct: 80 }),
      candidate(Date.UTC(2026, 2, 1), { energyPct: 55 }),
    ])
    expect(extremeMonths(months)).toEqual({ best: 1, worst: 0 })
  })
})
