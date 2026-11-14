import { describe, expect, it } from 'vitest'
import { boxAround, horizonsUrl, moonTrekUrl, quickmapUrl } from './externalLinks.ts'

describe('external map links', () => {
  it('builds a QuickMap link centred on the point, in projected metres', () => {
    const url = new URL(quickmapUrl(0, 10, 15_000))
    expect(url.origin).toBe('https://quickmap.lroc.im-ldi.com')
    expect(url.searchParams.get('proj')).toBe('10')
    const [x0, y0, x1, y1] = url.searchParams.get('prjExtent')!.split(',').map(Number)
    // Centre: lon 10° → R·0.1745 rad ≈ 303 km; half-width 15 km on each side.
    expect((x0 + x1) / 2).toBeCloseTo(303_237, -2)
    expect((y0 + y1) / 2).toBeCloseTo(0, 3)
    expect(x1 - x0).toBeCloseTo(30_000, -1)
    expect(y1 - y0).toBeCloseTo(30_000, -1)
  })

  it('builds a Moon Trek link with the centre and extent in degrees', () => {
    const url = moonTrekUrl(-85.99, 2.06)
    expect(url.startsWith('https://trek.nasa.gov/moon/#v=0.1&x=2.06&y=-85.99&')).toBe(true)
    expect(url).toContain('b=moon')
    const e = /e=([^&]+)/.exec(url)![1].split(',').map(Number)
    expect(e[0]).toBeLessThan(2.06)
    expect(e[2]).toBeGreaterThan(2.06)
    expect(e[1]).toBeLessThan(-85.99)
    expect(e[3]).toBeGreaterThan(-85.99)
  })

  it('widens the longitude span near the pole and caps it at the full circle', () => {
    const mid = boxAround(-60, 0, 15_000)
    const pole = boxAround(-89.4, -137, 15_000)
    expect(pole.maxLon - pole.minLon).toBeGreaterThan(20 * (mid.maxLon - mid.minLon))
    const atPole = boxAround(-89.99, 0, 15_000)
    expect(atPole.minLon).toBe(-180)
    expect(atPole.maxLon).toBe(180)
    expect(atPole.minLat).toBe(-90)
  })
})

describe('Horizons deep link', () => {
  it('pre-fills the site, the body and the mission window', () => {
    const start = Date.UTC(2027, 2, 1, 12)
    const url = new URL(horizonsUrl('earth', -89.45, -137.31, 1800, start, 14))
    expect(url.searchParams.get('COMMAND')).toBe("'399'")
    expect(url.searchParams.get('CENTER')).toBe("'coord@301'")
    // East longitude 0-360, planetodetic lat, altitude in km.
    expect(url.searchParams.get('SITE_COORD')).toBe("'222.6900,-89.4500,1.800'")
    expect(url.searchParams.get('START_TIME')).toBe("'2027-03-01 12:00'")
    expect(url.searchParams.get('STOP_TIME')).toBe("'2027-03-15 12:00'")
    expect(url.searchParams.get('QUANTITIES')).toBe("'4'")
    expect(horizonsUrl('sun', 0, 0, 0, start, 1)).toContain('COMMAND=%2710%27')
  })
})
