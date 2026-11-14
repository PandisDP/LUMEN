import { useEffect, useState } from 'react'
import type { BatteryResult } from '../astro/energy.ts'
import { combinedScore, scienceScore } from '../astro/iceAccess.ts'
import type { ScenarioMetrics } from '../astro/metrics.ts'
import type { SiteSeries } from '../astro/series.ts'
import { kelvinToC } from '../astro/thermal.ts'
import { energyPreset } from '../config/energyProfiles.ts'
import type { SiteDetail } from '../data/catalog.ts'
import { useBattery, useInstant, useThermal } from '../hooks/useScenario.ts'
import { useIceAccess } from '../hooks/useScience.ts'
import { type MsgKey, useT } from '../i18n/index.ts'
import { useSiteText } from '../i18n/sites.ts'
import {
  MAX_SCENARIOS,
  SCENARIO_COLORS,
  SCENARIO_LABELS,
  type Scenario,
  findSite,
  useMissionStore,
} from '../store/useMissionStore.ts'
import { ExportMenu } from './ExportMenu.tsx'
import {
  formatDateTime,
  formatDeg,
  formatDistance,
  formatDuration,
  formatHours,
  formatNight,
  formatPct,
} from './format.ts'
import { HorizonChart } from './HorizonChart.tsx'
import { LevelTag } from './LevelTag.tsx'
import {
  type Level,
  batteryLevel,
  dteLevel,
  energyLevel,
  nightLevel,
  scienceLevel,
  scoreLevel,
  thermalLevel,
} from './levels.ts'
import { MoonLocator } from './MoonLocator.tsx'
import { PresetBar } from './PresetBar.tsx'
import { ScenarioEditor } from './ScenarioEditor.tsx'
import { Timeline } from './Timeline.tsx'

type Row = [
  label: MsgKey,
  value: (m: ScenarioMetrics) => string,
  level?: (m: ScenarioMetrics) => Level,
]

/** Full detail, folded under "See detail" so the first read is three numbers. */
const ROWS: Row[] = [
  ['row.sunlit', (m) => formatPct(m.sunlitPct)],
  ['row.dte', (m) => formatPct(m.dtePct), (m) => dteLevel(m.dtePct)],
  ['row.both', (m) => formatPct(m.bothPct)],
  ['row.noDte', (m) => formatHours(m.longestNoDteH)],
  ['row.maxSunEl', (m) => formatDeg(m.maxSunEl, 1)],
]

/** What each column reports up so the view can rank the scenarios and show differences. */
export interface ColumnSummary {
  score: number
  energyPct: number
  longestDarkH: number
  dtePct: number
}

function Cell({ label, value, level }: { label: string; value: string; level?: Level }) {
  return (
    <div data-level={level}>
      <dt>{label}</dt>
      <dd>
        {value}
        {level && level !== 'good' && (
          <>
            {' '}
            <LevelTag level={level} />
          </>
        )}
      </dd>
    </div>
  )
}

/** "▲ +12" / "▼ −5" against scenario A; `better` says which direction is good. */
function Delta({
  value,
  base,
  better,
  unit = '',
}: {
  value: number
  base?: number
  better: 'up' | 'down'
  unit?: string
}) {
  if (base === undefined) return null
  const d = Math.round(value - base)
  if (d === 0) return <span className="delta">= A</span>
  const good = better === 'up' ? d > 0 : d < 0
  return (
    <span className="delta" data-good={good}>
      {d > 0 ? '▲' : '▼'} {d > 0 ? '+' : '−'}
      {Math.abs(d)}
      {unit}
    </span>
  )
}

function BatteryRow({ battery }: { battery?: BatteryResult }) {
  const t = useT()
  const value = battery
    ? battery.depletedAtMs != null
      ? t('row.batteryDead', { h: formatHours(battery.hoursAtZero) })
      : formatPct(battery.minSocPct)
    : '…'
  return (
    <Cell
      label={t('row.battery')}
      value={value}
      level={battery ? batteryLevel(battery) : undefined}
    />
  )
}

function ThermalRow({ series }: { series?: SiteSeries }) {
  const t = useT()
  const th = useThermal(series)
  return (
    <Cell
      label={t('row.minTemp')}
      value={th ? `${Math.round(kelvinToC(th.minK))} °C` : '…'}
      level={th ? thermalLevel(th.longestFreezeH, th.psr) : undefined}
    />
  )
}

/** Ice access and, when the scenario weighs science, the blended score. */
function ScienceRows({
  detail,
  engineering,
  scenario,
}: {
  detail?: SiteDetail
  engineering?: number
  scenario: Scenario
}) {
  const t = useT()
  const w = scenario.scienceWeight
  const ice = useIceAccess(detail, scenario.hardwareLimits.roverMaxSlopeDeg)
  if (!ice.available) return <Cell label={t('row.ice')} value={t('row.iceNoData')} />
  const sci = ice.data ? scienceScore(ice.data, ice.rover) : undefined
  const route = ice.data?.insidePsr
    ? t('ice.badge.inside')
    : ice.data?.routeM != null
      ? formatDistance(ice.data.routeM)
      : ice.data
        ? t('ice.badge.none')
        : '…'
  return (
    <>
      <Cell
        label={t('row.ice')}
        value={sci === undefined ? '…' : `${sci}/100 · ${route}`}
        level={sci === undefined ? undefined : scienceLevel(sci)}
      />
      {w > 0 && (
        <Cell
          label={t('row.combined', { pct: Math.round(w * 100) })}
          value={
            sci === undefined || engineering === undefined
              ? '…'
              : `${combinedScore(engineering, sci, w)}/100`
          }
        />
      )}
    </>
  )
}

function ScenarioColumn({
  scenario,
  index,
  base,
  best,
  onSummary,
  onEdit,
}: {
  scenario: Scenario
  index: number
  /** Scenario A's figures (undefined for A itself or while it computes). */
  base?: ColumnSummary
  best: boolean
  onSummary: (id: string, s: ColumnSummary | undefined) => void
  onEdit: (id: string) => void
}) {
  const t = useT()
  const siteText = useSiteText()
  const offsetH = useMissionStore((s) => s.offsetH)
  const activeId = useMissionStore((s) => s.activeId)
  const count = useMissionStore((s) => s.scenarios.length)
  const { setOffset, setActive, duplicateScenario, removeScenario } = useMissionStore.getState()
  const { info, detail, result, instant, loading } = useInstant(scenario)
  const battery = useBattery(result?.series, scenario.energy)
  const color = SCENARIO_COLORS[index]
  const m = result?.metrics
  const ended = offsetH > scenario.missionDays * 24

  useEffect(() => {
    onSummary(
      scenario.id,
      m
        ? {
            score: m.score,
            energyPct: m.energyPct,
            longestDarkH: m.longestDarkH,
            dtePct: m.dtePct,
          }
        : undefined,
    )
  }, [m, scenario.id, onSummary])
  useEffect(() => () => onSummary(scenario.id, undefined), [scenario.id, onSummary])

  const energyLabel = energyPreset(scenario.energyId)?.labelKey

  return (
    <article
      className="compare__col"
      style={{ ['--c' as string]: color }}
      aria-busy={loading}
      data-active={scenario.id === activeId}
    >
      <header>
        <button
          type="button"
          className="compare__badge"
          onClick={() => setActive(scenario.id)}
          title={t('compare.activate')}
        >
          {SCENARIO_LABELS[index]}
        </button>
        <div className="compare__title">
          <h3>
            {siteText(info)?.name ?? '…'}{' '}
            {best && <span className="chip chip--best">★ {t('compare.best')}</span>}
          </h3>
          <p className="hint">{t('compare.landing', { date: formatDateTime(scenario.startMs) })}</p>
          <p className="compare__params">
            <span className="tag">{t('compare.days', { n: scenario.missionDays })}</span>
            <span className="tag">{energyLabel ? t(energyLabel) : t('energy.preset.custom')}</span>
            {scenario.scienceWeight > 0 && (
              <span className="tag">❄ {Math.round(scenario.scienceWeight * 100)} %</span>
            )}
          </p>
        </div>
        {info && <MoonLocator points={[{ lat: info.lat, lon: info.lon, color }]} size={52} />}
      </header>

      <div className="compare__actions">
        <button type="button" className="btn btn--small" onClick={() => onEdit(scenario.id)}>
          ✎ {t('compare.edit')}
        </button>
        {count < MAX_SCENARIOS && (
          <button
            type="button"
            className="btn btn--small btn--ghost"
            onClick={() => duplicateScenario(scenario.id)}
          >
            ⧉ {t('compare.duplicate')}
          </button>
        )}
        {count > 1 && (
          <button
            type="button"
            className="btn btn--small btn--ghost"
            onClick={() => removeScenario(scenario.id)}
            aria-label={t('picker.remove', { label: SCENARIO_LABELS[index] })}
          >
            ✕
          </button>
        )}
      </div>

      <dl className="big3">
        <div data-level={m ? scoreLevel(m.score) : undefined}>
          <dt>{t('row.score')}</dt>
          <dd>
            {m ? m.score : '…'}
            <small>/100</small>
          </dd>
          {m && <Delta value={m.score} base={base?.score} better="up" />}
        </div>
        <div data-level={m ? energyLevel(m.energyPct) : undefined}>
          <dt>☀ {t('row.energy')}</dt>
          <dd>{m ? formatPct(m.energyPct) : '…'}</dd>
          {m && <Delta value={m.energyPct} base={base?.energyPct} better="up" unit=" %" />}
        </div>
        <div data-level={m ? nightLevel(m.longestDarkH) : undefined}>
          <dt>☾ {t('row.night')}</dt>
          <dd>{m ? formatNight(m.longestDarkH) : '…'}</dd>
          {m && <Delta value={m.longestDarkH} base={base?.longestDarkH} better="down" unit=" h" />}
        </div>
      </dl>

      {instant && !ended && (
        <p className="compare__now">
          <span data-on={instant.sunUp}>
            {instant.sunUp ? '☀ ✓' : '☀ ✕'} {instant.sunUp ? t('sun.title') : t('sun.shadowShort')}
          </span>
          {instant.sun.nextChangeMs != null && (
            <>
              {' '}
              {t('countdown.paren', {
                what: t(instant.sunUp ? 'ev.sunset' : 'ev.sunrise'),
                dur: formatDuration(instant.sun.nextChangeMs - instant.timeMs),
              })}
            </>
          )}
          <br />
          <span data-on={instant.earthUp}>
            {instant.earthUp ? '⊕ ✓' : '⊕ ✕'} {instant.earthUp ? t('earth.on') : t('earth.off')}
          </span>
        </p>
      )}
      {ended && <p className="hint">{t('compare.ended')}</p>}
      {result && detail && (
        <Timeline
          series={result.series}
          mask={detail.mask}
          offsetH={offsetH}
          onSeek={setOffset}
          compact
          label={SCENARIO_LABELS[index]}
          battery={battery}
        />
      )}

      <details className="compare__detail">
        <summary>{t('compare.detail')}</summary>
        {detail && (
          <HorizonChart
            mask={detail.mask}
            series={result?.series}
            instant={instant}
            linkMarginDeg={scenario.linkMarginDeg}
            compact
          />
        )}
        <dl className="stats">
          {ROWS.map(([label, value, level]) => (
            <Cell
              key={label}
              label={t(label)}
              value={m ? value(m) : '…'}
              level={m && level ? level(m) : undefined}
            />
          ))}
          <BatteryRow battery={battery} />
          <ThermalRow series={result?.series} />
          <ScienceRows detail={detail} engineering={m?.score} scenario={scenario} />
        </dl>
      </details>
    </article>
  )
}

/** "What to remember": three short lines about the best scenario. */
function Takeaways({ best, scenario }: { best: ColumnSummary; scenario: Scenario }) {
  const t = useT()
  const siteText = useSiteText()
  const sites = useMissionStore((s) => s.sites)
  const name = siteText(findSite(sites, scenario.siteId))?.name ?? '…'
  return (
    <aside className="takeaways" aria-label={t('takeaways.title')}>
      <p className="panel__label">{t('takeaways.title')}</p>
      <ul>
        <li>{t('takeaways.best', { name, score: best.score })}</li>
        <li>
          {t('takeaways.energy', {
            pct: Math.round(best.energyPct),
            dte: Math.round(best.dtePct),
          })}
        </li>
        <li>
          {best.longestDarkH > 48
            ? t('takeaways.nightLong', { h: formatHours(best.longestDarkH) })
            : best.longestDarkH > 0
              ? t('takeaways.nightShort', { h: formatHours(best.longestDarkH) })
              : t('takeaways.nightNone')}
        </li>
      </ul>
    </aside>
  )
}

/**
 * Step 4, "Decide": up to four scenarios side by side at the same mission time, each one fully
 * editable (site, date, mission, energy, lander), with the differences against A, the winner, and
 * the export as the last action.
 */
export function CompareView() {
  const t = useT()
  const open = useMissionStore((s) => s.compareOpen)
  const scenarios = useMissionStore((s) => s.scenarios)
  const sites = useMissionStore((s) => s.sites)
  const setCompareOpen = useMissionStore((s) => s.setCompareOpen)
  const [summaries, setSummaries] = useState<Record<string, ColumnSummary | undefined>>({})
  const [editor, setEditor] = useState<{ id: string | null } | null>(null)
  const [onSummary] = useState(
    () => (id: string, s: ColumnSummary | undefined) =>
      setSummaries((prev) => (prev[id] === s ? prev : { ...prev, [id]: s })),
  )
  if (!open) return null

  const base = summaries[scenarios[0]?.id]
  const ranked = scenarios
    .map((sc) => ({ sc, s: summaries[sc.id] }))
    .filter((x): x is { sc: Scenario; s: ColumnSummary } => x.s !== undefined)
    .sort((a, b) => b.s.score - a.s.score)
  const allReady = ranked.length === scenarios.length
  const winner = allReady && scenarios.length > 1 ? ranked[0] : undefined
  const points = scenarios.flatMap((sc, i) => {
    const site = findSite(sites, sc.siteId)
    return site
      ? [{ lat: site.lat, lon: site.lon, color: SCENARIO_COLORS[i], label: SCENARIO_LABELS[i] }]
      : []
  })

  return (
    <section className="overlay compare" aria-label={t('compare.aria')}>
      <header className="overlay__head">
        <div className="compare__intro">
          <MoonLocator points={points} size={64} showCaption />
          <div>
            <h2>{t('compare.title2')}</h2>
            <p className="hint">{t('compare.sub')}</p>
          </div>
        </div>
        <div>
          {scenarios.length < MAX_SCENARIOS && (
            <button
              type="button"
              className="btn btn--accent"
              onClick={() => setEditor({ id: null })}
            >
              {t('compare.new')}
            </button>
          )}
          <button type="button" className="btn" onClick={() => setCompareOpen(false)}>
            {t('common.close')}
          </button>
        </div>
      </header>
      <details className="compare__ideas">
        <summary>{t('compare.ideas')}</summary>
        <PresetBar />
      </details>
      {scenarios.length === 1 && <p className="hint compare__hint">{t('compare.hint2')}</p>}
      <div className="compare__grid">
        {scenarios.map((sc, i) => (
          <ScenarioColumn
            key={sc.id}
            scenario={sc}
            index={i}
            base={i === 0 ? undefined : base}
            best={winner?.sc.id === sc.id}
            onSummary={onSummary}
            onEdit={(id) => setEditor({ id })}
          />
        ))}
      </div>
      <footer className="compare__foot">
        {winner && <Takeaways best={winner.s} scenario={winner.sc} />}
        {!winner && ranked[0] && scenarios.length === 1 && (
          <Takeaways best={ranked[0].s} scenario={ranked[0].sc} />
        )}
        <div className="compare__export">
          <p className="hint">{t('export.finalHint')}</p>
          <ExportMenu final />
        </div>
      </footer>
      {editor && <ScenarioEditor scenarioId={editor.id} onClose={() => setEditor(null)} />}
    </section>
  )
}
