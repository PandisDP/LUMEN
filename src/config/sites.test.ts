/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SITE_ID, SITE_SEEDS } from './sites.ts'

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
  const index = JSON.parse(readFileSync(indexPath, 'utf8')) as { id: string; hasTerrain: boolean }[]

  it('covers every curated site', () => {
    expect(index.map((e) => e.id).sort()).toEqual(SITE_SEEDS.map((s) => s.id).sort())
  })

  it('every site has a full 360° mask and polar sites a terrain tile', () => {
    for (const e of index) {
      const site = JSON.parse(readFileSync(`public/data/sites/${e.id}.json`, 'utf8'))
      expect(site.mask.elevDeg.length * site.mask.azStepDeg).toBe(360)
      if (e.hasTerrain) {
        const { meta } = site.terrain
        const bytes = readFileSync(`public/data/${site.terrain.file}`).length
        expect(bytes).toBe(meta.width * meta.height * 2)
      }
    }
  })

  it('permanently shadowed craters have high horizons, rims low ones', () => {
    const max = (id: string) =>
      Math.max(...JSON.parse(readFileSync(`public/data/sites/${id}.json`, 'utf8')).mask.elevDeg)
    expect(max('shackleton-floor')).toBeGreaterThan(15)
    expect(max('shackleton-rim')).toBeLessThan(1)
  })

  // Products of `npm run data:derived`: checked only for the sites that have them.
  const siteJson = (id: string) =>
    JSON.parse(readFileSync(`public/data/sites/${id}.json`, 'utf8'))

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

  it('polar sites carry slope figures and an ice summary consistent with the map', () => {
    for (const e of index as (typeof index[number] & Record<string, unknown>)[]) {
      if (!e.hasTerrain) continue
      expect(e.slopeP90Deg).toBeGreaterThanOrEqual(0)
      const ice = e.ice as { insidePsr: boolean; reachable: boolean } | undefined
      if (!ice) continue
      if (e.id === 'shackleton-floor') expect(ice.insidePsr).toBe(true)
      if (ice.insidePsr) expect(ice.reachable).toBe(true)
    }
  })
})
