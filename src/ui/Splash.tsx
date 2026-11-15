import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n/index.ts'
import { Killa } from './Killa.tsx'

/** Minimum time the logo stays on screen, ms (shorter with reduced motion). */
export const SPLASH_MIN_MS = 1800
const SPLASH_MIN_REDUCED_MS = 500
/** Length of the fade-out, ms (keep in sync with `.splash--out` in index.css). */
export const SPLASH_FADE_MS = 600

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** The LUMEN mark: planet with an orbit ring, drawn larger and animated for the splash. */
function LogoMark() {
  return (
    <svg className="splash__mark" viewBox="0 0 64 64" aria-hidden>
      <defs>
        <radialGradient id="splash-planet" cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#7fd4ff" />
          <stop offset=".6" stopColor="#1f6fb2" />
          <stop offset="1" stopColor="#0a1f3d" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="#000814" />
      <circle cx="32" cy="32" r="22" fill="url(#splash-planet)" />
      <g className="splash__ring">
        <ellipse
          cx="32"
          cy="32"
          rx="29"
          ry="8"
          fill="none"
          stroke="#9be7ff"
          strokeWidth="2"
          opacity=".75"
          transform="rotate(-20 32 32)"
        />
      </g>
    </svg>
  )
}

/**
 * Start screen: the logo and Killa waiting, shown until the site catalogue is loaded and a minimum time has
 * passed; then it fades out and calls `onDone`. Click, Enter, Space or Escape skip it.
 */
export function Splash({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const t = useT()
  const [minElapsed, setMinElapsed] = useState(false)
  const [skipped, setSkipped] = useState(false)
  const leaving = skipped || (ready && minElapsed)
  const done = useRef(onDone)
  useEffect(() => {
    done.current = onDone
  }, [onDone])

  useEffect(() => {
    const id = setTimeout(
      () => setMinElapsed(true),
      reducedMotion() ? SPLASH_MIN_REDUCED_MS : SPLASH_MIN_MS,
    )
    return () => clearTimeout(id)
  }, [])

  useEffect(() => {
    if (!leaving) return
    const id = setTimeout(() => done.current(), reducedMotion() ? 0 : SPLASH_FADE_MS)
    return () => clearTimeout(id)
  }, [leaving])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') setSkipped(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div
      className={`splash${leaving ? ' splash--out' : ''}`}
      role="status"
      aria-live="polite"
      aria-label={t('splash.label')}
      onClick={() => setSkipped(true)}
      data-testid="splash"
    >
      <div className="splash__logo">
        <LogoMark />
        <span className="splash__word">
          LUMEN <span>3D</span>
        </span>
        <p className="splash__wait">
          <Killa state="thinking" size={48} />
          {t('splash.loading')}
        </p>
      </div>
    </div>
  )
}
