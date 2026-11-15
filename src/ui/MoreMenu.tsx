import { useRef } from 'react'
import { useT } from '../i18n/index.ts'
import { useMissionStore } from '../store/useMissionStore.ts'
import { useUiStore } from '../store/useUiStore.ts'
import { openChallenges } from '../hooks/useChallengeState.ts'
import { IconBook, IconEye, IconEyeOff, IconFilter, IconPin, IconTarget } from './icons.tsx'
import { useShow } from './audience.ts'

/** "⋯ More": the secondary tools, out of the way of the four steps. */
export function MoreMenu() {
  const t = useT()
  const menu = useRef<HTMLDetailsElement>(null)
  const panelsHidden = useMissionStore((s) => s.panelsHidden)
  const setStage = useUiStore((s) => s.setStage)
  const run = (fn: () => void) => () => {
    if (menu.current) menu.current.open = false
    fn()
  }
  const s = useMissionStore.getState()
  const showHardware = useShow('hardware')

  return (
    <details className="menu" ref={menu} data-tour="more">
      <summary className="btn" aria-label={t('more.aria')}>
        ⋯ <span className="btn__label">{t('more.title')}</span>
      </summary>
      <div className="menu__list menu__list--end" role="menu">
        <button type="button" role="menuitem" onClick={run(() => setStage('choose'))}>
          <IconPin /> {t('more.changeSite')}
        </button>
        {showHardware && (
          <button type="button" role="menuitem" onClick={run(() => s.setHardwareOpen(true))}>
            <IconFilter /> {t('topbar.hardware')}
          </button>
        )}
        <button type="button" role="menuitem" onClick={run(() => s.setExplainOpen(true))}>
          <IconBook /> {t('topbar.why')}
        </button>
        <button type="button" role="menuitem" onClick={run(openChallenges)}>
          <IconTarget /> {t('challenge.menu')}
        </button>
        <button type="button" role="menuitem" onClick={run(s.togglePanels)}>
          {panelsHidden ? <IconEye /> : <IconEyeOff />}{' '}
          {panelsHidden ? t('topbar.showPanels') : t('topbar.hidePanels')}
        </button>
      </div>
    </details>
  )
}
