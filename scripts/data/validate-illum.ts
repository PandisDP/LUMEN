/**
 * Cross-check of our illumination products against the LRO maps served by LROC QuickMap and
 * Moon Trek:
 *
 *   npm run validate:illum
 *
 * 1. Sun, per cell: our yearly illumination maps (public/data/illum/<id>.bin, 100 m) against
 *    the LROC WAC percentage-of-illumination map of Speyerer & Robinson (2013, Icarus 222),
 *    layer `luna_polar_illumination_pct` of the QuickMap WMS (88°S-90°S only).
 * 2. Earth, per site: our yearly Earth visibility (site horizon mask + DE441 table) against the
 *    LOLA mean Earth visibility map of Moon Trek (`AVGVISIB_85S_060M_201608_EARTH_SP`, WMTS).
 *
 * Both reference layers are published as display images with an undocumented grey stretch,
 * so the comparison uses only order-preserving statistics: Spearman rank correlation, and the
 * overlap of the permanently shadowed cells (ours: never lit; theirs: darkest grey class).
 * Results go to src/astro/__fixtures__/illum-validation.json (checked by the unit tests).
 */
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pixelToLatLon } from '../../src/astro/dem.ts'
import { ephemerisSeries, setEphemerisTable } from '../../src/astro/ephemeris.ts'
import { southPolarToMap } from '../../src/astro/frames.ts'
import { rasterExtent } from '../../src/astro/imagery.ts'
import { ILLUM_NODATA, type IllumMeta, illumPct } from '../../src/astro/illumination.ts'
import { evaluateSite } from '../../src/astro/series.ts'
import { readPublishedTable } from './horizons.ts'
import { decodePng } from './png.ts'

const OUT = 'public/data'
const CACHE = 'data-cache/validation'
const FIXTURE = 'src/astro/__fixtures__/illum-validation.json'
const LROC_WMS = 'https://wms.im-ldi.com/'
const SUN_LAYER = 'luna_polar_illumination_pct'
/** Southern limit of the Speyerer & Robinson map (88°S-90°S), with a one-cell margin. */
const SUN_LAYER_LAT = -88.05
/** Darkest class of the LROC map (never illuminated in the 12 lunations): grey 0 is never used. */
const REF_PSR_GREY = 1
const EARTH_TILES =
  'https://trek.nasa.gov/tiles/Moon/SP/AVGVISIB_85S_060M_201608_EARTH_SP/1.0.0/default/default028mm'
/** Level 6 of the Moon Trek polar matrix: 2 191 860 m / (256 · 64) ≈ 134 m/px. */
const EARTH_LEVEL = 6
const SP_TOP_LEFT = 1_095_930
const SP_SPAN0_M = 2_191_860

const log = (...a: unknown[]) => console.log('[validate:illum]', ...a)

async function cached(url: string): Promise<Buffer> {
  const file = join(CACHE, `${createHash('sha1').update(url).digest('hex').slice(0, 20)}.png`)
  if (existsSync(file)) return readFile(file)
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(300_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      await mkdir(CACHE, { recursive: true })
      await writeFile(file, buf)
      return buf
    } catch (err) {
      if (attempt >= 4) throw err
      log(`retry ${attempt}: ${(err as Error).message}`)
      await new Promise((r) => setTimeout(r, 5000 * attempt))
    }
  }
}

/** Average ranks (ties share their mean rank). */
function ranks(v: readonly number[]): number[] {
  const idx = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0])
  const out = new Array<number>(v.length)
  for (let i = 0; i < idx.length;) {
    let j = i
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++
    for (let k = i; k <= j; k++) out[idx[k][1]] = (i + j) / 2
    i = j + 1
  }
  return out
}

export function spearman(a: readonly number[], b: readonly number[]): number {
  const ra = ranks(a)
  const rb = ranks(b)
  const n = a.length
  const ma = ra.reduce((s, x) => s + x, 0) / n
  const mb = rb.reduce((s, x) => s + x, 0) / n
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < n; i++) {
    num += (ra[i] - ma) * (rb[i] - mb)
    da += (ra[i] - ma) ** 2
    db += (rb[i] - mb) ** 2
  }
  return num / Math.sqrt(da * db)
}

const round = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d

interface SunResult {
  site: string
  cells: number
  spearman: number
  psrCellsOurs: number
  psrCellsRef: number
  /** Intersection over union of the PSR cells. */
  psrIou: number
}

async function validateSun(id: string, meta: IllumMeta): Promise<SunResult | null> {
  const ours = new Uint8Array(await readFile(join(OUT, 'illum', `${id}.bin`)))
  const e = rasterExtent(meta)
  const q = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.1.1',
    REQUEST: 'GetMap',
    LAYERS: SUN_LAYER,
    STYLES: '',
    SRS: 'IAU2000:30120',
    BBOX: e.map((v) => v.toFixed(1)).join(','),
    WIDTH: String(meta.width),
    HEIGHT: String(meta.height),
    FORMAT: 'image/png',
    TRANSPARENT: 'TRUE',
  })
  const ref = decodePng(await cached(`${LROC_WMS}?${q}`))
  if (ref.width !== meta.width || ref.height !== meta.height) throw new Error('size mismatch')
  const a: number[] = []
  const b: number[] = []
  let psrOurs = 0
  let psrRef = 0
  let psrBoth = 0
  for (let r = 0; r < meta.height; r++) {
    for (let c = 0; c < meta.width; c++) {
      const i = r * meta.width + c
      const v = ours[i]
      if (v === ILLUM_NODATA || !ref.valid[i]) continue
      if (pixelToLatLon(meta, c, r).lat > SUN_LAYER_LAT) continue
      a.push(illumPct(v))
      b.push(ref.grey[i])
      const po = v === 0
      const pr = ref.grey[i] <= REF_PSR_GREY
      psrOurs += +po
      psrRef += +pr
      psrBoth += +(po && pr)
    }
  }
  if (a.length < 100) return null
  const union = psrOurs + psrRef - psrBoth
  return {
    site: id,
    cells: a.length,
    spearman: round(spearman(a, b)),
    psrCellsOurs: psrOurs,
    psrCellsRef: psrRef,
    psrIou: union ? round(psrBoth / union) : 1,
  }
}

/** Grey level of the Moon Trek Earth visibility map at a point (nearest pixel). */
async function earthGreyAt(lat: number, lon: number): Promise<number> {
  const { x, y } = southPolarToMap(lat, lon)
  const px = SP_SPAN0_M / (256 << EARTH_LEVEL)
  const gc = Math.floor((x + SP_TOP_LEFT) / px)
  const gr = Math.floor((SP_TOP_LEFT - y) / px)
  const tile = decodePng(await cached(`${EARTH_TILES}/${EARTH_LEVEL}/${gr >> 8}/${gc >> 8}.png`))
  return tile.grey[(gr & 255) * 256 + (gc & 255)]
}

async function main() {
  const index = JSON.parse(await readFile(join(OUT, 'sites', 'index.json'), 'utf8')) as {
    id: string
    lat: number
    lon: number
    heightM: number
    hasTerrain?: boolean
  }[]
  setEphemerisTable(await readPublishedTable())
  const sun: SunResult[] = []
  const earth: { site: string; oursPct: number; refGrey: number }[] = []
  // One year every 6 h covers the libration cycle for the Earth.
  const year = ephemerisSeries(Date.UTC(2027, 0, 1), 6 * 3_600_000, 1461)
  for (const s of index.filter((x) => x.hasTerrain)) {
    const json = JSON.parse(await readFile(join(OUT, 'sites', `${s.id}.json`), 'utf8'))
    if (json.illum) {
      const res = await validateSun(s.id, json.illum.meta)
      if (res) {
        sun.push(res)
        log(
          `Sun   ${s.id.padEnd(17)} ${res.cells} cells, Spearman ${res.spearman.toFixed(2)}, PSR IoU ${res.psrIou.toFixed(2)} (${res.psrCellsOurs} ours / ${res.psrCellsRef} LROC)`,
        )
      } else log(`Sun   ${s.id.padEnd(17)} outside the 88°S-90°S reference map`)
    }
    const series = evaluateSite(year, s, json.mask)
    let seen = 0
    for (let i = 0; i < series.count; i++) seen += series.earthFrac[i] >= 0.5 ? 1 : 0
    const oursPct = round((100 * seen) / series.count, 1)
    const refGrey = await earthGreyAt(s.lat, s.lon)
    earth.push({ site: s.id, oursPct, refGrey })
    log(
      `Earth ${s.id.padEnd(17)} ours ${oursPct.toFixed(1)} % of the year, Moon Trek grey ${refGrey}`,
    )
  }
  const earthSpearman = round(
    spearman(
      earth.map((e) => e.oursPct),
      earth.map((e) => e.refGrey),
    ),
  )
  log(`Earth visibility across ${earth.length} sites: Spearman ${earthSpearman.toFixed(2)}`)
  await writeFile(
    FIXTURE,
    JSON.stringify(
      {
        sunReference: `LROC QuickMap WMS ${SUN_LAYER} (Speyerer & Robinson 2013)`,
        earthReference: 'Moon Trek AVGVISIB_85S_060M_201608_EARTH_SP (LOLA, Mazarico et al.)',
        sun,
        earth,
        earthSpearman,
      },
      null,
      1,
    ) + '\n',
  )
  log(`wrote ${FIXTURE}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
