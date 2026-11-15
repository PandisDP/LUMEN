import type { Constraint } from '../astro/hardware.ts'
import { PLAN_TOP, type PlanDay, type PlanResult } from '../astro/plannerTypes.ts'
import { comparePlanDays, openPlanDay } from '../hooks/planActions.ts'
import { PLAN_ERROR } from '../hooks/usePlanner.ts'
import { type MsgKey, useLang, useT } from '../i18n/index.ts'
import { usePlannerStore } from '../store/usePlannerStore.ts'
import { formatDistance, formatHours, formatLatLon, formatPct } from './format.ts'
import { Busy } from './kit/Busy.tsx'
import { Killa } from './Killa.tsx'
import { Empty } from './kit/Empty.tsx'
import { Notice } from './kit/Notice.tsx'
import { LevelTag } from './LevelTag.tsx'
import { scoreLevel } from './levels.ts'
import { usePlanFixActions } from './plannerFixes.ts'
import { launchPlan } from './plannerInputs.ts'
import {
  VIOLATION_FIX,
  VIOLATION_KEY,
  formatPlanDate,
  planSummary,
  roundTripM,
  samplesKey,
  topDays,
  violationHistogram,
  violationsByDay,
} from './plannerView.ts'

/** Failures the engine names; anything else is shown as its raw message. */
const ERROR_KEY: Record<string, MsgKey> = {
  [PLAN_ERROR.noIce]: 'plan.err.noIce',
  [PLAN_ERROR.noGround]: 'plan.err.noGround',
  [PLAN_ERROR.noTile]: 'plan.err.noTile',
  [PLAN_ERROR.expired]: 'plan.err.expired',
}

const TIGHT_KEY: Record<Constraint, MsgKey> = {
  slope: 'hw.c.slope',
  night: 'hw.c.night',
  dte: 'hw.c.dte',
}

function TopCard({ result, day, rank }: { result: PlanResult; day: PlanDay; rank: number }) {
  const t = useT()
  const lang = useLang()
  const selected = usePlannerStore((s) => s.selectedDayMs === day.dayMs)
  const picked = usePlannerStore((s) => s.picked.includes(day.dayMs))
  const { selectDay, togglePicked } = usePlannerStore.getState()
  const b = day.best!
  const date = formatPlanDate(day.dayMs, lang)
  const level = scoreLevel(b.score)

  return (
    <li className="ptop__card" data-selected={selected} data-level={level}>
      <div className="ptop__head">
        <span className="pbadge pbadge--rank ptop__rank" aria-label={t('plan.rank', { n: rank })}>
          {rank}
        </span>
        <div className="ptop__when">
          <button
            type="button"
            className="ptop__date"
            aria-pressed={selected}
            title={t('plan.top.show')}
            onClick={() => selectDay(selected ? null : day.dayMs)}
          >
            {date}
          </button>
          <span className="ptop__coords">{formatLatLon(b.lat, b.lon)}</span>
        </div>
        <p className="ptop__score" data-level={level}>
          <span className="ptop__score-label">{t('plan.col.score')}</span>
          <strong>{Math.round(b.score)}</strong>
          <LevelTag level={level} />
        </p>
      </div>
      <dl className="ptop__figures">
        <div>
          <dt>{t('plan.col.energy')}</dt>
          <dd>{formatPct(b.energyPct)}</dd>
        </div>
        <div>
          <dt>{t('plan.col.dte')}</dt>
          <dd>{formatPct(b.dtePct)}</dd>
        </div>
        <div>
          <dt>{t('plan.col.light')}</dt>
          <dd>{formatHours(b.sunFromLandingH)}</dd>
        </div>
      </dl>
      <p className="ptop__rover">
        {t('plan.top.rover', {
          samples: t(samplesKey(b.rover.samplesDone), { n: b.rover.samplesDone }),
          h: formatHours(b.rover.totalH),
          margin: formatHours(b.rover.marginH ?? NaN),
          soc: formatPct(b.rover.minSocPct),
          route: formatDistance(roundTripM(b)),
        })}
      </p>
      {b.verdict === 'warn' && (
        <p className="ptop__warn">
          <LevelTag level="warn" />{' '}
          {t('plan.top.tight', { limits: b.tight.map((c) => t(TIGHT_KEY[c])).join(' · ') || '—' })}
        </p>
      )}
      <div className="ptop__actions">
        <label className="field field--check">
          <input
            type="checkbox"
            checked={picked}
            aria-label={t('plan.pick.aria', { date })}
            onChange={() => togglePicked(day.dayMs)}
          />
          {t('plan.top.compare')}
        </label>
        <button
          type="button"
          className="btn btn--primary btn--small"
          aria-label={t('plan.top.openAria', { date })}
          onClick={() => openPlanDay(result, day.dayMs)}
        >
          {t('plan.top.open')} →
        </button>
      </div>
    </li>
  )
}

/** No day has a solution: which constraint rejects most, and what to change. */
function NoSolution({ result }: { result: PlanResult }) {
  const t = useT()
  const bars = violationHistogram(result.days)
  const fixes = usePlanFixActions(result)
  const main = bars[0]
  // What stops the best point of most days, when it is not what rejects most points.
  const perDay = bars.find((b) => b.violation === violationsByDay(bars)[0])
  const unsolved = result.days.filter((d) => !d.best).length
  return (
    <Notice
      tone="warning"
      role="status"
      title={t('plan.none.title')}
      headingLevel={4}
      action={fixes}
      className="ptop__none"
    >
      {main ? (
        <>
          <p>
            {t('plan.none.main', {
              why: t(VIOLATION_KEY[main.violation]),
              pct: Math.round(main.share * 100),
            })}
          </p>
          {perDay && perDay.days > 0 && perDay.violation !== main.violation && (
            <p>
              {t('plan.none.days', {
                n: perDay.days,
                total: unsolved,
                why: t(VIOLATION_KEY[perDay.violation]),
              })}
            </p>
          )}
          <ul className="ptop__bars">
            {bars.map((bar) => (
              <li key={bar.violation}>
                <div className="ptop__bar-head">
                  <span>{t(VIOLATION_KEY[bar.violation])}</span>
                  <span>{formatPct(bar.share * 100)}</span>
                </div>
                <div className="ptop__bar" aria-hidden>
                  <i style={{ width: `${Math.max(2, bar.share * 100)}%` }} />
                </div>
                <p className="hint">→ {t(VIOLATION_FIX[bar.violation])}</p>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>{t('plan.none.unknown')}</p>
      )}
      {fixes.length > 0 && <p className="notice__next">{t('plan.fixbtn.then')}</p>}
    </Notice>
  )
}

/** Zone 3, bottom: the shortlist (best first), and what to do when there is none. */
export function PlannerTop() {
  const t = useT()
  const result = usePlannerStore((s) => s.result)
  const status = usePlannerStore((s) => s.status)
  const error = usePlannerStore((s) => s.error)
  const picked = usePlannerStore((s) => s.picked)
  const top = topDays(result)
  const summary = result ? planSummary(result) : null
  const running = status === 'running'
  const settled = !!result && !running && status !== 'error'
  const fixes = usePlanFixActions(result)
  const valid = result
    ? picked.filter((ms) => result.days.some((d) => d.dayMs === ms && d.best))
    : []

  return (
    <div className="ptop">
      <h4 className="ptop__title">{t('plan.top.title', { n: PLAN_TOP })}</h4>
      {status === 'error' && (
        <Notice tone="error" action={{ label: t('plan.retry'), onClick: launchPlan }}>
          {error && ERROR_KEY[error] ? t(ERROR_KEY[error]) : t('plan.error', { msg: error ?? '' })}
        </Notice>
      )}
      {!result && status !== 'error' && (
        <>
          {running ? (
            <Busy>{t('plan.top.starting')}</Busy>
          ) : (
            <Empty title={t('plan.empty.title')} mascot={<Killa size={72} />}>
              <p>{t('plan.empty.1')}</p>
              <p>{t('plan.empty.2', { n: PLAN_TOP })}</p>
            </Empty>
          )}
        </>
      )}
      {result && running && (
        <p className="ptop__note" role="status">
          {t(top.length ? 'plan.top.partial' : 'plan.top.partialNone')}
        </p>
      )}
      {result && status === 'cancelled' && summary && (
        <p className="ptop__note" role="status">
          {t('plan.top.cancelled', { n: summary.computed, total: summary.total })}
        </p>
      )}
      {settled && summary && summary.solved === 0 && <NoSolution result={result} />}
      {top.length > 0 && result && (
        <ol className="ptop__list">
          {top.map((d, i) => (
            <TopCard key={d.dayMs} result={result} day={d} rank={i + 1} />
          ))}
        </ol>
      )}
      {settled && summary && summary.solved > 0 && summary.solved < PLAN_TOP && (
        <Notice tone="note" action={fixes.slice(0, 2)} className="ptop__few">
          {t('plan.top.few', { n: summary.solved })}
        </Notice>
      )}
      {result && top.length > 0 && (
        <div className="ptop__send">
          <button
            type="button"
            className="btn btn--primary"
            disabled={valid.length < 2}
            onClick={() => comparePlanDays(result, valid)}
          >
            {t('plan.top.send', { n: valid.length })}
          </button>
          <p className="hint">{t('plan.top.sendHint')}</p>
        </div>
      )}
    </div>
  )
}
