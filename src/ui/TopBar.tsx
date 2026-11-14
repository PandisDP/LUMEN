import { LANGS, useLangStore, useT } from '../i18n/index.ts'
import { useUiStore } from '../store/useUiStore.ts'
import { IconHelp } from './icons.tsx'
import { MoreMenu } from './MoreMenu.tsx'
import { StepBar } from './StepBar.tsx'

function LangToggle() {
  const t = useT()
  const lang = useLangStore((s) => s.lang)
  const setLang = useLangStore((s) => s.setLang)
  return (
    <nav className="segmented segmented--small" aria-label={t('topbar.lang')}>
      {LANGS.map((l) => (
        <button key={l} type="button" lang={l} aria-pressed={lang === l} onClick={() => setLang(l)}>
          {l.toUpperCase()}
        </button>
      ))}
    </nav>
  )
}

/**
 * Brand, the four steps of the decision and the guide. Everything secondary lives in "⋯ More";
 * the export is at the end of the process (step 4), not here.
 */
export function TopBar() {
  const t = useT()
  const exploring = useUiStore((s) => s.stage === 'explore')
  const touring = useUiStore((s) => s.tourStep !== null)
  const startTour = useUiStore((s) => s.startTour)

  return (
    <header className="topbar">
      <div className="topbar__brand">
        <img className="topbar__mark" src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" />
        <span className="topbar__logo">
          LUMEN <span>3D</span>
        </span>
        <span className="topbar__tag">{t('topbar.tag')}</span>
      </div>
      {exploring && <StepBar />}
      <div className="topbar__actions" role="group" aria-label={t('topbar.tools')}>
        {exploring && (
          <>
            <button
              type="button"
              className="btn btn--accent"
              aria-pressed={touring}
              onClick={() => startTour(0)}
              title={t('topbar.guideTitle')}
              data-tour="guide"
            >
              <IconHelp />
              <span className="btn__label">{t('topbar.guide')}</span>
            </button>
            <MoreMenu />
          </>
        )}
        <LangToggle />
      </div>
    </header>
  )
}
