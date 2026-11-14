import { describe, expect, it } from 'vitest'
import {
  DEM_NODATA,
  type DemGrid,
  cropGrid,
  demCovers,
  downsampleGrid,
  latLonToPixel,
  lolaProductMeta,
  pixelToLatLon,
  sampleDem,
  samplePixel,
} from './dem.ts'

/** Synthetic "LOLA product": a linear ramp in map x (DN = 2·column, so 2x/4x box means stay integer). */
function ramp(size = 64, scaleM = 1000): DemGrid {
  const data = new Int16Array(size * size)
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) data[r * size + c] = 2 * c
  return { ...lolaProductMeta(size, scaleM), data }
}

describe('LOLA georeferencing', () => {
  it('matches the PDS projection offsets (LDEM_85S_20M: 7583.5 px)', () => {
    const meta = lolaProductMeta(15168, 20)
    const { c, r } = latLonToPixel(meta, -90, 0)
    expect(c).toBeCloseTo(7583.5, 6)
    expect(r).toBeCloseTo(7583.5, 6)
  })

  it('round-trips pixels and coordinates', () => {
    const meta = lolaProductMeta(3812, 240)
    const { lat, lon } = pixelToLatLon(meta, 1000.25, 2400.5)
    const { c, r } = latLonToPixel(meta, lat, lon)
    expect(c).toBeCloseTo(1000.25, 6)
    expect(r).toBeCloseTo(2400.5, 6)
  })
})

describe('sampling', () => {
  it('interpolates bilinearly and applies the 0.5 m DN scale', () => {
    const g = ramp()
    expect(samplePixel(g, 10.5, 3)).toBeCloseTo(10.5)
    expect(samplePixel(g, -1, 3)).toBeNaN()
  })

  it('ignores the northern hemisphere and missing data', () => {
    const g = ramp()
    expect(sampleDem(g, 10, 0)).toBeNaN()
    g.data[0] = DEM_NODATA
    expect(samplePixel(g, 0.5, 0.5)).toBeNaN()
  })

  it('keeps georeferencing through crops and downsampling', () => {
    const g = ramp(64, 1000)
    const lat = -89.6
    const lon = 30
    const ref = sampleDem(g, lat, lon)
    const crop = cropGrid(g, 20, 20, 24, 24)
    expect(sampleDem(crop, lat, lon)).toBeCloseTo(ref, 9)
    // The ramp is linear, so the box filter must reproduce it exactly at the same place.
    expect(sampleDem(downsampleGrid(g, 2), lat, lon)).toBeCloseTo(ref, 6)
    expect(sampleDem(downsampleGrid(g, 4), lat, lon)).toBeCloseTo(ref, 6)
  })

  it('reports coverage', () => {
    const g = ramp(64, 1000) // ±32 km around the pole
    expect(demCovers(g, -89.9, 0)).toBe(true)
    expect(demCovers(g, -85, 0)).toBe(false)
  })
})
