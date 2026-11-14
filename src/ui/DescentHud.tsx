import { useEffect, useRef } from 'react'
import { DESCENT_DURATION_S, panelIllumination, sunAheadApproach } from '../astro/descent.ts'
import { useInstant } from '../hooks/useScenario.ts'
import { useT } from '../i18n/index.ts'
import { descentTelemetry } from '../scene/micro/descentTelemetry.ts'
import { DESCENT_SPEEDS, useDescentStore } from '../store/useDescentStore.ts'
import { selectActiveScenario, useMissionStore } from '../store/useMissionStore.ts'
import { IconEye, IconPause, IconPlay, IconRestart, IconSatellite } from './icons.tsx'
import { LevelTag } from './LevelTag.tsx'
import { type Level, slopeLevel } from './levels.ts'
import { cardinal, formatDeg, formatDistance, formatPct } from './format.ts'

const ICONS: Record<Level, string> = { good: '✓', warn: '!', bad: '✕' }
const POLL_MS = 100
const AZ_OPTIONS = [0, 45, 90, 135, 180, 225, 270, 315]
const PHASES = ['braking', 'approach', 'terminal', 'landed'] as const
/** Height that fills the altitude bar, m. */
const ALT_BAR_TOP_M = 3000

/**
 * Guidance overlay of the landing view. The per-frame readings come from `descentTelemetry`
 * and are written straight into DOM nodes at 10 Hz, so the descent never re-renders React.
 */
export function DescentHud() {
  const t = useT()
  const scenario = useMissionStore(selectActiveScenario)
  const { instant } = useInstant(scenario)
  const approachAz = useMissionStore((s) => s.approachAz)
  const landerCam = useMissionStore((s) => s.landerCam)
  const { setApproachAz, setLanderCam, setView } = useMissionStore.getState()
  const landed = useDescentStore((s) => s.landed)
  const playing = useDescentStore((s) => s.playing)
  const speed = useDescentStore((s) => s.speed)
  const progress = useDescentStore((s) => s.t)
  const { restart, setPlaying, setSpeed, seekTo } = useDescentStore.getState()

  const alt = useRef<HTMLElement>(null)
  const dist = useRef<HTMLElement>(null)
  const vs = useRef<HTMLElement>(null)
  const phase = useRef<HTMLElement>(null)
  const slope = useRef<HTMLElement>(null)
  const slopeIcon = useRef<HTMLElement>(null)
  const slopeText = useRef<HTMLElement>(null)
  const sun = useRef<HTMLParagraphElement>(null)
  const steps = useRef<HTMLOListElement>(null)
  const altBar = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const paint = () => {
      const tm = descentTelemetry
      if (alt.current) alt.current.textContent = formatDistance(tm.altAglM)
      if (dist.current) dist.current.textContent = formatDistance(tm.distM)
      if (vs.current)
        vs.current.textContent = Number.isFinite(tm.vSpeed) ? `${tm.vSpeed.toFixed(0)} m/s` : '—'
      if (phase.current) phase.current.textContent = t(`landing.phase.${tm.phase}`)
      if (steps.current) steps.current.dataset.phase = tm.phase
      if (altBar.current) {
        // Log scale: the last hundred metres matter as much as the first kilometres.
        const f = Number.isFinite(tm.altAglM)
          ? Math.log10(1 + Math.max(0, tm.altAglM)) / Math.log10(1 + ALT_BAR_TOP_M)
          : 0
        altBar.current.style.transform = `scaleX(${Math.min(1, f).toFixed(3)})`
      }
      const level = Number.isNaN(tm.reticleSlopeDeg) ? null : slopeLevel(tm.reticleSlopeDeg)
      if (slope.current) slope.current.dataset.level = level ?? 'none'
      if (slopeIcon.current) slopeIcon.current.textContent = level ? ICONS[level] : '–'
      if (slopeText.current)
        slopeText.current.textContent = level
          ? `${formatDeg(tm.reticleSlopeDeg, 1)} · ${t(`level.${level}`)}`
          : t('landing.noData')
      if (sun.current) {
        sun.current.dataset.alert = String(tm.sunInFov)
        sun.current.textContent = Number.isFinite(tm.sunOffAxisDeg)
          ? t(tm.sunInFov ? 'landing.sunInFov' : 'landing.sunClear', {
              deg: formatDeg(tm.sunOffAxisDeg, 0),
            })
          : ''
      }
    }
    paint()
    const id = window.setInterval(paint, POLL_MS)
    return () => window.clearInterval(id)
  }, [t])

  const sunAz = instant ? Math.round(instant.sky.sun.az) : 0
  const ahead = sunAheadApproach(sunAz)
  const approachValue =
    approachAz === null ? 'auto' : approachAz === ahead ? 'ahead' : String(approachAz)
  const azOptions =
    approachAz !== null && approachAz !== ahead && !AZ_OPTIONS.includes(approachAz)
      ? [...AZ_OPTIONS, approachAz].sort((a, b) => a - b)
      : AZ_OPTIONS
  const sunFrac = instant?.sunFrac ?? 0
  const panels = instant ? panelIllumination(instant.sky.sun.el, sunFrac) : null
  const orbit = landed && landerCam === 'orbit'

  const again = () => {
    setLanderCam('eye')
    restart()
  }

  return (
    <section className="dhud" aria-label={t('landing.aria')}>
      {!landed && (
        <>
          <ol ref={steps} className="dhud__steps" data-phase="braking" aria-hidden>
            {PHASES.map((p) => (
              <li key={p} data-step={p}>
                {t(`landing.phase.${p}`)}
              </li>
            ))}
          </ol>
          <dl className="dhud__telemetry">
            <div>
              <dt>{t('landing.alt')}</dt>
              <dd ref={alt}>—</dd>
              <span className="dhud__altbar" aria-hidden>
                <span ref={altBar} />
              </span>
            </div>
            <div>
              <dt>{t('landing.dist')}</dt>
              <dd ref={dist}>—</dd>
            </div>
            <div>
              <dt>{t('landing.vspeed')}</dt>
              <dd ref={vs}>—</dd>
            </div>
            <div>
              <dt className="sr-only">{t('landing.phase')}</dt>
              <dd ref={phase} className="dhud__phase" />
            </div>
          </dl>
          <p className="dhud__line">
            <span ref={slope} className="dhud__slope" data-level="none">
              {t('landing.reticle')}:{' '}
              <span ref={slopeIcon} className="lvl" aria-hidden>
                –
              </span>{' '}
              <span ref={slopeText} />
            </span>
          </p>
          <p ref={sun} className="dhud__line dhud__sun" data-alert="false" aria-live="polite" />
        </>
      )}
      <p className="dhud__line">
        <LevelTag level={sunFrac > 0 ? 'good' : 'bad'} />{' '}
        {sunFrac > 0
          ? t('landing.contactLit', { pct: formatPct(sunFrac * 100) })
          : t('landing.contactDark')}
      </p>
      {landed && panels && (
        <p className="dhud__line">
          {t('landing.panels', { top: formatPct(panels.topPct), side: formatPct(panels.sidePct) })}
        </p>
      )}

      <div className="viewhud__buttons">
        <button
          type="button"
          className="btn"
          onClick={() => (landed ? again() : setPlaying(!playing))}
        >
          {playing && !landed ? <IconPause /> : <IconPlay />}
          {playing && !landed ? t('landing.pause') : t('landing.play')}
        </button>
        <button type="button" className="btn" onClick={again}>
          <IconRestart /> {t('landing.restart')}
        </button>
        <label className="toggle">
          {t('landing.speed')}
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            {DESCENT_SPEEDS.map((s) => (
              <option key={s} value={s}>
                ×{s}
              </option>
            ))}
          </select>
        </label>
        <label className="toggle">
          {t('landing.approach')}
          <select
            value={approachValue}
            onChange={(e) => {
              const v = e.target.value
              setApproachAz(v === 'auto' ? null : v === 'ahead' ? ahead : Number(v))
            }}
          >
            <option value="auto">{t('landing.approachAuto')}</option>
            <option value="ahead">{t('landing.approachAhead')}</option>
            {azOptions.map((a) => (
              <option key={a} value={a}>
                {t('landing.approachFrom', { dir: `${cardinal(a)} ${Math.round(a)}°` })}
              </option>
            ))}
          </select>
        </label>
      </div>
      <input
        className="dhud__progress"
        type="range"
        min={0}
        max={DESCENT_DURATION_S}
        step={0.1}
        value={progress}
        aria-label={t('landing.progress')}
        onChange={(e) => {
          setLanderCam('eye')
          seekTo(Number(e.target.value))
        }}
      />
      {landed && (
        <div className="viewhud__buttons">
          <button
            type="button"
            className="btn"
            aria-pressed={landerCam === 'eye'}
            onClick={() => setLanderCam('eye')}
          >
            <IconEye /> {t('landing.eye')}
          </button>
          <button
            type="button"
            className="btn"
            aria-pressed={orbit}
            onClick={() => setLanderCam('orbit')}
          >
            <IconSatellite /> {t('landing.orbit')}
          </button>
          <button type="button" className="btn" onClick={() => setView('micro')}>
            {t('landing.toSurface')}
          </button>
        </div>
      )}
      <p className="hint">{orbit ? t('landing.orbitHint') : t('landing.hint')}</p>
    </section>
  )
}
