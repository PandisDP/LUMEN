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

/** The Killa Landing mark: a full Moon with craters (same drawing as public/favicon.svg), larger for the splash. */
function LogoMark() {
  return (
    <svg className="splash__mark" viewBox="0 0 64 64" aria-hidden>
      <defs>
        <radialGradient id="splash-moon-b" cx="36%" cy="30%" r="78%">
          <stop offset="0" stopColor="#f6f5f1" />
          <stop offset=".55" stopColor="#cfcec9" />
          <stop offset="1" stopColor="#8a8985" />
        </radialGradient>
        <radialGradient id="splash-moon-t" cx="34%" cy="28%" r="80%">
          <stop offset=".62" stopColor="#0b0b14" stopOpacity="0" />
          <stop offset="1" stopColor="#0b0b14" stopOpacity=".62" />
        </radialGradient>
        <clipPath id="splash-moon-c">
          <circle cx="32" cy="32" r="28" />
        </clipPath>
      </defs>
      <circle cx="32" cy="32" r="28" fill="url(#splash-moon-b)" />
      <g clipPath="url(#splash-moon-c)">
        <path
          d="M14 22c4-7 13-9 19-6 5 3 4 9-1 12-6 4-14 5-18 1-2-2-2-5 0-7Z"
          fill="#7f7e7b"
          opacity=".42"
        />
        <path
          d="M30 34c5-3 13-2 16 3 3 5 0 11-6 13-7 2-14-1-15-7-1-4 2-7 5-9Z"
          fill="#7f7e7b"
          opacity=".42"
        />
        <path
          d="M40 14c3-1 7 1 9 4 1 3-1 6-4 6-4 0-7-3-7-6 0-2 1-3 2-4Z"
          fill="#7f7e7b"
          opacity=".42"
        />
        <circle cx="22" cy="22" r="5.2" fill="#8b8a86" />
        <circle cx="22.83" cy="22.83" r="4.16" fill="#b4b3ae" />
        <circle
          cx="22"
          cy="22"
          r="5.2"
          fill="none"
          stroke="#f3f2ee"
          strokeWidth="0.52"
          opacity=".55"
        />
        <circle cx="40" cy="18" r="3.2" fill="#8b8a86" />
        <circle cx="40.51" cy="18.51" r="2.56" fill="#b4b3ae" />
        <circle
          cx="40"
          cy="18"
          r="3.2"
          fill="none"
          stroke="#f3f2ee"
          strokeWidth="0.35"
          opacity=".55"
        />
        <circle cx="45" cy="34" r="6.0" fill="#8b8a86" />
        <circle cx="45.96" cy="34.96" r="4.80" fill="#b4b3ae" />
        <circle
          cx="45"
          cy="34"
          r="6.0"
          fill="none"
          stroke="#f3f2ee"
          strokeWidth="0.60"
          opacity=".55"
        />
        <circle cx="27" cy="40" r="4.0" fill="#8b8a86" />
        <circle cx="27.64" cy="40.64" r="3.20" fill="#b4b3ae" />
        <circle
          cx="27"
          cy="40"
          r="4.0"
          fill="none"
          stroke="#f3f2ee"
          strokeWidth="0.40"
          opacity=".55"
        />
        <circle cx="36" cy="49" r="3.0" fill="#8b8a86" />
        <circle cx="36.48" cy="49.48" r="2.40" fill="#b4b3ae" />
        <circle
          cx="36"
          cy="49"
          r="3.0"
          fill="none"
          stroke="#f3f2ee"
          strokeWidth="0.35"
          opacity=".55"
        />
        <circle cx="16" cy="35" r="2.4" fill="#8b8a86" />
        <circle cx="16.38" cy="35.38" r="1.92" fill="#b4b3ae" />
        <circle
          cx="16"
          cy="35"
          r="2.4"
          fill="none"
          stroke="#f3f2ee"
          strokeWidth="0.35"
          opacity=".55"
        />
        <circle cx="34" cy="29" r="2.2" fill="#8b8a86" />
        <circle cx="34.35" cy="29.35" r="1.76" fill="#b4b3ae" />
        <circle
          cx="34"
          cy="29"
          r="2.2"
          fill="none"
          stroke="#f3f2ee"
          strokeWidth="0.35"
          opacity=".55"
        />
        <circle cx="50" cy="24" r="1.8" fill="#8b8a86" />
        <circle cx="50.29" cy="24.29" r="1.44" fill="#b4b3ae" />
        <circle
          cx="50"
          cy="24"
          r="1.8"
          fill="none"
          stroke="#f3f2ee"
          strokeWidth="0.35"
          opacity=".55"
        />
        <circle cx="21" cy="48" r="1.9" fill="#8b8a86" />
        <circle cx="21.30" cy="48.30" r="1.52" fill="#b4b3ae" />
        <circle
          cx="21"
          cy="48"
          r="1.9"
          fill="none"
          stroke="#f3f2ee"
          strokeWidth="0.35"
          opacity=".55"
        />
        <circle cx="42" cy="44" r="1.6" fill="#8b8a86" />
        <circle cx="42.26" cy="44.26" r="1.28" fill="#b4b3ae" />
        <circle
          cx="42"
          cy="44"
          r="1.6"
          fill="none"
          stroke="#f3f2ee"
          strokeWidth="0.35"
          opacity=".55"
        />
        <circle cx="32" cy="32" r="28" fill="url(#splash-moon-t)" />
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
          KILLA <span>LANDING</span>
        </span>
        <p className="splash__wait">
          <Killa state="thinking" size={48} />
          {t('splash.loading')}
        </p>
      </div>
    </div>
  )
}
