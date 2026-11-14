import { beforeEach, describe, expect, it } from 'vitest'
import { SITE_SEEDS } from '../config/sites.ts'
import { customSiteInfo } from '../data/catalog.ts'
import { useMissionStore } from '../store/useMissionStore.ts'
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
