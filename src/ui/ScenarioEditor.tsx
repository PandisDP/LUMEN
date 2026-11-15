import { useState } from 'react'
import { type HardwareLimits, LIMIT_RANGES } from '../astro/hardware.ts'
import { ENERGY_PRESETS } from '../config/energyProfiles.ts'
import { type MsgKey, useT } from '../i18n/index.ts'
import { useSiteText } from '../i18n/sites.ts'
import {
  LINK_MARGIN,
  MISSION_DAYS,
  SCENARIO_COLORS,
  SCENARIO_LABELS,
  type Scenario,
  type ScenarioPatch,
  findSite,
  paramsOf,
  sanitizeParams,
  selectActiveScenario,
  useMissionStore,
} from '../store/useMissionStore.ts'
import { formatLatLon, fromInputValue, toInputValue } from './format.ts'
import { MoonLocator } from './MoonLocator.tsx'
import { CustomSiteForm, SiteList } from './SitePicker.tsx'
import { TopSites } from './TopSites.tsx'

const HW_FIELDS: [keyof HardwareLimits, MsgKey, number][] = [
  ['maxSlopeDeg', 'hw.field.slope', 1],
  ['maxNightH', 'hw.field.night', 6],
  ['minDtePct', 'hw.field.dte', 5],
  ['roverMaxSlopeDeg', 'hw.field.rover', 1],
]

type Draft = Omit<Scenario, 'id'>

const draftOf = (sc: Scenario): Draft => ({
  siteId: sc.siteId,
  startMs: sc.startMs,
  ...paramsOf(sc),
})

/**
 * Create or edit a scenario: 1) where (Top 3, every site or coordinates), 2) when and with what
 * (date, mission length, energy, lander limits, link margin, science weight).
 *
 * Editing applies every change at once, so the comparison behind updates live; creating keeps a
 * draft until "Create".
 */
export function ScenarioEditor({
  scenarioId,
  onClose,
}: {
  /** null = new scenario (starts as a copy of the active one). */
  scenarioId: string | null
  onClose: () => void
}) {
  const t = useT()
  const siteText = useSiteText()
  const sites = useMissionStore((s) => s.sites)
  const scenarios = useMissionStore((s) => s.scenarios)
  const active = useMissionStore(selectActiveScenario)
  const { addScenario, updateScenario, setSites } = useMissionStore.getState()
  const editing = scenarioId ? scenarios.find((s) => s.id === scenarioId) : undefined
  const [draft, setDraft] = useState<Draft>(() => draftOf(editing ?? active))
  const [showAll, setShowAll] = useState(false)

  const value: Draft = editing ? draftOf(editing) : draft
  const index = editing ? scenarios.indexOf(editing) : scenarios.length
  const color = SCENARIO_COLORS[index] ?? SCENARIO_COLORS[0]
  const site = findSite(sites, value.siteId)

  const change = (patch: ScenarioPatch) => {
    if (editing) updateScenario(editing.id, patch)
    else
      setDraft((d) => ({
        ...d,
        ...sanitizeParams(patch, d),
        siteId: patch.siteId ?? d.siteId,
        startMs:
          patch.startMs !== undefined && Number.isFinite(patch.startMs) ? patch.startMs : d.startMs,
      }))
  }

  const create = () => {
    addScenario(draft)
    onClose()
  }

  return (
    <div className="editor" role="dialog" aria-modal="true" aria-labelledby="editor-title">
      <div className="editor__backdrop" onClick={onClose} />
      <div className="editor__sheet" style={{ ['--c' as string]: color }}>
        <header className="editor__head">
          <span className="compare__badge" aria-hidden>
            {SCENARIO_LABELS[index] ?? '+'}
          </span>
          <div>
            <h2 id="editor-title">
              {editing
                ? t('editor.editTitle', { label: SCENARIO_LABELS[index] })
                : t('editor.newTitle')}
            </h2>
            <p className="hint">{editing ? t('editor.liveHint') : t('editor.newHint')}</p>
          </div>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {t('common.close')}
          </button>
        </header>

        <section className="editor__section">
          <h3>
            <span className="editor__num">1</span> {t('editor.where')}
          </h3>
          <div className="sites__where">
            <MoonLocator
              points={site ? [{ lat: site.lat, lon: site.lon, color }] : []}
              size={64}
              showCaption
            />
            <div>
              <p className="sites__current">{siteText(site)?.name ?? '…'}</p>
              {site && <p className="hint">{formatLatLon(site.lat, site.lon)}</p>}
            </div>
          </div>
          <TopSites
            variant="compact"
            selectOnPick={false}
            selectedId={value.siteId}
            onPick={(siteId) => change({ siteId })}
          />
          <button
            type="button"
            className="btn btn--ghost sites__more"
            aria-expanded={showAll}
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? t('top.less') : t('top.more', { n: sites.filter((s) => !s.custom).length })}
          </button>
          {showAll && (
            <div className="sites">
              <SiteList
                name="editor-site"
                value={value.siteId}
                onChange={(siteId) => change({ siteId })}
              />
              <CustomSiteForm
                onSite={(custom) => {
                  setSites([...sites.filter((x) => x.id !== custom.id), custom])
                  change({ siteId: custom.id })
                }}
              />
            </div>
          )}
        </section>

        <section className="editor__section">
          <h3>
            <span className="editor__num">2</span> {t('editor.how')}
          </h3>
          <div className="editor__grid">
            <label className="field">
              <span>{t('editor.date')}</span>
              <input
                type="datetime-local"
                value={toInputValue(value.startMs)}
                onChange={(e) => change({ startMs: fromInputValue(e.target.value) })}
              />
            </label>
            <label className="field">
              <span>
                {t('editor.days')} <strong>{value.missionDays}</strong>
              </span>
              <input
                type="range"
                min={MISSION_DAYS.min}
                max={MISSION_DAYS.max}
                value={value.missionDays}
                onChange={(e) => change({ missionDays: Number(e.target.value) })}
              />
            </label>
            <label className="field">
              <span>{t('energy.title')}</span>
              <select value={value.energyId} onChange={(e) => change({ energyId: e.target.value })}>
                {ENERGY_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {t(p.labelKey)}
                  </option>
                ))}
                {value.energyId === 'custom' && (
                  <option value="custom">{t('energy.preset.custom')}</option>
                )}
              </select>
            </label>
            <label className="field">
              <span>
                {t('link.label')} <strong>{value.linkMarginDeg}°</strong>
              </span>
              <input
                type="range"
                min={LINK_MARGIN.min}
                max={LINK_MARGIN.max}
                step={0.5}
                value={value.linkMarginDeg}
                onChange={(e) => change({ linkMarginDeg: Number(e.target.value) })}
              />
            </label>
            <label className="field field--check" title={t('link.dsnTitle')}>
              <input
                type="checkbox"
                checked={value.requireDsn}
                onChange={(e) => change({ requireDsn: e.target.checked })}
              />
              <span>{t('link.dsn')}</span>
            </label>
            <label className="field">
              <span>
                {t('editor.science')} <strong>{Math.round(value.scienceWeight * 100)} %</strong>
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={value.scienceWeight}
                onChange={(e) => change({ scienceWeight: Number(e.target.value) })}
              />
            </label>
          </div>
          <details className="editor__more">
            <summary>{t('editor.hardware')}</summary>
            <div className="editor__grid">
              {HW_FIELDS.map(([k, label, step]) => (
                <label key={k} className="field">
                  <span>{t(label)}</span>
                  <input
                    type="number"
                    min={LIMIT_RANGES[k].min}
                    max={LIMIT_RANGES[k].max}
                    step={step}
                    value={value.hardwareLimits[k]}
                    onChange={(e) =>
                      change({
                        hardwareLimits: { ...value.hardwareLimits, [k]: Number(e.target.value) },
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </details>
        </section>

        {!editing && (
          <footer className="editor__foot">
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              {t('editor.cancel')}
            </button>
            <button type="button" className="btn btn--accent" onClick={create}>
              {t('editor.create')}
            </button>
          </footer>
        )}
      </div>
    </div>
  )
}
