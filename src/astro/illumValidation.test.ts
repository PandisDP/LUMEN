import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import validation from './__fixtures__/illum-validation.json'
import type { EphemTableMeta } from './ephemTable.ts'
import { ephemerisSeries, setEphemerisTable } from './ephemeris.ts'
import type { HorizonMask } from './horizon.ts'
import { type IllumGrid, type IllumMeta, illumAt, illumPct } from './illumination.ts'
import { evaluateSite } from './series.ts'

interface SiteFile {
  lat: number
  lon: number
  heightM: number
  mask: HorizonMask
  illum: { file: string; meta: IllumMeta }
}

const TOLERANCE_PCT = 6

// The maps were built with the DE441 table (scripts/data/build-derived.ts).
beforeAll(() => {
  const meta = JSON.parse(readFileSync('public/data/ephem/de441.json', 'utf8')) as EphemTableMeta
  const buf = readFileSync('public/data/ephem/de441.bin')
  setEphemerisTable({ ...meta, data: new Float32Array(new Uint8Array(buf).buffer) })
})
afterAll(() => setEphemerisTable(null))

// Reference values from LROC QuickMap and Moon Trek (npm run validate:illum). The reference
// layers are display images, so only rank correlation and PSR overlap are meaningful.
describe('illumination products against LRO maps', () => {
  it('covers the sites inside the 88°S-90°S WAC illumination map', () => {
    expect(validation.sun.map((s) => s.site).sort()).toEqual(
      ['connecting-ridge', 'de-gerlache-rim', 'shackleton-floor', 'shackleton-rim'].sort(),
    )
  })

  it.each(validation.sun.map((s) => [s.site, s] as const))(
    'Sun, %s: our yearly map ranks cells like the LROC WAC map',
    (_, s) => {
      expect(s.cells).toBeGreaterThan(10_000)
      expect(s.spearman).toBeGreaterThan(0.9)
    },
  )

  it('Shackleton floor: the permanently shadowed cells coincide', () => {
    const floor = validation.sun.find((s) => s.site === 'shackleton-floor')!
    expect(floor.psrIou).toBeGreaterThan(0.9)
  })

  it('Earth: sites rank like the LOLA mean Earth visibility map', () => {
    expect(validation.earth).toHaveLength(9)
    expect(validation.earthSpearman).toBeGreaterThan(0.9)
  })
})

// The checks above only read stored statistics. These tie them to the published maps and to the
// physics: change a map, the horizon code or the ephemeris and they fail.
describe('published illumination maps', () => {
  const load = (id: string): { detail: SiteFile; grid: IllumGrid } => {
    const detail = JSON.parse(readFileSync(`public/data/sites/${id}.json`, 'utf8')) as SiteFile
    const buf = readFileSync(`public/data/${detail.illum.file}`)
    return { detail, grid: { ...detail.illum.meta, data: new Uint8Array(buf) } }
  }

  it.each(validation.sun.map((s) => [s.site, s] as const))(
    '%s: the map still has the PSR cell count that was validated',
    (id, s) => {
      const { grid } = load(id)
      expect(grid.data.length).toBe(s.cells)
      expect(grid.data.reduce((n, v) => n + (v === 0 ? 1 : 0), 0)).toBe(s.psrCellsOurs)
    },
  )

  it.each(['shackleton-rim', 'connecting-ridge', 'de-gerlache-rim', 'shackleton-floor'])(
    '%s: the map at the site agrees with a year of Sun positions against its horizon mask',
    (id) => {
      const { detail, grid } = load(id)
      const year = ephemerisSeries(Date.UTC(2026, 0, 1), 6 * 3_600_000, 1461)
      const series = evaluateSite(year, detail, detail.mask)
      let lit = 0
      for (let i = 0; i < series.count; i++) lit += series.sunFrac[i]
      const recomputedPct = (100 * lit) / series.count
      const v = illumAt(grid, detail.lat, detail.lon)!
      // 100 m cells and a 3° mask against the 0.5° site mask: same picture, not the same number.
      expect(Math.abs(illumPct(v) - recomputedPct)).toBeLessThan(TOLERANCE_PCT)
    },
  )
})
