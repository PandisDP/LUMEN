import { beforeEach, describe, expect, it } from 'vitest'
import { PLAN_DEFAULTS, PLAN_MAX_DAYS } from '../astro/plannerTypes.ts'
import { loadPlannerInputs, usePlannerStore } from './usePlannerStore.ts'

const state = () => usePlannerStore.getState()

beforeEach(() => {
  localStorage.clear()
  usePlannerStore.setState({ ...loadPlannerInputs(), picked: [], selectedDayMs: null })
})

describe('planner store', () => {
  it('starts from the defaults and clamps the range', () => {
    expect(state().days).toBe(PLAN_DEFAULTS.days)
    expect(state().minSunDays).toBe(PLAN_DEFAULTS.minSunDays)
    state().setRange(Date.UTC(2027, 2, 1), 500)
    expect(state().days).toBe(PLAN_MAX_DAYS)
    state().setRange(Date.UTC(2027, 2, 1), 0)
    expect(state().days).toBe(1)
  })

  it('remembers the inputs between visits and ignores garbage', () => {
    state().setTarget({ lat: -89.4, lon: -137.2 }, 'shackleton-rim')
    state().setRange(Date.UTC(2027, 2, 1), 21)
    state().setMinSunDays(7)
    state().setRadius(3000)
    const saved = loadPlannerInputs()
    expect(saved.target).toEqual({ lat: -89.4, lon: -137.2 })
    expect(saved.tileSiteId).toBe('shackleton-rim')
    expect(saved.days).toBe(21)
    expect(saved.minSunDays).toBe(7)
    expect(saved.radiusM).toBe(3000)
    localStorage.setItem('lumen3d.planner', '{"days":"x","radiusM":7,"target":{"lat":200}}')
    const bad = loadPlannerInputs()
    expect(bad.days).toBe(PLAN_DEFAULTS.days)
    expect(bad.radiusM).toBe(PLAN_DEFAULTS.radiusM)
    expect(bad.target).toBeNull()
    localStorage.setItem('lumen3d.planner', 'not json')
    expect(loadPlannerInputs().target).toBeNull()
  })

  it('keeps at most four days picked for Compare, toggling', () => {
    for (const d of [1, 2, 3, 4, 5]) state().togglePicked(d)
    expect(state().picked).toEqual([2, 3, 4, 5])
    state().togglePicked(3)
    expect(state().picked).toEqual([2, 4, 5])
  })

  it('clearing the result keeps the inputs', () => {
    state().setTarget({ lat: -89, lon: 10 }, 'haworth')
    state().setRun({ status: 'done', progress: 1 })
    state().selectDay(123)
    state().clearResult()
    expect(state().status).toBe('idle')
    expect(state().selectedDayMs).toBeNull()
    expect(state().target).toEqual({ lat: -89, lon: 10 })
  })
})
