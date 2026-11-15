import type { ReactNode } from 'react'
import { BAND_GLYPH, type KitAction, kitActions } from '../bands.ts'

interface Props {
  title: string
  /** What is missing, in one or two lines. */
  children?: ReactNode
  /** The button(s) that fill the gap. */
  action?: KitAction | readonly KitAction[]
  /** Slot for the mascot (or any small visual); a neutral mark is drawn without it. */
  mascot?: ReactNode
  className?: string
}

/** The empty state: what is missing and the button that solves it. */
export function Empty({ title, children, action, mascot, className }: Props) {
  const actions = kitActions(action)
  return (
    <div className={className ? `empty ${className}` : 'empty'}>
      {mascot ?? (
        <span className="empty__mark" aria-hidden>
          {BAND_GLYPH.idle}
        </span>
      )}
      <p className="empty__title">{title}</p>
      {children != null && children !== false && <div className="empty__hint">{children}</div>}
      {actions.length > 0 && (
        <div className="empty__actions">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              className="btn btn--small"
              disabled={a.disabled}
              onClick={a.onClick}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
