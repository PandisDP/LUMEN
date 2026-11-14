import { type StationState, dsnVisibility } from './dsn.ts'
import { type Site, type SkyState, skyAt } from './ephemeris.ts'
import { type HorizonMask, discVisibleFraction, maskAt } from './horizon.ts'
import { VISIBLE_THRESHOLD } from './metrics.ts'
import { type Interval, type StateAt, stateAt } from './windows.ts'

/** What a mission operator needs to know "right now" at a site. */
export interface InstantState {
  timeMs: number
  sky: SkyState
  /** Horizon elevation in the direction of the Sun / Earth. */
  sunHorizonDeg: number
  earthHorizonDeg: number
  sunFrac: number
  earthFrac: number
  sunUp: boolean
  earthUp: boolean
  /** Next sunset (if lit) or sunrise (if dark) inside the analysis window. */
  sun: StateAt
  earth: StateAt
  /** Site-to-Earth-centre distance, km (topocentric). */
  earthDistKm: number
  /** Moon visibility from the three Deep Space Network complexes. */
  dsn: StationState[]
}

export function instantState(
  site: Site,
  mask: HorizonMask,
  timeMs: number,
  sunWindows: readonly Interval[] = [],
  dteWindows: readonly Interval[] = [],
  linkMarginDeg = 0,
): InstantState {
  const sky = skyAt(new Date(timeMs), site)
  const sunHorizonDeg = maskAt(mask, sky.sun.az)
  const earthHorizonDeg = maskAt(mask, sky.earth.az)
  const sunFrac = discVisibleFraction(sky.sun.el, sunHorizonDeg, sky.sun.radiusDeg)
  const earthFrac = discVisibleFraction(
    sky.earth.el,
    earthHorizonDeg + linkMarginDeg,
    sky.earth.radiusDeg,
  )
  const sunUp = sunFrac >= VISIBLE_THRESHOLD
  const earthUp = earthFrac >= VISIBLE_THRESHOLD
  // The sampled windows give the next transition; the instantaneous state comes from the
  // exact computation, so the two agree except within a sampling step of an edge.
  const sun = { ...stateAt(sunWindows, timeMs), on: sunUp }
  const earth = { ...stateAt(dteWindows, timeMs), on: earthUp }
  return {
    timeMs,
    sky,
    sunHorizonDeg,
    earthHorizonDeg,
    sunFrac,
    earthFrac,
    sunUp,
    earthUp,
    sun,
    earth,
    earthDistKm: sky.earth.dist,
    dsn: dsnVisibility(new Date(timeMs)),
  }
}
