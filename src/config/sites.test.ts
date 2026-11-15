/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SITE_ID, SITE_SEEDS, usesPolarProduct } from './sites.ts'

describe('curated sites', () => {
  it('have unique ids and valid coordinates', () => {
    const ids = SITE_SEEDS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const s of SITE_SEEDS) {
      expect(Math.abs(s.lat)).toBeLessThanOrEqual(90)
      expect(Math.abs(s.lon)).toBeLessThanOrEqual(180)
    }
    expect(ids).toContain(DEFAULT_SITE_ID)
  })

  it('include the main south pole targets', () => {
    for (const id of ['shackleton-rim', 'malapert-massif', 'haworth']) {
      expect(SITE_SEEDS.some((s) => s.id === id)).toBe(true)
    }
  })
})

// Integrity of the files produced by `npm run data` (skipped if they were not generated).
const indexPath = 'public/data/sites/index.json'
describe.skipIf(!existsSync(indexPath))('generated site data', () => {
  const index = JSON.parse(readFileSync(indexPath, 'utf8')) as {
    id: string
    hasTerrain: boolean
    accuracy: string
    heightM: number
  }[]

  it('covers every curated site', () => {
    expect(index.map((e) => e.id).sort()).toEqual(SITE_SEEDS.map((s) => s.id).sort())
  })

  it('every site has a full 360° mask and a terrain tile', () => {
    for (const e of index) {
      const site = JSON.parse(readFileSync(`public/data/sites/${e.id}.json`, 'utf8'))
      expect(site.mask.elevDeg.length * site.mask.azStepDeg).toBe(360)
      expect(e.hasTerrain).toBe(true)
      const { meta } = site.terrain
      const bytes = readFileSync(`public/data/${site.terrain.file}`).length
      expect(bytes).toBe(meta.width * meta.height * 2)
    }
  })

  // Sites outside the LOLA polar products: terrain from the LOLA global grids (60 m tile in an
  // oblique stereographic centred on the site, horizon out to 300 km).
  describe('reference sites (LOLA global)', () => {
    const reference = SITE_SEEDS.filter((s) => !usesPolarProduct(s))
    const mask = (id: string): number[] =>
      JSON.parse(readFileSync(`public/data/sites/${id}.json`, 'utf8')).mask.elevDeg
    /** Highest mask elevation within ±22.5° of an azimuth. */
    const sector = (id: string, az: number) => {
      const e = mask(id)
      const step = 360 / e.length
      return Math.max(...e.filter((_, i) => Math.abs(((i * step - az + 540) % 360) - 180) <= 22.5))
    }

    it('are the ten reference seeds, polar ones keep the 20 m path', () => {
      expect(reference.map((s) => s.id).sort()).toEqual(
        [
          'apollo-11',
          'apollo-15',
          'apollo-17',
          'blue-ghost-m1',
          'chandrayaan-3',
          'change-4',
          'change-6',
          'im-1',
          'luna-25',
          'slim',
        ].sort(),
      )
      for (const e of index) {
        const seed = SITE_SEEDS.find((s) => s.id === e.id)!
        expect(e.accuracy).toBe(usesPolarProduct(seed) ? 'lola' : 'lola-global')
      }
    })

    it('carry a tile centred on the site, a real horizon and its obstruction distances', () => {
      for (const seed of reference) {
        const site = JSON.parse(readFileSync(`public/data/sites/${seed.id}.json`, 'utf8'))
        expect(site.accuracy).toBe('lola-global')
        expect(site.lat).toBe(seed.lat)
        expect(site.lon).toBe(seed.lon)
        const { meta } = site.terrain
        expect(meta.projection).toEqual({ kind: 'stereo', lat0: seed.lat, lon0: seed.lon })
        expect(meta.heightScale).toBe(0.5)
        // Site on the centre pixel: its DN is the published height.
        const tile = readFileSync(`public/data/${site.terrain.file}`)
        const centre = (meta.height / 2) * meta.width + meta.width / 2
        expect(tile.readInt16LE(centre * 2) * meta.heightScale).toBeCloseTo(site.heightM, 1)
        expect(-meta.originX).toBe((meta.width / 2) * meta.scaleM)
        expect(site.mask.obstructionKm).toHaveLength(site.mask.elevDeg.length)
        // A real horizon is never the constant dip of the ideal sphere.
        const e: number[] = site.mask.elevDeg
        expect(Math.max(...e) - Math.min(...e)).toBeGreaterThan(0.5)
        expect(site.illum).toBeUndefined()
      }
    })

    it('heights match the known elevations of the Apollo sites (1737.4 km datum)', () => {
      const h = (id: string) => index.find((e) => e.id === id)!.heightM
      expect(h('apollo-11')).toBeGreaterThan(-2050)
      expect(h('apollo-11')).toBeLessThan(-1800)
      expect(h('apollo-15')).toBeGreaterThan(-2050)
      expect(h('apollo-15')).toBeLessThan(-1800)
      expect(h('apollo-17')).toBeGreaterThan(-2750)
      expect(h('apollo-17')).toBeLessThan(-2500)
    })

    it('Apollo 15 sees the Apennine front, Apollo 17 its massifs, Apollo 11 an open mare', () => {
      // Hadley Delta due south, the Swann Range / Mons Hadley to the east; open mare to the west.
      expect(sector('apollo-15', 180)).toBeGreaterThan(10)
      expect(sector('apollo-15', 90)).toBeGreaterThan(5)
      expect(sector('apollo-15', 270)).toBeLessThan(4)
      // Taurus-Littrow: North Massif to the north, South Massif to the south-west/west.
      expect(sector('apollo-17', 0)).toBeGreaterThan(10)
      expect(sector('apollo-17', 270)).toBeGreaterThan(6)
      // Tranquillity Base: nothing above 2°.
      expect(Math.max(...mask('apollo-11'))).toBeLessThan(2)
    })
  })

  it('permanently shadowed craters have high horizons, rims low ones', () => {
    const max = (id: string) =>
      Math.max(...JSON.parse(readFileSync(`public/data/sites/${id}.json`, 'utf8')).mask.elevDeg)
    expect(max('shackleton-floor')).toBeGreaterThan(15)
    expect(max('shackleton-rim')).toBeLessThan(1)
  })

  // Products of `npm run data:derived`: checked only for the sites that have them.
  const siteJson = (id: string) => JSON.parse(readFileSync(`public/data/sites/${id}.json`, 'utf8'))

  it('illumination maps match their metadata; PSR floors are shadowed, rims lit', () => {
    for (const e of index.filter((x) => x.hasTerrain)) {
      const { illum } = siteJson(e.id)
      if (!illum) continue
      const bytes = readFileSync(`public/data/${illum.file}`)
      expect(bytes.length).toBe(illum.meta.width * illum.meta.height)
      // Site at the centre of its tile, so at the centre of the map too.
      const centre = bytes[(illum.meta.height >> 1) * illum.meta.width + (illum.meta.width >> 1)]
      if (e.id === 'shackleton-floor' || e.id === 'haworth') expect(centre).toBe(0)
      if (e.id === 'shackleton-rim' || e.id === 'connecting-ridge') {
        // 1 + 2 × mean lit %: well lit rims are above 50 %.
        expect(centre).toBeGreaterThan(101)
      }
    }
  })

  it('sites carry slope figures; polar ones an ice summary consistent with the map', () => {
    for (const e of index as ((typeof index)[number] & Record<string, unknown>)[]) {
      if (!e.hasTerrain) continue
      expect(e.slopeP90Deg).toBeGreaterThanOrEqual(0)
      const ice = e.ice as { insidePsr: boolean; reachable: boolean } | undefined
      if (!ice) continue
      if (e.id === 'shackleton-floor') expect(ice.insidePsr).toBe(true)
      if (ice.insidePsr) expect(ice.reachable).toBe(true)
    }
  })
})
