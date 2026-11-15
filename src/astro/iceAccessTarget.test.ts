import { describe, expect, it } from 'vitest'
import { DEG } from './constants.ts'
import { type DemGrid, lolaProductMeta, pixelToLatLon, pixelToMap } from './dem.ts'
import { mapToSouthPolar, southPolarToMap, surfaceDistance } from './frames.ts'
import { ICE_TARGET_SNAP_M, computeIceAccess, nearestPsrCell } from './iceAccess.ts'
import { type IllumGrid, encodeIllum } from './illumination.ts'

const SIZE = 241 // ±2.4 km at 20 m/px, centred on the pole
const meta = lolaProductMeta(SIZE, 20)

function dem(f: (x: number, y: number) => number): DemGrid {
  const data = new Int16Array(SIZE * SIZE)
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) {
      const { x, y } = pixelToMap(meta, c, r)
      data[r * SIZE + c] = Math.round(f(x, y) / meta.heightScale)
    }
  return { ...meta, data }
}

function illum(psr: (x: number, y: number) => boolean): IllumGrid {
  const data = new Uint8Array(SIZE * SIZE)
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) {
      const { x, y } = pixelToMap(meta, c, r)
      data[r * SIZE + c] = psr(x, y) ? 0 : encodeIllum(75, 1)
    }
  return { ...meta, data }
}

const flat = dem(() => 0)
/** Permanent shadow east of x = 1000 m. */
const east = illum((x) => x > 1000)
const centre = pixelToLatLon(meta, (SIZE - 1) / 2, (SIZE - 1) / 2)
const at = (x: number, y: number) => mapToSouthPolar(x, y)

describe('nearestPsrCell', () => {
  it('keeps a shadowed point and snaps a lit one to the nearest shadow', () => {
    const inside = at(1500, 800)
    const a = nearestPsrCell(east, inside.lat, inside.lon)!
    expect(a.distM).toBe(0)
    expect(surfaceDistance(a.lat, a.lon, inside.lat, inside.lon)).toBeLessThan(15)
    const lit = at(900, -600)
    const b = nearestPsrCell(east, lit.lat, lit.lon)!
    const m = southPolarToMap(b.lat, b.lon)
    expect(m.x).toBeCloseTo(1020, 0)
    expect(m.y).toBeCloseTo(-600, 0)
    expect(b.distM).toBeCloseTo(120, 0)
  })

  it('finds nothing beyond the snap distance', () => {
    const far = at(1000 - ICE_TARGET_SNAP_M - 100, 0)
    expect(nearestPsrCell(east, far.lat, far.lon)).toBeNull()
    expect(nearestPsrCell(east, far.lat, far.lon, ICE_TARGET_SNAP_M + 200)).not.toBeNull()
  })
})

describe('computeIceAccess with a target', () => {
  it('is unchanged without one', () => {
    const plain = computeIceAccess(flat, east, centre.lat, centre.lon)
    expect(computeIceAccess(flat, east, centre.lat, centre.lon, {})).toEqual(plain)
    expect(computeIceAccess(flat, east, centre.lat, centre.lon, { target: undefined })).toEqual(
      plain,
    )
  })

  it('drives to the shadowed cell nearest to the target, not to the nearest shadow', () => {
    const target = at(1500, 800)
    const near = computeIceAccess(flat, east, centre.lat, centre.lon)
    const a = computeIceAccess(flat, east, centre.lat, centre.lon, { target })
    expect(a.reachable).toBe(true)
    expect(surfaceDistance(a.target!.lat, a.target!.lon, target.lat, target.lon)).toBeLessThan(15)
    expect(a.straightM).toBeCloseTo(1700, -1)
    expect(a.routeM!).toBeGreaterThanOrEqual(a.straightM! - 1)
    expect(a.routeM!).toBeLessThan(1.1 * a.straightM!)
    expect(a.routeM!).toBeGreaterThan(near.routeM! + 500)
    expect(a.insidePsr).toBe(false)
    const last = a.path[a.path.length - 1]
    expect(surfaceDistance(last.lat, last.lon, target.lat, target.lon)).toBeLessThan(15)
    expect(a.path[0].lat).toBeCloseTo(centre.lat, 6)
  })

  it('grows the search window to hold a far target', () => {
    const target = at(1900, 1300)
    const a = computeIceAccess(flat, east, centre.lat, centre.lon, { target, radiusM: 800 })
    expect(a.reachable).toBe(true)
    expect(a.radiusM).toBeGreaterThan(2300)
    // Without a target the same radius finds no shadow at all.
    expect(computeIceAccess(flat, east, centre.lat, centre.lon, { radiusM: 800 }).straightM).toBe(
      null,
    )
  })

  it('returns no route when the target has no shadow nearby, and 0 m from the cell itself', () => {
    const lit = at(-1500, 0)
    const none = computeIceAccess(flat, east, centre.lat, centre.lon, { target: lit })
    expect(none.reachable).toBe(false)
    expect(none.straightM).toBeNull()
    expect(none.target).toBeNull()
    const cell = at(1500, 800)
    const here = computeIceAccess(flat, east, cell.lat, cell.lon, { target: cell })
    expect(here.routeM).toBe(0)
    expect(here.insidePsr).toBe(true)
  })

  it('does not drive over other shadowed ground steeper than the rover limit', () => {
    // A 40° ridge between x = 400 and 600 m, in shadow with its feet: the nearest "ice", and a
    // wall on the way to the target beyond it. Open only for 800 < y < 1000 in the second terrain.
    const t = Math.tan(40 * DEG)
    const ridge = (open: boolean) => (x: number, y: number) =>
      x > 400 && x < 600 && !(open && y > 800 && y < 1000) ? (100 - Math.abs(x - 500)) * t : 0
    const shadows = (open: boolean) =>
      illum((x, y) => x > 1000 || (x > 370 && x < 630 && !(open && y > 800 && y < 1000)))
    const target = at(1500, 0)

    const closed = dem(ridge(false))
    // The ridge itself is the nearest shadow, entered at its foot…
    const near = computeIceAccess(closed, shadows(false), centre.lat, centre.lon)
    expect(near.reachable).toBe(true)
    expect(near.routeM!).toBeLessThan(500)
    // …but it cannot be crossed to reach the target.
    const blocked = computeIceAccess(closed, shadows(false), centre.lat, centre.lon, { target })
    expect(blocked.reachable).toBe(false)
    expect(blocked.straightM).not.toBeNull()

    const around = computeIceAccess(dem(ridge(true)), shadows(true), centre.lat, centre.lon, {
      target,
    })
    expect(around.reachable).toBe(true)
    expect(around.routeM!).toBeGreaterThan(around.straightM! + 400)
    expect(around.maxSlopeDeg!).toBeLessThanOrEqual(20)
  })
})
