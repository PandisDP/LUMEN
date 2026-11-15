/**
 * LOLA global gridded topography (PDS Geosciences, LOLA GDR, simple cylindrical) for the
 * sites outside the south polar products.
 *
 * Products (all LSB Int16, height_m = DN * 0.5 over the 1737.4 km sphere, no missing data;
 * line 0 at 90°N, sample 0 at 0°E, pixel centres at half-pixel offsets):
 *   LDEM_64   64 px/deg (474 m at the equator), one 531 MB file
 *   LDEM_512  512 px/deg (59 m), sixteen 45° x 90° tiles of 2.1 GB
 *
 * Only the pixels around a site are fetched: the server honours multi-range requests, so a
 * window costs megabytes instead of the whole product. Windows are cached in data-cache/.
 */
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { type DemGrid, type DemMeta, demCovers, pixelToLatLon } from '../../src/astro/dem.ts'
import { wrap180, wrap360 } from '../../src/astro/frames.ts'

const PDS =
  'https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img'

/** A global cylindrical product, possibly split in tiles of latTileDeg x lonTileDeg. */
export interface CylProduct {
  name: string
  /** Pixels per degree. */
  ppd: number
  latTileDeg: number
  lonTileDeg: number
  /** File of the tile whose north edge is `latN` and west edge is `lonW` (0-360). */
  file: (latN: number, lonW: number) => string
}

export const LDEM_64: CylProduct = {
  name: 'LDEM_64',
  ppd: 64,
  latTileDeg: 180,
  lonTileDeg: 360,
  file: () => 'ldem_64.img',
}

const latTag = (lat: number, north: boolean) =>
  `${String(Math.abs(lat)).padStart(2, '0')}${north ? 'n' : 's'}`

export const LDEM_512: CylProduct = {
  name: 'LDEM_512',
  ppd: 512,
  latTileDeg: 45,
  lonTileDeg: 90,
  // e.g. ldem_512_00n_45n_000_090.img, ldem_512_45s_00s_270_360.img (south edge first).
  file: (latN, lonW) => {
    const north = latN > 0
    const pad = (v: number) => String(v).padStart(3, '0')
    return `ldem_512_${latTag(latN - 45, north)}_${latTag(latN, north)}_${pad(lonW)}_${pad(lonW + 90)}.img`
  },
}

/**
 * A rectangle of a global product. Columns are "unwrapped": col0 may be negative or the
 * window may run past 360°, so a site next to the 0° meridian gets one contiguous raster.
 */
export interface CylWindow {
  ppd: number
  row0: number
  col0: number
  rows: number
  cols: number
  /** Longitude (0-360) the unwrapping is centred on. */
  lonC: number
  data: Int16Array
}

interface Segment {
  file: string
  start: number
  length: number
  /** Byte offset in the window buffer. */
  dest: number
}

const mod = (a: number, n: number) => ((a % n) + n) % n

/** Byte ranges (per file) that make up a window. */
export function windowSegments(
  p: CylProduct,
  w: Pick<CylWindow, 'row0' | 'col0' | 'rows' | 'cols'>,
): Segment[] {
  const width = 360 * p.ppd
  const tw = p.lonTileDeg * p.ppd
  const th = p.latTileDeg * p.ppd
  const out: Segment[] = []
  for (let r = 0; r < w.rows; r++) {
    const row = w.row0 + r
    const tj = Math.floor(row / th)
    let c = w.col0
    const end = w.col0 + w.cols
    while (c < end) {
      const cm = mod(c, width)
      const ti = Math.floor(cm / tw)
      const local = cm - ti * tw
      const n = Math.min(end - c, tw - local)
      out.push({
        file: p.file(90 - tj * p.latTileDeg, ti * p.lonTileDeg),
        start: ((row - tj * th) * tw + local) * 2,
        length: n * 2,
        dest: (r * w.cols + (c - w.col0)) * 2,
      })
      c += n
    }
  }
  return out
}

/** Parses a multipart/byteranges body into its parts (binary safe: lengths from the headers). */
export function parseByteRanges(body: Buffer, boundary: string): { start: number; data: Buffer }[] {
  const parts: { start: number; data: Buffer }[] = []
  const marker = Buffer.from(`--${boundary}`)
  let pos = body.indexOf(marker)
  while (pos >= 0) {
    pos += marker.length
    if (body.subarray(pos, pos + 2).toString('latin1') === '--') break
    const headEnd = body.indexOf('\r\n\r\n', pos)
    if (headEnd < 0) throw new Error('multipart: truncated part header')
    const m = /content-range:\s*bytes\s+(\d+)-(\d+)\//i.exec(
      body.subarray(pos, headEnd).toString('latin1'),
    )
    if (!m) throw new Error('multipart: part without Content-Range')
    const start = Number(m[1])
    const length = Number(m[2]) - start + 1
    const data = body.subarray(headEnd + 4, headEnd + 4 + length)
    if (data.length !== length) throw new Error('multipart: truncated part body')
    parts.push({ start, data })
    pos = body.indexOf(marker, headEnd + 4 + length)
  }
  return parts
}

const RANGES_PER_REQUEST = 48

async function fetchRanges(url: string, segs: Segment[], out: Buffer, attempt = 1): Promise<void> {
  try {
    const header = segs.map((s) => `${s.start}-${s.start + s.length - 1}`).join(',')
    const res = await fetch(url, { headers: { Range: `bytes=${header}` } })
    if (res.status !== 206) {
      // A 200 would be the whole multi-gigabyte file: never read it.
      await res.body?.cancel()
      throw new Error(`HTTP ${res.status} (expected 206) for ${url}`)
    }
    const body = Buffer.from(await res.arrayBuffer())
    const type = res.headers.get('content-type') ?? ''
    const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(type)
    let parts: { start: number; data: Buffer }[]
    if (boundary) parts = parseByteRanges(body, boundary[1] ?? boundary[2])
    else {
      const m = /bytes\s+(\d+)-/i.exec(res.headers.get('content-range') ?? '')
      if (!m) throw new Error('206 without Content-Range')
      parts = [{ start: Number(m[1]), data: body }]
    }
    // The server may coalesce adjacent ranges: copy by overlap and check nothing is missing.
    let got = 0
    for (const s of segs) {
      for (const part of parts) {
        const a = Math.max(s.start, part.start)
        const b = Math.min(s.start + s.length, part.start + part.data.length)
        if (b <= a) continue
        part.data.copy(out, s.dest + (a - s.start), a - part.start, b - part.start)
        got += b - a
      }
    }
    const want = segs.reduce((n, s) => n + s.length, 0)
    if (got !== want) throw new Error(`byte ranges: got ${got} of ${want} bytes`)
  } catch (err) {
    if (attempt >= 4) throw err
    console.log(`[data] retry ${attempt} ${url}: ${(err as Error).message}`)
    await new Promise((r) => setTimeout(r, 2000 * attempt))
    return fetchRanges(url, segs, out, attempt + 1)
  }
}

/**
 * The window of `p` that covers every pixel of the (stereographic) raster `target`, with a
 * small margin for the bilinear resampling.
 */
export function windowFor(p: CylProduct, target: DemMeta, lonCenter: number) {
  const width = 360 * p.ppd
  const height = 180 * p.ppd
  const lonC = wrap360(lonCenter)
  let rMin = Infinity
  let rMax = -Infinity
  let cMin = Infinity
  let cMax = -Infinity
  // The extremes of latitude and of longitude are reached on the border, unless a pole is
  // inside (then every longitude is needed).
  const visit = (c: number, r: number) => {
    const { lat, lon } = pixelToLatLon(target, c, r)
    const rowF = (90 - lat) * p.ppd - 0.5
    const colF = (lonC + wrap180(lon - lonC)) * p.ppd - 0.5
    rMin = Math.min(rMin, rowF)
    rMax = Math.max(rMax, rowF)
    cMin = Math.min(cMin, colF)
    cMax = Math.max(cMax, colF)
  }
  for (let i = 0; i < target.width; i++) {
    visit(i, 0)
    visit(i, target.height - 1)
  }
  for (let j = 0; j < target.height; j++) {
    visit(0, j)
    visit(target.width - 1, j)
  }
  const pad = 2
  const south = demCovers(target, -90, 0, 0)
  const north = demCovers(target, 90, 0, 0)
  let row0 = north ? 0 : Math.max(0, Math.floor(rMin) - pad)
  const row1 = south ? height - 1 : Math.min(height - 1, Math.ceil(rMax) + pad)
  let col0 = Math.floor(cMin) - pad
  let cols = Math.ceil(cMax) + pad - col0 + 1
  if (south || north || cols >= width) {
    // Whole parallels, plus the wrapped columns the bilinear filter needs at the seam.
    col0 = Math.floor((lonC - 180) * p.ppd - 0.5) - pad
    cols = width + 2 * pad + 1
  }
  row0 = Math.min(row0, row1)
  return { row0, col0, rows: row1 - row0 + 1, cols, lonC }
}

export async function loadWindow(
  p: CylProduct,
  spec: ReturnType<typeof windowFor>,
  cacheDir: string,
  label: string,
): Promise<CylWindow> {
  const name = `cyl-${p.ppd}-${spec.row0}-${spec.col0}-${spec.rows}x${spec.cols}.bin`
  const path = join(cacheDir, name)
  let bytes: Buffer
  if (existsSync(path)) bytes = await readFile(path)
  else {
    bytes = Buffer.alloc(spec.rows * spec.cols * 2)
    const byFile = new Map<string, Segment[]>()
    for (const s of windowSegments(p, spec)) {
      const list = byFile.get(s.file) ?? []
      list.push(s)
      byFile.set(s.file, list)
    }
    console.log(
      `[data] ${label}: fetching ${(bytes.length / 1e6).toFixed(1)} MB of ${p.name} ` +
        `(${spec.rows}x${spec.cols} px, ${byFile.size} file${byFile.size > 1 ? 's' : ''})…`,
    )
    for (const [file, segs] of byFile) {
      const batches: Segment[][] = []
      for (let i = 0; i < segs.length; i += RANGES_PER_REQUEST) {
        batches.push(segs.slice(i, i + RANGES_PER_REQUEST))
      }
      // Two requests at a time: polite to the PDS node, and the link is the bottleneck anyway.
      let next = 0
      const worker = async () => {
        while (next < batches.length) await fetchRanges(`${PDS}/${file}`, batches[next++], bytes)
      }
      await Promise.all([worker(), worker()])
    }
    await writeFile(path, bytes)
  }
  const data = new Int16Array(bytes.length / 2)
  for (let i = 0; i < data.length; i++) data[i] = bytes.readInt16LE(i * 2)
  return { ppd: p.ppd, ...spec, data }
}

/** Bilinear DN of a window at (lat, lon); NaN outside. Rows are clamped at the poles. */
export function sampleWindow(w: CylWindow, lat: number, lon: number): number {
  const height = 180 * w.ppd
  const rowG = Math.max(0, Math.min(height - 1, (90 - lat) * w.ppd - 0.5))
  const r = rowG - w.row0
  const c = (w.lonC + wrap180(lon - w.lonC)) * w.ppd - 0.5 - w.col0
  if (!(c >= 0 && r >= 0 && c <= w.cols - 1 && r <= w.rows - 1)) return NaN
  const c0 = Math.min(Math.floor(c), w.cols - 2)
  const r0 = Math.max(0, Math.min(Math.floor(r), w.rows - 2))
  const tc = c - c0
  const tr = w.rows > 1 ? r - r0 : 0
  const i = r0 * w.cols + c0
  const j = w.rows > 1 ? i + w.cols : i
  const top = w.data[i] + (w.data[i + 1] - w.data[i]) * tc
  const bottom = w.data[j] + (w.data[j + 1] - w.data[j]) * tc
  return top + (bottom - top) * tr
}

/** Resamples a window into the raster described by `meta` (Int16 DNs, same 0.5 m scale). */
export function resampleWindow(w: CylWindow, meta: DemMeta): DemGrid {
  const data = new Int16Array(meta.width * meta.height)
  for (let r = 0; r < meta.height; r++) {
    for (let c = 0; c < meta.width; c++) {
      const { lat, lon } = pixelToLatLon(meta, c, r)
      const v = sampleWindow(w, lat, lon)
      if (Number.isNaN(v))
        throw new Error(`window does not cover ${lat.toFixed(3)}, ${lon.toFixed(3)}`)
      data[r * meta.width + c] = Math.round(v)
    }
  }
  return { ...meta, data }
}

/** Square raster of `size` px at `scaleM`, oblique stereographic, site on pixel (size/2, size/2). */
export function localMeta(lat: number, lon: number, size: number, scaleM: number): DemMeta {
  const half = (size / 2) * scaleM
  return {
    originX: -half,
    originY: half,
    scaleM,
    width: size,
    height: size,
    heightScale: 0.5,
    projection: { kind: 'stereo', lat0: lat, lon0: lon },
  }
}
