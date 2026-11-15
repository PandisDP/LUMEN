import { type MouseEvent, useEffect, useMemo, useState } from 'react'
import { DEM_NODATA, type DemGrid, demCovers, latLonToPixel, pixelToLatLon } from '../astro/dem.ts'
import { ILLUM_NODATA, type IllumGrid, illumAt, illumPct } from '../astro/illumination.ts'
import { iceTargetsOf, tileForPoint } from '../config/iceTargets.ts'
import { asset } from '../data/catalog.ts'
import { loadDem, loadIllum } from '../data/loadDem.ts'
import { useAsync } from '../hooks/useAsync.ts'
import { context2d, useCanvasSize } from '../hooks/useCanvas.ts'
import { useLang, useT } from '../i18n/index.ts'
import { useSiteText } from '../i18n/sites.ts'
import { ILLUM_COLORS } from '../scene/micro/illumColors.ts'
import { findSite, useMissionStore } from '../store/useMissionStore.ts'
import { usePlannerStore } from '../store/usePlannerStore.ts'
import { DARK_CHART_THEME as MAP, alpha, chartFont, levelInk } from './chartTheme.ts'
import { formatDistance, formatLatLon, formatPct } from './format.ts'
import { scoreLevel } from './levels.ts'
import { Busy } from './kit/Busy.tsx'
import { Notice } from './kit/Notice.tsx'
import { usePlanTiles } from './plannerInputs.ts'
import { formatPlanDate, rankByDay, topDays } from './plannerView.ts'

const hexRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const PSR_RGB = hexRgb(ILLUM_COLORS.psr)
const LIT_RGB = hexRgb(ILLUM_COLORS.bright)
// The map is terrain imagery, dark in both themes: its marks use the dark palette (MAP).
const HIT_PX = 11
/** The view fits the search radius with this much air around it. */
const FIT = 1.6
const SCALE_STEPS_M = [100, 200, 500, 1000, 2000, 5000, 10_000]

function offscreen(w: number, h: number): CanvasRenderingContext2D | null {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  try {
    return c.getContext('2d')
  } catch {
    return null
  }
}

/** Hillshade of the 20 m tile, one image pixel per cell, lit from the upper left. */
function buildHillshade(dem: DemGrid): HTMLCanvasElement | null {
  const { width: W, height: H, data, heightScale, scaleM } = dem
  const ctx = offscreen(W, H)
  if (!ctx) return null
  const img = ctx.createImageData(W, H)
  const px = img.data
  const at = (c: number, r: number, fallback: number) => {
    const v = data[r * W + c]
    return v === DEM_NODATA ? fallback : v * heightScale
  }
  const [lx, ly, lz] = [-0.5, -0.5, 0.707]
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const v = data[r * W + c]
      if (v === DEM_NODATA) continue
      const h = v * heightScale
      const dzdx = (at(Math.min(W - 1, c + 1), r, h) - at(Math.max(0, c - 1), r, h)) / (2 * scaleM)
      const dzdy = (at(c, Math.min(H - 1, r + 1), h) - at(c, Math.max(0, r - 1), h)) / (2 * scaleM)
      const nx = -dzdx * 1.6
      const ny = -dzdy * 1.6
      const shade = Math.max(0, (nx * lx + ny * ly + lz) / Math.hypot(nx, ny, 1))
      const base = 34 + 150 * shade
      const o = (r * W + c) * 4
      px[o] = base
      px[o + 1] = base + 2
      px[o + 2] = base + 10
      px[o + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return ctx.canvas
}

/** Yearly illumination: permanent shadow in blue, well-lit ground with a faint warm tint. */
function buildIllumLayer(g: IllumGrid): HTMLCanvasElement | null {
  const ctx = offscreen(g.width, g.height)
  if (!ctx) return null
  const img = ctx.createImageData(g.width, g.height)
  const px = img.data
  for (let k = 0; k < g.data.length; k++) {
    const v = g.data[k]
    if (v === ILLUM_NODATA) continue
    const rgb = v === 0 ? PSR_RGB : LIT_RGB
    const o = k * 4
    px[o] = rgb[0]
    px[o + 1] = rgb[1]
    px[o + 2] = rgb[2]
    px[o + 3] = v === 0 ? 150 : 90 * Math.min(1, illumPct(v) / 100) ** 1.5
  }
  ctx.putImageData(img, 0, 0)
  return ctx.canvas
}

interface Hover {
  x: number
  y: number
  lat: number
  lon: number
  /** Yearly illumination of the cell, % (0 = permanent shadow); undefined without data. */
  illum?: number
  dayMs?: number
  /** Tile a target placed here would be planned on; null too close to the edge of the data. */
  tileSiteId: string | null
}

/**
 * Zone 3, top: the 20 m tile around the ice target, with permanent shadow in blue, the search
 * radius, the candidate landing points and the best point of each shortlisted day. A click
 * moves the target there.
 */
export function PlannerMap() {
  const t = useT()
  const lang = useLang()
  const siteText = useSiteText()
  const sites = useMissionStore((s) => s.sites)
  const target = usePlannerStore((s) => s.target)
  const tileSiteId = usePlannerStore((s) => s.tileSiteId)
  const radiusM = usePlannerStore((s) => s.radiusM)
  const result = usePlannerStore((s) => s.result)
  const selectedDayMs = usePlannerStore((s) => s.selectedDayMs)
  const running = usePlannerStore((s) => s.status === 'running')
  const tiles = usePlanTiles()
  const [whole, setWhole] = useState(false)
  const [hover, setHover] = useState<Hover | null>(null)
  const { ref, width, height, dpr } = useCanvasSize()

  // Without a target yet: the tile of the first suggestion, to choose a point on.
  const shownId = tileSiteId ?? iceTargetsOf(sites)[0]?.tileSiteId ?? tiles?.[0]?.siteId
  const tile = tiles?.find((x) => x.siteId === shownId)
  const grids = useAsync(tile ? `plan-map|${tile.siteId}` : null, async () => {
    const [dem, illum] = await Promise.all([
      loadDem(asset(`data/${tile!.file}`), tile!.meta),
      tile!.illum ? loadIllum(asset(`data/${tile!.illum.file}`), tile!.illum.meta) : null,
    ])
    return { siteId: tile!.siteId, dem, illum }
  })
  const loaded = grids.data && tile && grids.data.siteId === tile.siteId ? grids.data : undefined
  const hill = useMemo(() => (loaded ? buildHillshade(loaded.dem) : null), [loaded])
  const illumLayer = useMemo(() => (loaded?.illum ? buildIllumLayer(loaded.illum) : null), [loaded])

  const meta = tile?.meta
  const fitWhole = whole || !target
  // Tile pixel (c, r) → canvas pixel.
  const view = useMemo(() => {
    if (!meta || !width || !height) return null
    const centre =
      !fitWhole && target
        ? latLonToPixel(meta, target.lat, target.lon)
        : { c: (meta.width - 1) / 2, r: (meta.height - 1) / 2 }
    const halfPx = fitWhole ? Math.max(meta.width, meta.height) / 2 : (radiusM * FIT) / meta.scaleM
    const k = Math.min(width, height) / (2 * halfPx)
    return {
      k,
      x: (c: number) => width / 2 + (c - centre.c) * k,
      y: (r: number) => height / 2 + (r - centre.r) * k,
      c: (x: number) => centre.c + (x - width / 2) / k,
      r: (y: number) => centre.r + (y - height / 2) / k,
    }
  }, [meta, width, height, fitWhole, target, radiusM])

  // The results belong on this map only when they were computed on the tile shown.
  const shown = result && result.problem.tileSiteId === shownId ? result : null
  const marks = useMemo(() => {
    if (!shown || !meta || !view) return []
    const rank = rankByDay(shown)
    const days = topDays(shown)
    const sel = shown.days.find((d) => d.dayMs === selectedDayMs && d.best)
    if (sel && !days.includes(sel)) days.push(sel)
    return days.map((d) => {
      const p = latLonToPixel(meta, d.best!.lat, d.best!.lon)
      return { day: d, rank: rank.get(d.dayMs), x: view.x(p.c), y: view.y(p.r) }
    })
  }, [shown, meta, view, selectedDayMs])

  useEffect(() => {
    const ctx = context2d(ref.current, width, height, dpr)
    if (!ctx || !view || !meta) return
    ctx.fillStyle = MAP.background
    ctx.fillRect(0, 0, width, height)
    ctx.imageSmoothingEnabled = true
    if (hill) {
      ctx.drawImage(hill, view.x(-0.5), view.y(-0.5), meta.width * view.k, meta.height * view.k)
    }
    const ill = loaded?.illum
    if (illumLayer && ill) {
      const c0 = (ill.originX - ill.scaleM / 2 - meta.originX) / meta.scaleM
      const r0 = (meta.originY - (ill.originY + ill.scaleM / 2)) / meta.scaleM
      const f = ill.scaleM / meta.scaleM
      ctx.drawImage(
        illumLayer,
        view.x(c0),
        view.y(r0),
        ill.width * f * view.k,
        ill.height * f * view.k,
      )
    }
    const xy = (lat: number, lon: number): [number, number] => {
      const p = latLonToPixel(meta, lat, lon)
      return [view.x(p.c), view.y(p.r)]
    }
    const halo = (text: string, x: number, y: number) => {
      ctx.lineWidth = 3
      ctx.strokeStyle = alpha(MAP.background, 0.85)
      ctx.strokeText(text, x, y)
      ctx.fillStyle = MAP.ink
      ctx.fillText(text, x, y)
    }

    // Candidate landing points.
    if (shown) {
      ctx.fillStyle = alpha(MAP.ink, 0.75)
      for (const c of shown.candidates) {
        const [x, y] = xy(c.lat, c.lon)
        ctx.beginPath()
        ctx.arc(x, y, 1.6, 0, 2 * Math.PI)
        ctx.fill()
      }
    }

    // Search radius around the target.
    if (target) {
      const [tx, ty] = xy(target.lat, target.lon)
      ctx.setLineDash([6, 5])
      ctx.lineWidth = 1.5
      ctx.strokeStyle = MAP.primary
      ctx.beginPath()
      ctx.arc(tx, ty, (radiusM / meta.scaleM) * view.k, 0, 2 * Math.PI)
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Route of the selected day: straight dashed line from its landing point to the ice.
    const sel = marks.find((m) => m.day.dayMs === selectedDayMs)
    if (sel && shown) {
      const [ix, iy] = xy(shown.ice.lat, shown.ice.lon)
      ctx.setLineDash([5, 4])
      ctx.lineWidth = 2
      ctx.strokeStyle = MAP.route
      ctx.beginPath()
      ctx.moveTo(sel.x, sel.y)
      ctx.lineTo(ix, iy)
      ctx.stroke()
      ctx.setLineDash([])
    }

    // The ice: the target as typed, and the shadowed cell the routes end at.
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    if (shown) {
      const [ix, iy] = xy(shown.ice.lat, shown.ice.lon)
      ctx.fillStyle = MAP.route
      ctx.strokeStyle = MAP.background
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(ix, iy, 3.5, 0, 2 * Math.PI)
      ctx.fill()
      ctx.stroke()
    }
    if (target) {
      const [tx, ty] = xy(target.lat, target.lon)
      ctx.font = chartFont(20, 'sans', 600)
      halo('❄', tx, ty)
    }

    // Best point of each shortlisted day (numbered). Days often share a point: the best rank
    // is drawn over the others, and the selected day over all.
    ctx.font = chartFont(11, 'mono', 500)
    const order = (m: (typeof marks)[number]) =>
      m.day.dayMs === selectedDayMs ? 99 : -(m.rank ?? 9)
    for (const m of [...marks].sort((a, b) => order(a) - order(b))) {
      const on = m.day.dayMs === selectedDayMs
      const radius = on ? 11 : 9
      if (on) {
        ctx.strokeStyle = MAP.ink
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(m.x, m.y, radius + 4, 0, 2 * Math.PI)
        ctx.stroke()
      }
      // Shortlisted days: a filled badge with the rank; the rest hollow, ringed by their level.
      ctx.fillStyle = m.rank ? MAP.fillExcess : MAP.card
      ctx.strokeStyle = m.rank ? MAP.background : levelInk(MAP, scoreLevel(m.day.best!.score))
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(m.x, m.y, radius, 0, 2 * Math.PI)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = m.rank ? MAP.tooltipFg : MAP.ink
      ctx.fillText(m.rank ? String(m.rank) : '•', m.x, m.y + 0.5)
    }

    // Length of the selected day's route, next to its line and above the markers.
    if (sel && shown) {
      const iy = xy(shown.ice.lat, shown.ice.lon)[1]
      const below = sel.y > iy ? 1 : -1
      ctx.font = chartFont(11, 'mono', 500)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      halo(formatDistance(sel.day.best!.routeM), sel.x, sel.y + below * 26)
    }

    // Scale bar.
    const mPerPx = meta.scaleM / view.k
    const len = SCALE_STEPS_M.findLast((s) => s / mPerPx <= width * 0.3) ?? SCALE_STEPS_M[0]
    const bar = len / mPerPx
    ctx.strokeStyle = MAP.ink
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(12, height - 14)
    ctx.lineTo(12 + bar, height - 14)
    ctx.stroke()
    ctx.font = chartFont(11, 'mono', 500)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    halo(formatDistance(len), 12, height - 18)
  }, [
    ref,
    width,
    height,
    dpr,
    view,
    meta,
    hill,
    illumLayer,
    loaded,
    shown,
    target,
    radiusM,
    marks,
    selectedDayMs,
  ])

  const locate = (e: MouseEvent<HTMLCanvasElement>): Hover | null => {
    if (!view || !meta) return null
    const box = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - box.left
    const y = e.clientY - box.top
    const { lat, lon } = pixelToLatLon(meta, view.c(x), view.r(y))
    if (!demCovers(meta, lat, lon, 8)) return null
    const hit = marks.find((m) => Math.hypot(m.x - x, m.y - y) <= HIT_PX)
    const v = loaded?.illum ? illumAt(loaded.illum, lat, lon) : undefined
    return {
      x,
      y,
      lat,
      lon,
      illum: v === undefined ? undefined : illumPct(v),
      dayMs: hit?.day.dayMs,
      tileSiteId: tileForPoint(sites, lat, lon, radiusM),
    }
  }
  const onClick = (e: MouseEvent<HTMLCanvasElement>) => {
    const h = locate(e)
    if (!h || !tile) return
    const s = usePlannerStore.getState()
    if (h.dayMs !== undefined) s.selectDay(h.dayMs)
    else if (!running && h.tileSiteId)
      s.setTarget({ lat: +h.lat.toFixed(5), lon: +h.lon.toFixed(5) }, h.tileSiteId)
  }

  const hoverDay = hover?.dayMs !== undefined && marks.find((m) => m.day.dayMs === hover.dayMs)
  const tileName = shownId ? (siteText(findSite(sites, shownId))?.name ?? shownId) : ''
  const empty = tiles !== undefined && !tile

  return (
    <div className="pmap">
      <div className="pmap__bar">
        <h4 className="pmap__title">
          {tileName ? t('plan.map.title', { site: tileName }) : t('plan.map.titleNone')}
        </h4>
        <button
          type="button"
          className="btn btn--small"
          aria-pressed={fitWhole}
          disabled={!target}
          onClick={() => setWhole(!whole)}
        >
          {t('plan.map.whole')}
        </button>
      </div>
      <div className="pmap__frame" data-clickable={!running && !!tile}>
        <canvas
          ref={ref}
          role="img"
          aria-label={t('plan.map.aria')}
          onMouseMove={(e) => setHover(locate(e))}
          onMouseLeave={() => setHover(null)}
          onClick={onClick}
        />
        {empty && (
          <div className="pmap__msg">
            <Notice tone="note">{t('plan.map.noTile')}</Notice>
          </div>
        )}
        {!empty && !loaded && !grids.error && (
          <div className="pmap__msg">
            <Busy>{t('plan.map.loading')}</Busy>
          </div>
        )}
        {grids.error && !loaded && (
          <div className="pmap__msg">
            <Notice tone="error" action={{ label: t('kit.retry'), onClick: grids.retry }}>
              {t('plan.map.error', { msg: grids.error.message })}
            </Notice>
          </div>
        )}
        {hover && (
          <div
            className="pmap__tip"
            style={{
              left: Math.min(hover.x + 12, Math.max(0, width - 190)),
              top: hover.y > height - 80 ? hover.y - 64 : hover.y + 14,
            }}
          >
            {hoverDay ? (
              <>
                <strong>
                  {hoverDay.rank ? `${t('plan.rank', { n: hoverDay.rank })} · ` : ''}
                  {formatPlanDate(hoverDay.day.dayMs, lang)}
                </strong>
                <span>
                  {t('plan.tip.score', { score: Math.round(hoverDay.day.best!.score) })} ·{' '}
                  {formatDistance(hoverDay.day.best!.routeM)}
                </span>
              </>
            ) : (
              <>
                <strong>{formatLatLon(hover.lat, hover.lon)}</strong>
                {hover.illum !== undefined && (
                  <span>
                    {hover.illum === 0
                      ? t('plan.map.psr')
                      : t('plan.map.lit', { pct: formatPct(hover.illum) })}
                  </span>
                )}
                {!running && (
                  <span className="pmap__tip-hint">
                    {t(hover.tileSiteId ? 'plan.map.clickHint' : 'plan.target.outside')}
                  </span>
                )}
              </>
            )}
          </div>
        )}
      </div>
      <ul className="pmap__legend">
        <li>
          <i className="pmap__k pmap__k--ice" aria-hidden>
            ❄
          </i>
          {t('plan.map.kTarget')}
        </li>
        <li>
          <i className="pmap__k pmap__k--psr" aria-hidden />
          {t('plan.map.kPsr')}
        </li>
        <li>
          <i className="pmap__k pmap__k--radius" aria-hidden />
          {t('plan.map.kRadius')}
        </li>
        <li>
          <i className="pmap__k pmap__k--cand" aria-hidden />
          {t('plan.map.kCandidates')}
        </li>
        <li>
          <i className="pmap__k pmap__k--top" aria-hidden>
            1
          </i>
          {t('plan.map.kTop')}
        </li>
      </ul>
    </div>
  )
}
