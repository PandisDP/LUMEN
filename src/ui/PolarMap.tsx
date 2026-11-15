import { type MouseEvent, useEffect, useMemo, useRef, useState } from 'react'
import { type DemGrid, latLonToPixel, pixelToLatLon, samplePixel } from '../astro/dem.ts'
import { ILLUM_NODATA, type IllumGrid, illumPct } from '../astro/illumination.ts'
import { MACRO_DEM, type SiteInfo, loadSiteDetail } from '../data/catalog.ts'
import { loadDem, loadIllum } from '../data/loadDem.ts'
import { useAsync } from '../hooks/useAsync.ts'
import { context2d, useCanvasSize } from '../hooks/useCanvas.ts'
import { illumRef } from '../hooks/useScience.ts'
import { useLang, useT } from '../i18n/index.ts'
import { useSiteText } from '../i18n/sites.ts'
import { ILLUM_COLORS } from '../scene/micro/illumColors.ts'
import {
  SCENARIO_COLORS,
  SCENARIO_LABELS,
  findSite,
  selectActiveScenario,
  useMissionStore,
} from '../store/useMissionStore.ts'
import { formatLatLon } from './format.ts'
import { POLAR_EDGE_LAT, polarXY } from './locator.ts'

/** Side of the cached raster images (base hillshade and illumination layer), px. */
const RASTER = 512
const DEG = Math.PI / 180
const EDGE = Math.tan(((90 + POLAR_EDGE_LAT) * DEG) / 2)
/** Metres per raster pixel at the pole (used to scale the hillshade gradient). */
const PX_M = (2 * 2 * 1737400 * EDGE) / RASTER
const RINGS = [-82, -84, -86, -88]
const MARKER_HIT_PX = 9

/** Inverse of locator.polarXY: unit-disc position → lat/lon (null outside the disc). */
function polarLatLon(x: number, y: number): { lat: number; lon: number } | null {
  const r = Math.hypot(x, y)
  if (r > 1) return null
  const lat = -90 + (2 * Math.atan(r * EDGE)) / DEG
  const lon = r === 0 ? 0 : Math.atan2(x, -y) / DEG
  return { lat, lon }
}

const hexRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const PSR_RGB = hexRgb(ILLUM_COLORS.psr)
const DIM_RGB = hexRgb(ILLUM_COLORS.dim)
const BRIGHT_RGB = hexRgb(ILLUM_COLORS.bright)

/** Unit-disc coordinates of raster pixel (i, j) centre. */
const rasterXY = (i: number, j: number) => [
  ((i + 0.5) / RASTER) * 2 - 1,
  ((j + 0.5) / RASTER) * 2 - 1,
]

function offscreen(): CanvasRenderingContext2D | null {
  const c = document.createElement('canvas')
  c.width = RASTER
  c.height = RASTER
  try {
    return c.getContext('2d')
  } catch {
    return null
  }
}

/**
 * Hillshade of the polar cap from the 960 m DEM: heights are sampled per raster pixel through
 * the inverse projection, then lit from the upper left with a slight vertical exaggeration.
 */
function buildHillshade(dem: DemGrid): HTMLCanvasElement | null {
  const ctx = offscreen()
  if (!ctx) return null
  const N = RASTER
  const heights = new Float32Array(N * N).fill(NaN)
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const [x, y] = rasterXY(i, j)
      const ll = polarLatLon(x, y)
      if (!ll) continue
      const { c, r } = latLonToPixel(dem, ll.lat, ll.lon)
      heights[j * N + i] = samplePixel(dem, c, r)
    }
  }
  const lx = -0.55
  const ly = -0.55
  const lz = 0.63
  const img = ctx.createImageData(N, N)
  const px = img.data
  const EXAGGERATION = 2.5
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i
      const h = heights[k]
      if (Number.isNaN(h)) continue
      const hl = heights[k - 1]
      const hr = heights[k + 1]
      const hu = heights[k - N]
      const hd = heights[k + N]
      const dzdx = ((Number.isNaN(hr) ? h : hr) - (Number.isNaN(hl) ? h : hl)) / (2 * PX_M)
      const dzdy = ((Number.isNaN(hd) ? h : hd) - (Number.isNaN(hu) ? h : hu)) / (2 * PX_M)
      // Surface normal in screen space (y down): (-dzdx, -dzdy, 1), exaggerated so slopes read.
      const nx = -dzdx * EXAGGERATION
      const ny = -dzdy * EXAGGERATION
      const inv = 1 / Math.hypot(nx, ny, 1)
      const shade = Math.max(0, (nx * lx + ny * ly + lz) * inv)
      // Elevation tint: deep floors slightly bluish, high ground slightly warm.
      const e = Math.max(-1, Math.min(1, h / 6000))
      const base = 55 + 150 * shade
      const o = k * 4
      px[o] = Math.min(255, base + 10 * e)
      px[o + 1] = Math.min(255, base + 4 * e)
      px[o + 2] = Math.min(255, base - 10 * e + 8)
      px[o + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return ctx.canvas
}

/**
 * Illumination patches: for every raster pixel inside a tile's footprint the tile cell under it
 * is looked up through the inverse projection (nearest cell), so the patch has no gaps.
 */
function buildIllumLayer(grids: readonly IllumGrid[]): HTMLCanvasElement | null {
  const ctx = offscreen()
  if (!ctx) return null
  const N = RASTER
  const img = ctx.createImageData(N, N)
  const px = img.data
  for (const g of grids) {
    // Footprint in raster pixels from the tile's corners.
    let i0 = N
    let i1 = -1
    let j0 = N
    let j1 = -1
    for (const [c, r] of [
      [0, 0],
      [g.width - 1, 0],
      [0, g.height - 1],
      [g.width - 1, g.height - 1],
    ]) {
      const ll = pixelToLatLon(g, c, r)
      const [x, y] = polarXY(ll.lat, ll.lon)
      const i = ((x + 1) / 2) * N
      const j = ((y + 1) / 2) * N
      i0 = Math.min(i0, Math.floor(i) - 1)
      i1 = Math.max(i1, Math.ceil(i) + 1)
      j0 = Math.min(j0, Math.floor(j) - 1)
      j1 = Math.max(j1, Math.ceil(j) + 1)
    }
    for (let j = Math.max(0, j0); j <= Math.min(N - 1, j1); j++) {
      for (let i = Math.max(0, i0); i <= Math.min(N - 1, i1); i++) {
        const [x, y] = rasterXY(i, j)
        const ll = polarLatLon(x, y)
        if (!ll) continue
        const { c, r } = latLonToPixel(g, ll.lat, ll.lon)
        const ci = Math.round(c)
        const ri = Math.round(r)
        if (ci < 0 || ri < 0 || ci >= g.width || ri >= g.height) continue
        const v = g.data[ri * g.width + ci]
        if (v === ILLUM_NODATA) continue
        const o = (j * N + i) * 4
        if (v === 0) {
          px[o] = PSR_RGB[0]
          px[o + 1] = PSR_RGB[1]
          px[o + 2] = PSR_RGB[2]
        } else {
          const f = Math.sqrt(Math.min(1, illumPct(v) / 100))
          for (let k = 0; k < 3; k++) px[o + k] = DIM_RGB[k] + (BRIGHT_RGB[k] - DIM_RGB[k]) * f
        }
        px[o + 3] = 235
      }
    }
  }
  ctx.putImageData(img, 0, 0)
  return ctx.canvas
}

/** Canvas position of a point for a disc centred at (cx, cy) with radius R. */
function project(lat: number, lon: number, cx: number, cy: number, R: number) {
  const [x, y] = polarXY(lat, lon)
  return [cx + x * R, cy + y * R] as const
}

const isPolarSite = (s: SiteInfo) => !s.custom && s.lat <= POLAR_EDGE_LAT

interface Hover {
  x: number
  y: number
  lat: number
  lon: number
  siteId?: string
}

/**
 * 2D map of the lunar south polar cap (80°S-90°S, stereographic, 0° longitude up): hillshade
 * from the regional DEM, the yearly illumination patches of the curated sites (PSR in blue)
 * and the site markers; the active scenario's site is highlighted and markers are clickable.
 */
export function PolarMap() {
  const t = useT()
  const lang = useLang()
  const siteText = useSiteText()
  const sites = useMissionStore((s) => s.sites)
  const scenarios = useMissionStore((s) => s.scenarios)
  const active = useMissionStore(selectActiveScenario)
  const selectSite = useMissionStore((s) => s.selectSite)
  const [showIllum, setShowIllum] = useState(true)
  const [hover, setHover] = useState<Hover | null>(null)
  const { ref, width, height, dpr } = useCanvasSize()

  const polarSites = useMemo(() => sites.filter(isPolarSite), [sites])
  const dem = useAsync('polar-dem', () => loadDem(MACRO_DEM.bin, MACRO_DEM.meta))
  const illumKey = polarSites.length ? `polar-illum:${polarSites.map((s) => s.id).join(',')}` : null
  const illum = useAsync(illumKey, async () => {
    const grids = await Promise.all(
      polarSites.map(async (s) => {
        try {
          const r = illumRef(await loadSiteDetail(s))
          return r ? await loadIllum(r.bin, r.meta) : null
        } catch {
          return null
        }
      }),
    )
    return grids.filter((g): g is IllumGrid => g !== null)
  })

  // Rasters are computed once per data set and reused on every redraw.
  const baseCache = useRef<{ dem: DemGrid; canvas: HTMLCanvasElement | null } | null>(null)
  const illumCache = useRef<{
    grids: readonly IllumGrid[]
    canvas: HTMLCanvasElement | null
  } | null>(null)

  const S = Math.min(width, height)
  const ox = (width - S) / 2
  const oy = (height - S) / 2
  const R = S / 2 - 12
  const toCanvas = (lat: number, lon: number) => project(lat, lon, ox + S / 2, oy + S / 2, R)

  const compare = scenarios.length > 1
  const west = lang === 'es' ? 'O' : 'W'
  const activeSiteId = active?.siteId

  useEffect(() => {
    const ctx = context2d(ref.current, width, height, dpr)
    if (!ctx || S <= 0) return
    const cx = ox + S / 2
    const cy = oy + S / 2

    // Disc background.
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, R, 0, Math.PI * 2)
    ctx.fillStyle = '#3b3d45'
    ctx.fill()
    ctx.clip()
    if (dem.data) {
      if (baseCache.current?.dem !== dem.data)
        baseCache.current = { dem: dem.data, canvas: buildHillshade(dem.data) }
      const base = baseCache.current.canvas
      if (base) ctx.drawImage(base, cx - R, cy - R, 2 * R, 2 * R)
    }
    if (showIllum && illum.data?.length) {
      if (illumCache.current?.grids !== illum.data)
        illumCache.current = { grids: illum.data, canvas: buildIllumLayer(illum.data) }
      const layer = illumCache.current.canvas
      if (layer) {
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(layer, cx - R, cy - R, 2 * R, 2 * R)
        ctx.imageSmoothingEnabled = true
      }
    }
    ctx.restore()

    // Graticule: latitude rings every 2° and the 0°/90° meridians.
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgb(255 255 255 / .22)'
    ctx.fillStyle = 'rgb(255 255 255 / .6)'
    ctx.font = '10px Inter, system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    for (const lat of RINGS) {
      const r = -polarXY(lat, 0)[1] * R
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillText(`${-lat}°S`, cx + r * Math.SQRT1_2 + 2, cy - r * Math.SQRT1_2 - 1)
    }
    ctx.strokeStyle = 'rgb(255 255 255 / .14)'
    ctx.beginPath()
    ctx.moveTo(cx, cy - R)
    ctx.lineTo(cx, cy + R)
    ctx.moveTo(cx - R, cy)
    ctx.lineTo(cx + R, cy)
    ctx.stroke()
    ctx.strokeStyle = 'rgb(148 184 255 / .45)'
    ctx.beginPath()
    ctx.arc(cx, cy, R, 0, Math.PI * 2)
    ctx.stroke()
    // Pole cross.
    ctx.strokeStyle = 'rgb(255 255 255 / .8)'
    ctx.beginPath()
    ctx.moveTo(cx - 4, cy - 4)
    ctx.lineTo(cx + 4, cy + 4)
    ctx.moveTo(cx + 4, cy - 4)
    ctx.lineTo(cx - 4, cy + 4)
    ctx.stroke()

    // Direction labels: the Earth lies towards 0° longitude (top).
    ctx.fillStyle = '#e9eef8'
    ctx.font = 'bold 11px Inter, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillText('⊕ 0°', cx, cy - R - 2)
    ctx.font = '10px Inter, system-ui, sans-serif'
    ctx.fillStyle = 'rgb(255 255 255 / .7)'
    ctx.textBaseline = 'top'
    ctx.fillText('180°', cx, cy + R + 2)
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.fillText('90°E', cx + R + 3, cy)
    ctx.textAlign = 'right'
    ctx.fillText(`90°${west}`, cx - R - 3, cy)

    // Site markers: plain dots, the active (or each compared) scenario highlighted.
    const scenarioOf = new Map<string, number>()
    scenarios.forEach((sc, i) => {
      if (!scenarioOf.has(sc.siteId)) scenarioOf.set(sc.siteId, i)
    })
    ctx.font = 'bold 11px Inter, system-ui, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    for (const s of polarSites) {
      const [x, y] = project(s.lat, s.lon, cx, cy, R)
      const idx = scenarioOf.get(s.id)
      const highlighted = compare ? idx !== undefined : s.id === activeSiteId
      if (!highlighted) {
        ctx.beginPath()
        ctx.arc(x, y, 3, 0, Math.PI * 2)
        ctx.fillStyle = '#e9eef8'
        ctx.fill()
        ctx.lineWidth = 1
        ctx.strokeStyle = '#000'
        ctx.stroke()
      }
    }
    for (const s of polarSites) {
      const idx = scenarioOf.get(s.id)
      const highlighted = compare ? idx !== undefined : s.id === activeSiteId
      if (!highlighted) continue
      const [x, y] = project(s.lat, s.lon, cx, cy, R)
      const color = compare ? SCENARIO_COLORS[idx ?? 0] : SCENARIO_COLORS[0]
      ctx.beginPath()
      ctx.arc(x, y, 8, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.globalAlpha = 0.3
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.beginPath()
      ctx.arc(x, y, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.lineWidth = 1.2
      ctx.strokeStyle = '#000'
      ctx.stroke()
      const label = compare ? SCENARIO_LABELS[idx ?? 0] : (siteText(s)?.name ?? s.name)
      ctx.fillStyle = color
      ctx.strokeStyle = 'rgb(0 0 0 / .8)'
      ctx.lineWidth = 3
      ctx.strokeText(label, x + 7, y - 7)
      ctx.fillText(label, x + 7, y - 7)
    }
  }, [
    ref,
    width,
    height,
    dpr,
    S,
    ox,
    oy,
    R,
    dem.data,
    illum.data,
    showIllum,
    polarSites,
    scenarios,
    compare,
    activeSiteId,
    siteText,
    west,
  ])

  const locate = (e: MouseEvent<HTMLCanvasElement>): Hover | null => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    if (R <= 0) return null
    const ll = polarLatLon((px - ox - S / 2) / R, (py - oy - S / 2) / R)
    if (!ll) return null
    let siteId: string | undefined
    let best = MARKER_HIT_PX
    for (const s of polarSites) {
      const [x, y] = toCanvas(s.lat, s.lon)
      const d = Math.hypot(x - px, y - py)
      if (d < best) {
        best = d
        siteId = s.id
      }
    }
    return { x: px, y: py, lat: ll.lat, lon: ll.lon, siteId }
  }

  const hoverSite = hover?.siteId ? findSite(sites, hover.siteId) : undefined
  const noIllum = illumKey === null || (!illum.loading && !illum.data?.length)

  return (
    <div className="polar-map">
      <div className="polar-map__stage">
        <canvas
          ref={ref}
          className="polar-map__canvas"
          role="img"
          aria-label={t('polar.aria')}
          onPointerMove={(e) => setHover(locate(e))}
          onPointerLeave={() => setHover(null)}
          onClick={(e) => {
            const h = locate(e)
            if (h?.siteId) selectSite(h.siteId)
          }}
          style={{ cursor: hover?.siteId ? 'pointer' : 'crosshair' }}
        />
        {hover && (
          <div className="polar-map__tip" style={{ left: hover.x, top: hover.y }}>
            {hoverSite && <strong>{siteText(hoverSite)?.name ?? hoverSite.name}</strong>}
            <span>{formatLatLon(hover.lat, hover.lon)}</span>
          </div>
        )}
      </div>
      <div className="polar-map__side">
        <label className="toggle">
          <input
            type="checkbox"
            checked={showIllum}
            onChange={(e) => setShowIllum(e.target.checked)}
          />
          {t('polar.illum')}
        </label>
        <ul className="polar-map__legend">
          <li>
            <span className="polar-map__swatch" style={{ background: ILLUM_COLORS.psr }} />
            {t('polar.psr')}
          </li>
          <li>
            <span className="polar-map__swatch polar-map__ramp" />
            {t('polar.lit')}
          </li>
          <li>
            <span className="polar-map__swatch polar-map__swatch--shade" />
            {t('polar.relief')}
          </li>
          <li>
            <span className="polar-map__dot polar-map__dot--active" />
            {compare ? t('polar.scenarios') : t('polar.active')}
          </li>
          <li>
            <span className="polar-map__dot" />
            {t('polar.sites')}
          </li>
        </ul>
        <p className="hint">
          {dem.loading && !dem.data
            ? t('polar.loading')
            : dem.error && !dem.data
              ? t('polar.noDem')
              : noIllum && showIllum
                ? t('polar.noIllum')
                : t('polar.hint')}
        </p>
      </div>
    </div>
  )
}
