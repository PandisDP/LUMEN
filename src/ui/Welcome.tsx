import { openChallenges } from '../hooks/useChallengeState.ts'
import { type MsgKey, useT } from '../i18n/index.ts'
import { useMissionStore } from '../store/useMissionStore.ts'
import { AUDIENCES, chooseStage, useUiStore } from '../store/useUiStore.ts'
import { IconCompare, IconLander, IconMountain, IconOrbit, IconTarget } from './icons.tsx'
import { STEPS } from './steps.ts'
import { TopSites } from './TopSites.tsx'

const ICONS = [IconOrbit, IconMountain, IconLander, IconCompare]

/** Who is using the tool: picks how much detail the panels will show. */
function AudiencePicker() {
  const t = useT()
  const audience = useUiStore((s) => s.audience)
  const setAudience = useUiStore((s) => s.setAudience)
  return (
    <fieldset className="intro__audience">
      <legend className="panel__label">{t('audience.who')}</legend>
      {AUDIENCES.map((a) => (
        <label key={a} className="intro__audience-card" data-selected={audience === a}>
          <input
            type="radio"
            name="audience"
            value={a}
            checked={audience === a}
            onChange={() => setAudience(a)}
          />
          <strong>{t(`audience.${a}` as MsgKey)}</strong>
          <span>{t(`audience.${a}.desc` as MsgKey)}</span>
        </label>
      ))}
    </fieldset>
  )
}

/** First screen after the splash: the goal in one sentence and the steps (planners start with "Plan"). */
export function Welcome() {
  const t = useT()
  const setStage = useUiStore((s) => s.setStage)
  const planner = useUiStore((s) => s.audience === 'planner')
  const shift = planner ? 2 : 1
  const startTour = useUiStore((s) => s.startTour)

  return (
    <section className="intro" aria-labelledby="intro-title">
      <div className="intro__card">
        <p className="intro__kicker">{t('welcome.kicker')}</p>
        <h1 id="intro-title" className="intro__title">
          {t('welcome.title')}
        </h1>
        <p className="intro__sub">{t('welcome.sub', { n: STEPS.length + shift - 1 })}</p>
        <ol className="intro__steps">
          {planner && (
            <li>
              <span className="intro__num">1</span>
              <IconTarget />
              <span>{t('step.plan')}</span>
            </li>
          )}
          {STEPS.map((step, i) => {
            const Icon = ICONS[i]
            return (
              <li key={step.id}>
                <span className="intro__num">{i + shift}</span>
                <Icon />
                <span>{t(step.title)}</span>
              </li>
            )
          })}
        </ol>
        <AudiencePicker />
        <div className="intro__actions">
          <button
            type="button"
            className="btn btn--accent btn--big"
            onClick={() => setStage(chooseStage(useUiStore.getState().audience))}
            autoFocus
          >
            {t('welcome.start')} →
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              setStage('explore')
              startTour(0)
            }}
          >
            {t('welcome.tour')}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              openChallenges()
              setStage('explore')
            }}
          >
            {t('challenge.welcome')}
          </button>
        </div>
      </div>
    </section>
  )
}

/** Step 0: pick where to land among the Top 3 (or open the full list). */
export function ChooseSite() {
  const t = useT()
  const setStage = useUiStore((s) => s.setStage)
  const setShowAllSites = useUiStore((s) => s.setShowAllSites)
  const count = useMissionStore((s) => s.sites.filter((x) => !x.custom).length)
  const start = () => {
    useMissionStore.getState().setCompareOpen(false)
    useMissionStore.getState().setView('macro')
    setStage('explore')
  }

  return (
    <section className="intro intro--choose" aria-labelledby="choose-title">
      <div className="intro__card">
        <p className="intro__kicker">{t('choose.kicker')}</p>
        <h2 id="choose-title" className="intro__title intro__title--small">
          {t('choose.title')}
        </h2>
        <p className="intro__sub">{t('choose.sub')}</p>
        <TopSites variant="hero" onPick={start} />
        <div className="intro__actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              setShowAllSites(true)
              start()
            }}
          >
            {t('top.more', { n: count })}
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => setStage('welcome')}>
            ← {t('choose.back')}
          </button>
        </div>
      </div>
    </section>
  )
}
