/**
 * Derived products computed from the already published data (no download):
 *
 *   npm run data:derived                 # every polar site
 *   npm run data:derived -- <id>…        # only some sites (runs can go in parallel)
 *   npm run data:derived -- --no-illum   # slopes (and ice access from existing maps) only
 *   npm run data:derived -- --force      # recompute illumination maps that already exist
 *
 * Inputs:  public/data/terrain/<id>.bin (20 m polar tiles, 60 m tiles of the reference
 *          sites), public/data/dem/south_480m.*
 * Outputs: index.json gains, per site with a tile, slopeCenterDeg / slopeP90Deg (500 m radius)
 *          and, for the polar ones only, `ice` (rover access to the nearest PSR,
 *          src/astro/iceAccess.ts);
 *          public/data/illum/<id>.bin illumination map (src/astro/illumination.ts), with its
 *          metadata under `illum` in sites/<id>.json.
 *
 * An illumination map takes ~15 min per tile on one core, so maps that already exist are
 * reused unless --force is given, and index.json is merged (re-read just before writing) so
 * several runs on different sites can go in parallel.
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { DemGrid, DemMeta } from '../../src/astro/dem.ts'
import { ephemerisSeries, setEphemerisTable } from '../../src/astro/ephemeris.ts'
import { readPublishedTable } from './horizons.ts'
import { computeIceAccess } from '../../src/astro/iceAccess.ts'
import { type IllumGrid, computeIlluminationMap } from '../../src/astro/illumination.ts'
import { slopeStats } from '../../src/astro/slope.ts'

const OUT = 'public/data'
const SLOPE_RADIUS_M = 500
/** 1024 px tile / 5 ≈ 205 cells of 100 m. */
const ILLUM_FACTOR = 5
/** Rover limit the precomputed ice summary uses (same as DEFAULT_LIMITS). */
const ROVER_MAX_SLOPE_DEG = 20

const log = (...args: unknown[]) => console.log('[derived]', ...args)
const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d
const roundOrNull = (v: number | null, d: number) => (v === null ? null : round(v, d))

async function readGrid(bin: string, meta: DemMeta): Promise<DemGrid> {
  const buf = await readFile(bin)
  const data = new Int16Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
  return { ...meta, data }
}

type Entry = Record<string, unknown>

async function main() {
  const args = process.argv.slice(2)
  const illumOn = !args.includes('--no-illum')
  const force = args.includes('--force')
  const only = args.filter((a) => !a.startsWith('--'))
  const indexPath = join(OUT, 'sites', 'index.json')
  const index: Entry[] = JSON.parse(await readFile(indexPath, 'utf8'))
  const farMeta: DemMeta = JSON.parse(await readFile(join(OUT, 'dem', 'south_480m.json'), 'utf8'))
  const far = await readGrid(join(OUT, 'dem', 'south_480m.bin'), farMeta)
  await mkdir(join(OUT, 'illum'), { recursive: true })
  const table = await readPublishedTable()
  setEphemerisTable(table)
  console.log(
    `Ephemeris: ${table ? table.source : 'IAU model (run `npm run data:ephem` for DE441)'}`,
  )
  // One year every 6 h: the Sun's declination swings through its full ±1.54° range.
  const year = illumOn ? ephemerisSeries(Date.UTC(2026, 0, 1), 6 * 3_600_000, 1461) : null
  const updates = new Map<string, Entry>()

  for (const entry of index) {
    const id = entry.id as string
    if (!entry.hasTerrain || (only.length && !only.includes(id))) continue
    const sitePath = join(OUT, 'sites', `${id}.json`)
    const site = JSON.parse(await readFile(sitePath, 'utf8'))
    if (!site.terrain || !existsSync(join(OUT, site.terrain.file))) continue
    const tile = await readGrid(join(OUT, site.terrain.file), site.terrain.meta)
    const patch: Entry = {}

    const s = slopeStats(tile, site.lat, site.lon, SLOPE_RADIUS_M)
    patch.slopeCenterDeg = round(s.center, 2)
    patch.slopeP90Deg = round(s.p90, 2)
    log(`${id}: slope ${s.center.toFixed(1)}° (p90 ${s.p90.toFixed(1)}° in ${SLOPE_RADIUS_M} m)`)
    // Tiles of the global products (reference sites, own projection): slopes only. The
    // illumination/PSR maps need the polar far field and only make sense near the pole.
    if (site.terrain.meta.projection) {
      updates.set(id, patch)
      continue
    }

    let illum: IllumGrid | null = null
    const file = `illum/${id}.bin`
    if (site.illum && existsSync(join(OUT, site.illum.file)) && !force) {
      const buf = await readFile(join(OUT, site.illum.file))
      illum = { ...site.illum.meta, data: new Uint8Array(buf) }
      log(`  ${id}: reusing ${site.illum.file}`)
    } else if (year) {
      const t0 = performance.now()
      illum = computeIlluminationMap(tile, far, year, ILLUM_FACTOR, (done, total) => {
        if (done % 20 === 0) log(`  ${id}: illumination row ${done}/${total}`)
      })
      await writeFile(join(OUT, file), Buffer.from(illum.data.buffer))
      const { data: _data, ...meta } = illum
      void _data
      site.illum = { file, meta }
      await writeFile(sitePath, JSON.stringify(site))
      const psr = illum.data.filter((v) => v === 0).length
      log(
        `  ${id}: ${illum.width}x${illum.height} cells, ${psr} PSR ` +
          `(${((performance.now() - t0) / 1000).toFixed(0)} s)`,
      )
    }

    if (illum) {
      const a = computeIceAccess(tile, illum, site.lat, site.lon, {
        roverMaxSlopeDeg: ROVER_MAX_SLOPE_DEG,
      })
      patch.ice = {
        straightM: roundOrNull(a.straightM, 0),
        routeM: roundOrNull(a.routeM, 0),
        maxSlopeDeg: roundOrNull(a.maxSlopeDeg, 1),
        reachable: a.reachable,
        insidePsr: a.insidePsr,
        roverMaxSlopeDeg: ROVER_MAX_SLOPE_DEG,
      }
      log(
        `  ${id}: ice ${a.insidePsr ? 'inside PSR' : a.reachable ? `${a.routeM?.toFixed(0)} m by rover` : 'out of reach'}`,
      )
    }
    updates.set(id, patch)
  }

  // Merge into the index as it is now (another run may have written it meanwhile).
  const latest: Entry[] = JSON.parse(await readFile(indexPath, 'utf8'))
  for (const e of latest) Object.assign(e, updates.get(e.id as string) ?? {})
  await writeFile(indexPath, JSON.stringify(latest, null, 1))
  log(`done: ${updates.size} sites`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
