import { type PointerEvent, useEffect, useMemo } from 'react'
import { DAY_MS, HOUR_MS } from '../astro/constants.ts'
import type { BatteryResult } from '../astro/energy.ts'
import { type HorizonMask, maskAt } from '../astro/horizon.ts'
import { VISIBLE_THRESHOLD } from '../astro/metrics.ts'
import type { SiteSeries } from '../astro/series.ts'
import { context2d, useCanvasSize } from '../hooks/useCanvas.ts'
import { useLang, useT } from '../i18n/index.ts'
import { alpha, chartFont, useChartTheme } from './chartTheme.ts'
import { formatDateTime, formatDay, formatPct } from './format.ts'

/*
 * Sun / Earth / both are told apart by colour *and* fill (solid / hatched / cross-hatched) plus
 * in-bar labels, so the chart still reads without colour vision. Colours come from the tokens
 * (chartTheme.ts): Sun = series-4, Earth = series-6, both = series-1, battery = series-5.
 */

type Fill = 'solid' | 'hatch' | 'cross'

/** Small repeating tile: stripes on a translucent base of the same colour. */
function pattern(ctx: CanvasRenderingContext2D, color: string, fill: Fill) {
  if (fill === 'solid' || typeof document === 'undefined') return color
  const tile = document.createElement('canvas')
  tile.width = tile.height = 8
  const t = tile.getContext('2d')
  if (!t) return color
  t.fillStyle = color
  t.globalAlpha = 0.45
  t.fillRect(0, 0, 8, 8)
  t.globalAlpha = 1
  t.strokeStyle = color
  t.lineWidth = 2
  t.beginPath()
  t.moveTo(-2, 10)
  t.lineTo(10, -2)
  if (fill === 'cross') {
    t.moveTo(-2, -2)
    t.lineTo(10, 10)
  }
  t.stroke()
  return ctx.createPattern(tile, 'repeat') ?? color
}

/** Contiguous [start, end) index runs where on(i) holds. */
function runs(n: number, on: (i: number) => boolean) {
  const out: [number, number][] = []
  let start = -1
  for (let i = 0; i < n; i++) {
    if (on(i) && start < 0) start = i
    else if (!on(i) && start >= 0) {
      out.push([start, i])
      start = -1
    }
  }
  if (start >= 0) out.push([start, n - 1])
  return out
}

interface TimelineProps {
  series: SiteSeries
  mask: HorizonMask
  offsetH: number
  onSeek?: (hours: number) => void
  /** Compact mode: only the lanes (used in the comparison view). */
  compact?: boolean
  label?: string
  battery?: BatteryResult
  /** Survival threshold drawn on the battery lane (%). */
  hibernateBelowPct?: number
}

const LABEL_W = 64

/**
 * Lanes: Sun (intensity = visible fraction of the disc), Earth (direct link), both, battery.
 * Chart: height of the Sun and the Earth above the *local* horizon, the quantity that
 * actually decides power and comms, unlike the raw elevation.
 */
export function Timeline({
  series,
  mask,
  offsetH,
  onSeek,
  compact,
  label,
  battery,
  hibernateBelowPct,
}: TimelineProps) {
  const { ref, width, height, dpr } = useCanvasSize()
  const t = useT()
  const lang = useLang()
  const theme = useChartTheme()

  const summary = useMemo(() => {
    const n = series.count
    let sun = 0
    let dte = 0
    let both = 0
    for (let i = 0; i < n; i++) {
      const s = series.sunFrac[i] >= VISIBLE_THRESHOLD
      const e = series.earthFrac[i] >= VISIBLE_THRESHOLD
      if (s) sun++
      if (e) dte++
      if (s && e) both++
    }
    const pct = (k: number) => formatPct((100 * k) / Math.max(1, n))
    const parts = [t('timeline.aria', { sun: pct(sun), dte: pct(dte), both: pct(both) })]
    if (battery) {
      parts.push(
        battery.depletedAtMs != null
          ? t('timeline.ariaDepleted', { when: formatDateTime(battery.depletedAtMs) })
          : t('timeline.ariaBattery', { min: formatPct(battery.minSocPct) }),
      )
    }
    return parts.join(' ')
    // lang: formatters read the language directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, battery, t, lang])

  useEffect(() => {
    const ctx = context2d(ref.current, width, height, dpr)
    if (!ctx) return
    const plotW = width - LABEL_W
    const n = series.count
    const x = (i: number) => LABEL_W + (i / Math.max(1, n - 1)) * plotW
    const laneH = compact ? Math.max(10, (height - 14) / (battery ? 3 : 2) - 3) : 12
    const LABEL_FONT = chartFont(11)
    const NUM_FONT = chartFont(10, 'mono')
    const TEXT = theme.inkMuted
    const GRID = alpha(theme.grid, 0.9)
    const LANE = alpha(theme.inkMuted, 0.1)
    ctx.font = LABEL_FONT
    ctx.textBaseline = 'middle'
    let y = 0

    const sunOn = (i: number) => series.sunFrac[i] >= VISIBLE_THRESHOLD
    const dteOn = (i: number) => series.earthFrac[i] >= VISIBLE_THRESHOLD

    const lane = (
      name: string,
      value: (i: number) => number,
      color: string,
      fill: Fill,
      inBar: string,
    ) => {
      ctx.fillStyle = LANE
      ctx.fillRect(LABEL_W, y, plotW, laneH)
      ctx.fillStyle = pattern(ctx, color, fill)
      for (let i = 0; i < n - 1; i++) {
        const v = value(i)
        if (v <= 0) continue
        ctx.globalAlpha = v
        ctx.fillRect(x(i), y, Math.max(1, x(i + 1) - x(i) + 0.5), laneH)
      }
      ctx.globalAlpha = 1
      // In-bar labels on runs wide enough to hold them.
      ctx.font = chartFont(10, 'sans', 600)
      const w = ctx.measureText(inBar).width + 8
      for (const [a, b] of runs(n, (i) => value(i) >= VISIBLE_THRESHOLD)) {
        if (x(b) - x(a) < w + 4 || laneH < 10) continue
        const cx = (x(a) + x(b)) / 2
        ctx.fillStyle = alpha(theme.card, 0.9)
        ctx.fillRect(cx - w / 2, y + 1, w, laneH - 2)
        ctx.fillStyle = theme.ink
        ctx.textAlign = 'center'
        ctx.fillText(inBar, cx, y + laneH / 2)
        ctx.textAlign = 'left'
      }
      ctx.font = LABEL_FONT
      ctx.fillStyle = TEXT
      ctx.fillText(name, 4, y + laneH / 2)
      y += laneH + 3
    }

    const prefix = compact && label ? `${label} ` : ''
    lane(
      `${prefix}${t('timeline.sun')}`,
      (i) => series.sunFrac[i],
      theme.sun,
      'solid',
      t('timeline.sun'),
    )
    lane(
      `${prefix}${compact ? 'DTE' : t('timeline.earth')}`,
      (i) => (dteOn(i) ? 1 : 0),
      theme.earth,
      'hatch',
      'DTE',
    )
    if (!compact) {
      lane(
        t('timeline.both'),
        (i) => (sunOn(i) && dteOn(i) ? 1 : 0),
        theme.both,
        'cross',
        t('timeline.both'),
      )
    }

    // Battery: state-of-charge line, survival threshold and the "out of power" stretches.
    if (battery) {
      const bh = compact ? laneH : 18
      ctx.fillStyle = LANE
      ctx.fillRect(LABEL_W, y, plotW, bh)
      const by = (pct: number) => y + bh - 1 - (pct / 100) * (bh - 2)
      ctx.fillStyle = pattern(ctx, theme.fillDeficit, 'hatch')
      for (const [a, b] of runs(n, (i) => battery.socPct[i] <= 0.01 && !battery.active[i])) {
        ctx.fillRect(x(a), y, Math.max(2, x(b) - x(a)), bh)
      }
      if (hibernateBelowPct != null) {
        ctx.strokeStyle = alpha(theme.inkMuted, 0.8)
        ctx.setLineDash([3, 3])
        ctx.beginPath()
        ctx.moveTo(LABEL_W, by(hibernateBelowPct))
        ctx.lineTo(width, by(hibernateBelowPct))
        ctx.stroke()
        ctx.setLineDash([])
      }
      ctx.strokeStyle = theme.battery
      ctx.lineWidth = 2
      ctx.beginPath()
      for (let i = 0; i < n; i++) {
        if (i === 0) ctx.moveTo(x(i), by(battery.socPct[i]))
        else ctx.lineTo(x(i), by(battery.socPct[i]))
      }
      ctx.stroke()
      ctx.lineWidth = 1
      if (battery.depletedAtMs != null) {
        const px =
          LABEL_W + ((battery.depletedAtMs - series.startMs) / ((n - 1) * series.stepMs)) * plotW
        ctx.fillStyle = theme.fillDeficit
        ctx.beginPath()
        ctx.moveTo(px, y + bh)
        ctx.lineTo(px - 5, y + bh + 6)
        ctx.lineTo(px + 5, y + bh + 6)
        ctx.fill()
        if (!compact) {
          ctx.font = chartFont(10, 'sans', 600)
          const txt = `⚠ ${t('timeline.depleted')}`
          const tw = ctx.measureText(txt).width
          const tx = Math.min(px + 4, width - tw - 6)
          ctx.fillStyle = theme.tooltip
          ctx.fillRect(tx - 3, y + 2, tw + 6, bh - 4)
          ctx.fillStyle = theme.tooltipFg
          ctx.fillText(txt, tx, y + bh / 2)
          ctx.font = LABEL_FONT
        }
      }
      ctx.fillStyle = TEXT
      ctx.fillText(`${prefix}${t('timeline.battery')}`, 4, y + bh / 2)
      y += bh + (compact ? 3 : 6)
    }

    const top = y + 4
    const chartH = height - top - 16
    if (!compact && chartH > 30) {
      // Margin above the local horizon, clamped to ±8° (beyond that it does not matter).
      const RANGE = 8
      const cy = (deg: number) =>
        top + chartH / 2 - (Math.max(-RANGE, Math.min(RANGE, deg)) / RANGE) * (chartH / 2)
      ctx.strokeStyle = GRID
      ctx.beginPath()
      for (const d of [-RANGE, -4, 0, 4, RANGE]) {
        ctx.moveTo(LABEL_W, cy(d))
        ctx.lineTo(width, cy(d))
      }
      ctx.stroke()
      ctx.strokeStyle = alpha(theme.inkMuted, 0.9)
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      ctx.moveTo(LABEL_W, cy(0))
      ctx.lineTo(width, cy(0))
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = TEXT
      ctx.fillText(t('timeline.horizon'), 4, cy(0))
      ctx.font = NUM_FONT
      ctx.fillText(`+${RANGE}°`, 4, cy(RANGE) + 6)
      ctx.fillText(`−${RANGE}°`, 4, cy(-RANGE) - 6)
      ctx.font = LABEL_FONT
      const line = (el: Float32Array, az: Float32Array, color: string, dash: number[]) => {
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.setLineDash(dash)
        ctx.beginPath()
        for (let i = 0; i < n; i++) {
          const v = el[i] - maskAt(mask, az[i])
          if (i === 0) ctx.moveTo(x(i), cy(v))
          else ctx.lineTo(x(i), cy(v))
        }
        ctx.stroke()
        ctx.setLineDash([])
        ctx.lineWidth = 1
      }
      line(series.sunEl, series.sunAz, theme.sun, [])
      line(series.earthEl, series.earthAz, theme.earth, [6, 3])
      // Legend at the right edge: a sample of each line (colour and dash) with its name in ink.
      ctx.textAlign = 'right'
      const key = (name: string, color: string, dash: number[], ky: number) => {
        const tw = ctx.measureText(name).width
        ctx.fillStyle = alpha(theme.card, 0.85)
        ctx.fillRect(width - tw - 34, ky - 6, tw + 32, 12)
        ctx.fillStyle = theme.ink
        ctx.fillText(name, width - 4, ky)
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.setLineDash(dash)
        ctx.beginPath()
        ctx.moveTo(width - tw - 30, ky)
        ctx.lineTo(width - tw - 10, ky)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.lineWidth = 1
      }
      key(t('timeline.sun'), theme.sun, [], top + 8)
      key(t('timeline.earth'), theme.earth, [6, 3], top + 22)
      ctx.textAlign = 'left'
    }

    // Day ticks.
    const spanMs = (n - 1) * series.stepMs
    const days = spanMs / DAY_MS
    const every = days > 200 ? 30 : days > 90 ? 14 : days > 30 ? 7 : days > 10 ? 2 : 1
    ctx.fillStyle = TEXT
    ctx.strokeStyle = GRID
    ctx.font = NUM_FONT
    ctx.textBaseline = 'alphabetic'
    for (let d = 0; d <= days; d += every) {
      const px = LABEL_W + ((d * DAY_MS) / spanMs) * plotW
      ctx.beginPath()
      ctx.moveTo(px, 0)
      ctx.lineTo(px, height - 12)
      ctx.stroke()
      if (!compact || d % (every * 2) === 0)
        ctx.fillText(formatDay(series.startMs + d * DAY_MS), px + 2, height - 2)
    }

    // Cursor.
    const cx = LABEL_W + ((offsetH * HOUR_MS) / spanMs) * plotW
    ctx.strokeStyle = theme.ink
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(cx, 0)
    ctx.lineTo(cx, height - 12)
    ctx.stroke()
    ctx.lineWidth = 1
  }, [
    ref,
    width,
    height,
    dpr,
    series,
    mask,
    offsetH,
    compact,
    label,
    battery,
    hibernateBelowPct,
    t,
    lang,
    theme,
  ])

  const seek = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!onSeek || (e.type === 'pointermove' && e.buttons !== 1)) return
    const rect = e.currentTarget.getBoundingClientRect()
    const f = (e.clientX - rect.left - LABEL_W) / (rect.width - LABEL_W)
    const spanH = ((series.count - 1) * series.stepMs) / HOUR_MS
    onSeek(Math.max(0, Math.min(1, f)) * spanH)
  }

  return (
    <canvas
      ref={ref}
      className={compact ? 'timeline timeline--compact' : 'timeline'}
      onPointerDown={seek}
      onPointerMove={seek}
      role="img"
      aria-label={summary}
    />
  )
}
