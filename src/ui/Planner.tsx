import type { ReactNode } from 'react'
import { useLang, useT } from '../i18n/index.ts'
import { usePlannerStore } from '../store/usePlannerStore.ts'
import { PlannerCalendar } from './PlannerCalendar.tsx'
import { PlannerForm } from './PlannerForm.tsx'
import { Empty } from './kit/Empty.tsx'
import { effectiveFromMs, usePlanProblem } from './plannerInputs.ts'
import { PlannerMap } from './PlannerMap.tsx'
import { PlannerTable } from './PlannerTable.tsx'
import { PlannerTop } from './PlannerTop.tsx'
import { formatPlanDate, planSummary, problemChanged, rangeEndMs } from './plannerView.ts'

// Development only: lets a script (or the console) put a result on screen without the engine.
if (import.meta.env.DEV) (globalThis as { __planner?: unknown }).__planner = usePlannerStore

function Zone({
  id,
  n,
  title,
  aside,
  children,
}: {
  id: string
  n: number
  title: string
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section className={`planner__zone planner__zone--${id}`} aria-labelledby={`planner-${id}`}>
      <header className="planner__zone-head">
        <h3 id={`planner-${id}`}>
          <span className="planner__num">{n}</span>
          <span className="sr-only"> · </span>
          {title}
        </h3>
        {aside}
      </header>
      <div className="planner__zone-body">{children}</div>
    </section>
  )
}

/** "N of M days with a solution · best day: …", once there is something to say. */
function Summary() {
  const t = useT()
  const lang = useLang()
  const result = usePlannerStore((s) => s.result)
  if (!result?.days.length) return null
  const s = planSummary(result)
  return (
    <p className="planner__summary" role="status">
      <strong>{t('plan.summary.solved', { n: s.solved, total: s.computed })}</strong>
      {s.bestDayMs !== null && s.bestScore !== null && (
        <span>
          {' · '}
          {t('plan.summary.best', {
            date: formatPlanDate(s.bestDayMs, lang),
            score: Math.round(s.bestScore),
          })}
        </span>
      )}
    </p>
  )
}

/**
 * The "Plan" step (planner audience): from a point with ice and a range of dates to the five
 * best landing days, each with its landing point. Three zones in reading order: what the
 * mission is, when to land, where.
 */
export function Planner() {
  const t = useT()
  const lang = useLang()
  const result = usePlannerStore((s) => s.result)
  const status = usePlannerStore((s) => s.status)
  const storedFrom = usePlannerStore((s) => s.fromMs)
  const storedDays = usePlannerStore((s) => s.days)
  const problem = usePlanProblem()
  const stale =
    !!result && status !== 'running' && (!problem || problemChanged(result.problem, problem))
  // The calendar shows the range of the results while there are any, else the range typed.
  const fromMs = result?.problem.fromMs ?? effectiveFromMs(storedFrom, storedDays)
  const days = result?.problem.days ?? storedDays
  const staleBadge = stale && (
    <span className="pbadge pbadge--stale" title={t('plan.stale.text')}>
      {t('plan.stale.badge')}
    </span>
  )

  return (
    <section className="planner" aria-labelledby="planner-title">
      <header className="planner__head">
        <div>
          <h2 id="planner-title" className="planner__title">
            {t('plan.title')}
          </h2>
          <p className="planner__sub">{t('plan.sub')}</p>
        </div>
        <Summary />
      </header>
      <div className="planner__grid">
        <Zone id="what" n={1} title={t('plan.zone.what')}>
          <PlannerForm />
        </Zone>
        <Zone id="when" n={2} title={t('plan.zone.when')} aside={staleBadge}>
          <p className="planner__range">
            {t('plan.when.range', {
              from: formatPlanDate(fromMs, lang),
              to: formatPlanDate(rangeEndMs(fromMs, days), lang),
              days,
            })}
          </p>
          <PlannerCalendar fromMs={fromMs} days={days} result={result} />
          {result ? (
            <PlannerTable result={result} />
          ) : (
            <Empty title={t('plan.when.emptyTitle')}>{t('plan.when.empty')}</Empty>
          )}
        </Zone>
        <Zone id="where" n={3} title={t('plan.zone.where')} aside={staleBadge}>
          <PlannerMap />
          <PlannerTop />
        </Zone>
      </div>
    </section>
  )
}
