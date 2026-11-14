import { useT } from '../i18n/index.ts'
import { IconCompare, IconLander, IconMountain, IconOrbit } from './icons.tsx'
import { DECIDE_STEP, STEPS, goToStep, useStepIndex } from './steps.ts'

const ICONS = [IconOrbit, IconMountain, IconLander, IconCompare]

/**
 * "① Orbit › ② Surface › ③ Landing › ④ Decide": the process as a stepper. Every step stays
 * clickable; the ones before the current one are ticked.
 */
export function StepBar() {
  const t = useT()
  const current = useStepIndex()
  return (
    <nav className="steps" aria-label={t('step.aria')} data-tour="steps">
      <ol>
        {STEPS.map((step, i) => {
          const Icon = ICONS[i]
          const state = i < current ? 'done' : i === current ? 'current' : 'todo'
          return (
            <li key={step.id} data-state={state}>
              <button
                type="button"
                aria-current={i === current ? 'step' : undefined}
                onClick={() => goToStep(i)}
                data-tour={step.id === 'decide' ? 'compare' : undefined}
              >
                <span className="steps__num" aria-hidden>
                  {state === 'done' ? '✓' : i + 1}
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
  const step = STEPS[current]
  return (
    <div className="stephint" role="status">
      <span className="stephint__n">{t('step.of', { n: current + 1, total: STEPS.length })}</span>
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
