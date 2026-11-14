import { describe, expect, it } from 'vitest'
import validation from './__fixtures__/illum-validation.json'

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
