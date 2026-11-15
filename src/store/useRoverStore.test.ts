import { beforeEach, describe, expect, it } from 'vitest'
import { SITE_SEEDS } from '../config/sites.ts'
import { applyUrl, stateToSearch } from '../hooks/useUrlSync.ts'
import { PLAN_DEFAULTS } from '../astro/plannerTypes.ts'
import { SAMPLING_DEFAULTS } from '../astro/traverse.ts'
import { useMissionStore } from './useMissionStore.ts'
import { ROVER_STORAGE_KEY, loadRoverSampling, useRoverStore } from './useRoverStore.ts'

const rover = () => useRoverStore.getState()

beforeEach(() => {
  localStorage.clear()
  useRoverStore.setState({
    autoDeploy: 'no',
    speed: 600,
    tMs: 0,
    roverId: 'rover',
    cam: 'follow',
    ...loadRoverSampling(),
  })
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

describe('rover egress phase', () => {
  it('a restart or a new rover rolls down the ramps; seeking skips them', () => {
    rover().setPhase('drive')
    rover().restart()
    expect(rover().phase).toBe('egress')
    rover().seekTo(60_000)
    expect(rover().phase).toBe('drive')
    rover().setRover('csa-rover')
    expect(rover().phase).toBe('egress')
  })
})

describe('sampling inputs', () => {
  it('start from the defaults shared with the planner and clamp to their limits', () => {
    expect(rover().samples).toBe(SAMPLING_DEFAULTS.samples)
    expect(rover().sampleH).toBe(SAMPLING_DEFAULTS.sampleH)
    expect(PLAN_DEFAULTS).toMatchObject({ samples: rover().samples, sampleH: rover().sampleH })
    rover().setSamples(99)
    expect(rover().samples).toBe(10)
    rover().setSamples(0)
    expect(rover().samples).toBe(1)
    rover().setSamples(4.4)
    expect(rover().samples).toBe(4)
    rover().setSampleH(0.1)
    expect(rover().sampleH).toBe(0.5)
    rover().setSampleH(40)
    expect(rover().sampleH).toBe(6)
    rover().setSampleH(1.5)
    expect(rover().sampleH).toBe(1.5)
    rover().setSamples(NaN)
    expect(rover().samples).toBe(SAMPLING_DEFAULTS.samples)
  })

  it('a change is another trip (the playback starts over); the same value is not', () => {
    rover().publishT(5000)
    rover().setPhase('drive')
    const run = rover().run
    rover().setSamples(rover().samples)
    rover().setSampleH(rover().sampleH)
    expect(rover().run).toBe(run)
    expect(rover().tMs).toBe(5000)
    rover().setSamples(5)
    expect(rover()).toMatchObject({ samples: 5, tMs: 0, run: run + 1, phase: 'egress' })
    rover().publishT(5000)
    rover().setSampleH(1)
    expect(rover()).toMatchObject({ sampleH: 1, tMs: 0, run: run + 2 })
  })

  it('are remembered between visits, and garbage is ignored', () => {
    rover().setSamples(7)
    rover().setSampleH(3.5)
    expect(JSON.parse(localStorage.getItem(ROVER_STORAGE_KEY)!)).toEqual({
      samples: 7,
      sampleH: 3.5,
    })
    expect(ROVER_STORAGE_KEY).toBe('lumen3d.rover')
    expect(loadRoverSampling()).toEqual({ samples: 7, sampleH: 3.5 })
    localStorage.setItem(ROVER_STORAGE_KEY, '{"samples":"x","sampleH":99}')
    expect(loadRoverSampling()).toEqual({ samples: SAMPLING_DEFAULTS.samples, sampleH: 6 })
    localStorage.setItem(ROVER_STORAGE_KEY, 'not json')
    expect(loadRoverSampling()).toEqual({ ...SAMPLING_DEFAULTS })
    localStorage.removeItem(ROVER_STORAGE_KEY)
    expect(loadRoverSampling()).toEqual({ ...SAMPLING_DEFAULTS })
  })
})
