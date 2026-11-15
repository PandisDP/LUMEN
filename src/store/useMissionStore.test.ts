import { beforeEach, describe, expect, it } from 'vitest'
import { SITE_SEEDS } from '../config/sites.ts'
import { customSiteInfo } from '../data/catalog.ts'
import {
  MAX_SCENARIOS,
  MISSION_DAYS,
  selectActiveScenario,
  useMissionStore,
} from './useMissionStore.ts'

const sites = SITE_SEEDS.map((s) => ({
  ...s,
  heightM: 0,
  accuracy: 'spherical' as const,
  hasTerrain: false,
}))
const state = () => useMissionStore.getState()

beforeEach(() => {
  state().reset()
  state().setSites(sites)
})

describe('scenarios', () => {
  it('starts with one scenario on the default site', () => {
    expect(state().scenarios).toHaveLength(1)
    expect(selectActiveScenario(state()).siteId).toBe('shackleton-rim')
  })

  it('duplicates the active scenario up to the maximum', () => {
    for (let i = 0; i < 10; i++) state().addScenario()
    expect(state().scenarios).toHaveLength(MAX_SCENARIOS)
    expect(state().activeId).toBe(state().scenarios[MAX_SCENARIOS - 1].id)
  })

  it('changes site and date only for the active scenario', () => {
    state().addScenario()
    state().selectSite('malapert-massif')
    state().setStart(Date.UTC(2027, 0, 1))
    const [a, b] = state().scenarios
    expect(a.siteId).toBe('shackleton-rim')
    expect(b.siteId).toBe('malapert-massif')
    expect(b.startMs).toBe(Date.UTC(2027, 0, 1))
  })

  it('rejects unknown sites and invalid dates', () => {
    state().selectSite('atlantis')
    state().setStart(Number.NaN)
    expect(selectActiveScenario(state()).siteId).toBe('shackleton-rim')
    expect(Number.isFinite(selectActiveScenario(state()).startMs)).toBe(true)
  })

  it('never removes the last scenario', () => {
    state().removeScenario(state().activeId)
    expect(state().scenarios).toHaveLength(1)
  })

  it('adds custom sites and selects them', () => {
    const custom = customSiteInfo(-88.5, -60)
    state().addCustomSite(custom)
    expect(state().sites.some((s) => s.id === custom.id)).toBe(true)
    expect(selectActiveScenario(state()).siteId).toBe(custom.id)
    expect(custom.accuracy).toBe('lola-480')
    expect(customSiteInfo(10, 10).accuracy).toBe('spherical')
  })
})

describe('time', () => {
  it('clamps the mission time to the analysis window', () => {
    state().setOffset(-5)
    expect(state().offsetH).toBe(0)
    state().setOffset(1e9)
    expect(state().offsetH).toBe(MISSION_DAYS.default * 24)
  })

  it('clamps the mission length and the offset with it', () => {
    state().setOffset(300)
    state().setMissionDays(5)
    expect(state().missionDays).toBe(5)
    expect(state().offsetH).toBe(120)
    state().setMissionDays(1000)
    expect(state().missionDays).toBe(MISSION_DAYS.max)
  })

  it('restarts playback from the landing when at the end', () => {
    state().setOffset(1e9)
    state().togglePlay()
    expect(state().playing).toBe(true)
    expect(state().offsetH).toBe(0)
  })

  it('only accepts listed playback speeds', () => {
    state().setSpeed(24)
    state().setSpeed(13)
    expect(state().speed).toBe(24)
  })

  it('look requests always change their nonce', () => {
    state().lookAt(10, 1)
    const first = state().look!.nonce
    state().lookAt(10, 1)
    expect(state().look!.nonce).toBe(first + 1)
  })
})

describe('presets', () => {
  it('delay preset compares the active site at +14 days and opens Compare', async () => {
    const { PRESETS } = await import('../config/presets.ts')
    const start = Date.UTC(2027, 2, 1)
    state().selectSite('malapert-massif')
    state().setStart(start)
    state().applyPreset(PRESETS.find((p) => p.id === 'delay-14d')!)
    const [a, b] = state().scenarios
    expect(state().scenarios).toHaveLength(2)
    expect(a.siteId).toBe('malapert-massif')
    expect(b.siteId).toBe('malapert-massif')
    expect(b.startMs - a.startMs).toBe(14 * 86_400_000)
    expect(state().compareOpen).toBe(true)
    expect(state().activeId).toBe(a.id)
  })

  it('every preset references known sites and fits in MAX_SCENARIOS', async () => {
    const { PRESETS } = await import('../config/presets.ts')
    for (const p of PRESETS) {
      state().reset()
      state().setSites(sites)
      const built = p.build({ siteId: 'shackleton-rim', startMs: Date.UTC(2027, 0, 1) })
      expect(built.scenarios.length).toBeLessThanOrEqual(MAX_SCENARIOS)
      state().applyPreset(p)
      expect(state().scenarios).toHaveLength(built.scenarios.length)
    }
  })

  it('setScenarios drops unknown sites and caps the list', () => {
    const t = Date.UTC(2027, 0, 1)
    const ok = state().setScenarios([
      { siteId: 'nope', startMs: t },
      ...Array.from({ length: 6 }, () => ({ siteId: 'cabeus', startMs: t })),
    ])
    expect(ok).toBe(true)
    expect(state().scenarios).toHaveLength(MAX_SCENARIOS)
    expect(state().scenarios.every((s) => s.siteId === 'cabeus')).toBe(true)
    expect(state().setScenarios([{ siteId: 'nope', startMs: t }])).toBe(false)
  })
})

describe('lunar day playback', () => {
  it('rewinds, stretches a short mission to one synodic day and plays', () => {
    const s = useMissionStore.getState()
    s.reset()
    s.setMissionDays(14)
    s.setOffset(100)
    s.playLunarDay()
    const after = useMissionStore.getState()
    expect(after.missionDays).toBe(30)
    expect(after.offsetH).toBe(0)
    expect(after.playing).toBe(true)
    expect(after.speed).toBe(24)
    // A longer mission is left as it is.
    after.setMissionDays(45)
    after.playLunarDay()
    expect(useMissionStore.getState().missionDays).toBe(45)
  })
})

describe('landing ellipse settings', () => {
  it('accepts only the listed aspect ratios', () => {
    const s = useMissionStore.getState()
    s.reset()
    expect(useMissionStore.getState().ellipseAspect).toBe(2)
    s.setEllipseAspect(3)
    expect(useMissionStore.getState().ellipseAspect).toBe(3)
    s.setEllipseAspect(7)
    expect(useMissionStore.getState().ellipseAspect).toBe(3)
  })
})
