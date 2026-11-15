import { type PointerEvent, useEffect, useMemo } from 'react'
import { aggregateByMonth, extremeMonths, type MonthStat } from '../astro/seasons.ts'
import { useAsync } from '../hooks/useAsync.ts'
import { context2d, useCanvasSize } from '../hooks/useCanvas.ts'
import { useScenarioData } from '../hooks/useScenario.ts'
import { selectActiveScenario, useMissionStore } from '../store/useMissionStore.ts'
import { getLang, type Lang, useT } from '../i18n/index.ts'
import { useSiteText } from '../i18n/sites.ts'
import { runDateSweep } from '../workers/astroClient.ts'
import { formatDeg, formatPct } from './format.ts'

/** The DE441 table covers 2026–2030; later dates fall back to the analytic model. */
const FROM_MS = Date.UTC(2026, 0, 1)
const SWEEP_DAYS = 1826 // through 2030-12-31

const COLOR_ENERGY = '#ffc94d'
const COLOR_DTE = '#4da6ff'
const COLOR_SUN_EL = '#e9eef8'
const COLOR_AXIS = '#9aa8bd'
const PAD = { left: 38, right: 38, top: 8, bottom: 22 }

const LOCALES: Record<Lang, string> = { es: 'es-MX', en: 'en-US' }
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

    // Left axis: Sun elevation. Half-degree steps around the observed range, always showing 0.
    let elMin = 0
    let elMax = 0
    for (const m of months) {
      if (m.maxSunEl < elMin) elMin = m.maxSunEl
      if (m.maxSunEl > elMax) elMax = m.maxSunEl
    }
    const lo = Math.floor(elMin * 2) / 2
    const hi = Math.max(lo + 0.5, Math.ceil(elMax * 2) / 2)
    const yEl = (deg: number) => y1 - ((deg - lo) / (hi - lo)) * plotH
    const yPct = (pct: number) => y1 - (pct / 100) * plotH

    ctx.font = '10px system-ui, sans-serif'
    ctx.textBaseline = 'middle'

    // Horizontal gridlines at 0 %, 50 %, 100 %.
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.fillStyle = COLOR_AXIS
    ctx.textAlign = 'left'
    for (const p of [0, 50, 100]) {
      const y = yPct(p)
      ctx.beginPath()
      ctx.moveTo(x0, y)
      ctx.lineTo(x1, y)
      ctx.stroke()
      ctx.fillText(`${p} %`, x1 + 4, y)
    }
    // Left ticks: lo, 0, hi.
    ctx.textAlign = 'right'
    ctx.fillStyle = COLOR_SUN_EL
    for (const deg of new Set([lo, 0, hi])) {
      ctx.fillText(`${deg.toFixed(1)}°`, x0 - 4, yEl(deg))
    }
    // Horizon line (0°).
    ctx.strokeStyle = 'rgba(233,238,248,0.25)'
    ctx.setLineDash([3, 3])
    ctx.beginPath()
    ctx.moveTo(x0, yEl(0))
    ctx.lineTo(x1, yEl(0))
    ctx.stroke()
    ctx.setLineDash([])

    // Energy bars: brighter when most landing days are sunlit at touchdown.
    months.forEach((m, i) => {
      const h = y1 - yPct(m.energyPct)
      ctx.fillStyle = COLOR_ENERGY
      ctx.globalAlpha = 0.3 + 0.6 * m.sunAtLandingFrac
      ctx.fillRect(x0 + i * bw + 1, y1 - h, Math.max(1, bw - 2), h)
    })
    ctx.globalAlpha = 1

    const line = (color: string, y: (m: MonthStat) => number, w: number) => {
      ctx.strokeStyle = color
      ctx.lineWidth = w
      ctx.beginPath()
      months.forEach((m, i) => {
        const x = x0 + (i + 0.5) * bw
        if (i === 0) ctx.moveTo(x, y(m))
        else ctx.lineTo(x, y(m))
      })
      ctx.stroke()
    }
    line(COLOR_DTE, (m) => yPct(m.dtePct), 1.5)
    line(COLOR_SUN_EL, (m) => yEl(m.maxSunEl), 2)
    ctx.lineWidth = 1

    // Year separators and labels.
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = COLOR_AXIS
    months.forEach((m, i) => {
      if (m.month !== 0 && i !== 0) return
      const x = x0 + i * bw
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'
      ctx.beginPath()
      ctx.moveTo(x, y0)
      ctx.lineTo(x, y1 + 4)
      ctx.stroke()
      ctx.fillText(String(m.year), x + 3, height - 6)
    })

    // Month holding the active landing date.
    const sel = months.findIndex((m) => {
      const d = new Date(selectedMs)
      return d.getUTCFullYear() === m.year && d.getUTCMonth() === m.month
    })
    if (sel >= 0) {
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.strokeRect(x0 + sel * bw, y0, Math.max(2, bw), plotH)
      ctx.lineWidth = 1
    }
  }, [ref, width, height, dpr, months, selectedMs])

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
        <p className="hint">{t('season.noDetail')}</p>
      ) : months.length ? (
        <>
          <div className="season__chart">
            <SeasonCanvas months={months} selectedMs={scenario.startMs} onPick={pick} />
          </div>
          <div className="season__legend">
            <span>
              <i style={{ background: COLOR_ENERGY }} /> {t('season.legend.energy')}
            </span>
            <span>
              <i style={{ background: COLOR_DTE }} /> {t('season.legend.dte')}
            </span>
            <span>
              <i style={{ background: COLOR_SUN_EL }} /> {t('season.legend.sunEl')}
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
        <p className="hint">{t('season.computing')}</p>
      )}
    </div>
  )
}
