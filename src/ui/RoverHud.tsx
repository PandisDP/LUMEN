import { type CSSProperties, useEffect, useMemo, useRef } from 'react'
import {
  ROVER_VEHICLES,
  type RoverId,
  SAMPLING_LIMITS,
  traverseDurationMs,
} from '../astro/traverse.ts'
import { kelvinToC } from '../astro/thermal.ts'
import { useRoverTraverse } from '../hooks/useRover.ts'
import { type MsgKey, useT } from '../i18n/index.ts'
import { roverTelemetry } from '../scene/micro/roverTelemetry.ts'
import { useMissionStore } from '../store/useMissionStore.ts'
import { usePlannerStore } from '../store/usePlannerStore.ts'
import { ROVER_SPEEDS, type RoverCam, useRoverStore } from '../store/useRoverStore.ts'
import { useShow } from './audience.ts'
import type { KitAction } from './bands.ts'
import { formatDateTime, formatDeg, formatDistance, formatHours, formatPct } from './format.ts'
import { IconPause, IconPlay, IconRestart } from './icons.tsx'
import { Notice } from './kit/Notice.tsx'
import { LevelTag } from './LevelTag.tsx'
import {
  type RoverFix,
  type RoverOutcome,
  type RoverStateKey,
  legRemaining,
  outcomeLevel,
  profileCursorM,
  roverFixes,
  roverOutcome,
  roverStateKey,
  sampleDots,
  stateBand,
  stateGlyph,
  tripMarks,
} from './roverView.ts'

const POLL_MS = 100
const CAMS: RoverCam[] = ['follow', 'mast', 'top']
const ROVERS = Object.keys(ROVER_VEHICLES) as RoverId[]
const SEEK_STEP_MS = 60_000
const PROFILE_W = 320
const PROFILE_H = 40
const range = ({ min, max, step }: { min: number; max: number; step: number }) =>
  Array.from({ length: Math.round((max - min) / step) + 1 }, (_, i) => min + i * step)
const SAMPLE_COUNTS = range(SAMPLING_LIMITS.samples)
const SAMPLE_HOURS = range(SAMPLING_LIMITS.sampleH)

const STATE_KEY: Record<RoverStateKey, MsgKey> = {
  out: 'rover.state.out',
  wait: 'rover.state.wait',
  sample: 'rover.state.sample',
  back: 'rover.state.back',
  done: 'rover.state.home',
  'fail-battery': 'rover.state.failBattery',
  'fail-samples': 'rover.state.failSamples',
  'fail-late': 'rover.state.failLate',
}
const FAIL_KEY: Record<Exclude<RoverOutcome, 'ok'>, MsgKey> = {
  'low-battery': 'rover.fail.lowBattery',
  'no-route': 'rover.fail.noRoute',
  'battery-out': 'rover.fail.batteryOut',
  samples: 'rover.fail.samples',
  'no-return': 'rover.fail.noReturn',
  late: 'rover.fail.late',
}
const FIX_KEY: Record<RoverFix, MsgKey> = {
  fewerSamples: 'rover.fix.fewerSamples',
  shorterSamples: 'rover.fix.shorterSamples',
  utilityRover: 'rover.fix.utilityRover',
}

/**
 * Overlay of the rover's round trip to the ice. As in DescentHud, the per-frame readings come
 * from a telemetry singleton and are written straight into DOM nodes at 10 Hz.
 */
export function RoverHud() {
  const t = useT()
  const detailed = useShow('roverTelemetry')
  const { data, loading, error } = useRoverTraverse()
  const playing = useRoverStore((s) => s.playing)
  const speed = useRoverStore((s) => s.speed)
  const cam = useRoverStore((s) => s.cam)
  const roverId = useRoverStore((s) => s.roverId)
  const samples = useRoverStore((s) => s.samples)
  const sampleH = useRoverStore((s) => s.sampleH)
  const progress = useRoverStore((s) => s.tMs)
  const minSocPct = usePlannerStore((s) => s.minRoverSocPct)
  const { restart, setPlaying, setSpeed, seekTo, setCam, setRover, setSamples, setSampleH } =
    useRoverStore.getState()
  const { setLanderCam, setView } = useMissionStore.getState()

  const dist = useRef<HTMLElement>(null)
  const leftLabel = useRef<HTMLElement>(null)
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
  const count = useRef<HTMLSpanElement>(null)
  const cursor = useRef<SVGGElement>(null)
  const arrow = useRef<SVGPathElement>(null)

  const sum = data?.summary
  useEffect(() => {
    const set = (el: Element | null, text: string) => {
      if (el && el.textContent !== text) el.textContent = text
    }
    const paint = () => {
      const tm = roverTelemetry
      if (!tm.active) return
      set(dist.current, formatDistance(tm.distM))
      // What is left of the leg under way: to the ice, then to the lander.
      const rest = legRemaining(tm.distM, tm.outLengthM, tm.leg)
      set(leftLabel.current, t(rest.to === 'ice' ? 'rover.left.ice' : 'rover.left.lander'))
      set(left.current, formatDistance(rest.m))
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
        set(sun.current, `☀ ${t(tm.inPsr ? 'rover.psr' : lit ? 'rover.sunOn' : 'rover.sunOff')}`)
      }
      if (earth.current) {
        const up = tm.earthFrac >= 0.5
        earth.current.dataset.on = String(up)
        set(earth.current, `⊕ ${t(up ? 'rover.linkOn' : 'rover.linkOff')}`)
      }
      set(clock.current, Number.isFinite(tm.timeMs) ? formatDateTime(tm.timeMs) : '')
      if (state.current && sum) {
        // Glyph + text + band: the state never travels in colour alone.
        const key = roverStateKey(tm.phase, tm.done, sum)
        const text = t(STATE_KEY[key], { n: tm.sampleIndex, total: sum.samples })
        set(state.current, `${stateGlyph(key)} ${text}`.trim())
        state.current.dataset.state = key
        state.current.dataset.band = stateBand(key) ?? ''
      }
      if (sum && sum.samples > 0)
        set(
          count.current,
          `${sampleDots(tm.samplesDone, sum.samples)} ${t('rover.samplesCount', { done: tm.samplesDone, total: sum.samples })}`,
        )
      if (cursor.current && tm.outLengthM > 0) {
        const x = (profileCursorM(tm.distM, tm.outLengthM) / tm.outLengthM) * PROFILE_W
        cursor.current.setAttribute('transform', `translate(${x.toFixed(1)} 0)`)
        // The arrowhead points the way the rover is driving.
        arrow.current?.setAttribute('transform', tm.leg === 'back' ? 'scale(-1 1)' : '')
      }
    }
    paint()
    const id = window.setInterval(paint, POLL_MS)
    return () => window.clearInterval(id)
  }, [t, sum])

  // Elevation profile of the way out (the way back is the same ground), with the stretch inside
  // permanent shadow and the turn-around point marked.
  const profile = useMemo(() => {
    const plan = data?.plan
    if (!plan || plan.turnIndex < 1) return null
    const pts = plan.points.slice(0, plan.turnIndex + 1)
    const len = plan.outLengthM || 1
    let lo = Infinity
    let hi = -Infinity
    for (const p of pts) {
      lo = Math.min(lo, p.heightM)
      hi = Math.max(hi, p.heightM)
    }
    const span = Math.max(1, hi - lo)
    const x = (d: number) => (d / len) * PROFILE_W
    const y = (h: number) => PROFILE_H - 5 - ((h - lo) / span) * (PROFILE_H - 16)
    return {
      line: pts.map((p) => `${x(p.distM).toFixed(1)},${y(p.heightM).toFixed(1)}`).join(' '),
      psrX: plan.psrEntryM === null ? null : x(plan.psrEntryM),
      startY: y(pts[0].heightM),
      iceY: y(pts[pts.length - 1].heightM),
      drop: hi - lo,
    }
  }, [data])

  const duration = data ? traverseDurationMs(data) : 0
  const marks = useMemo(() => {
    if (!data || duration <= 0) return []
    const { arrivalMs, leaveMs } = tripMarks(data)
    return [
      { key: 'rover.mark.arrival' as const, at: arrivalMs },
      { key: 'rover.mark.leave' as const, at: leaveMs },
    ].flatMap((m) => (m.at === null ? [] : [{ key: m.key, at: m.at / duration }]))
  }, [data, duration])

  const outcome = sum ? roverOutcome(sum, minSocPct) : null
  const fixes: KitAction[] = outcome
    ? roverFixes(outcome, { roverId, samples, sampleH }).map((fix) => ({
        label: t(FIX_KEY[fix]),
        onClick: () => {
          if (fix === 'fewerSamples') setSamples(samples - SAMPLING_LIMITS.samples.step)
          else if (fix === 'shorterSamples') setSampleH(sampleH - SAMPLING_LIMITS.sampleH.step)
          else setRover('csa-rover')
        },
      }))
    : []
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
              <dt ref={leftLabel}>{t('rover.left.ice')}</dt>
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
            <span ref={state} className="rhud__state" />
            <span ref={count} className="rhud__samples" />
            <span ref={sun} data-on="false" />
            <span ref={earth} data-on="false" />
            <span ref={clock} className="rhud__clock" />
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
                  {/* The lander (start and end of the trip) and the ice, where it turns around. */}
                  <rect x="0" y={profile.startY - 3} width="5" height="5" className="rhud__mark" />
                  <circle cx={PROFILE_W - 3} cy={profile.iceY} r="3" className="rhud__mark" />
                  <text x={PROFILE_W - 9} y="9" textAnchor="end" className="rhud__marktext">
                    ❄ {t('rover.turn')}
                  </text>
                  <g ref={cursor}>
                    <line x1="0" x2="0" y1="0" y2={PROFILE_H} className="rhud__cursor" />
                    <path ref={arrow} d="M1 1 L7 4.5 L1 8 Z" className="rhud__arrow" />
                  </g>
                </svg>
                <figcaption className="hint">
                  {t('rover.profileCaption', {
                    d: formatDistance(data.plan.outLengthM),
                    drop: formatDistance(profile.drop),
                    slope: formatDeg(data.plan.maxSlopeDeg, 1),
                  })}
                </figcaption>
              </figure>
            )}
            {sum && outcome === 'ok' && (
              <p
                className="dhud__line rhud__summary"
                role="status"
                title={t('rover.summaryDetail', {
                  shadow: formatHours(sum.hoursInShadow),
                  dte: formatPct(sum.dtePct),
                })}
              >
                <LevelTag level="good" />{' '}
                {[
                  t(sum.samples === 1 ? 'rover.sum.sample' : 'rover.sum.samples', {
                    n: sum.samples,
                  }),
                  t('rover.sum.back', { h: formatHours(sum.totalH) }),
                  sum.marginH === null
                    ? null
                    : t('rover.sum.margin', { h: formatHours(sum.marginH) }),
                  t('rover.sum.minSoc', { soc: formatPct(sum.minSocPct) }),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
            {sum && outcome && outcome !== 'ok' && (
              <Notice
                tone={outcomeLevel(outcome) === 'warn' ? 'warning' : 'error'}
                className="rhud__notice"
                role="status"
                action={fixes}
              >
                {t(FAIL_KEY[outcome], {
                  done: sum.samplesDone,
                  total: sum.samples,
                  soc: formatPct(sum.minSocPct),
                  min: formatPct(minSocPct),
                  late: formatHours(-(sum.marginH ?? 0)),
                })}
              </Notice>
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
          <label className="toggle" title={t('rover.samples.title')}>
            {t('rover.samples')}
            <select value={samples} onChange={(e) => setSamples(Number(e.target.value))}>
              {SAMPLE_COUNTS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="toggle" title={t('rover.sampleH.title')}>
            {t('rover.sampleH')}
            <select value={sampleH} onChange={(e) => setSampleH(Number(e.target.value))}>
              {SAMPLE_HOURS.map((h) => (
                <option key={h} value={h}>
                  {formatHours(h)}
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
        <div className="rhud__slider">
          <input
            className="dhud__progress"
            type="range"
            min={0}
            max={duration}
            step={SEEK_STEP_MS}
            value={Math.min(progress, duration)}
            aria-label={t('rover.progress')}
            // The last step of the slider is the end of the trip, whatever its length.
            onChange={(e) => {
              const v = Number(e.target.value)
              seekTo(v > duration - SEEK_STEP_MS ? duration : v)
            }}
            disabled={!data}
          />
          {marks.map((m) => (
            <span
              key={m.key}
              className="rhud__tick"
              style={{ '--at': m.at } as CSSProperties}
              title={t(m.key)}
              aria-hidden
            />
          ))}
        </div>
      </div>
    </section>
  )
}
