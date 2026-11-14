/**
 * Offline data pipeline: LOLA (LRO) polar DEMs -> static files in public/data.
 *
 *   npm run data            # download (cached in data-cache/) and build everything
 *
 * Products used (PDS Geosciences node, LOLA GDR polar, south pole stereographic):
 *   LDEM_80S_20M  20 m/px  80°S-90°S  (1.8 GB; only the rows around each site are fetched)
 *   LDEM_75S_240M 240 m/px 75°S-90°S  (29 MB; far-field horizon + browser DEM)
 *
 * Outputs:
 *   public/data/sites/index.json      refined coordinates/heights for every curated site
 *   public/data/sites/<id>.json       horizon mask (+ terrain tile metadata)
 *   public/data/terrain/<id>.bin      1024x1024 Int16 LOLA DN tile (20 m/px, 20.5 km)
 *   public/data/dem/south_480m.bin    75°S-90°S DEM for custom coordinates (worker)
 *   public/data/dem/south_960m.bin    lighter version for the orbital (macro) view
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  type DemGrid,
  type DemMeta,
  cropGrid,
  downsampleGrid,
  latLonToPixel,
  lolaProductMeta,
  pixelToLatLon,
} from '../../src/astro/dem.ts'
import {
  type EphemerisSeries,
  ephemerisSeries,
  setEphemerisTable,
} from '../../src/astro/ephemeris.ts'
import { computeHorizonMask } from '../../src/astro/horizonFromDem.ts'
import { evaluateSite } from '../../src/astro/series.ts'
import { maskStats, sphericalMask } from '../../src/astro/horizon.ts'
import { SITE_SEEDS, type SiteSeed } from '../../src/config/sites.ts'
import { readPublishedTable } from './horizons.ts'

const PDS =
  'https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img'
const CACHE = 'data-cache'
const OUT = 'public/data'
const TILE = 1024

const P20 = { file: 'ldem_80s_20m.img', size: 30400, scaleM: 20 }
const P240 = { file: 'ldem_75s_240m.img', size: 3812, scaleM: 240 }

const log = (...args: unknown[]) => console.log('[data]', ...args)

async function fetchBytes(url: string, range?: [number, number], attempt = 1): Promise<Buffer> {
  try {
    const res = await fetch(
      url,
      range ? { headers: { Range: `bytes=${range[0]}-${range[1]}` } } : {},
    )
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
    return Buffer.from(await res.arrayBuffer())
  } catch (err) {
    if (attempt >= 4) throw err
    log(`retry ${attempt} ${url}: ${(err as Error).message}`)
    await new Promise((r) => setTimeout(r, 2000 * attempt))
    return fetchBytes(url, range, attempt + 1)
  }
}

async function cached(name: string, produce: () => Promise<Buffer>): Promise<Buffer> {
  const path = join(CACHE, name)
  if (existsSync(path)) return readFile(path)
  const buf = await produce()
  await writeFile(path, buf)
  return buf
}

/** Little-endian Int16 view that owns an aligned copy of the bytes. */
const toInt16 = (buf: Buffer) => {
  const out = new Int16Array(buf.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = buf.readInt16LE(i * 2)
  return out
}

const metaOf = (g: DemGrid): DemMeta => {
  const { data: _data, ...meta } = g
  void _data
  return meta
}

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d

async function loadFar(): Promise<DemGrid> {
  const bytes = await cached(P240.file, () => {
    log(`downloading ${P240.file} (29 MB)…`)
    return fetchBytes(`${PDS}/${P240.file}`)
  })
  return { ...lolaProductMeta(P240.size, P240.scaleM), data: toInt16(bytes) }
}

/** Fetches only the rows of LDEM_80S_20M around a site and crops the columns. */
async function loadBand(seed: SiteSeed, marginPx: number): Promise<DemGrid> {
  const full = lolaProductMeta(P20.size, P20.scaleM)
  const { c, r } = latLonToPixel(full, seed.lat, seed.lon)
  const half = TILE / 2 + marginPx
  const r0 = Math.round(r) - half
  const c0 = Math.round(c) - half
  const size = half * 2
  const rowBytes = P20.size * 2
  const bytes = await cached(`${seed.id}-band-${r0}-${c0}-${size}.bin`, async () => {
    log(`${seed.id}: fetching ${((size * rowBytes) / 1e6).toFixed(0)} MB of LDEM_80S_20M rows…`)
    const band = await fetchBytes(`${PDS}/${P20.file}`, [r0 * rowBytes, (r0 + size) * rowBytes - 1])
    const out = Buffer.alloc(size * size * 2)
    for (let y = 0; y < size; y++)
      band.copy(out, y * size * 2, y * rowBytes + c0 * 2, y * rowBytes + (c0 + size) * 2)
    return out
  })
  return {
    ...full,
    originX: full.originX + c0 * full.scaleM,
    originY: full.originY - r0 * full.scaleM,
    width: size,
    height: size,
    data: toInt16(bytes),
  }
}

/** Highest pixel within `radiusPx` of the band centre (ridges and peaks are the sunny spots). */
function snapToHighPoint(g: DemGrid, radiusPx: number) {
  const cc = g.width / 2
  const cr = g.height / 2
  let best = { c: Math.round(cc), r: Math.round(cr), v: -Infinity }
  for (let r = Math.floor(cr - radiusPx); r <= cr + radiusPx; r++) {
    for (let c = Math.floor(cc - radiusPx); c <= cc + radiusPx; c++) {
      if ((c - cc) ** 2 + (r - cr) ** 2 > radiusPx ** 2) continue
      const v = g.data[r * g.width + c]
      if (v > best.v) best = { c, r, v }
    }
  }
  return best
}

/** One year of Sun positions every 6 h, shared by every candidate of the 'sun' snap. */
let yearEphemeris: EphemerisSeries | null = null

/**
 * Best-lit point: among the highest pixels within `radiusPx`, the one whose (coarse) horizon
 * lets the Sun through for the largest fraction of a year.
 */
function snapToBestLit(g: DemGrid, far: DemGrid, radiusPx: number) {
  yearEphemeris ??= ephemerisSeries(Date.UTC(2026, 0, 1), 6 * 3_600_000, 1461)
  const cc = g.width / 2
  const cr = g.height / 2
  const candidates: { c: number; r: number; v: number }[] = []
  const stride = Math.max(2, Math.round(radiusPx / 25))
  for (let r = Math.floor(cr - radiusPx); r <= cr + radiusPx; r += stride) {
    for (let c = Math.floor(cc - radiusPx); c <= cc + radiusPx; c += stride) {
      if ((c - cc) ** 2 + (r - cr) ** 2 > radiusPx ** 2) continue
      candidates.push({ c, r, v: g.data[r * g.width + c] })
    }
  }
  candidates.sort((a, b) => b.v - a.v)
  let best = { c: Math.round(cc), r: Math.round(cr), lit: -1 }
  for (const cand of candidates.slice(0, 60)) {
    const { lat, lon } = pixelToLatLon(g, cand.c, cand.r)
    const h = computeHorizonMask([g, far], lat, lon, { azStepDeg: 2, growth: 0.01 })
    const s = evaluateSite(yearEphemeris, { lat, lon, heightM: h.terrainHeightM }, h)
    let lit = 0
    for (let i = 0; i < s.count; i++) lit += s.sunFrac[i]
    lit /= s.count
    if (lit > best.lit) best = { c: cand.c, r: cand.r, lit }
  }
  log(`  best-lit candidate: ${(best.lit * 100).toFixed(1)} % of the year`)
  return best
}

interface SiteIndexEntry {
  id: string
  lat: number
  lon: number
  heightM: number
  accuracy: 'lola' | 'spherical'
  maskMaxDeg: number
  hasTerrain: boolean
}

async function buildPolarSite(seed: SiteSeed, far: DemGrid): Promise<SiteIndexEntry> {
  const snapPx = Math.ceil(seed.snapRadiusM / P20.scaleM)
  const band = await loadBand(seed, snapPx + 2)
  const center =
    seed.snapRadiusM <= 0
      ? null
      : seed.snapMode === 'sun'
        ? snapToBestLit(band, far, snapPx)
        : snapToHighPoint(band, snapPx)
  const cc = center ? center.c : Math.round(band.width / 2)
  const cr = center ? center.r : Math.round(band.height / 2)
  const tile = cropGrid(band, cc - TILE / 2, cr - TILE / 2, TILE, TILE)
  // The site sits on the centre pixel of the tile.
  const { lat, lon } = pixelToLatLon(tile, TILE / 2, TILE / 2)

  const t0 = performance.now()
  const horizon = computeHorizonMask([tile, far], lat, lon, { azStepDeg: 0.5 })
  const stats = maskStats(horizon)
  log(
    `${seed.id}: ${lat.toFixed(4)}, ${lon.toFixed(4)} h=${horizon.terrainHeightM.toFixed(0)} m, ` +
      `horizon ${stats.min.toFixed(2)}°…${stats.max.toFixed(2)}° (${(performance.now() - t0).toFixed(0)} ms)`,
  )

  await writeFile(join(OUT, 'terrain', `${seed.id}.bin`), Buffer.from(tile.data.buffer))
  await writeFile(
    join(OUT, 'sites', `${seed.id}.json`),
    JSON.stringify({
      id: seed.id,
      lat: round(lat, 5),
      lon: round(lon, 5),
      heightM: round(horizon.terrainHeightM, 1),
      accuracy: 'lola',
      source: 'LOLA LDEM_80S_20M (±10 km) + LDEM_75S_240M (hasta 300 km)',
      mask: {
        azStepDeg: horizon.azStepDeg,
        elevDeg: Array.from(horizon.elevDeg, (v) => round(v, 3)),
        obstructionKm: Array.from(horizon.obstructionDistM, (v) => round(v / 1000, 2)),
      },
      terrain: { file: `terrain/${seed.id}.bin`, meta: metaOf(tile) },
    }),
  )
  return {
    id: seed.id,
    lat: round(lat, 5),
    lon: round(lon, 5),
    heightM: round(horizon.terrainHeightM, 1),
    accuracy: 'lola',
    maskMaxDeg: round(stats.max, 2),
    hasTerrain: true,
  }
}

async function buildReferenceSite(seed: SiteSeed): Promise<SiteIndexEntry> {
  const mask = sphericalMask(2, 1)
  await writeFile(
    join(OUT, 'sites', `${seed.id}.json`),
    JSON.stringify({
      id: seed.id,
      lat: seed.lat,
      lon: seed.lon,
      heightM: 0,
      accuracy: 'spherical',
      source: 'Horizonte esférico ideal (sin topografía local)',
      mask: { azStepDeg: mask.azStepDeg, elevDeg: Array.from(mask.elevDeg, (v) => round(v, 3)) },
    }),
  )
  return {
    id: seed.id,
    lat: seed.lat,
    lon: seed.lon,
    heightM: 0,
    accuracy: 'spherical',
    maskMaxDeg: round(mask.elevDeg[0], 2),
    hasTerrain: false,
  }
}

async function writeDem(name: string, g: DemGrid) {
  await writeFile(join(OUT, 'dem', `${name}.bin`), Buffer.from(g.data.buffer))
  await writeFile(join(OUT, 'dem', `${name}.json`), JSON.stringify(metaOf(g)))
  log(`dem ${name}: ${g.width}x${g.height} @ ${g.scaleM} m`)
}

async function main() {
  // DE441 (npm run data:ephem) when published; IAU model otherwise.
  setEphemerisTable(await readPublishedTable())
  for (const dir of [CACHE, join(OUT, 'sites'), join(OUT, 'terrain'), join(OUT, 'dem')]) {
    await mkdir(dir, { recursive: true })
  }


  const far = await loadFar()
  await writeDem('south_480m', downsampleGrid(far, 2))
  await writeDem('south_960m', downsampleGrid(far, 4))

  const only = process.argv.slice(2)
  const seeds = SITE_SEEDS.filter((s) => only.length === 0 || only.includes(s.id))
  const entries: SiteIndexEntry[] = []
  for (const seed of seeds) {
    entries.push(
      seed.lat <= -80.2 ? await buildPolarSite(seed, far) : await buildReferenceSite(seed),
    )
  }

  // Merge with an existing index so partial runs (`npm run data -- <id>`) keep other sites.
  const indexPath = join(OUT, 'sites', 'index.json')
  const previous: SiteIndexEntry[] = existsSync(indexPath)
    ? JSON.parse(await readFile(indexPath, 'utf8'))
    : []
  const merged = SITE_SEEDS.map(
    (s) => entries.find((e) => e.id === s.id) ?? previous.find((e) => e.id === s.id),
  ).filter(Boolean)
  await writeFile(indexPath, JSON.stringify(merged, null, 1))
  log(`done: ${entries.length} sites`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
