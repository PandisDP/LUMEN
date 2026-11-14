/**
 * Minimal JPL Horizons API client for the offline data scripts (never used by the app).
 * Replies are cached in data-cache/horizons/ so re-running a script costs no requests.
 *
 * API docs: https://ssd-api.jpl.nasa.gov/doc/horizons.html
 */
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { BaryState, Body, MakeTime } from 'astronomy-engine'
import { AU_KM } from '../../src/astro/constants.ts'
import {
  type EphemTable,
  type EphemTableMeta,
  subPointToVector,
} from '../../src/astro/ephemTable.ts'
import { moonBodyRotation } from '../../src/astro/ephemeris.ts'
import { type Vec3, dot, norm } from '../../src/astro/frames.ts'

const API = 'https://ssd.jpl.nasa.gov/api/horizons.api'
const CACHE = 'data-cache/horizons'

export const EPHEM_DIR = 'public/data/ephem'
export const EPHEM_NAME = 'de441'

/** Runs a query (values are quoted for the API) and returns the raw text result. */
export async function horizons(params: Record<string, string>): Promise<string> {
  const search = new URLSearchParams({ format: 'text' })
  for (const [k, v] of Object.entries(params)) search.set(k, `'${v}'`)
  const key = createHash('sha1').update(search.toString()).digest('hex').slice(0, 16)
  const file = join(CACHE, `${key}.txt`)
  if (existsSync(file)) return readFile(file, 'utf8')
  const res = await fetch(`${API}?${search}`)
  if (!res.ok) throw new Error(`Horizons HTTP ${res.status}`)
  const text = await res.text()
  if (!text.includes('$$SOE')) throw new Error(`Unexpected Horizons reply:\n${text.slice(0, 1200)}`)
  await mkdir(CACHE, { recursive: true })
  await writeFile(file, text)
  return text
}

/** Rows between $$SOE and $$EOE, split on commas (CSV_FORMAT=YES). */
export function csvRows(text: string): string[][] {
  const body = text.split('$$SOE')[1]?.split('$$EOE')[0] ?? ''
  return body
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(',').map((c) => c.trim()))
}

/** "2026-Mar-01 00:00:00.000" (UT) -> epoch ms. */
export function parseHorizonsDate(s: string): number {
  const m = /^(\d{4})-(\w{3})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?/.exec(s)
  if (!m) throw new Error(`Bad Horizons date: ${s}`)
  const mon = 'JanFebMarAprMayJunJulAugSepOctNovDec'.indexOf(m[2]) / 3
  return Date.UTC(+m[1], mon, +m[3], +m[4], +m[5]) + Math.round(+(m[6] ?? 0) * 1000)
}

const C_AU_PER_DAY = 173.144_632_674

/**
 * Converts the Earth direction to the apparent one seen from the Moon.
 * Horizons' sub-solar point (quantity 15) already matches the apparent Sun az/el (quantity 4)
 * to 1″. Its sub-observer point (quantity 14) is "apparent" for the terrestrial observer, so
 * it carries the aberration of the Earth→Moon line of sight, and the Moon→Earth direction
 * ends up ~20″ off quantity 4. A first-order shift of −v/c (v = barycentric velocity of the
 * Moon, from astronomy-engine, ~30 km/s) removes it: `npm run validate` gives ≤ 1.4″ against
 * quantity 4 at every catalogue site.
 */
function withAberration(v: Vec3, timeMs: number): Vec3 {
  const date = new Date(timeMs)
  const s = BaryState(Body.Moon, MakeTime(date))
  const rot = moonBodyRotation(date)
  const beta: Vec3 = [-s.vx / C_AU_PER_DAY, -s.vy / C_AU_PER_DAY, -s.vz / C_AU_PER_DAY]
  const b = [dot(rot[0], beta), dot(rot[1], beta), dot(rot[2], beta)] as const
  const r = norm(v)
  const u = [v[0] / r, v[1] / r, v[2] / r] as const
  const ub = u[0] * b[0] + u[1] * b[1] + u[2] * b[2]
  return [
    r * (u[0] + b[0] - ub * u[0]),
    r * (u[1] + b[1] - ub * u[1]),
    r * (u[2] + b[2] - ub * u[2]),
  ]
}

/**
 * Sun and Earth positions in the Moon body-fixed frame (DE441 + Horizons' lunar Mean Earth
 * frame), sampled on a regular grid. Built from the sub-observer point (Earth geocentre seen
 * from the Moon), the sub-solar point and both ranges, so one table serves every site.
 * Both are apparent directions (light time + aberration), as Horizons' az/el.
 */
export async function fetchBodyFixedTable(
  start: string,
  stop: string,
  stepHours: number,
): Promise<EphemTable> {
  const text = await horizons({
    COMMAND: '301',
    OBJ_DATA: 'NO',
    MAKE_EPHEM: 'YES',
    EPHEM_TYPE: 'OBSERVER',
    CENTER: '500@399',
    START_TIME: start,
    STOP_TIME: stop,
    STEP_SIZE: `${stepHours} h`,
    QUANTITIES: '14,15,19,20',
    ANG_FORMAT: 'DEG',
    EXTRA_PREC: 'YES',
    CSV_FORMAT: 'YES',
  })
  // Columns: date, solar flag, lunar flag, ObsSub-LON, ObsSub-LAT, SunSub-LON, SunSub-LAT,
  //          r (AU), rdot, delta (AU), deldot
  const rows = csvRows(text)
  const data = new Float32Array(rows.length * 6)
  const startMs = parseHorizonsDate(rows[0][0])
  const stepMs = stepHours * 3_600_000
  rows.forEach((r, i) => {
    const t = parseHorizonsDate(r[0])
    if (t !== startMs + i * stepMs) throw new Error(`Irregular Horizons grid at row ${i}: ${r[0]}`)
    const [obsLon, obsLat, sunLon, sunLat, rAu, , deltaAu] = r.slice(3).map(Number)
    data.set(subPointToVector(sunLon, sunLat, rAu * AU_KM), i * 6)
    const earth = subPointToVector(obsLon, obsLat, deltaAu * AU_KM)
    data.set(withAberration(earth, t), i * 6 + 3)
  })
  return { source: 'JPL Horizons DE441', startMs, stepMs, count: rows.length, data }
}

/** Loads the published table from disk (scripts run in Node; the app fetches it). */
export async function readPublishedTable(): Promise<EphemTable | null> {
  const metaFile = join(EPHEM_DIR, `${EPHEM_NAME}.json`)
  if (!existsSync(metaFile)) return null
  const meta = JSON.parse(await readFile(metaFile, 'utf8')) as EphemTableMeta
  const buf = await readFile(join(EPHEM_DIR, `${EPHEM_NAME}.bin`))
  const data = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
  return { ...meta, data: new Float32Array(data) }
}
