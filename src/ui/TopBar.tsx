import { LANGS, type MsgKey, useLangStore, useT } from '../i18n/index.ts'
import { AUDIENCES, useUiStore } from '../store/useUiStore.ts'
import { IconHelp, IconMoon, IconSun } from './icons.tsx'
import { MoreMenu } from './MoreMenu.tsx'
import { StepBar } from './StepBar.tsx'
import { useThemeStore } from './theme.ts'

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

/** Planner / educator / public: how much detail the panels show (see ui/audience.ts). */
export function AudienceToggle() {
  const t = useT()
  const audience = useUiStore((s) => s.audience)
  const setAudience = useUiStore((s) => s.setAudience)
  return (
    <nav
      className="segmented segmented--small"
      aria-label={t('topbar.audience')}
      data-tour="audience"
    >
      {AUDIENCES.map((a) => (
        <button
          key={a}
          type="button"
          aria-pressed={audience === a}
          onClick={() => setAudience(a)}
          title={t(`audience.${a}.desc` as MsgKey)}
        >
          {t(`audience.${a}` as MsgKey)}
        </button>
      ))}
    </nav>
  )
}

/** Dark ⇄ light for the interface; the 3D scene stays dark. */
export function ThemeToggle() {
  const t = useT()
  const theme = useThemeStore((s) => s.theme)
  const toggle = useThemeStore((s) => s.toggle)
  const label = t(theme === 'dark' ? 'topbar.themeLight' : 'topbar.themeDark')
  return (
    <button type="button" className="icon-btn" onClick={toggle} aria-label={label} title={label}>
      {theme === 'dark' ? <IconSun /> : <IconMoon />}
    </button>
  )
}

/**
 * Brand, the four steps of the decision and the guide. Everything secondary lives in "⋯ More";
 * the export is at the end of the process (step 4), not here.
 */
export function TopBar() {
  const t = useT()
  const exploring = useUiStore((s) => s.stage === 'explore')
  const planning = useUiStore((s) => s.stage === 'plan')
  const touring = useUiStore((s) => s.tourStep !== null)
  const startTour = useUiStore((s) => s.startTour)

  return (
    <header className="topbar">
      <div className="topbar__brand">
        <img className="topbar__mark" src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" />
        <span className="topbar__logo">
          KILLA <span>LANDING</span>
        </span>
        <span className="topbar__tag">{t('topbar.tag')}</span>
      </div>
      {(exploring || planning) && <StepBar />}
      <div className="topbar__actions" role="group" aria-label={t('topbar.tools')}>
        {exploring && (
          <>
            <button
              type="button"
              className="btn"
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
        {(exploring || planning) && <AudienceToggle />}
        <ThemeToggle />
        <LangToggle />
      </div>
    </header>
  )
}
