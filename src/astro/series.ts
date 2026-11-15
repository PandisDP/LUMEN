import { anyStationSeesMoon } from './dsn.ts'
import { type EphemerisSeries, type Site, makeObserver, skyFromVectors } from './ephemeris.ts'
import type { Vec3 } from './frames.ts'
import { type HorizonMask, discVisibleFraction, maskAt } from './horizon.ts'

/**
 * Sun/Earth geometry for one site, sampled on a regular time grid. Typed arrays keep it
 * cheap to send from the worker and to draw in canvas charts.
 */
export interface SiteSeries {
  startMs: number
  stepMs: number
  count: number
  sunAz: Float32Array
  sunEl: Float32Array
  /** Visible fraction of the solar disc over the local horizon (0..1). */
  sunFrac: Float32Array
  earthAz: Float32Array
  earthEl: Float32Array
  /** Visible fraction of the Earth disc over the local horizon (0..1). */
  earthFrac: Float32Array
}

/**
 * @param linkMarginDeg Minimum clearance of the Earth above the terrain horizon for a usable
 *   direct-to-Earth link (multipath off the regolith). The Sun is always judged against the
 *   bare horizon.
 * @param requireDsn Also require a DSN complex with the Moon in view: without one the Earth
 *   counts as not visible for the link (about 1.6 % of the time, gaps of up to ~90 min).
 */
export function evaluateSite(
  eph: EphemerisSeries,
  site: Site,
  mask: HorizonMask,
  linkMarginDeg = 0,
  requireDsn = false,
): SiteSeries {
  const { count } = eph
  const out: SiteSeries = {
    startMs: eph.startMs,
    stepMs: eph.stepMs,
    count,
    sunAz: new Float32Array(count),
    sunEl: new Float32Array(count),
    sunFrac: new Float32Array(count),
    earthAz: new Float32Array(count),
    earthEl: new Float32Array(count),
    earthFrac: new Float32Array(count),
  }
  const observer = makeObserver(site)
  const d = eph.data
  for (let i = 0; i < count; i++) {
    const o = i * 6
    const sun: Vec3 = [d[o], d[o + 1], d[o + 2]]
    const earth: Vec3 = [d[o + 3], d[o + 4], d[o + 5]]
    const sky = skyFromVectors(sun, earth, observer)
    out.sunAz[i] = sky.sun.az
    out.sunEl[i] = sky.sun.el
    out.sunFrac[i] = discVisibleFraction(sky.sun.el, maskAt(mask, sky.sun.az), sky.sun.radiusDeg)
    out.earthAz[i] = sky.earth.az
    out.earthEl[i] = sky.earth.el
    out.earthFrac[i] = discVisibleFraction(
      sky.earth.el,
      maskAt(mask, sky.earth.az) + linkMarginDeg,
      sky.earth.radiusDeg,
    )
    if (requireDsn && out.earthFrac[i] > 0 && !anyStationSeesMoon(eph.startMs + i * eph.stepMs))
      out.earthFrac[i] = 0
  }
  return out
}

export const sampleTime = (s: Pick<SiteSeries, 'startMs' | 'stepMs'>, i: number) =>
  s.startMs + i * s.stepMs

/** Index range [i0, i1) of the samples whose time lies in [fromMs, toMs). */
export function indexRange(s: SiteSeries, fromMs: number, toMs: number): [number, number] {
  const i0 = Math.max(0, Math.ceil((fromMs - s.startMs) / s.stepMs))
  const i1 = Math.min(s.count, Math.ceil((toMs - s.startMs) / s.stepMs))
  return [i0, Math.max(i0, i1)]
}
