import { useT } from '../i18n/index.ts'
import { useUiStore } from '../store/useUiStore.ts'
import { IconCompare, IconLander, IconMountain, IconOrbit, IconTarget } from './icons.tsx'
import { DECIDE_STEP, STEPS, goToStep, useStepIndex } from './steps.ts'

const ICONS = [IconOrbit, IconMountain, IconLander, IconCompare]

/**
 * "① Orbit › ② Surface › ③ Landing › ④ Decide": the process as a stepper. Every step stays
 * clickable; the ones before the current one are ticked.
 */
export function StepBar() {
  const t = useT()
  const current = useStepIndex()
  // Planners start one step earlier: "Plan" (ice target + dates → best landing per day).
  const planner = useUiStore((s) => s.audience === 'planner')
  const planning = useUiStore((s) => s.stage === 'plan')
  const setStage = useUiStore((s) => s.setStage)
  const shift = planner ? 2 : 1
  return (
    <nav className="steps" aria-label={t('step.aria')} data-tour="steps">
      <ol>
        {planner && (
          <li data-state={planning ? 'current' : 'done'}>
            <button
              type="button"
              aria-current={planning ? 'step' : undefined}
              onClick={() => setStage('plan')}
              data-tour="plan"
            >
              <span className="steps__num" aria-hidden>
                {planning ? 1 : '✓'}
              </span>
              <IconTarget />
              <span className="steps__label">{t('step.plan')}</span>
            </button>
          </li>
        )}
        {STEPS.map((step, i) => {
          const Icon = ICONS[i]
          const state = planning
            ? 'todo'
            : i < current
              ? 'done'
              : i === current
                ? 'current'
                : 'todo'
          return (
            <li key={step.id} data-state={state}>
              <button
                type="button"
                aria-current={!planning && i === current ? 'step' : undefined}
                onClick={() => {
                  if (planning) setStage('explore')
                  goToStep(i)
                }}
                data-tour={step.id === 'decide' ? 'compare' : undefined}
              >
                <span className="steps__num" aria-hidden>
                  {state === 'done' ? '✓' : i + shift}
                </span>
                <Icon />
                <span className="steps__label">{t(step.title)}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/** One line under the top bar: what to look at in this step, and "Next →". */
export function StepHint() {
  const t = useT()
  const current = useStepIndex()
  const planner = useUiStore((s) => s.audience === 'planner')
  const step = STEPS[current]
  const extra = planner ? 1 : 0
  return (
    <div className="stephint" role="status">
      <span className="stephint__n">
        {t('step.of', { n: current + 1 + extra, total: STEPS.length + extra })}
      </span>
      <span className="stephint__text">{t(step.hint)}</span>
      {current < DECIDE_STEP && (
        <button
          type="button"
          className="btn btn--primary btn--small"
          onClick={() => goToStep(current + 1)}
        >
          {t('step.next', { name: t(STEPS[current + 1].title) })} →
        </button>
      )}
    </div>
  )
}
