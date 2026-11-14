import { beforeEach, describe, expect, it } from 'vitest'
import { SITE_SEEDS } from '../config/sites.ts'
import { applyUrl, parseScenarioList, stateToSearch } from '../hooks/useUrlSync.ts'
import {
  MISSION_DAYS,
  defaultParams,
  maxMissionDays,
  sanitizeParams,
  selectActiveScenario,
  useMissionStore,
} from './useMissionStore.ts'
import { useUiStore } from './useUiStore.ts'

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

describe('mission settings per scenario', () => {
  it('the top-level fields mirror the active scenario', () => {
    state().setMissionDays(30)
    state().setEnergyPreset('rover')
    expect(selectActiveScenario(state()).missionDays).toBe(30)
    expect(selectActiveScenario(state()).energyId).toBe('rover')
    state().addScenario()
    state().setMissionDays(5)
    const [a, b] = state().scenarios
    expect(a.missionDays).toBe(30)
    expect(b.missionDays).toBe(5)
    state().setActive(a.id)
    expect(state().missionDays).toBe(30)
    state().setActive(b.id)
    expect(state().missionDays).toBe(5)
  })

  it('addScenario takes a patch with any field, including the site', () => {
    state().addScenario({ siteId: 'cabeus', missionDays: 40, scienceWeight: 0.5 })
    const sc = selectActiveScenario(state())
    expect(sc.siteId).toBe('cabeus')
    expect(sc.missionDays).toBe(40)
    expect(sc.scienceWeight).toBe(0.5)
    // The source scenario is untouched.
    expect(state().scenarios[0].missionDays).toBe(MISSION_DAYS.default)
  })

  it('updateScenario edits a non-active scenario without touching the mirror', () => {
    state().addScenario()
    const [a] = state().scenarios
    state().updateScenario(a.id, { hardwareLimits: { ...a.hardwareLimits, maxSlopeDeg: 8 } })
    expect(state().scenarios[0].hardwareLimits.maxSlopeDeg).toBe(8)
    expect(state().hardwareLimits.maxSlopeDeg).toBe(defaultParams().hardwareLimits.maxSlopeDeg)
  })

  it('updateScenario rejects unknown sites and clamps numbers', () => {
    const id = state().activeId
    state().updateScenario(id, { siteId: 'atlantis', missionDays: 999, linkMarginDeg: -4 })
    const sc = selectActiveScenario(state())
    expect(sc.siteId).toBe('shackleton-rim')
    expect(sc.missionDays).toBe(MISSION_DAYS.max)
    expect(sc.linkMarginDeg).toBe(0)
  })

  it('duplicateScenario copies every setting, inserted after the source', () => {
    state().setMissionDays(21)
    state().addScenario({ siteId: 'cabeus' })
    const first = state().scenarios[0]
    state().duplicateScenario(first.id)
    const list = state().scenarios
    expect(list).toHaveLength(3)
    expect(list[1].siteId).toBe(first.siteId)
    expect(list[1].missionDays).toBe(21)
    expect(list[1].id).not.toBe(first.id)
    expect(state().activeId).toBe(list[1].id)
  })

  it('editing energy marks the profile as custom', () => {
    state().updateEnergy({ batteryWh: 1234 })
    expect(state().energyId).toBe('custom')
    expect(selectActiveScenario(state()).energy.batteryWh).toBe(1234)
  })

  it('the shared clock runs to the longest mission', () => {
    state().setMissionDays(5)
    state().addScenario({ missionDays: 20 })
    expect(maxMissionDays(state())).toBe(20)
    state().setOffset(1e6)
    expect(state().offsetH).toBe(20 * 24)
    state().removeScenario(state().activeId)
    expect(state().offsetH).toBe(5 * 24)
  })

  it('presets apply their settings to each scenario they build', () => {
    state().applyPreset({
      id: 't',
      titleKey: 'presets.csaRover.title',
      descKey: 'presets.csaRover.desc',
      build: ({ startMs }) => ({
        scenarios: [
          { siteId: 'cabeus', startMs },
          { siteId: 'connecting-ridge', startMs, missionDays: 7 },
        ],
        missionDays: 30,
        energyId: 'rover',
      }),
    })
    const [a, b] = state().scenarios
    expect(a.missionDays).toBe(30)
    expect(b.missionDays).toBe(7)
    expect(a.energyId).toBe('rover')
    expect(b.energyId).toBe('rover')
  })

  it('sanitizeParams ignores junk', () => {
    const base = defaultParams()
    const out = sanitizeParams(
      { missionDays: Number.NaN, energyId: 'nope', scienceWeight: '1' as unknown as number },
      base,
    )
    expect(out).toEqual(base)
  })
})

describe('per-scenario settings in the URL', () => {
  it('round-trips settings that differ between scenarios', () => {
    const t = Date.UTC(2027, 2, 1)
    state().setScenarios([
      { siteId: 'connecting-ridge', startMs: t },
      { siteId: 'cabeus', startMs: t, missionDays: 30, energyId: 'rover', scienceWeight: 0.3 },
    ])
    state().updateScenario(state().scenarios[1].id, {
      hardwareLimits: { maxSlopeDeg: 8, maxNightH: 50, minDtePct: 30, roverMaxSlopeDeg: 20 },
      linkMarginDeg: 6,
    })
    const search = stateToSearch()
    state().reset()
    state().setSites(sites)
    applyUrl(search)
    const [a, b] = state().scenarios
    expect(a.missionDays).toBe(MISSION_DAYS.default)
    expect(b).toMatchObject({
      siteId: 'cabeus',
      missionDays: 30,
      energyId: 'rover',
      scienceWeight: 0.3,
      linkMarginDeg: 6,
    })
    expect(b.hardwareLimits).toMatchObject({ maxSlopeDeg: 8, maxNightH: 50 })
  })

  it('custom energy profiles survive inside the scenario list', () => {
    const t = Date.UTC(2027, 2, 1)
    state().setScenarios([
      { siteId: 'connecting-ridge', startMs: t },
      { siteId: 'cabeus', startMs: t },
    ])
    state().setActive(state().scenarios[1].id)
    state().updateEnergy({ batteryWh: 4321 })
    state().setActive(state().scenarios[0].id)
    const list = parseScenarioList(new URLSearchParams(stateToSearch()).get('s')!)
    expect(list[1].energyId).toBe('custom')
    expect(list[1].energy?.batteryWh).toBe(4321)
  })

  it('old links (top-level settings only) apply them to every scenario', () => {
    applyUrl('?s=cabeus@2027-03-01T00:00Z,nobile-rim@2027-03-01T00:00Z&days=25&en=rover')
    expect(state().scenarios.map((s) => s.missionDays)).toEqual([25, 25])
    expect(state().scenarios.map((s) => s.energyId)).toEqual(['rover', 'rover'])
  })

  it('a shared link skips the welcome', () => {
    useUiStore.setState({ stage: 'welcome' })
    applyUrl('?site=cabeus')
    expect(useUiStore.getState().stage).toBe('explore')
  })
})
