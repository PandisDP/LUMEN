import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '../i18n/index.ts'
import { useUiStore } from '../store/useUiStore.ts'
import { IconHelp } from './icons.tsx'
import { HELP_TOPICS, type HelpTopic, placePopover, stepIndex } from './tourSteps.ts'

/**
 * "?" button that opens a short explanation of one part of the interface. The popover lives in a
 * portal with fixed positioning, so panels with `overflow: hidden` can't clip it.
 */
export function HelpButton({
  topic,
  align = 'end',
}: {
  topic: HelpTopic
  align?: 'start' | 'end'
}) {
  const t = useT()
  const open = useUiStore((s) => s.help === topic)
  const { setHelp, startTour } = useUiStore.getState()
  const id = useId()
  const button = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const info = HELP_TOPICS[topic]

  const place = useCallback(() => {
    const b = button.current
    const p = pop.current
    if (!b || !p) return
    setPos(
      placePopover(
        b.getBoundingClientRect(),
        { width: p.offsetWidth, height: p.offsetHeight },
        window.innerWidth,
        window.innerHeight,
        align,
      ),
    )
  }, [align])

  // Runs before paint, so the popover never flashes at a stale or unmeasured spot.
  useLayoutEffect(() => {
    if (open) place()
  }, [open, place])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (!button.current?.contains(target) && !pop.current?.contains(target)) setHelp(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setHelp(null)
        button.current?.focus()
      }
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, setHelp, place])

  return (
    <span className="help">
      <button
        ref={button}
        type="button"
        className="icon-btn"
        aria-expanded={open}
        aria-controls={id}
        aria-label={t('help.open', { topic: t(info.title) })}
        title={t('help.open', { topic: t(info.title) })}
        onClick={() => setHelp(open ? null : topic)}
      >
        <IconHelp />
      </button>
      {open &&
        createPortal(
          <div
            ref={pop}
            id={id}
            role="dialog"
            aria-label={t(info.title)}
            className="help__pop"
            // Measured hidden first, then shown at its final place (no jump).
            style={
              pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: 'hidden' }
            }
          >
            <p className="help__title">{t(info.title)}</p>
            <p>{t(info.body)}</p>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => startTour(stepIndex(info.step))}
            >
              {t('help.tour')} →
            </button>
          </div>,
          document.body,
        )}
    </span>
  )
}
