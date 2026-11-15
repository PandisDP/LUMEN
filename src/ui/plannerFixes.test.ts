import { beforeEach, describe, expect, it } from 'vitest'
import { useMissionStore } from '../store/useMissionStore.ts'
import { usePlannerStore } from '../store/usePlannerStore.ts'
import { useRoverStore } from '../store/useRoverStore.ts'
import { type PlanFixInputs, applyPlanFix, planFixes } from './plannerFixes.ts'

const planner = { days: 30, minSunDays: 15, minRoverSocPct: 20, radiusM: 2000 }
const inputs: PlanFixInputs = {
  ...planner,
  roverId: 'csa-rover',
  samples: 3,
  sampleH: 2,
  missionDays: 14,
}
const micro: PlanFixInputs = { ...inputs, roverId: 'rover' }

describe('planFixes', () => {
  it('orders the fixes by the dominant violation, without repeats', () => {
    expect(planFixes(['short-light', 'no-sun-at-landing', 'slope'], inputs)).toEqual([
      { id: 'lowerSun', value: 10 },
      { id: 'widenRange', value: 60 },
      { id: 'widenRadius', value: 3000 },
    ])
    expect(planFixes(['rover-battery'], inputs)).toEqual([
      { id: 'lowerSoc', value: 10 },
      { id: 'fewerSamples', value: 2 },
    ])
    expect(planFixes(['rover-unreachable'], inputs)).toEqual([{ id: 'narrowRadius', value: 1000 }])
  })

  it('skips inputs already at their limit and never widens and narrows at once', () => {
    const maxed = { ...inputs, days: 90, minSunDays: 3, minRoverSocPct: 0, radiusM: 3000 }
    expect(planFixes(['short-light', 'no-route', 'rover-unreachable'], maxed)).toEqual([
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

  it('offers the utility rover only while the micro-rover is selected', () => {
    expect(planFixes(['rover-samples'], micro).map((f) => f.id)).toEqual([
      'switchRover',
      'fewerSamples',
      'shorterSample',
    ])
    expect(planFixes(['rover-samples'], inputs).map((f) => f.id)).toEqual([
      'fewerSamples',
      'shorterSample',
    ])
    expect(planFixes(['rover-no-return'], micro).map((f) => f.id)).toEqual([
      'switchRover',
      'fewerSamples',
      'narrowRadius',
    ])
    expect(planFixes(['rover-battery'], micro).map((f) => f.id)).toEqual([
      'switchRover',
      'lowerSoc',
      'fewerSamples',
    ])
  })

  it('takes one sample or half an hour off at a time, down to the limits', () => {
    expect(planFixes(['rover-samples'], { ...inputs, samples: 2, sampleH: 1 })).toEqual([
      { id: 'fewerSamples', value: 1 },
      { id: 'shorterSample', value: 0.5 },
    ])
    expect(planFixes(['rover-samples'], { ...inputs, samples: 1, sampleH: 0.5 })).toEqual([])
    // Three buttons at most, whatever the list of causes.
    expect(planFixes(['rover-samples', 'rover-no-return', 'rover-late'], micro)).toHaveLength(3)
  })

  it('a late return offers a week more of mission, up to the longest one', () => {
    expect(planFixes(['rover-late'], inputs)).toEqual([
      { id: 'longerMission', value: 21 },
      { id: 'fewerSamples', value: 2 },
    ])
    expect(planFixes(['rover-late'], { ...inputs, missionDays: 362 })[0]).toEqual({
      id: 'longerMission',
      value: 365,
    })
    expect(planFixes(['rover-late'], { ...inputs, missionDays: 365 })).toEqual([
      { id: 'fewerSamples', value: 2 },
    ])
  })
})

describe('applyPlanFix', () => {
  beforeEach(() => {
    usePlannerStore.setState({ ...planner, fromMs: Date.UTC(2027, 2, 1), status: 'done' })
    useMissionStore.getState().reset()
    const r = useRoverStore.getState()
    r.setRover('rover')
    r.setSamples(3)
    r.setSampleH(2)
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

  it('the round-trip fixes change the rover, its workload and the mission length', () => {
    applyPlanFix({ id: 'fewerSamples', value: 2 })
    applyPlanFix({ id: 'shorterSample', value: 1.5 })
    applyPlanFix({ id: 'switchRover', value: 0 })
    applyPlanFix({ id: 'longerMission', value: 21 })
    expect(useRoverStore.getState()).toMatchObject({
      roverId: 'csa-rover',
      samples: 2,
      sampleH: 1.5,
    })
    expect(useMissionStore.getState().missionDays).toBe(21)
    expect(usePlannerStore.getState().status).toBe('done')
  })
})
