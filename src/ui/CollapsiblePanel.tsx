import type { ReactNode } from 'react'
import { useT } from '../i18n/index.ts'
import { PANEL_KEYS, type PanelId, useUiStore } from '../store/useUiStore.ts'
import { HelpButton } from './HelpButton.tsx'
import { IconChevron } from './icons.tsx'
import type { HelpTopic } from './tourSteps.ts'

/**
 * Side or bottom panel that collapses to a titled bar instead of disappearing: the header (icon,
 * title, one-line summary, "?" help) always stays on screen; the body mounts only when expanded,
 * so collapsed panels don't compute charts nobody sees.
 */
export function CollapsiblePanel({
  id,
  title,
  icon,
  summary,
  help,
  label,
  busy,
  children,
}: {
  id: PanelId
  title: string
  icon: ReactNode
  /** Shown in the header while collapsed (site name, Sun/Earth state, mission time…). */
  summary?: ReactNode
  help: HelpTopic
  label?: string
  busy?: boolean
  children: ReactNode
}) {
  const t = useT()
  const open = useUiStore((s) => s.panels[id])
  const togglePanel = useUiStore((s) => s.togglePanel)
  const bodyId = `panel-${id}-body`
  const action = t(open ? 'panel.collapse' : 'panel.expand', { name: title })

  return (
    <section
      className={`panel panel--${id} ${open ? 'is-open' : 'is-collapsed'}`}
      aria-label={label ?? title}
      aria-busy={busy}
      data-tour={`panel-${id}`}
    >
      <header className="panel__head">
        <button
          type="button"
          className="panel__toggle"
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={action}
          title={`${action} (${t('panel.key', { key: PANEL_KEYS[id] })})`}
          onClick={() => togglePanel(id)}
        >
          <span className="panel__icon" aria-hidden>
            {icon}
          </span>
          <span className="panel__heading">{title}</span>
          <span className="panel__chevron" aria-hidden>
            <IconChevron />
          </span>
        </button>
        {!open && summary && <div className="panel__summary">{summary}</div>}
        <HelpButton topic={help} align={id === 'right' ? 'end' : 'start'} />
      </header>
      {open && (
        <div className="panel__body" id={bodyId}>
          {children}
        </div>
      )}
    </section>
  )
}
