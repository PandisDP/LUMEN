import { useEffect, useMemo, useRef } from 'react'
import { ROVER_VEHICLES, type RoverId, traverseDurationMs } from '../astro/traverse.ts'
import { kelvinToC } from '../astro/thermal.ts'
import { useRoverTraverse } from '../hooks/useRover.ts'
import { type MsgKey, useT } from '../i18n/index.ts'
import { roverTelemetry } from '../scene/micro/roverTelemetry.ts'
import { useMissionStore } from '../store/useMissionStore.ts'
import { ROVER_SPEEDS, type RoverCam, useRoverStore } from '../store/useRoverStore.ts'
import { useShow } from './audience.ts'
import { formatDateTime, formatDeg, formatDistance, formatHours, formatPct } from './format.ts'
import { IconPause, IconPlay, IconRestart } from './icons.tsx'
import { LevelTag } from './LevelTag.tsx'

const POLL_MS = 100
const CAMS: RoverCam[] = ['follow', 'mast', 'top']
const ROVERS = Object.keys(ROVER_VEHICLES) as RoverId[]
const PROFILE_W = 320
const PROFILE_H = 54

/**
 * Overlay of the rover traverse to the ice. As in DescentHud, the per-frame readings come from
 * a telemetry singleton and are written straight into DOM nodes at 10 Hz.
 */
export function RoverHud() {
  const t = useT()
  const detailed = useShow('roverTelemetry')
  const { data, loading, error } = useRoverTraverse()
  const playing = useRoverStore((s) => s.playing)
  const speed = useRoverStore((s) => s.speed)
  const cam = useRoverStore((s) => s.cam)
  const roverId = useRoverStore((s) => s.roverId)
  const progress = useRoverStore((s) => s.tMs)
  const { restart, setPlaying, setSpeed, seekTo, setCam, setRover } = useRoverStore.getState()
  const { setLanderCam, setView } = useMissionStore.getState()

  const dist = useRef<HTMLElement>(null)
  const left = useRef<HTMLElement>(null)
  const slope = useRef<HTMLElement>(null)
  const speedEl = useRef<HTMLElement>(null)
  const soc = useRef<HTMLElement>(null)
  const socBar = useRef<HTMLSpanElement>(null)
  const power = useRef<HTMLElement>(null)
  const temp = useRef<HTMLElement>(null)
  const sun = useRef<HTMLSpanElement>(null)
  const earth = useRef<HTMLSpanElement>(null)
  const clock = useRef<HTMLSpanElement>(null)
  const state = useRef<HTMLSpanElement>(null)
  const cursor = useRef<SVGLineElement>(null)

  useEffect(() => {
    const set = (el: HTMLElement | null, text: string) => {
      if (el) el.textContent = text
    }
    const paint = () => {
      const tm = roverTelemetry
      if (!tm.active) return
      set(dist.current, formatDistance(tm.distM))
      set(left.current, formatDistance(Math.max(0, tm.lengthM - tm.distM)))
      set(slope.current, Number.isFinite(tm.slopeDeg) ? formatDeg(tm.slopeDeg, 1) : '—')
      set(speedEl.current, `${(tm.speedMs * 100).toFixed(0)} cm/s`)
      set(soc.current, Number.isFinite(tm.socPct) ? formatPct(tm.socPct) : '—')
      if (socBar.current) {
        socBar.current.style.transform = `scaleX(${Math.max(0, Math.min(1, tm.socPct / 100)).toFixed(3)})`
        socBar.current.dataset.low = String(tm.socPct < 25)
      }
      set(
        power.current,
        Number.isFinite(tm.solarW) ? `+${tm.solarW.toFixed(0)} / −${tm.loadW.toFixed(0)} W` : '—',
      )
      set(temp.current, Number.isFinite(tm.tempK) ? `${kelvinToC(tm.tempK).toFixed(0)} °C` : '—')
      if (sun.current) {
        const lit = tm.sunFrac >= 0.5
        sun.current.dataset.on = String(lit)
        sun.current.textContent = `☀ ${t(tm.inPsr ? 'rover.psr' : lit ? 'rover.sunOn' : 'rover.sunOff')}`
      }
      if (earth.current) {
        const up = tm.earthFrac >= 0.5
        earth.current.dataset.on = String(up)
        earth.current.textContent = `⊕ ${t(up ? 'rover.linkOn' : 'rover.linkOff')}`
      }
      set(clock.current, Number.isFinite(tm.timeMs) ? formatDateTime(tm.timeMs) : '')
      set(
        state.current,
        t(
          tm.done ? 'rover.state.done' : tm.driving ? 'rover.state.driving' : 'rover.state.stopped',
        ),
      )
      if (cursor.current && tm.lengthM > 0) {
        const x = ((tm.distM / tm.lengthM) * PROFILE_W).toFixed(1)
        cursor.current.setAttribute('x1', x)
        cursor.current.setAttribute('x2', x)
      }
    }
    paint()
    const id = window.setInterval(paint, POLL_MS)
    return () => window.clearInterval(id)
  }, [t])

  // Elevation profile of the route, with the stretch inside permanent shadow marked.
  const profile = useMemo(() => {
    const pts = data?.plan.points
    if (!pts || pts.length < 2) return null
    const len = data.plan.lengthM || 1
    let lo = Infinity
    let hi = -Infinity
    for (const p of pts) {
      lo = Math.min(lo, p.heightM)
      hi = Math.max(hi, p.heightM)
    }
    const span = Math.max(1, hi - lo)
    const xy = (d: number, h: number) =>
      `${((d / len) * PROFILE_W).toFixed(1)},${(PROFILE_H - 4 - ((h - lo) / span) * (PROFILE_H - 8)).toFixed(1)}`
    const psrX = data.plan.psrEntryM === null ? null : (data.plan.psrEntryM / len) * PROFILE_W
    return { line: pts.map((p) => xy(p.distM, p.heightM)).join(' '), psrX, drop: hi - lo }
  }, [data])

  const sum = data?.summary
  const duration = data ? traverseDurationMs(data) : 0
  const back = () => setLanderCam('eye')

  return (
    <section className="dhud rhud" aria-label={t('rover.aria')}>
      {loading && !data && <p className="dhud__line">{t('rover.loading')}</p>}
      {error && <p className="dhud__line dhud__warn">{error.message}</p>}
      {data && (
        <>
          <dl className="dhud__telemetry rhud__telemetry">
            <div>
              <dt>{t('rover.dist')}</dt>
              <dd ref={dist}>—</dd>
            </div>
            <div>
              <dt>{t('rover.left')}</dt>
              <dd ref={left}>—</dd>
            </div>
            <div>
              <dt>{t('rover.slope')}</dt>
              <dd ref={slope}>—</dd>
            </div>
            <div>
              <dt>{t('rover.speed')}</dt>
              <dd ref={speedEl}>—</dd>
            </div>
            <div>
              <dt>{t('rover.battery')}</dt>
              <dd ref={soc}>—</dd>
              <span className="dhud__altbar dhud__propbar" aria-hidden>
                <span ref={socBar} />
              </span>
            </div>
            {detailed && (
              <div>
                <dt>{t('rover.power')}</dt>
                <dd ref={power} className="rhud__small">
                  —
                </dd>
              </div>
            )}
            {detailed && (
              <div>
                <dt>{t('rover.temp')}</dt>
                <dd ref={temp}>—</dd>
              </div>
            )}
          </dl>
          <p className="dhud__line rhud__chips">
            <span ref={sun} data-on="false" />
            <span ref={earth} data-on="false" />
            <span ref={state} />
            <span ref={clock} />
          </p>
        </>
      )}
      <div className="rhud__dock">
        {data && (
          <>
            {profile && (
              <figure className="rhud__profile">
                <svg
                  viewBox={`0 0 ${PROFILE_W} ${PROFILE_H}`}
                  role="img"
                  aria-label={t('rover.profile')}
                >
                  {profile.psrX !== null && (
                    <rect
                      x={profile.psrX}
                      y="0"
                      width={PROFILE_W - profile.psrX}
                      height={PROFILE_H}
                      className="rhud__psr"
                    />
                  )}
                  <polyline points={profile.line} className="rhud__terrain" />
                  <line ref={cursor} x1="0" x2="0" y1="0" y2={PROFILE_H} className="rhud__cursor" />
                </svg>
                <figcaption className="hint">
                  {t('rover.profileCaption', {
                    d: formatDistance(data.plan.lengthM),
                    drop: formatDistance(profile.drop),
                    slope: formatDeg(data.plan.maxSlopeDeg, 1),
                  })}
                </figcaption>
              </figure>
            )}
            {sum && (
              <p className="dhud__line" role="status">
                <LevelTag level={!sum.reaches ? 'bad' : sum.minSocPct < 25 ? 'warn' : 'good'} />{' '}
                {sum.reaches
                  ? t('rover.summary', {
                      h: formatHours(sum.driveH + sum.waitH),
                      soc: formatPct(sum.minSocPct),
                      shadow: formatHours(sum.hoursInShadow),
                      dte: formatPct(sum.dtePct),
                    })
                  : t('rover.fails', { soc: formatPct(sum.minSocPct) })}
              </p>
            )}
          </>
        )}
        <div className="viewhud__buttons" title={t('rover.hint')}>
          <button
            type="button"
            className="btn"
            onClick={() => setPlaying(!playing)}
            disabled={!data}
          >
            {playing ? <IconPause /> : <IconPlay />}
            {playing ? t('landing.pause') : t('landing.play')}
          </button>
          <button type="button" className="btn" onClick={restart} disabled={!data}>
            <IconRestart /> {t('landing.restart')}
          </button>
          <label className="toggle">
            {t('landing.speed')}
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
              {ROVER_SPEEDS.map((s) => (
                <option key={s} value={s}>
                  {s >= 3600 ? `${s / 3600} h/s` : `${s / 60} min/s`}
                </option>
              ))}
            </select>
          </label>
          <label className="toggle">
            {t('rover.vehicle')}
            <select value={roverId} onChange={(e) => setRover(e.target.value as RoverId)}>
              {ROVERS.map((id) => (
                <option key={id} value={id}>
                  {t(`rover.vehicle.${id}` as MsgKey)}
                </option>
              ))}
            </select>
          </label>
          <label className="toggle">
            {t('rover.cam')}
            <select value={cam} onChange={(e) => setCam(e.target.value as RoverCam)}>
              {CAMS.map((c) => (
                <option key={c} value={c}>
                  {t(`rover.cam.${c}` as MsgKey)}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn" onClick={back}>
            {t('rover.backToLander')}
          </button>
          <button type="button" className="btn" onClick={() => setView('micro')}>
            {t('landing.toSurface')}
          </button>
        </div>
        <input
          className="dhud__progress"
          type="range"
          min={0}
          max={duration}
          step={60_000}
          value={Math.min(progress, duration)}
          aria-label={t('rover.progress')}
          onChange={(e) => seekTo(Number(e.target.value))}
          disabled={!data}
        />
      </div>
    </section>
  )
}
