import { type PointerEvent, useEffect, useMemo, useState } from 'react'
import { DAY_MS } from '../astro/constants.ts'
import type { DateCandidate } from '../astro/metrics.ts'
import { useAsync } from '../hooks/useAsync.ts'
import { context2d, useCanvasSize } from '../hooks/useCanvas.ts'
import { useScenarioData } from '../hooks/useScenario.ts'
import { selectActiveScenario, todayUtc, useMissionStore } from '../store/useMissionStore.ts'
import { useT } from '../i18n/index.ts'
import { useSiteText } from '../i18n/sites.ts'
import { runDateSweep } from '../workers/astroClient.ts'
import { alpha, chartFont, levelFill, useChartTheme } from './chartTheme.ts'
import { formatDay, formatHours, formatPct } from './format.ts'
import { Busy } from './kit/Busy.tsx'
import { LevelTag } from './LevelTag.tsx'
import { type Level, scoreLevel } from './levels.ts'

const SWEEP_DAYS = 365

/** Same steps as the bar colours of the chart: the shared score thresholds (60 / 35). */
const sweepLevel = (s: number): Level => scoreLevel(s)

function SweepChart({
  candidates,
  selectedMs,
  onPick,
}: {
  candidates: DateCandidate[]
  selectedMs: number
  onPick: (ms: number) => void
}) {
  const { ref, width, height, dpr } = useCanvasSize()
  const t = useT()
  const theme = useChartTheme()
  useEffect(() => {
    const ctx = context2d(ref.current, width, height, dpr)
    if (!ctx || !candidates.length) return
    const plotH = height - 26
    const bw = width / candidates.length
    candidates.forEach((c, i) => {
      const h = (c.score / 100) * plotH
      ctx.fillStyle = levelFill(theme, sweepLevel(c.score))
      ctx.globalAlpha = c.sunAtLanding ? 0.9 : 0.35
      ctx.fillRect(i * bw, plotH - h, Math.max(1, bw - 0.5), h)
      ctx.globalAlpha = 1
      // Strip: Earth visible at touchdown.
      ctx.fillStyle = c.earthAtLanding ? theme.earth : alpha(theme.inkMuted, 0.15)
      ctx.fillRect(i * bw, plotH + 2, Math.max(1, bw - 0.5), 5)
    })
    ctx.fillStyle = theme.inkMuted
    ctx.font = chartFont(10, 'mono')
    for (let i = 0; i < candidates.length; i += 30)
      ctx.fillText(formatDay(candidates[i].startMs), i * bw + 2, height - 2)
    const sel = candidates.findIndex((c) => Math.abs(c.startMs - selectedMs) < DAY_MS / 2)
    if (sel >= 0) {
      ctx.strokeStyle = theme.ink
      ctx.lineWidth = 2
      ctx.strokeRect(sel * bw, 0, Math.max(2, bw), plotH + 7)
      ctx.lineWidth = 1
    }
  }, [ref, width, height, dpr, candidates, selectedMs, theme])

  const pick = (e: PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const i = Math.floor(((e.clientX - rect.left) / rect.width) * candidates.length)
    const c = candidates[Math.max(0, Math.min(candidates.length - 1, i))]
    if (c) onPick(c.startMs)
  }

  return (
    <canvas
      ref={ref}
      className="sweep"
      onPointerDown={pick}
      role="img"
      aria-label={t('sweep.aria')}
    />
  )
}

/** "If the launch slips, which dates still work at this site?" */
export function DateSweep() {
  const scenario = useMissionStore(selectActiveScenario)
  const missionDays = useMissionStore((s) => s.missionDays)
  const setStart = useMissionStore((s) => s.setStart)
  const linkMarginDeg = useMissionStore((s) => s.linkMarginDeg)
  const requireDsn = useMissionStore((s) => s.requireDsn)
  const t = useT()
  const siteText = useSiteText()
  const { info, detail } = useScenarioData(scenario)
  const [fromMs] = useState(() => todayUtc())
  const key =
    detail && info ? `${info.id}|${fromMs}|${missionDays}|${linkMarginDeg}|${requireDsn}` : null
  const { data, loading } = useAsync(key, () =>
    runDateSweep({
      site: detail!.site,
      mask: detail!.mask,
      fromMs,
      days: SWEEP_DAYS,
      missionDays,
      linkMarginDeg,
      requireDsn,
    }),
  )
  const best = useMemo(
    () =>
      data
        ? [...data]
            .filter((c) => c.sunAtLanding)
            .sort((a, b) => b.score - a.score)
            .slice(0, 5)
        : [],
    [data],
  )
  const pick = (ms: number) => setStart(ms)

  return (
    <div className="sweep-panel" aria-busy={loading}>
      <div className="sweep-panel__chart">
        <p className="hint">
          {t('sweep.hint', { days: missionDays, site: siteText(info)?.name ?? '…' })}
        </p>
        {data ? (
          <SweepChart candidates={data} selectedMs={scenario.startMs} onPick={pick} />
        ) : (
          <Busy>{t('sweep.computing')}</Busy>
        )}
      </div>
      <ol className="sweep-panel__best">
        {best.map((c) => (
          <li key={c.startMs}>
            <button type="button" className="linklike" onClick={() => pick(c.startMs)}>
              {formatDay(c.startMs)} {new Date(c.startMs).getUTCFullYear()}
            </button>{' '}
            <strong className="sweep-score" data-level={sweepLevel(c.score)}>
              {c.score} <LevelTag level={sweepLevel(c.score)} />
            </strong>{' '}
            ·{' '}
            {t('sweep.item', {
              e: formatPct(c.energyPct),
              d: formatPct(c.dtePct),
              n: formatHours(c.longestDarkH),
            })}
            {c.earthAtLanding ? '' : ` · ${t('sweep.noEarth')}`}
          </li>
        ))}
      </ol>
    </div>
  )
}
