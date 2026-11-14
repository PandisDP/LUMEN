import { useEffect, useState } from 'react'
import { type HorizonMask, maskStats } from '../astro/horizon.ts'
import type { InstantState } from '../astro/instant.ts'
import { VISIBLE_THRESHOLD } from '../astro/metrics.ts'
import { earthRefractionDeg as refractionDeg } from '../astro/thermal.ts'
import type { SiteSeries } from '../astro/series.ts'
import { context2d, useCanvasSize } from '../hooks/useCanvas.ts'
import { t, useLang } from '../i18n/index.ts'
import { useMissionStore } from '../store/useMissionStore.ts'
import { cardinals } from './format.ts'
import { EARTH_COLOR, SUN_COLOR } from './Timeline.tsx'

interface HorizonChartProps {
  mask: HorizonMask
  series?: SiteSeries
  instant?: InstantState
  showPaths?: boolean
  compact?: boolean
  /** DTE link margin over the terrain (deg); drawn as a dashed line above the silhouette. */
  linkMarginDeg?: number
}

const PAD_L = 34
const PAD_B = 16

/**
 * 360° panorama seen from the lander: the real terrain profile (LOLA) and the paths of the
 * Sun and the Earth over the mission window. The vertical axis is exaggerated (the polar Sun
 * never climbs more than ~1.6°), and the factor is printed so the picture stays honest.
 */
export function HorizonChart({
  mask,
  series,
  instant,
  showPaths = true,
  compact,
  linkMarginDeg: marginProp,
}: HorizonChartProps) {
  const storeMargin = useMissionStore((s) => s.linkMarginDeg)
  const linkMarginDeg = marginProp ?? storeMargin
  const { ref, width, height, dpr } = useCanvasSize()
  const lang = useLang()
  const [earthMode, setEarthMode] = useState(false)

  useEffect(() => {
    const ctx = context2d(ref.current, width, height, dpr)
    if (!ctx) return
    const stats = maskStats(mask)
    let lo = stats.min
    let hi = stats.max
    if (series) {
      for (let i = 0; i < series.count; i++) {
        hi = Math.max(hi, series.sunEl[i], series.earthEl[i])
        lo = Math.min(lo, series.sunEl[i], series.earthEl[i])
      }
    }
    lo = Math.max(lo, stats.min - 4)
    hi = Math.min(Math.max(hi, stats.max + 1 + linkMarginDeg), 90)
    if (hi - lo < 4) {
      const mid = (hi + lo) / 2
      hi = mid + 2
      lo = mid - 2
    }
    lo -= 0.5
    hi += 0.5
    const plotW = width - PAD_L
    const plotH = height - PAD_B
    const pxPerDegX = plotW / 360
    const pxPerDegY = plotH / (hi - lo)
    const x = (az: number) => PAD_L + (((az % 360) + 360) % 360) * pxPerDegX
    const y = (el: number) => plotH - (el - lo) * pxPerDegY

    // Sky. In "Earth" mode the sky keeps glowing while the Sun is less than 18° below the
    // local horizon (astronomical twilight); on the Moon it is black the instant the disc sets.
    ctx.fillStyle = '#02040c'
    ctx.fillRect(PAD_L, 0, plotW, plotH)
    if (earthMode && instant) {
      const depth = instant.sky.sun.el + refractionDeg(instant.sky.sun.el) - instant.sunHorizonDeg
      const glow = depth >= 0 ? 1 : Math.max(0, 1 + depth / 18)
      if (glow > 0) {
        const sky = ctx.createLinearGradient(0, 0, 0, plotH)
        sky.addColorStop(0, `rgba(70,120,200,${0.55 * glow})`)
        sky.addColorStop(1, `rgba(230,150,90,${0.6 * glow})`)
        ctx.fillStyle = sky
        ctx.fillRect(PAD_L, 0, plotW, plotH)
      }
    }
    // Grid.
    ctx.strokeStyle = 'rgba(154,168,189,0.18)'
    ctx.fillStyle = '#9aa8bd'
    ctx.font = '10px system-ui, sans-serif'
    const stepEl = hi - lo > 20 ? 10 : hi - lo > 8 ? 2 : 1
    for (let e = Math.ceil(lo / stepEl) * stepEl; e <= hi; e += stepEl) {
      ctx.beginPath()
      ctx.moveTo(PAD_L, y(e))
      ctx.lineTo(width, y(e))
      ctx.stroke()
      ctx.fillText(`${e}°`, 2, y(e) + 3)
    }
    cardinals().forEach((name, k) => {
      const px = x(k * 45)
      ctx.beginPath()
      ctx.moveTo(px, 0)
      ctx.lineTo(px, plotH)
      ctx.stroke()
      ctx.fillText(name, px + 2, height - 4)
    })
    // Ideal horizon (0°).
    ctx.strokeStyle = 'rgba(230,237,247,0.45)'
    ctx.setLineDash([4, 3])
    ctx.beginPath()
    ctx.moveTo(PAD_L, y(0))
    ctx.lineTo(width, y(0))
    ctx.stroke()
    ctx.setLineDash([])

    // Paths (drawn before the terrain, so hidden parts disappear behind the ridges).
    if (series && showPaths) {
      const stride = Math.max(1, Math.floor(series.count / 1500))
      // Visible samples are filled dots, hidden ones hollow rings: the state reads from the
      // shape, not only from the opacity.
      const dots = (az: Float32Array, el: Float32Array, frac: Float32Array, color: string) => {
        ctx.fillStyle = color
        ctx.strokeStyle = color
        for (let i = 0; i < series.count; i += stride) {
          const px = x(az[i])
          const py = y(el[i])
          if (frac[i] >= VISIBLE_THRESHOLD) {
            ctx.globalAlpha = 0.8
            ctx.fillRect(px - 1.25, py - 1.25, 2.5, 2.5)
          } else {
            ctx.globalAlpha = 0.45
            ctx.beginPath()
            ctx.arc(px, py, 1.6, 0, Math.PI * 2)
            ctx.stroke()
          }
        }
        ctx.globalAlpha = 1
      }
      dots(series.sunAz, series.sunEl, series.sunFrac, SUN_COLOR)
      dots(series.earthAz, series.earthEl, series.earthFrac, EARTH_COLOR)
      if (earthMode) {
        // The same Sun lifted by Earth's atmospheric refraction: drawn as short dashes (a
        // different mark, not just a different colour).
        ctx.strokeStyle = '#ffb36b'
        ctx.globalAlpha = 0.9
        for (let i = 0; i < series.count; i += stride) {
          const px = x(series.sunAz[i])
          const py = y(series.sunEl[i] + refractionDeg(series.sunEl[i]))
          ctx.beginPath()
          ctx.moveTo(px - 2, py)
          ctx.lineTo(px + 2, py)
          ctx.stroke()
        }
        ctx.globalAlpha = 1
      }
    }

    // Current bodies with their true angular size (an ellipse because the axes differ).
    if (instant) {
      const body = (az: number, el: number, r: number, color: string, glow: boolean) => {
        ctx.fillStyle = color
        if (glow) {
          ctx.shadowColor = color
          ctx.shadowBlur = 12
        }
        ctx.beginPath()
        ctx.ellipse(
          x(az),
          y(el),
          Math.max(3, r * pxPerDegX),
          Math.max(3, r * pxPerDegY),
          0,
          0,
          Math.PI * 2,
        )
        ctx.fill()
        ctx.shadowBlur = 0
      }
      body(
        instant.sky.earth.az,
        instant.sky.earth.el,
        instant.sky.earth.radiusDeg,
        EARTH_COLOR,
        false,
      )
      body(instant.sky.sun.az, instant.sky.sun.el, instant.sky.sun.radiusDeg, '#fff3c4', true)
    }

    // Terrain silhouette.
    const n = mask.elevDeg.length
    ctx.beginPath()
    ctx.moveTo(PAD_L, plotH)
    // Not wrapped: bin n closes the profile at 360° on the right edge.
    for (let k = 0; k <= n; k++)
      ctx.lineTo(PAD_L + k * mask.azStepDeg * pxPerDegX, y(mask.elevDeg[k % n]))
    ctx.lineTo(PAD_L + plotW, plotH)
    ctx.closePath()
    const grad = ctx.createLinearGradient(0, 0, 0, plotH)
    grad.addColorStop(0, '#5b606b')
    grad.addColorStop(1, '#1d2028')
    ctx.fillStyle = grad
    ctx.fill()
    ctx.strokeStyle = '#c9d1dc'
    ctx.stroke()

    // DTE link threshold: the Earth must clear the terrain by this margin.
    if (linkMarginDeg > 0) {
      ctx.strokeStyle = EARTH_COLOR
      ctx.globalAlpha = 0.85
      ctx.setLineDash([5, 4])
      ctx.beginPath()
      for (let k = 0; k <= n; k++) {
        const px = PAD_L + k * mask.azStepDeg * pxPerDegX
        const py = y(mask.elevDeg[k % n] + linkMarginDeg)
        if (k === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.stroke()
      ctx.setLineDash([])
      ctx.globalAlpha = 1
      if (!compact) {
        ctx.fillStyle = EARTH_COLOR
        ctx.fillText(t('horizon.linkLine', { deg: linkMarginDeg }), PAD_L + 4, 12)
      }
    }

    if (!compact) {
      ctx.fillStyle = '#9aa8bd'
      ctx.textAlign = 'right'
      ctx.fillText(t('horizon.scale', { k: (pxPerDegY / pxPerDegX).toFixed(1) }), width - 4, 12)
      if (series && showPaths) ctx.fillText(t('horizon.legend'), width - 4, 24)
      if (earthMode) {
        ctx.fillStyle = '#ffb36b'
        ctx.fillText(`– ${t('horizon.earthLegend')}`, width - 4, 36)
      }
      ctx.textAlign = 'left'
    }
  }, [
    ref,
    width,
    height,
    dpr,
    mask,
    series,
    instant,
    showPaths,
    compact,
    linkMarginDeg,
    lang,
    earthMode,
  ])

  const canvas = (
    <canvas
      ref={ref}
      className={compact ? 'horizon horizon--compact' : 'horizon'}
      role="img"
      aria-label={t('horizon.aria')}
    />
  )
  if (compact) return canvas
  return (
    <div className="horizon__wrap">
      {canvas}
      <label className="toggle horizon__toggle">
        <input
          type="checkbox"
          checked={earthMode}
          onChange={(e) => setEarthMode(e.target.checked)}
        />
        {t('horizon.earthToggle')}
      </label>
    </div>
  )
}
