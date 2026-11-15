import { beforeEach, describe, expect, it } from 'vitest'
import { DESCENT_DURATION_S } from '../astro/descent.ts'
import { useDescentStore } from './useDescentStore.ts'

const state = () => useDescentStore.getState()

beforeEach(() => {
  useDescentStore.setState({ mode: 'physics', vehicleId: 'clps', landed: false, t: 0 })
})

describe('descent store', () => {
  it('starts with the physical model and the kinematic duration until a flight is published', () => {
    expect(state().mode).toBe('physics')
    expect(state().flight.durationS).toBe(DESCENT_DURATION_S)
    expect(state().flight.summary).toBeNull()
  })

  it('changing the model or the vehicle restarts the descent', () => {
    state().land()
    const run = state().run
    state().setMode('kinematic')
    expect(state().mode).toBe('kinematic')
    expect(state().landed).toBe(false)
    expect(state().run).toBe(run + 1)
    state().setVehicle('heavy')
    expect(state().vehicleId).toBe('heavy')
    expect(state().run).toBe(run + 2)
    state().setVehicle('unknown')
    expect(state().vehicleId).toBe('heavy')
    expect(state().run).toBe(run + 2)
  })
})
