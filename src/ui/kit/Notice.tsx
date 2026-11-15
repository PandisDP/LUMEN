import type { ReactNode } from 'react'
import { type KitAction, NOTICE_GLYPH, type NoticeTone, kitActions } from '../bands.ts'

interface Props {
  tone: NoticeTone
  title?: string
  /** Renders the title as a heading of this level (default: bold text). */
  headingLevel?: 2 | 3 | 4 | 5
  children?: ReactNode
  /** The button(s) that fix what the notice reports. */
  action?: KitAction | readonly KitAction[]
  /** Default: 'alert' for error and warning, 'status' for note and success. */
  role?: 'alert' | 'status'
  className?: string
}

/**
 * A message about the state of things: glyph + tint + text, never colour alone. A notice that
 * points at a problem brings the button that fixes it.
 */
export function Notice({ tone, title, headingLevel, children, action, role, className }: Props) {
  const actions = kitActions(action)
  const as = role ?? (tone === 'error' || tone === 'warning' ? 'alert' : 'status')
  const Title = headingLevel ? (`h${headingLevel}` as const) : 'strong'
  return (
    <div
      className={className ? `notice ${className}` : 'notice'}
      data-tone={tone}
      role={as}
      aria-live={as === 'status' ? 'polite' : undefined}
    >
      <span className="notice__glyph" aria-hidden>
        {NOTICE_GLYPH[tone]}
      </span>
      {title && <Title className="notice__title">{title}</Title>}
      {children != null && children !== false && <div className="notice__body">{children}</div>}
      {actions.length > 0 && (
        <div className="notice__actions">
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
