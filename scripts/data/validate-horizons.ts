/**
 * Independent check of the ephemeris against JPL Horizons (DE441, MEAN_ME frame).
 *
 *   npm run validate
 *
 * Queries the apparent azimuth/elevation of the Sun and the Earth seen from every catalogue
 * site (public/data/sites/index.json) at 12 instants spread over 2026-2030, and compares
 * them with both models of src/astro/ephemeris.ts: the analytic IAU model and the published
 * Horizons table (npm run data:ephem). Stores the reference values in
 * src/astro/__fixtures__/horizons.json for the unit tests (offline).
 *
 * Also checks the DSN geometry (src/astro/dsn.ts): the Moon seen from Goldstone, Madrid and
 * Canberra at 60 instants, stored in src/astro/__fixtures__/horizons-dsn.json.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { OBSERVER_HEIGHT_M } from '../../src/astro/constants.ts'
import { DSN_STATIONS, type DsnStation, dsnVisibility } from '../../src/astro/dsn.ts'
import { setEphemerisTable, skyAt } from '../../src/astro/ephemeris.ts'
import { wrap180 } from '../../src/astro/frames.ts'
import { csvRows, horizons, parseHorizonsDate, readPublishedTable } from './horizons.ts'

interface SiteRow {
  id: string
  lat: number
  lon: number
  heightM: number
}

/** 12 instants: the 15th of each month, cycling through 2026-2030 and four hours of day. */
const DATES_MS = Array.from({ length: 12 }, (_, m) => Date.UTC(2026 + (m % 5), m, 15, (m % 4) * 6))
const BODIES = [
  { key: 'sun', command: '10' },
  { key: 'earth', command: '399' },
] as const

export interface HorizonsFixture {
  site: string
  lat: number
  lon: number
  heightM: number
  date: string
  body: 'sun' | 'earth'
  az: number
  el: number
}

const toJd = (ms: number) => (ms / 86_400_000 + 2_440_587.5).toFixed(6)

async function query(site: SiteRow, command: string) {
  const eLon = (site.lon + 360) % 360
  const altKm = (site.heightM + OBSERVER_HEIGHT_M) / 1000
  const text = await horizons({
    COMMAND: command,
    OBJ_DATA: 'NO',
    MAKE_EPHEM: 'YES',
    EPHEM_TYPE: 'OBSERVER',
    CENTER: 'coord@301',
    COORD_TYPE: 'GEODETIC',
    SITE_COORD: `${eLon},${site.lat},${altKm}`,
    TLIST_TYPE: 'JD',
    TLIST: DATES_MS.map(toJd).join(' '),
    QUANTITIES: '4',
    ANG_FORMAT: 'DEG',
    EXTRA_PREC: 'YES',
    CSV_FORMAT: 'YES',
  })
  // Columns: date, solar flag, lunar flag, azimuth, elevation
  return csvRows(text).map((r) => ({ ms: parseHorizonsDate(r[0]), az: +r[3], el: +r[4] }))
}

function delta(mine: { az: number; el: number }, ref: { az: number; el: number }) {
  // Azimuth differences are meaningless near the zenith; weight them by cos(el).
  const dAz = wrap180(mine.az - ref.az) * Math.cos((ref.el * Math.PI) / 180)
  return Math.max(Math.abs(dAz), Math.abs(mine.el - ref.el))
}

async function main() {
  const sites = JSON.parse(await readFile('public/data/sites/index.json', 'utf8')) as SiteRow[]
  const table = await readPublishedTable()
  if (!table) console.warn('No public/data/ephem table: run `npm run data:ephem` first.')
  const fixtures: HorizonsFixture[] = []
  const worst = { iau: 0, table: 0 }
  console.log('site                  body    max|Δ| IAU   max|Δ| DE441 table')
  for (const site of sites) {
    for (const b of BODIES) {
      const refs = await query(site, b.command)
      const siteWorst = { iau: 0, table: 0 }
      for (const ref of refs) {
        const date = new Date(ref.ms)
        fixtures.push({
          site: site.id,
          lat: site.lat,
          lon: site.lon,
          heightM: site.heightM,
          date: date.toISOString().slice(0, 16),
          body: b.key,
          az: ref.az,
          el: ref.el,
        })
        setEphemerisTable(null)
        siteWorst.iau = Math.max(siteWorst.iau, delta(skyAt(date, site)[b.key], ref))
        if (table) {
          setEphemerisTable(table)
          siteWorst.table = Math.max(siteWorst.table, delta(skyAt(date, site)[b.key], ref))
        }
      }
      worst.iau = Math.max(worst.iau, siteWorst.iau)
      worst.table = Math.max(worst.table, siteWorst.table)
      console.log(
        `${site.id.padEnd(21)} ${b.key.padEnd(6)} ${siteWorst.iau.toFixed(4).padStart(10)}° ${table ? siteWorst.table.toFixed(4).padStart(12) + '°' : '           -'}`,
      )
    }
  }
  await mkdir('src/astro/__fixtures__', { recursive: true })
  await writeFile('src/astro/__fixtures__/horizons.json', JSON.stringify(fixtures, null, 1) + '\n')
  console.log(`\n${fixtures.length} reference positions`)
  console.log(`IAU model:   max |Δ| = ${worst.iau.toFixed(4)}° (${(worst.iau * 3600).toFixed(1)}″)`)
  if (table)
    console.log(
      `DE441 table: max |Δ| = ${worst.table.toFixed(4)}° (${(worst.table * 3600).toFixed(1)}″)`,
    )
}

/** 60 instants, one a month over 2026-2030, each at a different hour of the day. */
const DSN_DATES_MS = Array.from({ length: 60 }, (_, i) => Date.UTC(2026, i, 1, (i * 5) % 24))

export interface DsnFixture {
  station: DsnStation['id']
  date: string
  az: number
  el: number
}

/** Moon az/el (apparent, airless) from each DSN complex, against dsn.ts. */
async function validateDsn() {
  const fixtures: DsnFixture[] = []
  let worst = 0
  for (const [k, s] of DSN_STATIONS.entries()) {
    const text = await horizons({
      COMMAND: '301',
      OBJ_DATA: 'NO',
      MAKE_EPHEM: 'YES',
      EPHEM_TYPE: 'OBSERVER',
      CENTER: 'coord@399',
      COORD_TYPE: 'GEODETIC',
      SITE_COORD: `${(s.lon + 360) % 360},${s.lat},${s.heightM / 1000}`,
      TLIST_TYPE: 'JD',
      TLIST: DSN_DATES_MS.map(toJd).join(' '),
      QUANTITIES: '4',
      APPARENT: 'AIRLESS',
      ANG_FORMAT: 'DEG',
      EXTRA_PREC: 'YES',
      CSV_FORMAT: 'YES',
    })
    let stationWorst = 0
    for (const r of csvRows(text)) {
      const ref = { az: +r[3], el: +r[4] }
      const date = new Date(Math.round(parseHorizonsDate(r[0]) / 1000) * 1000)
      fixtures.push({ station: s.id, date: date.toISOString().slice(0, 19), ...ref })
      stationWorst = Math.max(stationWorst, delta(dsnVisibility(date)[k], ref))
    }
    worst = Math.max(worst, stationWorst)
    console.log(`DSN ${s.id.padEnd(9)} Moon az/el max |Δ| = ${stationWorst.toFixed(4)}°`)
  }
  await writeFile(
    'src/astro/__fixtures__/horizons-dsn.json',
    JSON.stringify(fixtures, null, 1) + '\n',
  )
  console.log(`DSN: ${fixtures.length} reference positions, max |Δ| = ${worst.toFixed(4)}°`)
}

main()
  .then(validateDsn)
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
