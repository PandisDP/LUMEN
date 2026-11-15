import { MOON_RADIUS_M } from '../astro/constants.ts'

/**
 * Deep links that open a point in the two NASA/ASU map portals, to cross-check a site with
 * the full LRO data sets (NAC images, illumination, PSRs, 3D terrain…).
 *
 * Both use their simple cylindrical view, the format of the portals' own share links:
 *   QuickMap: `prjExtent` = projected metres (x = R·lon, y = R·lat), `proj=10`.
 *   Moon Trek: hash with the centre (`x` lon, `y` lat) and the extent `e` in degrees.
 * Near the pole a fixed ground radius spans many degrees of longitude; it is capped at ±180°.
 */
export const QUICKMAP_URL = 'https://quickmap.lroc.im-ldi.com/'
export const MOON_TREK_URL = 'https://trek.nasa.gov/moon/'
export const CSA_MOON_URL = 'https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/'
export const HORIZONS_URL = 'https://ssd.jpl.nasa.gov/horizons/'
const HORIZONS_API = 'https://ssd.jpl.nasa.gov/api/horizons.api'

export type HorizonsBody = 'sun' | 'earth'
const HORIZONS_COMMAND: Record<HorizonsBody, string> = { sun: '10', earth: '399' }

const horizonsTime = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ')

/**
 * JPL Horizons query, pre-filled for the site and the mission window: apparent azimuth and
 * elevation (quantity 4) of the Sun or the Earth seen from the surface point, hourly, as plain
 * text. The web app has no deep-link format, so this calls the public API directly: the same
 * numbers Killa Landing uses, straight from the source (see `npm run validate`).
 */
export function horizonsUrl(
  body: HorizonsBody,
  lat: number,
  lon: number,
  heightM: number,
  startMs: number,
  days: number,
): string {
  const eLon = ((lon % 360) + 360) % 360
  const q = new URLSearchParams({ format: 'text' })
  const params: Record<string, string> = {
    COMMAND: HORIZONS_COMMAND[body],
    OBJ_DATA: 'NO',
    MAKE_EPHEM: 'YES',
    EPHEM_TYPE: 'OBSERVER',
    CENTER: 'coord@301',
    COORD_TYPE: 'GEODETIC',
    SITE_COORD: `${eLon.toFixed(4)},${lat.toFixed(4)},${(heightM / 1000).toFixed(3)}`,
    START_TIME: horizonsTime(startMs),
    STOP_TIME: horizonsTime(startMs + days * 86_400_000),
    STEP_SIZE: '1 h',
    QUANTITIES: '4',
    APPARENT: 'AIRLESS',
    CSV_FORMAT: 'YES',
  }
  for (const [k, v] of Object.entries(params)) q.set(k, `'${v}'`)
  return `${HORIZONS_API}?${q}`
}

/** Equirectangular projection id of QuickMap (from its share links). */
const QUICKMAP_PROJ = 10
/** Basemap stack and layer opacity of the portal's default share link (LROC WAC mosaic). */
const QUICKMAP_STACK = '3314'
const QUICKMAP_DEFS = 'N4IgzGCMAsIFygPYAcCGBjAlgFwJ70gF9Cg'

const RAD = 180 / Math.PI

/** Lat/lon box (deg) around a point for a ground half-width in metres. */
export function boxAround(lat: number, lon: number, halfWidthM: number) {
  const dLat = (halfWidthM / MOON_RADIUS_M) * RAD
  const cosLat = Math.max(Math.cos(lat / RAD), 1e-3)
  const dLon = Math.min(180, dLat / cosLat)
  return {
    minLat: Math.max(-90, lat - dLat),
    maxLat: Math.min(90, lat + dLat),
    minLon: dLon >= 180 ? -180 : lon - dLon,
    maxLon: dLon >= 180 ? 180 : lon + dLon,
  }
}

const fix = (v: number, d: number) => Number(v.toFixed(d)).toString()

export function quickmapUrl(lat: number, lon: number, halfWidthM = 15_000): string {
  const b = boxAround(lat, lon, halfWidthM)
  const m = MOON_RADIUS_M / RAD
  const extent = [b.minLon * m, b.minLat * m, b.maxLon * m, b.maxLat * m].map((v) => fix(v, 1))
  const q = new URLSearchParams({
    prjExtent: extent.join(','),
    proj: String(QUICKMAP_PROJ),
    stack: QUICKMAP_STACK,
    defs: QUICKMAP_DEFS,
  })
  return `${QUICKMAP_URL}?${q.toString().replace(/%2C/g, ',')}`
}

export function moonTrekUrl(lat: number, lon: number, halfWidthM = 15_000): string {
  const b = boxAround(lat, lon, halfWidthM)
  const zoom = Math.max(1, Math.min(14, Math.round(Math.log2(360 / (b.maxLon - b.minLon)))))
  const parts = [
    'v=0.1',
    `x=${fix(lon, 4)}`,
    `y=${fix(lat, 4)}`,
    `z=${zoom}`,
    `p=${encodeURIComponent('urn:ogc:def:crs:EPSG::104903')}`,
    'd=',
    'locale=',
    'b=moon',
    `e=${[b.minLon, b.minLat, b.maxLon, b.maxLat].map((v) => fix(v, 4)).join(',')}`,
    'sfz=',
    'w=',
  ]
  return `${MOON_TREK_URL}#${parts.join('&')}`
}
