import { useT } from '../i18n/index.ts'

/** Placeholder of the "Plan" step: replaced by the planner screen. */
export function Planner() {
  const t = useT()
  return (
    <section className="intro" aria-label={t('step.plan')}>
      <div className="intro__card">
        <p className="hint">{t('common.computing')}</p>
      </div>
    </section>
  )
}
