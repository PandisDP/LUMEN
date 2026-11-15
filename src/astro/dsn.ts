import { Body, Equator, Horizon, MakeTime, Observer } from 'astronomy-engine'

/**
 * Deep Space Network geometry: which of the three complexes sees the Moon at a given instant.
 * The site's offset on the Moon (≤ 1737 km) is negligible against ~384 000 km, so the Moon's
 * centre stands for the lander. Geometric only: no antenna gain, noise or scheduling.
 */
export interface DsnStation {
  id: 'goldstone' | 'madrid' | 'canberra'
  lat: number
  lon: number
  heightM: number
}

export const DSN_STATIONS: readonly DsnStation[] = [
  { id: 'goldstone', lat: 35.4267, lon: -116.89, heightM: 1000 },
  { id: 'madrid', lat: 40.4314, lon: -4.2481, heightM: 800 },
  { id: 'canberra', lat: -35.4014, lon: 148.9817, heightM: 700 },
]

/** Typical minimum antenna elevation for DSN tracking passes (deg). */
export const DSN_MIN_EL_DEG = 10

/** Mean Earth-Moon distance (km), reference for the relative path loss. */
export const MEAN_EARTH_MOON_KM = 384_400

/** X-band downlink used by most deep-space missions (MHz). */
export const X_BAND_MHZ = 8450

export interface StationState {
  id: DsnStation['id']
  /** Moon elevation / azimuth seen from the station (deg, no refraction). */
  el: number
  az: number
  visible: boolean
}

export function dsnVisibility(date: Date): StationState[] {
  const time = MakeTime(date)
  return DSN_STATIONS.map((s) => {
    const obs = new Observer(s.lat, s.lon, s.heightM)
    const eq = Equator(Body.Moon, time, obs, true, true)
    const h = Horizon(time, obs, eq.ra, eq.dec)
    return { id: s.id, el: h.altitude, az: h.azimuth, visible: h.altitude >= DSN_MIN_EL_DEG }
  })
}

/** Whether any DSN complex has the Moon above its tracking limit at `timeMs`. */
export const anyStationSeesMoon = (timeMs: number) =>
  dsnVisibility(new Date(timeMs)).some((s) => s.visible)

/** The station that would carry the link now: the visible one with the Moon highest. */
export function primaryStation(states: readonly StationState[]): StationState | undefined {
  let best: StationState | undefined
  for (const s of states) if (s.visible && (!best || s.el > best.el)) best = s
  return best
}

/** Free-space path loss (dB) over `distKm` at `freqMHz`. */
export const fsplDb = (distKm: number, freqMHz = X_BAND_MHZ) =>
  20 * Math.log10(distKm) + 20 * Math.log10(freqMHz) + 32.44

/** Path loss relative to the mean Earth-Moon distance (dB; positive = weaker than average). */
export const relativeFsplDb = (distKm: number) => 20 * Math.log10(distKm / MEAN_EARTH_MOON_KM)
