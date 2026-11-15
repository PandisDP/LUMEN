import { beforeEach, describe, expect, it } from 'vitest'
import { SITE_SEEDS } from '../config/sites.ts'
import { customSiteInfo } from '../data/catalog.ts'
import { useMissionStore } from '../store/useMissionStore.ts'
import { useUiStore } from '../store/useUiStore.ts'
import { applyUrl, parseScenarioList, stateToSearch } from './useUrlSync.ts'

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

describe('URL state', () => {
  it('round-trips several scenarios, the active one, Compare and the link margin', () => {
    const t = Date.UTC(2027, 2, 1)
    state().setSites([...sites, customSiteInfo(-89.1, 20)])
    state().setScenarios(
      [
        { siteId: 'connecting-ridge', startMs: t },
        { siteId: 'shackleton-floor', startMs: t + 86_400_000 },
        { siteId: 'custom:-89.1000:20.0000', startMs: t },
      ],
      1,
    )
    state().setLinkMargin(5)
    state().setCompareOpen(true)
    const search = stateToSearch()

    state().reset()
    state().setSites(sites)
    applyUrl(search)
    const s = state()
    // The custom site is registered from its id, so the third scenario survives.
    expect(s.scenarios.map((x) => x.siteId)).toEqual([
      'connecting-ridge',
      'shackleton-floor',
      'custom:-89.1000:20.0000',
    ])
    expect(s.scenarios[1].startMs).toBe(t + 86_400_000)
    expect(s.activeId).toBe(s.scenarios[1].id)
    expect(s.linkMarginDeg).toBe(5)
    expect(s.compareOpen).toBe(true)
  })

  it('round-trips the audience and ignores unknown modes', () => {
    useUiStore.setState({ audience: 'educator' })
    const search = stateToSearch()
    expect(search).toContain('mode=educator')
    useUiStore.setState({ audience: 'planner' })
    applyUrl(search)
    expect(useUiStore.getState().audience).toBe('educator')
    applyUrl('?site=cabeus&mode=hacker')
    expect(useUiStore.getState().audience).toBe('educator')
  })

  it('round-trips the DSN requirement, top level and per scenario', () => {
    expect(stateToSearch()).not.toContain('dsn=')
    state().setRequireDsn(true)
    const search = stateToSearch()
    expect(search).toContain('dsn=1')
    state().reset()
    state().setSites(sites)
    applyUrl(search)
    expect(state().requireDsn).toBe(true)

    const t = Date.UTC(2027, 2, 1)
    state().setScenarios(
      [
        { siteId: 'cabeus', startMs: t, requireDsn: true },
        { siteId: 'haworth', startMs: t, requireDsn: false, missionDays: 20 },
      ],
      0,
    )
    const multi = stateToSearch()
    state().reset()
    state().setSites(sites)
    applyUrl(multi)
    expect(state().scenarios.map((x) => x.requireDsn)).toEqual([true, false])
    expect(state().scenarios[1].missionDays).toBe(20)
  })

  it('keeps the single-scenario format working', () => {
    applyUrl('?site=cabeus&date=2027-05-01T00:00Z&days=20')
    expect(state().scenarios).toHaveLength(1)
    expect(state().scenarios[0].siteId).toBe('cabeus')
    expect(state().missionDays).toBe(20)
  })

  it('round-trips the landing view and its approach azimuth', () => {
    state().setView('landing')
    state().setApproachAz(450)
    const search = stateToSearch()
    expect(search).toContain('view=landing')
    expect(search).toContain('ap=90')
    state().reset()
    applyUrl(search)
    expect(state().view).toBe('landing')
    expect(state().approachAz).toBe(90)

    state().reset()
    expect(stateToSearch()).not.toContain('ap=')
    applyUrl('?view=landing&ap=nope')
    expect(state().approachAz).toBeNull()
  })

  it('ignores malformed scenario entries', () => {
    expect(parseScenarioList('a@nope,b@2027-01-01T00:00Z,@2027-01-01T00:00Z')).toEqual([
      { siteId: 'b', startMs: Date.UTC(2027, 0, 1) },
    ])
  })
})

describe('energy profile in the URL', () => {
  it('round-trips a preset and a custom profile', () => {
    state().setEnergyPreset('rover')
    let search = stateToSearch()
    expect(search).toContain('en=rover')
    state().reset()
    applyUrl(search)
    expect(state().energyId).toBe('rover')

    state().updateEnergy({ batteryWh: 2222, panel: 'horizontal' })
    search = stateToSearch()
    state().reset()
    applyUrl(search)
    expect(state().energyId).toBe('custom')
    expect(state().energy.batteryWh).toBe(2222)
    expect(state().energy.panel).toBe('horizontal')
  })

  it('rejects malformed custom profiles', async () => {
    const { decodeProfile } = await import('../config/energyProfiles.ts')
    expect(decodeProfile('solar,0,1,2,3,4,5,6')).toBeNull()
    expect(decodeProfile('tracking,0,1,2')).toBeNull()
    expect(decodeProfile('tracking,0,-1,2,3,4,5,6')).toBeNull()
    expect(decodeProfile('tracking,0,100,500,50,10,200,50')?.hibernateBelowPct).toBe(100)
  })
})

describe('hardware limits and science weight in the URL', () => {
  it('omits defaults and round-trips custom values', () => {
    expect(stateToSearch()).not.toContain('hw=')
    expect(stateToSearch()).not.toContain('sci=')
    state().setHardwareLimits({ maxSlopeDeg: 8, maxNightH: 50 })
    state().setScienceWeight(0.3)
    const search = stateToSearch()
    expect(search).toContain('hw=8%2C50%2C30%2C20')
    state().reset()
    applyUrl(search)
    expect(state().hardwareLimits).toMatchObject({ maxSlopeDeg: 8, maxNightH: 50, minDtePct: 30 })
    expect(state().scienceWeight).toBe(0.3)
  })

  it('clamps hostile values', () => {
    applyUrl('?hw=999,-5,500,1&sci=7')
    expect(state().hardwareLimits).toEqual({
      maxSlopeDeg: 30,
      maxNightH: 1,
      minDtePct: 100,
      roverMaxSlopeDeg: 5,
    })
    expect(state().scienceWeight).toBe(1)
  })
})

describe('ice target of a planner pick in the URL', () => {
  const t = Date.UTC(2027, 2, 1)
  const pick = customSiteInfo(-89.4403, -137.4833)
  const target = { lat: -89.40444, lon: -140.07663 }
  const rounded = { lat: -89.4044, lon: -140.0766 }

  it("round-trips the active scenario's target as a top-level key", () => {
    expect(stateToSearch()).not.toContain('ice=')
    state().addCustomSite(pick)
    state().updateScenario(state().activeId, { startMs: t, iceTarget: target })
    const search = stateToSearch()
    expect(new URLSearchParams(search).get('ice')).toBe('-89.4044,-140.0766')

    state().reset()
    state().setSites(sites)
    applyUrl(search)
    const sc = state().scenarios[0]
    expect(sc.siteId).toBe(pick.id)
    expect(sc.iceTarget).toEqual(rounded)
    // Stable from here on: what is read back is what is written.
    expect(stateToSearch()).toBe(search)
  })

  it('drops it with the site and ignores malformed values', () => {
    state().addCustomSite(pick)
    state().updateScenario(state().activeId, { iceTarget: target })
    state().selectSite('cabeus')
    expect(stateToSearch()).not.toContain('ice=')
    for (const bad of ['nope', '-89.4', '-89.4,', '95,10', '-89.4,190', '1,2,3', ','])
      applyUrl(`?site=cabeus&ice=${bad}`)
    expect(state().scenarios[0].iceTarget).toBeUndefined()
    applyUrl('?site=cabeus&ice=-84.7,-48.5')
    expect(state().scenarios[0].iceTarget).toEqual({ lat: -84.7, lon: -48.5 })
    // A link to another site without a target clears it.
    applyUrl('?site=haworth')
    expect(state().scenarios[0].iceTarget).toBeUndefined()
  })

  it('round-trips a target per scenario in Compare, next to the other overrides', () => {
    const other = customSiteInfo(-89.4356, -137.5574)
    state().setSites([...sites, pick, other])
    state().setScenarios(
      [
        { siteId: pick.id, startMs: t, iceTarget: target },
        { siteId: 'cabeus', startMs: t, missionDays: 20, linkMarginDeg: 3 },
        { siteId: other.id, startMs: t + 86_400_000, iceTarget: { lat: 12.5, lon: 45.6789 } },
      ],
      0,
    )
    const search = stateToSearch()
    const p = new URLSearchParams(search)
    expect(p.has('ice')).toBe(false)
    const items = p.get('s')!.split(',')
    expect(items[0]).toMatch(/~i-89\.4044_-140\.0766$/)
    expect(items[1]).not.toContain('~i')
    expect(items[2]).toContain('~i12.5000_45.6789')

    state().reset()
    state().setSites(sites)
    applyUrl(search)
    const sc = state().scenarios
    expect(sc.map((x) => x.siteId)).toEqual([pick.id, 'cabeus', other.id])
    expect(sc.map((x) => x.iceTarget)).toEqual([rounded, undefined, { lat: 12.5, lon: 45.6789 }])
    // The neighbouring tokens still decode: 'i' clashes with none of them.
    expect(sc[1].missionDays).toBe(20)
    expect(sc[1].linkMarginDeg).toBe(3)
    expect(sc[0].missionDays).not.toBe(20)
    expect(stateToSearch()).toBe(search)
  })

  it('parses the token on its own and skips a broken one', () => {
    expect(parseScenarioList('cabeus@2027-03-01T00:00Z~i-84.7_-48.5~d30')).toEqual([
      { siteId: 'cabeus', startMs: t, iceTarget: { lat: -84.7, lon: -48.5 }, missionDays: 30 },
    ])
    expect(parseScenarioList('cabeus@2027-03-01T00:00Z~ixx~l2')).toEqual([
      { siteId: 'cabeus', startMs: t, linkMarginDeg: 2 },
    ])
  })
})
