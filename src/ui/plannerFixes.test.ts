import { beforeEach, describe, expect, it } from 'vitest'
import { usePlannerStore } from '../store/usePlannerStore.ts'
import { applyPlanFix, planFixes } from './plannerFixes.ts'

const inputs = { days: 30, minSunDays: 15, minRoverSocPct: 20, radiusM: 2000 }

describe('planFixes', () => {
  it('orders the fixes by the dominant violation, without repeats', () => {
    expect(planFixes(['short-light', 'no-sun-at-landing', 'slope'], inputs)).toEqual([
      { id: 'lowerSun', value: 10 },
      { id: 'widenRange', value: 60 },
      { id: 'widenRadius', value: 3000 },
    ])
    expect(planFixes(['rover-battery'], inputs)).toEqual([
      { id: 'lowerSoc', value: 10 },
      { id: 'narrowRadius', value: 1000 },
    ])
  })

  it('skips inputs already at their limit and never widens and narrows at once', () => {
    const maxed = { days: 90, minSunDays: 3, minRoverSocPct: 0, radiusM: 3000 }
    expect(planFixes(['short-light', 'no-route', 'rover-battery'], maxed)).toEqual([
      { id: 'lowerSun', value: 0 },
      { id: 'narrowRadius', value: 2000 },
    ])
    expect(planFixes(['no-route', 'rover-unreachable'], inputs)).toEqual([
      { id: 'widenRadius', value: 3000 },
    ])
    expect(planFixes(['night'], { ...inputs, days: 75 })).toEqual([{ id: 'widenRange', value: 90 }])
  })

  it('with no diagnosis it offers the three that open the search most', () => {
    expect(planFixes([], inputs).map((f) => f.id)).toEqual([
      'widenRange',
      'lowerSun',
      'widenRadius',
    ])
  })
})

describe('applyPlanFix', () => {
  beforeEach(() => {
    usePlannerStore.setState({ ...inputs, fromMs: Date.UTC(2027, 2, 1), status: 'done' })
  })

  it('changes the input and launches nothing', () => {
    applyPlanFix({ id: 'widenRange', value: 60 })
    applyPlanFix({ id: 'lowerSun', value: 10 })
    applyPlanFix({ id: 'widenRadius', value: 3000 })
    applyPlanFix({ id: 'lowerSoc', value: 10 })
    const s = usePlannerStore.getState()
    expect(s).toMatchObject({ days: 60, minSunDays: 10, radiusM: 3000, minRoverSocPct: 10 })
    expect(s.fromMs).toBe(Date.UTC(2027, 2, 1))
    expect(s.status).toBe('done')
  })
})
