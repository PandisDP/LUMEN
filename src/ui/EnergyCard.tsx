import type { BatteryResult, EnergyProfile, PanelKind } from '../astro/energy.ts'
import { ENERGY_PRESETS, PANEL_KINDS } from '../config/energyProfiles.ts'
import { useT } from '../i18n/index.ts'
import { useMissionStore } from '../store/useMissionStore.ts'
import { formatDateTime, formatDuration, formatHours, formatPct } from './format.ts'
import { LevelTag } from './LevelTag.tsx'
import { batteryLevel } from './levels.ts'

type NumField = Exclude<keyof EnergyProfile, 'panel'>
const FIELDS: [
  NumField,
  (
    | 'energy.field.az'
    | 'energy.field.peak'
    | 'energy.field.battery'
    | 'energy.field.active'
    | 'energy.field.hibernate'
    | 'energy.field.threshold'
    | 'energy.field.initial'
  ),
  number,
][] = [
  ['peakW', 'energy.field.peak', 10],
  ['batteryWh', 'energy.field.battery', 50],
  ['activeW', 'energy.field.active', 5],
  ['hibernateW', 'energy.field.hibernate', 1],
  ['hibernateBelowPct', 'energy.field.threshold', 5],
  ['initialSocPct', 'energy.field.initial', 5],
  ['panelAzDeg', 'energy.field.az', 15],
]

function ProfileEditor() {
  const t = useT()
  const energy = useMissionStore((s) => s.energy)
  const updateEnergy = useMissionStore((s) => s.updateEnergy)
  return (
    <details className="energy__edit">
      <summary>{t('energy.edit')}</summary>
      <div className="energy__grid">
        <label className="field">
          <span>{t('energy.field.panel')}</span>
          <select
            value={energy.panel}
            onChange={(e) => updateEnergy({ panel: e.target.value as PanelKind })}
          >
            {PANEL_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`energy.panel.${k}`)}
              </option>
            ))}
          </select>
        </label>
        {FIELDS.filter(([k]) => k !== 'panelAzDeg' || energy.panel.startsWith('vertical')).map(
          ([k, key, step]) => (
            <label key={k} className="field">
              <span>{t(key)}</span>
              <input
                type="number"
                min={0}
                max={k.endsWith('Pct') ? 100 : k === 'panelAzDeg' ? 359 : undefined}
                step={step}
                value={energy[k]}
                onChange={(e) => updateEnergy({ [k]: Number(e.target.value) })}
              />
            </label>
          ),
        )}
      </div>
      <p className="hint">{t('energy.modelNote')}</p>
    </details>
  )
}

/** Power profile selector + "does it survive until sunrise?" verdict. */
export function EnergyCard({
  battery,
  startMs,
  stepMs,
  timeMs,
}: {
  battery?: BatteryResult
  startMs: number
  stepMs: number
  timeMs: number
}) {
  const t = useT()
  const energyId = useMissionStore((s) => s.energyId)
  const setEnergyPreset = useMissionStore((s) => s.setEnergyPreset)
  const level = battery ? batteryLevel(battery) : undefined
  const nowSoc = battery
    ? battery.socPct[
        Math.min(battery.socPct.length - 1, Math.max(0, Math.round((timeMs - startMs) / stepMs)))
      ]
    : undefined
  return (
    <div className="card energy" data-level={level}>
      <div className="card__head">
        <span className="card__icon" aria-hidden>
          🔋
        </span>
        <span className="card__title">{t('energy.title')}</span>
        {battery && (
          <span className="badge">
            <LevelTag level={level} />{' '}
            {battery.depletedAtMs != null ? t('energy.badge.dead') : t('energy.badge.ok')}
          </span>
        )}
      </div>
      <label className="field">
        <span className="sr-only">{t('energy.profile')}</span>
        <select value={energyId} onChange={(e) => setEnergyPreset(e.target.value)}>
          {ENERGY_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {t(p.labelKey)}
            </option>
          ))}
          {energyId === 'custom' && <option value="custom">{t('energy.preset.custom')}</option>}
        </select>
      </label>
      {battery && (
        <>
          {battery.depletedAtMs != null ? (
            <p className="card__sub alert" role="status">
              ⚠{' '}
              {t('energy.depleted', {
                when: formatDateTime(battery.depletedAtMs),
                after: formatDuration(battery.depletedAtMs - startMs),
                dead: formatHours(battery.hoursAtZero),
              })}
            </p>
          ) : (
            <p className="card__sub">
              {t('energy.survives', { min: formatPct(battery.minSocPct) })}
            </p>
          )}
          <p className="card__sub">
            {t('energy.stats', {
              min: formatPct(battery.minSocPct),
              now: formatPct(nowSoc ?? NaN),
              active: formatPct(battery.activePct),
              wh: Math.round(battery.energyInWh),
            })}
          </p>
        </>
      )}
      <ProfileEditor />
    </div>
  )
}
