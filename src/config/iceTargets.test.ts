import { describe, expect, it } from 'vitest'
import { destination } from '../astro/frames.ts'
import { type SiteInfo, customSiteInfo } from '../data/catalog.ts'
import { iceTargetsOf, tileForPoint } from './iceTargets.ts'
import { SITE_SEEDS } from './sites.ts'

const seed = (id: string) => SITE_SEEDS.find((s) => s.id === id)!
const site = (id: string, patch: Partial<SiteInfo> = {}): SiteInfo => ({
  ...seed(id),
  heightM: 0,
  accuracy: 'lola',
  hasTerrain: true,
  ...patch,
})
const ice = { straightM: 900, routeM: 1000, maxSlopeDeg: 10, reachable: true, insidePsr: false }
const rim = site('shackleton-rim', {
  ice: { ...ice, roverMaxSlopeDeg: 20, target: { lat: -89.4044, lon: -140.0766 } },
})
const ridge = site('connecting-ridge', { ice: { ...ice, roverMaxSlopeDeg: 20 } })
const floor = site('shackleton-floor', {
  ice: { ...ice, straightM: 0, routeM: 0, insidePsr: true, roverMaxSlopeDeg: 20 },
})
const outOfReach = site('change-7', {
  ice: {
    straightM: null,
    routeM: null,
    maxSlopeDeg: null,
    reachable: false,
    insidePsr: false,
    roverMaxSlopeDeg: 20,
  },
})
const reference = site('apollo-11', { accuracy: 'lola-global' })
const noData = site('haworth', { hasTerrain: false, accuracy: 'spherical' })
const sites = [rim, ridge, floor, outOfReach, reference, noData, customSiteInfo(-89.4, -137)]

describe('iceTargetsOf', () => {
  it('offers the ice next to each site that reaches it and the shadowed floors', () => {
    expect(iceTargetsOf(sites)).toEqual([
      {
        id: 'near-site:shackleton-rim',
        siteId: 'shackleton-rim',
        tileSiteId: 'shackleton-rim',
        lat: -89.4044,
        lon: -140.0766,
        kind: 'near-site',
        routeM: 1000,
      },
      {
        // No published end of route: the site stands in for it.
        id: 'near-site:connecting-ridge',
        siteId: 'connecting-ridge',
        tileSiteId: 'connecting-ridge',
        lat: ridge.lat,
        lon: ridge.lon,
        kind: 'near-site',
        routeM: 1000,
      },
      {
        id: 'psr-floor:shackleton-floor',
        siteId: 'shackleton-floor',
        tileSiteId: 'shackleton-floor',
        lat: floor.lat,
        lon: floor.lon,
        kind: 'psr-floor',
        routeM: 0,
      },
    ])
    expect(iceTargetsOf([])).toEqual([])
  })
})

describe('tileForPoint', () => {
  it('names the curated tile around a point, with room for the search radius', () => {
    expect(tileForPoint(sites, rim.lat, rim.lon)).toBe('shackleton-rim')
    expect(tileForPoint(sites, -89.4044, -140.0766)).toBe('shackleton-rim')
    const near = destination(rim.lat, rim.lon, 90, 4000)
    expect(tileForPoint(sites, near.lat, near.lon)).toBe('shackleton-rim')
    // 6 km out there is room for a 1 km search but not for a 3 km one.
    const edge = destination(ridge.lat, ridge.lon, 0, 6000)
    expect(tileForPoint(sites, edge.lat, edge.lon, 1000)).toBe('connecting-ridge')
    expect(tileForPoint(sites, edge.lat, edge.lon)).toBeNull()
  })

  it('ignores sites without a polar tile and an illumination map', () => {
    expect(tileForPoint(sites, reference.lat, reference.lon)).toBeNull()
    expect(tileForPoint(sites, noData.lat, noData.lon)).toBeNull()
    expect(tileForPoint(sites, -80, 100)).toBeNull()
  })
})
