import { beforeEach, describe, expect, it } from 'vitest'
import { SITE_SEEDS } from '../config/sites.ts'
import { applyUrl, stateToSearch } from '../hooks/useUrlSync.ts'
import { useMissionStore } from './useMissionStore.ts'
import { useRoverStore } from './useRoverStore.ts'

const rover = () => useRoverStore.getState()

beforeEach(() => {
  useRoverStore.setState({ autoDeploy: 'no', speed: 600, tMs: 0, roverId: 'rover', cam: 'follow' })
  const s = useMissionStore.getState()
  s.reset()
  s.setSites(
    SITE_SEEDS.map((x) => ({ ...x, heightM: 0, accuracy: 'spherical', hasTerrain: false })),
  )
})

describe('rover store', () => {
  it('accepts only the listed speeds and restarts when the rover changes', () => {
    rover().setSpeed(3600)
    expect(rover().speed).toBe(3600)
    rover().setSpeed(7)
    expect(rover().speed).toBe(3600)
    rover().publishT(5000)
    const run = rover().run
    rover().setRover('csa-rover')
    expect(rover().roverId).toBe('csa-rover')
    expect(rover().tMs).toBe(0)
    expect(rover().run).toBe(run + 1)
  })

  it('seeking moves the published clock', () => {
    rover().seekTo(120_000)
    expect(rover().tMs).toBe(120_000)
    expect(rover().seek?.tMs).toBe(120_000)
  })
})

describe('rover in the URL', () => {
  it('writes rover=1 only while the rover drives, and a link skips the descent', () => {
    const s = useMissionStore.getState()
    s.setView('landing')
    expect(stateToSearch()).not.toContain('rover=')
    s.setLanderCam('rover')
    const search = stateToSearch()
    expect(search).toContain('rover=1')
    s.reset()
    applyUrl(search)
    expect(useMissionStore.getState().view).toBe('landing')
    expect(rover().autoDeploy).toBe('skip-descent')
  })
})
