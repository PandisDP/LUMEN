import { useEffect, useRef } from 'react'
import { useT } from '../i18n/index.ts'
import { useMissionStore } from '../store/useMissionStore.ts'
import { useUiStore } from '../store/useUiStore.ts'
import { TOUR_STEPS, placeBubble, tourText } from './tourSteps.ts'

const PAD = 8

/** Step-by-step walkthrough: dims the page, spotlights one element and explains it. */
/** Full user guide (docs/GUIA.md), opened from the last step of the tour. */
const GUIDE_URL = 'https://github.com/ErickLozFer/LUMEN_3D/blob/main/docs/GUIA.md'

export function Tour() {
  const t = useT()
  const step = useUiStore((s) => s.tourStep)
  const { setTourStep, endTour, setPanel } = useUiStore.getState()
  const spot = useRef<HTMLDivElement>(null)
  const bubble = useRef<HTMLDivElement>(null)
  const next = useRef<HTMLButtonElement>(null)

  const current = step === null ? null : TOUR_STEPS[step]
  const total = TOUR_STEPS.length
  const last = step === total - 1

  // Prepare the page for the step: open its panel, switch view, close overlays.
  useEffect(() => {
    if (!current) return
    const mission = useMissionStore.getState()
    if (mission.compareOpen) mission.setCompareOpen(false)
    if (mission.explainOpen) mission.setExplainOpen(false)
    if (mission.panelsHidden && current.panel) mission.togglePanels()
    if (current.view && mission.view !== current.view) mission.setView(current.view)
    if (current.panel) setPanel(current.panel, true)
    next.current?.focus()
  }, [current, setPanel])

  // Track the target every frame (panels animate open, the window resizes, labels move).
  useEffect(() => {
    if (!current) return
    let raf = 0
    let prev = ''
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const el = current.target
        ? document.querySelector<HTMLElement>(`[data-tour="${current.target}"]`)
        : null
      const r = el?.getBoundingClientRect()
      const box =
        r && r.width > 0 ? { top: r.top, left: r.left, width: r.width, height: r.height } : null
      const b = bubble.current
      const size = { width: b?.offsetWidth ?? 340, height: b?.offsetHeight ?? 200 }
      const key = `${box?.top},${box?.left},${box?.width},${box?.height},${size.width},${size.height},${innerWidth},${innerHeight}`
      if (key === prev) return
      prev = key
      const s = spot.current
      if (s) {
        if (box) {
          s.style.opacity = '1'
          s.style.transform = `translate(${box.left - PAD}px, ${box.top - PAD}px)`
          s.style.width = `${box.width + 2 * PAD}px`
          s.style.height = `${box.height + 2 * PAD}px`
        } else {
          // No target: shrink the hole to nothing in the middle of the screen.
          s.style.transform = `translate(${innerWidth / 2}px, ${innerHeight / 2}px)`
          s.style.width = s.style.height = '0px'
        }
      }
      if (b) {
        const pos = placeBubble(box, size, innerWidth, innerHeight)
        b.style.transform = `translate(${Math.round(pos.left)}px, ${Math.round(pos.top)}px)`
      }
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [current])

  useEffect(() => {
    if (step === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') endTour()
      else if (e.key === 'ArrowRight') {
        if (step < total - 1) setTourStep(step + 1)
        else endTour()
      } else if (e.key === 'ArrowLeft' && step > 0) setTourStep(step - 1)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, total, setTourStep, endTour])

  if (!current || step === null) return null

  // Keep Tab inside the bubble while the tour is open.
  const trap = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !bubble.current) return
    const items = bubble.current.querySelectorAll<HTMLElement>('button, a[href]')
    const first = items[0]
    const lastItem = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      lastItem.focus()
    } else if (!e.shiftKey && document.activeElement === lastItem) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="tour" aria-live="polite">
      <div className="tour__spot" ref={spot} aria-hidden />
      <div
        ref={bubble}
        className="tour__bubble"
        role="dialog"
        aria-modal="true"
        aria-label={t('tour.aria')}
        aria-describedby="tour-body"
        onKeyDown={trap}
      >
        <div className="tour__progress" aria-hidden>
          {TOUR_STEPS.map((s, i) => (
            <span key={s.id} data-done={i <= step} />
          ))}
        </div>
        <p className="tour__count">{t('tour.step', { n: step + 1, total })}</p>
        <h2 className="tour__title">{t(tourText(current.id, 'title'))}</h2>
        <p className="tour__body" id="tour-body">
          {t(tourText(current.id, 'body'))}
        </p>
        {current.id === 'done' && (
          <p className="tour__link">
            <a href={GUIDE_URL} target="_blank" rel="noreferrer">
              {t('tour.fullGuide')} ↗
            </a>
          </p>
        )}
        <div className="tour__actions">
          {!last && (
            <button type="button" className="btn btn--ghost" onClick={endTour}>
              {t('tour.skip')}
            </button>
          )}
          <span className="tour__spacer" />
          {step > 0 && (
            <button type="button" className="btn" onClick={() => setTourStep(step - 1)}>
              {t('tour.prev')}
            </button>
          )}
          <button
            ref={next}
            type="button"
            className="btn btn--primary"
            onClick={() => (last ? endTour() : setTourStep(step + 1))}
          >
            {last ? t('tour.finish') : t('tour.next')}
          </button>
        </div>
      </div>
    </div>
  )
}

/** First-visit invitation to take the tour. */
export function TourInvite() {
  const t = useT()
  const seen = useUiStore((s) => s.tourSeen)
  const running = useUiStore((s) => s.tourStep !== null)
  const { startTour, dismissTourInvite } = useUiStore.getState()
  if (seen || running) return null
  return (
    <div className="toast" role="status">
      <span className="toast__icon" aria-hidden>
        ✦
      </span>
      <p>{t('tour.invite')}</p>
      <button type="button" className="btn btn--primary btn--small" onClick={() => startTour(0)}>
        {t('tour.start')}
      </button>
      <button type="button" className="btn btn--ghost btn--small" onClick={dismissTourInvite}>
        {t('tour.later')}
      </button>
    </div>
  )
}
