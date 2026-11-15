import { useEffect, useRef, useState } from 'react'
import type { Constraint } from '../astro/hardware.ts'
import type { PlanDay, PlanResult } from '../astro/plannerTypes.ts'
import { type MsgKey, useLang, useT } from '../i18n/index.ts'
import { usePlannerStore } from '../store/usePlannerStore.ts'
import { downloadText } from './export.ts'
import { formatDistance, formatLatLon, formatPct } from './format.ts'
import { LevelTag } from './LevelTag.tsx'
import { scoreLevel } from './levels.ts'
import {
  DEFAULT_DIR,
  type SortDir,
  type SortKey,
  VIOLATION_KEY,
  formatPlanWeekday,
  formatSpan,
  planCsv,
  planFileName,
  rankByDay,
  sortDays,
} from './plannerView.ts'

const TIGHT_KEY: Record<Constraint, MsgKey> = {
  slope: 'hw.c.slope',
  night: 'hw.c.night',
  dte: 'hw.c.dte',
}

/** Columns after the checkbox; `key` makes the header a sort button. */
const COLUMNS: { label: MsgKey; short?: MsgKey; key: SortKey; num?: boolean }[] = [
  { label: 'plan.col.date', key: 'date' },
  { label: 'plan.col.score', short: 'plan.th.score', key: 'score', num: true },
  { label: 'plan.col.route', short: 'plan.th.route', key: 'route', num: true },
  { label: 'plan.col.energy', key: 'energy', num: true },
  { label: 'plan.col.dte', short: 'plan.th.dte', key: 'dte', num: true },
  { label: 'plan.col.night', short: 'plan.th.night', key: 'night', num: true },
  { label: 'plan.col.light', short: 'plan.th.light', key: 'light', num: true },
  { label: 'plan.col.battery', short: 'plan.th.battery', key: 'battery', num: true },
  { label: 'plan.col.verdict', key: 'verdict' },
]

function Row({ day, rank }: { day: PlanDay; rank?: number }) {
  const t = useT()
  const lang = useLang()
  const selected = usePlannerStore((s) => s.selectedDayMs === day.dayMs)
  const picked = usePlannerStore((s) => s.picked.includes(day.dayMs))
  const { selectDay, togglePicked } = usePlannerStore.getState()
  const ref = useRef<HTMLTableRowElement>(null)
  const b = day.best
  const date = formatPlanWeekday(day.dayMs, lang)

  // The calendar or the map selected this day: bring its row into view (within the table).
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView?.({ block: 'nearest' })
  }, [selected])

  return (
    <tr
      ref={ref}
      data-state={b ? b.verdict : 'none'}
      data-selected={selected}
      aria-current={selected ? 'true' : undefined}
      onClick={() => selectDay(day.dayMs)}
    >
      <td className="ptable__check">
        <input
          type="checkbox"
          checked={picked}
          disabled={!b}
          aria-label={t('plan.pick.aria', { date })}
          onClick={(e) => e.stopPropagation()}
          onChange={() => togglePicked(day.dayMs)}
        />
      </td>
      <th scope="row">
        <button type="button" className="linklike" onClick={() => selectDay(day.dayMs)}>
          {date}
        </button>
        {rank && (
          <span className="pbadge pbadge--rank" title={t('plan.rank', { n: rank })}>
            {rank}
          </span>
        )}
        {b && <span className="ptable__point">{formatLatLon(b.lat, b.lon)}</span>}
      </th>
      {b ? (
        <>
          <td className="ptable__num ptable__score">
            <LevelTag level={scoreLevel(b.score)} /> {Math.round(b.score)}
          </td>
          <td className="ptable__num">{formatDistance(b.routeM)}</td>
          <td className="ptable__num">{formatPct(b.energyPct)}</td>
          <td className="ptable__num">{formatPct(b.dtePct)}</td>
          <td className="ptable__num">
            {b.longestDarkH > 0 ? formatSpan(b.longestDarkH) : t('night.none')}
          </td>
          <td className="ptable__num">{formatSpan(b.sunFromLandingH)}</td>
          <td className="ptable__num">{formatPct(b.rover.minSocPct)}</td>
          <td className="ptable__verdict">
            <LevelTag level={b.verdict} /> {t(`hw.verdict.${b.verdict}`)}
            {b.tight.length > 0 && (
              <span className="ptable__note ptable__tight">
                {b.tight.map((c) => t(TIGHT_KEY[c])).join(' · ')}
              </span>
            )}
          </td>
        </>
      ) : (
        <td colSpan={8} className="ptable__none">
          <span aria-hidden>✕</span> {t('plan.noSolution')}
          {day.mainViolation && (
            <span className="ptable__note">: {t(VIOLATION_KEY[day.mainViolation])}</span>
          )}
        </td>
      )}
    </tr>
  )
}

/** Zone 2, bottom: one row per day, sortable, with the days ticked for Compare. */
export function PlannerTable({ result }: { result: PlanResult }) {
  const t = useT()
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'date', dir: 'asc' })
  const rows = sortDays(result.days, sort.key, sort.dir)
  const rank = rankByDay(result)
  const byScore = sort.key === 'score'
  const toggle = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: DEFAULT_DIR[key] },
    )

  return (
    <div className="ptable">
      <div className="ptable__bar">
        <h4 className="ptable__title">{t('plan.table.title')}</h4>
        <button
          type="button"
          className="btn btn--small"
          aria-pressed={byScore}
          onClick={() =>
            setSort(byScore ? { key: 'date', dir: 'asc' } : { key: 'score', dir: 'desc' })
          }
        >
          {t('plan.table.byScore')}
        </button>
        <button
          type="button"
          className="btn btn--small"
          disabled={!result.days.length}
          onClick={() => downloadText(planFileName(result), 'text/csv', planCsv(result))}
        >
          {t('plan.table.csv')}
        </button>
      </div>
      <div className="ptable__scroll" tabIndex={0} role="region" aria-label={t('plan.table.title')}>
        <table>
          <thead>
            <tr>
              <th scope="col" className="ptable__check">
                <span className="sr-only">{t('plan.col.pick')}</span>
              </th>
              {COLUMNS.map((c) => (
                <th
                  key={c.label}
                  scope="col"
                  className={c.num ? 'ptable__num' : undefined}
                  aria-sort={
                    sort.key === c.key
                      ? sort.dir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : undefined
                  }
                >
                  <button
                    type="button"
                    className="ptable__sort"
                    title={c.short ? t(c.label) : undefined}
                    aria-label={t(c.label)}
                    onClick={() => toggle(c.key)}
                  >
                    {t(c.short ?? c.label)}
                    <span aria-hidden>
                      {sort.key === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <Row key={d.dayMs} day={d} rank={rank.get(d.dayMs)} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">{t('plan.table.note')}</p>
    </div>
  )
}
