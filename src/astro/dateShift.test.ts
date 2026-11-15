import { describe, expect, it } from 'vitest'
import { DAY_MS } from './constants.ts'
import { SHIFT_DAYS, shiftScores } from './dateShift.ts'
import type { DateCandidate } from './metrics.ts'

const t0 = Date.UTC(2027, 2, 1)
const candidate = (day: number): DateCandidate => ({
  startMs: t0 + day * DAY_MS,
  energyPct: 50,
  dtePct: 50,
  longestDarkH: 0,
  sunAtLanding: true,
  earthAtLanding: true,
  maxSunEl: 1,
  meanSunElLit: 1,
  score: 50 + day,
})

describe('date shift', () => {
  it('picks the score at each slip around the landing date', () => {
    const sweep = Array.from({ length: 15 }, (_, i) => candidate(i - 7))
    const out = shiftScores(sweep, t0)
    expect(out.map((s) => s.days)).toEqual([...SHIFT_DAYS])
    expect(out.find((s) => s.days === 0)?.score).toBe(50)
    expect(out.find((s) => s.days === -7)?.score).toBe(43)
    expect(out.find((s) => s.days === 3)?.startMs).toBe(t0 + 3 * DAY_MS)
  })

  it('skips slips the sweep does not cover', () => {
    const out = shiftScores([candidate(0), candidate(1)], t0)
    expect(out.map((s) => s.days)).toEqual([0, 1])
  })
})
