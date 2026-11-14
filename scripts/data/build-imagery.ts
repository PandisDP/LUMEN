/**
 * Orbital imagery from the two NASA/ASU map portals, published as image tiles:
 *
 *   npm run data:imagery               # everything (cached in data-cache/imagery/)
 *   npm run data:imagery -- <id>…      # only the NAC images of some sites
 *
 * - Moon Trek (NASA/JPL Solar System Treks, WMTS):
 *     LRO WAC global mosaic → public/data/imagery/trek-global/ (orbital globe)
 *     LRO WAC south pole mosaic → public/data/imagery/trek-sp/ (LOLA relief cap)
 * - LROC QuickMap (ASU, WMS behind https://quickmap.lroc.im-ldi.com):
 *     LROC NAC south pole mosaic over the WAC mosaic, 2 × 2 tiles of 1024 px (10 m/px) over
 *     each site's 20 m terrain tile → public/data/imagery/nac/<id>/ (surface view layer)
 *
 * Files are stored as served (no image codec needed) and listed in
 * public/data/imagery/index.json (src/astro/imagery.ts); the app assembles them in a canvas.
 */
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { DemMeta } from '../../src/astro/dem.ts'
import {
  type ImageryIndex,
  type MapExtent,
  type MosaicRef,
  rasterExtent,
  tilePath,
} from '../../src/astro/imagery.ts'
import { CAP_EDGE_LAT } from '../../src/scene/macro/macroGeometry.ts'
import { mapToSouthPolar, southPolarToMap } from '../../src/astro/frames.ts'

const OUT = 'public/data'
const CACHE = 'data-cache/imagery'
const log = (...args: unknown[]) => console.log('[imagery]', ...args)

const TREK = 'https://trek.nasa.gov/tiles/Moon'
const TREK_GLOBAL = `${TREK}/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm`
const TREK_SP = `${TREK}/SP/LRO_WAC_Mosaic_SPole60_100m_v02/1.0.0/default/default028mm`
/** Level 2 of the global mosaic: 8 × 4 tiles of 256 px = 2048 × 1024. */
const GLOBAL_LEVEL = 2
/** Level 3 of the polar mosaic: ~1070 m/px, matching the 960 m DEM of the cap. */
const SP_LEVEL = 3
/** Polar TileMatrixSet (WMTSCapabilities.xml): top-left corner and level-0 tile span (m). */
const SP_TOP_LEFT = 1_095_930
const SP_SPAN0_M = 2_191_860

const LROC_WMS = 'https://wms.im-ldi.com/'
const NAC_LAYERS = 'luna_wac_global,luna_nac_sp_mosaic'
const NAC_GRID = 2
const NAC_TILE_PX = 1024
/** Northern limit of the LROC NAC south pole mosaic (its README). */
const NAC_MOSAIC_LAT = -85.5

/** Share of an extent inside the NAC mosaic (21 × 21 samples). */
function nacCoverage(e: MapExtent): number {
  let inside = 0
  for (let i = 0; i <= 20; i++)
    for (let j = 0; j <= 20; j++) {
      const x = e[0] + ((e[2] - e[0]) * i) / 20
      const y = e[1] + ((e[3] - e[1]) * j) / 20
      if (mapToSouthPolar(x, y).lat <= NAC_MOSAIC_LAT) inside++
    }
  return inside / 441
}

async function cached(url: string, ext: string, attempt = 1): Promise<Buffer> {
  const file = join(CACHE, `${createHash('sha1').update(url).digest('hex').slice(0, 20)}.${ext}`)
  if (existsSync(file)) return readFile(file)
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(300_000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const type = res.headers.get('content-type') ?? ''
    if (!type.startsWith('image/')) throw new Error(`not an image (${type})`)
    const buf = Buffer.from(await res.arrayBuffer())
    await mkdir(CACHE, { recursive: true })
    await writeFile(file, buf)
    return buf
  } catch (err) {
    if (attempt >= 4) throw err
    log(`retry ${attempt} ${url}: ${(err as Error).message}`)
    await new Promise((r) => setTimeout(r, 5000 * attempt))
    return cached(url, ext, attempt + 1)
  }
}

/** Runs `jobs` with at most `n` in flight (the WMS renders 1 m/px data: be gentle). */
async function pool(jobs: (() => Promise<void>)[], n: number) {
  let next = 0
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < jobs.length) await jobs[next++]()
    }),
  )
}

async function save(ref: MosaicRef, r: number, c: number, buf: Buffer) {
  const file = join('public', tilePath(ref, r, c))
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, buf)
}

async function trekGlobal(): Promise<MosaicRef> {
  const cols = 2 << GLOBAL_LEVEL
  const rows = 1 << GLOBAL_LEVEL
  const ref: MosaicRef = {
    source: 'Moon Trek · LRO WAC (NASA/GSFC/ASU)',
    path: 'data/imagery/trek-global/r{r}c{c}.jpg',
    rows,
    cols,
    tileSize: 256,
  }
  const jobs = []
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      jobs.push(async () =>
        save(ref, r, c, await cached(`${TREK_GLOBAL}/${GLOBAL_LEVEL}/${r}/${c}.jpg`, 'jpg')),
      )
  await pool(jobs, 4)
  log(`Moon Trek global: ${cols} × ${rows} tiles`)
  return ref
}

async function trekSouthPole(): Promise<MosaicRef> {
  const span = SP_SPAN0_M / (1 << SP_LEVEL)
  // Radius of the cap (CAP_EDGE_LAT) plus a margin, in the polar plane.
  const radius = Math.hypot(...Object.values(southPolarToMap(CAP_EDGE_LAT - 0.5, 0))) + 10_000
  const first = Math.floor((SP_TOP_LEFT - radius) / span)
  const last = Math.floor((SP_TOP_LEFT + radius) / span)
  const n = last - first + 1
  const extent: MapExtent = [
    -SP_TOP_LEFT + first * span,
    SP_TOP_LEFT - (last + 1) * span,
    -SP_TOP_LEFT + (last + 1) * span,
    SP_TOP_LEFT - first * span,
  ]
  const ref: MosaicRef = {
    source: 'Moon Trek · LRO WAC South Pole (NASA/GSFC/ASU)',
    path: 'data/imagery/trek-sp/r{r}c{c}.png',
    rows: n,
    cols: n,
    tileSize: 256,
    extent,
  }
  const jobs = []
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      jobs.push(async () =>
        save(
          ref,
          r,
          c,
          await cached(`${TREK_SP}/${SP_LEVEL}/${first + r}/${first + c}.png`, 'png'),
        ),
      )
  await pool(jobs, 4)
  log(`Moon Trek south pole: ${n} × ${n} tiles, ${(span / 256).toFixed(0)} m/px`)
  return ref
}

async function nacForSite(id: string, terrain: DemMeta): Promise<MosaicRef> {
  const extent = rasterExtent(terrain)
  const coverage = nacCoverage(extent)
  const ref: MosaicRef = {
    // Outside the NAC mosaic the WMS falls back to the 100 m WAC mosaic: say so.
    source:
      coverage >= 0.99
        ? 'LROC QuickMap · LROC NAC (NASA/GSFC/ASU)'
        : coverage > 0
          ? `LROC QuickMap · LROC NAC (${Math.round(coverage * 100)} %) + LRO WAC 100 m (NASA/GSFC/ASU)`
          : 'LROC QuickMap · LRO WAC 100 m (NASA/GSFC/ASU)',
    path: `data/imagery/nac/${id}/r{r}c{c}.jpg`,
    rows: NAC_GRID,
    cols: NAC_GRID,
    tileSize: NAC_TILE_PX,
    extent,
  }
  const w = (extent[2] - extent[0]) / NAC_GRID
  const h = (extent[3] - extent[1]) / NAC_GRID
  const jobs = []
  for (let r = 0; r < NAC_GRID; r++) {
    for (let c = 0; c < NAC_GRID; c++) {
      const bbox = [
        extent[0] + c * w,
        extent[3] - (r + 1) * h,
        extent[0] + (c + 1) * w,
        extent[3] - r * h,
      ]
      const q = new URLSearchParams({
        SERVICE: 'WMS',
        VERSION: '1.1.1',
        REQUEST: 'GetMap',
        LAYERS: NAC_LAYERS,
        STYLES: '',
        SRS: 'IAU2000:30120',
        BBOX: bbox.map((v) => v.toFixed(1)).join(','),
        WIDTH: String(NAC_TILE_PX),
        HEIGHT: String(NAC_TILE_PX),
        FORMAT: 'image/jpeg',
      })
      jobs.push(async () => save(ref, r, c, await cached(`${LROC_WMS}?${q}`, 'jpg')))
    }
  }
  await pool(jobs, 2)
  log(`${id}: ${ref.source}, ${(w / NAC_TILE_PX).toFixed(1)} m/px`)
  return ref
}

async function main() {
  const only = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const indexFile = join(OUT, 'imagery', 'index.json')
  const index: ImageryIndex = existsSync(indexFile)
    ? JSON.parse(await readFile(indexFile, 'utf8'))
    : { sites: {} }
  if (!only.length) {
    index.globe = await trekGlobal()
    index.cap = await trekSouthPole()
  }
  const files = (await readdir(join(OUT, 'sites'))).filter((f) => f !== 'index.json')
  for (const f of files) {
    const site = JSON.parse(await readFile(join(OUT, 'sites', f), 'utf8'))
    if (!site.terrain || (only.length && !only.includes(site.id))) continue
    index.sites[site.id] = await nacForSite(site.id, site.terrain.meta)
  }
  await mkdir(dirname(indexFile), { recursive: true })
  await writeFile(indexFile, JSON.stringify(index, null, 1) + '\n')
  log(`wrote ${indexFile}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
