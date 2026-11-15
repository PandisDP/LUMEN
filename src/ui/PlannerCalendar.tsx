import { type KeyboardEvent, useRef, useState } from 'react'
import { DAY_MS } from '../astro/constants.ts'
import type { PlanDay, PlanResult } from '../astro/plannerTypes.ts'
import { useLang, useT } from '../i18n/index.ts'
import { usePlannerStore } from '../store/usePlannerStore.ts'
import { formatDistance, formatHours, formatPct } from './format.ts'
import {
  VIOLATION_KEY,
  calendarLayout,
  dayState,
  formatPlanDate,
  formatPlanMonth,
  formatPlanWeekday,
  rankByDay,
  scoreColor,
  weekdayNames,
} from './plannerView.ts'

interface Props {
  fromMs: number
  days: number
  /** Null before the first run: the range is shown as pending days. */
  result: PlanResult | null
}

/** Half the tooltip's width (see .pcal__tip). */
const TIP_HALF_PX = 125

const KEY_STEP: Record<string, number> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -7,
  ArrowDown: 7,
}

/** Key figures of a day (or why it has no solution): the calendar's tooltip. */
function DayTip({ ms, day, rank }: { ms: number; day: PlanDay | undefined; rank?: number }) {
  const t = useT()
  const lang = useLang()
  const b = day?.best
  return (
    <>
      <strong>
        {formatPlanWeekday(ms, lang)}
        {rank ? ` · ${t('plan.rank', { n: rank })}` : ''}
      </strong>
      {!day && <span>{t('plan.cal.pending')}</span>}
      {day && !b && (
        <span>
          {t('plan.noSolution')}
          {day.mainViolation ? `: ${t(VIOLATION_KEY[day.mainViolation])}` : ''}
        </span>
      )}
      {b && (
        <>
          <span>{t('plan.tip.score', { score: Math.round(b.score) })}</span>
          <span>
            {t('plan.tip.figures', { energy: formatPct(b.energyPct), dte: formatPct(b.dtePct) })}
          </span>
          <span>
            {t('plan.tip.light', {
              light: formatHours(b.sunFromLandingH),
              night:
                b.longestDarkH > 0
                  ? t('plan.tip.night', { night: formatHours(b.longestDarkH) })
                  : t('night.none'),
            })}
          </span>
          <span>
            {t('plan.tip.rover', {
              route: formatDistance(b.routeM),
              soc: formatPct(b.rover.minSocPct),
            })}
          </span>
        </>
      )}
    </>
  )
}

/**
 * Zone 2, top: the range as a calendar (weeks, Monday first). Colour is the day's best score;
 * the score itself is printed, days without a solution carry a ✕ and the shortlist its rank.
 */
export function PlannerCalendar({ fromMs, days, result }: Props) {
  const t = useT()
  const lang = useLang()
  const selected = usePlannerStore((s) => s.selectedDayMs)
  const selectDay = usePlannerStore((s) => s.selectDay)
  const [tip, setTip] = useState<{ ms: number; x: number; y: number; below: boolean } | null>(null)
  const cells = useRef(new Map<number, HTMLButtonElement>())
  const weeks = calendarLayout(fromMs, days)
  const byDay = new Map(result?.days.map((d) => [d.dayMs, d]))
  const rank = rankByDay(result)
  const lastMs = fromMs + (days - 1) * DAY_MS
  // Roving tabindex: the selected day, or the first one.
  const tabStop = selected !== null && selected >= fromMs && selected <= lastMs ? selected : fromMs

  const showTip = (ms: number, el: HTMLElement) => {
    const below = el.offsetTop < 96
    // Kept inside the grid: the zone clips what sticks out.
    const room = (el.offsetParent as HTMLElement | null)?.offsetWidth ?? 0
    const centre = el.offsetLeft + el.offsetWidth / 2
    setTip({
      ms,
      x:
        room > 2 * TIP_HALF_PX
          ? Math.min(room - TIP_HALF_PX, Math.max(TIP_HALF_PX, centre))
          : centre,
      y: below ? el.offsetTop + el.offsetHeight : el.offsetTop,
      below,
    })
  }
  const onKey = (e: KeyboardEvent, ms: number) => {
    const step =
      KEY_STEP[e.key] ??
      (e.key === 'Home' ? (fromMs - ms) / DAY_MS : e.key === 'End' ? (lastMs - ms) / DAY_MS : 0)
    if (!step) return
    e.preventDefault()
    const next = Math.min(lastMs, Math.max(fromMs, ms + step * DAY_MS))
    cells.current.get(next)?.focus()
  }
  const label = (ms: number, day: PlanDay | undefined) => {
    const date = formatPlanDate(ms, lang)
    if (!day) return t('plan.cal.aria.pending', { date })
    if (!day.best)
      return t('plan.cal.aria.none', {
        date,
        why: day.mainViolation ? t(VIOLATION_KEY[day.mainViolation]) : t('plan.noSolution'),
      })
    const r = rank.get(ms)
    const base = t('plan.cal.aria.score', { date, score: Math.round(day.best.score) })
    return r ? `${base}, ${t('plan.rank', { n: r })}` : base
  }

  return (
    <div className="pcal">
      <div className="pcal__grid" role="group" aria-label={t('plan.cal.aria')}>
        <span />
        {weekdayNames(lang).map((d) => (
          <span key={d.long} className="pcal__wd" title={d.long}>
            <span aria-hidden>{d.short}</span>
            <span className="sr-only">{d.long}</span>
          </span>
        ))}
        {weeks.map((w, wi) => (
          <div key={wi} className="pcal__week">
            <span className="pcal__month">
              {w.labelMs !== null ? formatPlanMonth(w.labelMs, lang) : ''}
            </span>
            {w.cells.map((ms, ci) => {
              if (ms === null) return <span key={ci} className="pcal__gap" />
              const day = byDay.get(ms)
              const state = dayState(day)
              const r = rank.get(ms)
              return (
                <button
                  key={ci}
                  type="button"
                  ref={(el) => {
                    if (el) cells.current.set(ms, el)
                    else cells.current.delete(ms)
                  }}
                  className="pcal__cell"
                  data-state={state}
                  data-day={ms}
                  aria-pressed={selected === ms}
                  aria-label={label(ms, day)}
                  tabIndex={ms === tabStop ? 0 : -1}
                  style={day?.best ? { background: scoreColor(day.best.score) } : undefined}
                  onClick={() => selectDay(selected === ms ? null : ms)}
                  onKeyDown={(e) => onKey(e, ms)}
                  onMouseEnter={(e) => showTip(ms, e.currentTarget)}
                  onMouseLeave={() => setTip(null)}
                  onFocus={(e) => showTip(ms, e.currentTarget)}
                  onBlur={() => setTip(null)}
                >
                  <span className="pcal__date" aria-hidden>
                    {new Date(ms).getUTCDate()}
                  </span>
                  <span className="pcal__score" aria-hidden>
                    {day?.best ? Math.round(day.best.score) : state === 'none' ? '✕' : '·'}
                  </span>
                  {r && (
                    <span className="pcal__rank" aria-hidden>
                      {r}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ))}
        {tip && (
          <div
            className="pcal__tip"
            data-below={tip.below}
            role="tooltip"
            style={{ left: tip.x, top: tip.y }}
          >
            <DayTip ms={tip.ms} day={byDay.get(tip.ms)} rank={rank.get(tip.ms)} />
          </div>
        )}
      </div>
      <ul className="pcal__legend" aria-label={t('plan.cal.legend')}>
        <li>
          <i style={{ background: scoreColor(20) }} />
          {t('plan.cal.legendBad')}
        </li>
        <li>
          <i style={{ background: scoreColor(48) }} />
          {t('plan.cal.legendWarn')}
        </li>
        <li>
          <i style={{ background: scoreColor(80) }} />
          {t('plan.cal.legendGood')}
        </li>
        <li>
          <i className="pcal__legend-none">✕</i>
          {t('plan.noSolution')}
        </li>
        <li>
          <i className="pcal__legend-rank">1</i>
          {t('plan.cal.legendTop')}
        </li>
      </ul>
    </div>
  )
}
