import { type FormEvent, useState } from 'react'
import { type HardwareLimits, LIMIT_RANGES } from '../astro/hardware.ts'
import { PLAN_MAX_DAYS, PLAN_RADII_M } from '../astro/plannerTypes.ts'
import { ROVER_VEHICLES, type RoverId } from '../astro/traverse.ts'
import { type IceTargetOption, iceTargetsOf, tileForPoint } from '../config/iceTargets.ts'
import { cancelPlan } from '../hooks/usePlanner.ts'
import { type MsgKey, useLang, useT } from '../i18n/index.ts'
import { useSiteText } from '../i18n/sites.ts'
import { LINK_MARGIN, MISSION_DAYS, findSite, useMissionStore } from '../store/useMissionStore.ts'
import { usePlannerStore } from '../store/usePlannerStore.ts'
import { useRoverStore } from '../store/useRoverStore.ts'
import { formatDistance, formatLatLon } from './format.ts'
import { KINDS, effectiveFromMs, launchPlan, sameTarget, usePlanProblem } from './plannerInputs.ts'
import {
  PLAN_RANGE,
  clampDays,
  clampFrom,
  formatPlanDate,
  fromDateInput,
  problemChanged,
  rangeEndMs,
  toDateInput,
} from './plannerView.ts'

const ROVERS = Object.keys(ROVER_VEHICLES) as RoverId[]

const KIND_GROUP: Record<IceTargetOption['kind'], MsgKey> = {
  'near-site': 'plan.target.groupNear',
  'psr-floor': 'plan.target.groupPsr',
}
const KIND_LABEL: Record<IceTargetOption['kind'], MsgKey> = {
  'near-site': 'plan.target.near',
  'psr-floor': 'plan.target.psr',
}

const LIMIT_FIELDS: [keyof HardwareLimits, MsgKey, number][] = [
  ['maxSlopeDeg', 'hw.field.slope', 1],
  ['maxNightH', 'hw.field.night', 6],
  ['minDtePct', 'hw.field.dte', 5],
  ['roverMaxSlopeDeg', 'hw.field.rover', 1],
]

const num = (v: string) => (v.trim() === '' ? NaN : Number(v.replace(',', '.')))

/** Typed coordinates: applied on Enter or with the button, once they fall in a 20 m tile. */
function Coordinates({ disabled }: { disabled: boolean }) {
  const t = useT()
  const target = usePlannerStore((s) => s.target)
  const sites = useMissionStore((s) => s.sites)
  const [lat, setLat] = useState(target ? String(target.lat) : '')
  const [lon, setLon] = useState(target ? String(target.lon) : '')
  const [outside, setOutside] = useState(false)

  const apply = (e: FormEvent) => {
    e.preventDefault()
    const la = num(lat)
    const lo = num(lon)
    const p = usePlannerStore.getState()
    const tile =
      Number.isFinite(la) && Number.isFinite(lo) ? tileForPoint(sites, la, lo, p.radiusM) : null
    setOutside(!tile)
    if (tile) p.setTarget({ lat: la, lon: lo }, tile)
  }
  const edit = (set: (v: string) => void) => (v: string) => {
    set(v)
    setOutside(false)
  }

  return (
    <form className="pform__coords" onSubmit={apply} noValidate>
      <label className="field">
        <span>{t('plan.target.lat')}</span>
        <input
          type="number"
          inputMode="decimal"
          step="any"
          min={-90}
          max={0}
          value={lat}
          disabled={disabled}
          aria-invalid={outside}
          aria-describedby={outside ? 'pform-outside' : undefined}
          onChange={(e) => edit(setLat)(e.target.value)}
        />
      </label>
      <label className="field">
        <span>{t('plan.target.lon')}</span>
        <input
          type="number"
          inputMode="decimal"
          step="any"
          min={-180}
          max={360}
          value={lon}
          disabled={disabled}
          aria-invalid={outside}
          aria-describedby={outside ? 'pform-outside' : undefined}
          onChange={(e) => edit(setLon)(e.target.value)}
        />
      </label>
      <button
        type="submit"
        className="btn btn--small"
        disabled={disabled || !Number.isFinite(num(lat)) || !Number.isFinite(num(lon))}
      >
        {t('plan.target.use')}
      </button>
      {outside && (
        <p id="pform-outside" className="pform__msg error" role="alert">
          {t('plan.target.outside')}
        </p>
      )}
    </form>
  )
}

function Target({ disabled }: { disabled: boolean }) {
  const t = useT()
  const siteText = useSiteText()
  const sites = useMissionStore((s) => s.sites)
  const target = usePlannerStore((s) => s.target)
  const tileSiteId = usePlannerStore((s) => s.tileSiteId)
  const targets = iceTargetsOf(sites)
  const current = targets.find((x) => sameTarget(target, x))
  const name = (id: string) => siteText(findSite(sites, id))?.name ?? id

  return (
    <fieldset className="pform__group">
      <legend>{t('plan.target.legend')}</legend>
      <label className="field">
        <span>{t('plan.target.suggested')}</span>
        <select
          value={current?.id ?? (target ? 'custom' : '')}
          disabled={disabled}
          onChange={(e) => {
            const x = targets.find((y) => y.id === e.target.value)
            if (x) usePlannerStore.getState().setTarget({ lat: x.lat, lon: x.lon }, x.tileSiteId)
          }}
        >
          {!target && <option value="">{t('plan.target.choose')}</option>}
          {target && !current && <option value="custom">{t('plan.target.custom')}</option>}
          {KINDS.map((kind) => {
            const list = targets.filter((x) => x.kind === kind)
            return list.length ? (
              <optgroup key={kind} label={t(KIND_GROUP[kind])}>
                {list.map((x) => (
                  <option key={x.id} value={x.id}>
                    {t(KIND_LABEL[kind], { site: name(x.siteId) })}
                  </option>
                ))}
              </optgroup>
            ) : null
          })}
        </select>
      </label>
      <p className="pform__where" data-set={!!target}>
        <span aria-hidden>❄</span>{' '}
        {target ? (
          <>
            <strong>{formatLatLon(target.lat, target.lon)}</strong>
            {tileSiteId && (
              <span className="pform__tile">
                {' '}
                · {t('plan.target.tile', { site: name(tileSiteId) })}
              </span>
            )}
          </>
        ) : (
          t('plan.target.none')
        )}
      </p>
      <Coordinates key={target ? `${target.lat}:${target.lon}` : 'none'} disabled={disabled} />
      <p className="hint">{t('plan.target.mapHint')}</p>
    </fieldset>
  )
}

function Dates({ disabled }: { disabled: boolean }) {
  const t = useT()
  const lang = useLang()
  const storedFrom = usePlannerStore((s) => s.fromMs)
  const days = usePlannerStore((s) => s.days)
  const setRange = usePlannerStore((s) => s.setRange)
  const fromMs = effectiveFromMs(storedFrom, days)

  return (
    <fieldset className="pform__group">
      <legend>{t('plan.dates.legend')}</legend>
      <div className="pform__row">
        <label className="field">
          <span>{t('plan.dates.from')}</span>
          <input
            type="date"
            value={toDateInput(fromMs)}
            min={toDateInput(PLAN_RANGE.minMs)}
            max={toDateInput(PLAN_RANGE.maxMs)}
            disabled={disabled}
            onChange={(e) => {
              const ms = fromDateInput(e.target.value)
              if (ms !== null) setRange(clampFrom(ms, days), days)
            }}
          />
        </label>
        <label className="field field--narrow">
          <span>{t('plan.dates.days')}</span>
          <input
            type="number"
            min={1}
            max={PLAN_MAX_DAYS}
            step={1}
            value={days}
            disabled={disabled}
            onChange={(e) => {
              const d = clampDays(Number(e.target.value))
              setRange(clampFrom(fromMs, d), d)
            }}
          />
        </label>
      </div>
      <p className="hint">
        {t('plan.dates.until', {
          date: formatPlanDate(rangeEndMs(fromMs, days), lang),
          max: PLAN_MAX_DAYS,
        })}
      </p>
    </fieldset>
  )
}

function Mission({ disabled }: { disabled: boolean }) {
  const t = useT()
  const missionDays = useMissionStore((s) => s.missionDays)
  const roverId = useRoverStore((s) => s.roverId)
  const minSunDays = usePlannerStore((s) => s.minSunDays)
  const minRoverSocPct = usePlannerStore((s) => s.minRoverSocPct)
  const radiusM = usePlannerStore((s) => s.radiusM)
  const p = usePlannerStore.getState()
  const clamp = (v: string, min: number, max: number, fallback: number) => {
    const n = Number(v)
    return Number.isFinite(n) && v !== '' ? Math.min(max, Math.max(min, n)) : fallback
  }

  return (
    <fieldset className="pform__group">
      <legend>{t('plan.mission.legend')}</legend>
      <div className="pform__row">
        <label className="field">
          <span>{t('plan.mission.days')}</span>
          <input
            type="number"
            min={MISSION_DAYS.min}
            max={MISSION_DAYS.max}
            step={1}
            value={missionDays}
            disabled={disabled}
            onChange={(e) => useMissionStore.getState().setMissionDays(Number(e.target.value))}
          />
        </label>
        <label className="field">
          <span>{t('plan.mission.minSun')}</span>
          <input
            type="number"
            min={0}
            max={MISSION_DAYS.max}
            step={1}
            value={minSunDays}
            disabled={disabled}
            onChange={(e) => p.setMinSunDays(clamp(e.target.value, 0, MISSION_DAYS.max, 0))}
          />
        </label>
      </div>
      <label className="field">
        <span>{t('rover.vehicle')}</span>
        <select
          value={roverId}
          disabled={disabled}
          onChange={(e) => useRoverStore.getState().setRover(e.target.value as RoverId)}
        >
          {ROVERS.map((id) => (
            <option key={id} value={id}>
              {t(`rover.vehicle.${id}`)}
            </option>
          ))}
        </select>
      </label>
      <div className="pform__row">
        <label className="field">
          <span>{t('plan.mission.minSoc')}</span>
          <input
            type="number"
            min={0}
            max={90}
            step={5}
            value={minRoverSocPct}
            disabled={disabled}
            onChange={(e) => p.setMinRoverSoc(clamp(e.target.value, 0, 90, 0))}
          />
        </label>
        <label className="field">
          <span>{t('plan.mission.radius')}</span>
          <select
            value={radiusM}
            disabled={disabled}
            onChange={(e) => p.setRadius(Number(e.target.value))}
          >
            {PLAN_RADII_M.map((r) => (
              <option key={r} value={r}>
                {formatDistance(r)}
              </option>
            ))}
          </select>
        </label>
      </div>
    </fieldset>
  )
}

/** The lander limits shared with the rest of the app: one summary line, editable on demand. */
function Limits({ disabled }: { disabled: boolean }) {
  const t = useT()
  const limits = useMissionStore((s) => s.hardwareLimits)
  const linkMarginDeg = useMissionStore((s) => s.linkMarginDeg)
  const requireDsn = useMissionStore((s) => s.requireDsn)
  const scienceWeight = useMissionStore((s) => s.scienceWeight)
  const [open, setOpen] = useState(false)
  const m = useMissionStore.getState()

  return (
    <fieldset className="pform__group">
      <legend>{t('plan.limits.legend')}</legend>
      <ul className="pform__limits">
        {[
          ...t('plan.limits.summary', {
            slope: limits.maxSlopeDeg,
            night: limits.maxNightH,
            dte: limits.minDtePct,
            rover: limits.roverMaxSlopeDeg,
          }).split(' · '),
          ...t('plan.limits.summary2', {
            link: linkMarginDeg,
            dsn: t(requireDsn ? 'plan.limits.dsnOn' : 'plan.limits.dsnOff'),
            sci: Math.round(scienceWeight * 100),
          }).split(' · '),
        ].map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      <button
        type="button"
        className="btn btn--small"
        aria-expanded={open}
        aria-controls="pform-limits"
        onClick={() => setOpen(!open)}
      >
        {t(open ? 'plan.limits.hide' : 'plan.limits.change')}
      </button>
      {open && (
        <div id="pform-limits" className="pform__limits-edit">
          <div className="pform__row">
            {LIMIT_FIELDS.map(([k, label, step]) => (
              <label key={k} className="field">
                <span>{t(label)}</span>
                <input
                  type="number"
                  min={LIMIT_RANGES[k].min}
                  max={LIMIT_RANGES[k].max}
                  step={step}
                  value={limits[k]}
                  disabled={disabled}
                  onChange={(e) => m.setHardwareLimits({ [k]: e.target.value })}
                />
              </label>
            ))}
            <label className="field">
              <span>{t('link.label')}</span>
              <input
                type="number"
                min={LINK_MARGIN.min}
                max={LINK_MARGIN.max}
                step={0.5}
                value={linkMarginDeg}
                disabled={disabled}
                onChange={(e) => m.setLinkMargin(Number(e.target.value))}
              />
            </label>
            <label className="field">
              <span>{t('plan.limits.science')}</span>
              <input
                type="number"
                min={0}
                max={100}
                step={10}
                value={Math.round(scienceWeight * 100)}
                disabled={disabled}
                onChange={(e) => m.setScienceWeight(Number(e.target.value) / 100)}
              />
            </label>
          </div>
          <label className="field field--check">
            <input
              type="checkbox"
              checked={requireDsn}
              disabled={disabled}
              onChange={(e) => m.setRequireDsn(e.target.checked)}
            />
            {t('link.dsn')}
          </label>
        </div>
      )}
    </fieldset>
  )
}

/** Run / progress / re-run, with the reason when the plan cannot be launched yet. */
function Run() {
  const t = useT()
  const problem = usePlanProblem()
  const status = usePlannerStore((s) => s.status)
  const progress = usePlannerStore((s) => s.progress)
  const result = usePlannerStore((s) => s.result)
  const hasTarget = usePlannerStore((s) => !!s.target)
  const running = status === 'running'
  const stale = !!result && !running && (!problem || problemChanged(result.problem, problem))
  const total = result?.problem.days ?? problem?.days ?? 0
  const reason = problem ? null : t(hasTarget ? 'plan.run.needTile' : 'plan.run.needTarget')

  return (
    <div className="pform__run">
      {running ? (
        <div className="pform__progress">
          <progress max={1} value={progress} aria-label={t('plan.run.progressAria')} />
          <div className="pform__progress-row">
            <span role="status" aria-live="polite">
              {result
                ? t('plan.run.progress', { n: result.days.length, total })
                : t('plan.run.preparing')}
            </span>
            <button type="button" className="btn btn--small" onClick={cancelPlan}>
              {t('plan.run.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <>
          <button
            type="button"
            className="btn btn--accent pform__go"
            disabled={!problem}
            aria-describedby={reason ? 'pform-reason' : undefined}
            onClick={launchPlan}
          >
            {t(result ? 'plan.run.again' : 'plan.run.go')}
          </button>
          {reason && (
            <p id="pform-reason" className="hint pform__reason">
              {reason}
            </p>
          )}
          {stale && (
            <p className="pform__stale" role="status">
              <span className="pbadge pbadge--stale">{t('plan.stale.badge')}</span>{' '}
              {t('plan.stale.text')}
            </p>
          )}
        </>
      )}
    </div>
  )
}

/** Zone 1: what the mission is. Inputs top to bottom, then the button that launches the plan. */
export function PlannerForm() {
  const running = usePlannerStore((s) => s.status === 'running')
  return (
    <div className="pform">
      <Target disabled={running} />
      <Dates disabled={running} />
      <Mission disabled={running} />
      <Limits disabled={running} />
      <Run />
    </div>
  )
}
