import { type PointerEvent, useEffect, useMemo } from 'react'
import { aggregateByMonth, extremeMonths, type MonthStat } from '../astro/seasons.ts'
import { useAsync } from '../hooks/useAsync.ts'
import { context2d, useCanvasSize } from '../hooks/useCanvas.ts'
import { useScenarioData } from '../hooks/useScenario.ts'
import { selectActiveScenario, useMissionStore } from '../store/useMissionStore.ts'
import { getLang, type Lang, useT } from '../i18n/index.ts'
import { useSiteText } from '../i18n/sites.ts'
import { runDateSweep } from '../workers/astroClient.ts'
import { alpha, chartFont, useChartTheme } from './chartTheme.ts'
import { formatDeg, formatPct } from './format.ts'
import { Busy } from './kit/Busy.tsx'
import { Notice } from './kit/Notice.tsx'

/** The DE441 table covers 2026–2030; later dates fall back to the analytic model. */
const FROM_MS = Date.UTC(2026, 0, 1)
const SWEEP_DAYS = 1826 // through 2030-12-31

/**
 * One Y axis (%): energy bars and the DTE line. The maximum Sun elevation is another measure, so
 * it gets its own lane under the plot (a small profile plus the values in degrees), not a second
 * axis. `bottom` holds that lane and the year labels.
 */
const PAD = { left: 42, right: 10, top: 8, bottom: 50 }
const LANE_H = 12

const LOCALES: Record<Lang, string> = { es: 'es-MX', en: 'en-US', qu: 'es-PE' }
const monthName = (m: MonthStat) =>
  new Intl.DateTimeFormat(LOCALES[getLang()], {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(m.startMs)

/** Landing date for a clicked month: the first sunlit day, else the 1st. */
const monthLandingMs = (m: MonthStat) => m.firstSunlitMs ?? m.startMs

function SeasonCanvas({
  months,
  selectedMs,
  onPick,
}: {
  months: MonthStat[]
  selectedMs: number
  onPick: (m: MonthStat) => void
}) {
  const { ref, width, height, dpr } = useCanvasSize()
  const t = useT()
  const theme = useChartTheme()

  useEffect(() => {
    const ctx = context2d(ref.current, width, height, dpr)
    if (!ctx || !months.length) return
    const x0 = PAD.left
    const x1 = width - PAD.right
    const y0 = PAD.top
    const y1 = height - PAD.bottom
    const plotW = x1 - x0
    const plotH = y1 - y0
    if (plotW <= 0 || plotH <= 0) return
    const bw = plotW / months.length
    const yPct = (pct: number) => y1 - (pct / 100) * plotH
    const NUM = chartFont(10, 'mono')
    const LABEL = chartFont(10)

    // The single axis: gridlines and ticks at 0 %, 50 %, 100 %.
    ctx.font = NUM
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'right'
    ctx.strokeStyle = alpha(theme.grid, 0.9)
    ctx.fillStyle = theme.inkMuted
    for (const p of [0, 50, 100]) {
      const y = yPct(p)
      ctx.beginPath()
      ctx.moveTo(x0, y)
      ctx.lineTo(x1, y)
      ctx.stroke()
      ctx.fillText(`${p} %`, x0 - 5, y)
    }

    // Energy bars: stronger when most landing days are sunlit at touchdown.
    const barW = Math.max(1, bw - 2)
    const radius = Math.min(4, barW / 2)
    ctx.fillStyle = theme.sun
    months.forEach((m, i) => {
      const h = y1 - yPct(m.energyPct)
      if (h <= 0) return
      ctx.globalAlpha = 0.35 + 0.65 * m.sunAtLandingFrac
      ctx.beginPath()
      if (typeof ctx.roundRect === 'function')
        ctx.roundRect(x0 + i * bw + 1, y1 - h, barW, h, [radius, radius, 0, 0])
      else ctx.rect(x0 + i * bw + 1, y1 - h, barW, h)
      ctx.fill()
    })
    ctx.globalAlpha = 1

    // DTE line.
    ctx.strokeStyle = theme.earth
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    ctx.beginPath()
    months.forEach((m, i) => {
      const x = x0 + (i + 0.5) * bw
      if (i === 0) ctx.moveTo(x, yPct(m.dtePct))
      else ctx.lineTo(x, yPct(m.dtePct))
    })
    ctx.stroke()
    ctx.lineWidth = 1

    // Lane under the axis: maximum Sun elevation of each month, as a profile and as values.
    let lo = 0
    let hi = 0
    for (const m of months) {
      if (m.maxSunEl < lo) lo = m.maxSunEl
      if (m.maxSunEl > hi) hi = m.maxSunEl
    }
    if (hi - lo < 0.5) hi = lo + 0.5
    const laneTop = y1 + 6
    const yEl = (deg: number) => laneTop + LANE_H - ((deg - lo) / (hi - lo)) * LANE_H
    ctx.fillStyle = alpha(theme.inkMuted, 0.1)
    ctx.fillRect(x0, laneTop - 2, plotW, LANE_H + 4)
    ctx.strokeStyle = theme.ink
    ctx.lineWidth = 1.5
    ctx.beginPath()
    months.forEach((m, i) => {
      const x = x0 + (i + 0.5) * bw
      if (i === 0) ctx.moveTo(x, yEl(m.maxSunEl))
      else ctx.lineTo(x, yEl(m.maxSunEl))
    })
    ctx.stroke()
    ctx.lineWidth = 1
    ctx.font = LABEL
    ctx.fillStyle = theme.inkMuted
    ctx.textAlign = 'right'
    ctx.fillText(`${t('timeline.sun')} °`, x0 - 5, laneTop + LANE_H / 2)
    // Values: as many as fit without touching (every k-th month).
    ctx.font = NUM
    ctx.textAlign = 'center'
    ctx.fillStyle = theme.ink
    const valueW = ctx.measureText('−0.0').width + 6
    const every = Math.max(1, Math.ceil(valueW / bw))
    months.forEach((m, i) => {
      if (i % every !== 0) return
      ctx.fillText(m.maxSunEl.toFixed(1), x0 + (i + 0.5) * bw, laneTop + LANE_H + 10)
    })

    // Year separators and labels.
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = theme.inkMuted
    ctx.strokeStyle = alpha(theme.inkMuted, 0.35)
    months.forEach((m, i) => {
      if (m.month !== 0 && i !== 0) return
      const x = x0 + i * bw
      ctx.beginPath()
      ctx.moveTo(x, y0)
      ctx.lineTo(x, height - 2)
      ctx.stroke()
      ctx.fillText(String(m.year), x + 3, height - 3)
    })

    // Month holding the active landing date.
    const sel = months.findIndex((m) => {
      const d = new Date(selectedMs)
      return d.getUTCFullYear() === m.year && d.getUTCMonth() === m.month
    })
    if (sel >= 0) {
      ctx.strokeStyle = theme.ink
      ctx.lineWidth = 2
      ctx.strokeRect(x0 + sel * bw, y0, Math.max(2, bw), laneTop + LANE_H + 2 - y0)
      ctx.lineWidth = 1
    }
  }, [ref, width, height, dpr, months, selectedMs, theme, t])

  const pick = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!months.length) return
    const rect = e.currentTarget.getBoundingClientRect()
    const plotW = rect.width - PAD.left - PAD.right
    const i = Math.floor(((e.clientX - rect.left - PAD.left) / plotW) * months.length)
    const m = months[Math.max(0, Math.min(months.length - 1, i))]
    if (m) onPick(m)
  }

  return (
    <canvas
      ref={ref}
      className="season__canvas"
      onPointerDown={pick}
      role="img"
      aria-label={t('season.aria')}
    />
  )
}

/** "Which season and year favour this site?": month-by-month energy, DTE and Sun height. */
export function SeasonChart() {
  const scenario = useMissionStore(selectActiveScenario)
  const missionDays = useMissionStore((s) => s.missionDays)
  const linkMarginDeg = useMissionStore((s) => s.linkMarginDeg)
  const requireDsn = useMissionStore((s) => s.requireDsn)
  const setStart = useMissionStore((s) => s.setStart)
  const t = useT()
  const siteText = useSiteText()
  const { info, detail } = useScenarioData(scenario)
  const key = detail && info ? `${info.id}|${missionDays}|${linkMarginDeg}|${requireDsn}` : null
  const { data, loading } = useAsync(key, () =>
    runDateSweep({
      site: detail!.site,
      mask: detail!.mask,
      fromMs: FROM_MS,
      days: SWEEP_DAYS,
      missionDays,
      linkMarginDeg,
      requireDsn,
    }),
  )
  // The sweep ends on 2030-12-31: drop the stub of a month that a window start can spill into.
  const months = useMemo(
    () => (data ? aggregateByMonth(data).filter((m) => m.days >= 20) : []),
    [data],
  )
  const { best, worst } = useMemo(() => extremeMonths(months), [months])
  const pick = (m: MonthStat) => setStart(monthLandingMs(m))

  const describe = (i: number) => {
    const m = months[i]
    return { month: monthName(m), e: formatPct(m.energyPct), el: formatDeg(m.maxSunEl) }
  }

  return (
    <div className="season" aria-busy={loading}>
      <p className="hint">
        {t('season.hint', { days: missionDays, site: siteText(info)?.name ?? '…' })}
      </p>
      {!detail ? (
        <Notice tone="note">{t('season.noDetail')}</Notice>
      ) : months.length ? (
        <>
          <div className="season__chart">
            <SeasonCanvas months={months} selectedMs={scenario.startMs} onPick={pick} />
          </div>
          <div className="season__legend">
            <span>
              <i style={{ background: 'var(--series-4)' }} /> {t('season.legend.energy')}
            </span>
            <span>
              <i className="chart-key-line" style={{ background: 'var(--series-6)' }} />{' '}
              {t('season.legend.dte')}
            </span>
            <span>
              <i className="chart-key-line chart-key-line--thin" /> {t('season.legend.sunEl')}
            </span>
          </div>
          <p className="season__text">
            {best >= 0 && (
              <>
                <button type="button" className="linklike" onClick={() => pick(months[best])}>
                  {t('season.best', describe(best))}
                </button>{' '}
              </>
            )}
            {worst >= 0 && worst !== best && (
              <>
                <button type="button" className="linklike" onClick={() => pick(months[worst])}>
                  {t('season.worst', describe(worst))}
                </button>{' '}
              </>
            )}
            {t('season.why')}
          </p>
        </>
      ) : (
        <Busy>{t('season.computing')}</Busy>
      )}
    </div>
  )
}
