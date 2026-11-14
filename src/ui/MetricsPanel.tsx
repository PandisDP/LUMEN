import { fsplDb, primaryStation, relativeFsplDb } from '../astro/dsn.ts'
import type { InstantState } from '../astro/instant.ts'
import type { ScenarioMetrics } from '../astro/metrics.ts'
import type { SiteDetail } from '../data/catalog.ts'
import { useBattery, useInstant, useThermal } from '../hooks/useScenario.ts'
import { type MsgKey, useT } from '../i18n/index.ts'
import { useSiteText, useSourceText } from '../i18n/sites.ts'
import { selectActiveScenario, useMissionStore } from '../store/useMissionStore.ts'
import { CollapsiblePanel } from './CollapsiblePanel.tsx'
import { EnergyCard } from './EnergyCard.tsx'
import { cardinal, formatDeg, formatDuration, formatHours, formatPct } from './format.ts'
import { DispersionCard, TerrainCard } from './LandingPanel.tsx'
import { IconGauge } from './icons.tsx'
import { ThermalCard } from './ThermalCard.tsx'
import { IceCard, ScienceWeight } from './IceCard.tsx'
import { scienceScore } from '../astro/iceAccess.ts'
import { useIceAccess } from '../hooks/useScience.ts'
import { LevelTag } from './LevelTag.tsx'
import { type Level, dteLevel, energyLevel, nightLevel } from './levels.ts'

type T = ReturnType<typeof useT>

/** Distance to the terrain that defines the horizon in a direction (curated sites only). */
function obstruction(t: T, detail: SiteDetail | undefined, az: number): string | null {
  const km = detail?.obstructionKm
  if (!km?.length) return null
  const step = 360 / km.length
  const d = km[Math.round(az / step) % km.length]
  return d > 0 ? t('metrics.obstruction', { km: d < 10 ? d.toFixed(1) : Math.round(d) }) : null
}

function Countdown({
  on,
  nextMs,
  now,
  onKey,
  offKey,
}: {
  on: boolean
  nextMs: number | null
  now: number
  onKey: MsgKey
  offKey: MsgKey
}) {
  const t = useT()
  const what = t(on ? onKey : offKey)
  if (nextMs == null) return <span className="countdown">{t('countdown.none', { what })}</span>
  return (
    <span className="countdown">
      {t('countdown.in', { what })} <strong>{formatDuration(nextMs - now)}</strong>
    </span>
  )
}

function SunCard({ i, detail }: { i: InstantState; detail?: SiteDetail }) {
  const t = useT()
  const margin = i.sky.sun.el - i.sunHorizonDeg
  const ridge = obstruction(t, detail, i.sky.sun.az)
  const level: Level = i.sunUp ? 'good' : 'bad'
  return (
    <div className="card" data-level={level}>
      <div className="card__head">
        <span className="card__icon" aria-hidden>
          ☀
        </span>
        <span className="card__title">{t('sun.title')}</span>
        <span className="badge">
          <LevelTag level={level} /> {i.sunUp ? t('sun.lit') : t('sun.shadow')}
        </span>
      </div>
      <p className="card__big">{formatDeg(i.sky.sun.el)}</p>
      <p className="card__sub">
        {t('card.elevAz', { az: i.sky.sun.az.toFixed(1), card: cardinal(i.sky.sun.az) })}
      </p>
      <div
        className="meter"
        role="meter"
        aria-valuenow={Math.round(i.sunFrac * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('sun.meterAria')}
      >
        <div className="meter__fill" style={{ width: `${i.sunFrac * 100}%` }} />
      </div>
      <p className="card__sub">
        {t('sun.disc', {
          pct: formatPct(i.sunFrac * 100),
          hz: formatDeg(i.sunHorizonDeg),
          m: `${margin >= 0 ? '+' : ''}${margin.toFixed(2)}°`,
        })}
        {ridge && <> · {ridge}</>}
      </p>
      <Countdown
        on={i.sunUp}
        nextMs={i.sun.nextChangeMs}
        now={i.timeMs}
        onKey="ev.sunset"
        offKey="ev.sunrise"
      />
    </div>
  )
}

function EarthCard({ i, detail }: { i: InstantState; detail?: SiteDetail }) {
  const t = useT()
  const ridge = obstruction(t, detail, i.sky.earth.az)
  const linkMarginDeg = useMissionStore((s) => s.linkMarginDeg)
  const level: Level = i.earthUp ? 'good' : 'bad'
  return (
    <div className="card" data-level={level}>
      <div className="card__head">
        <span className="card__icon card__icon--earth" aria-hidden>
          ⊕
        </span>
        <span className="card__title">{t('earth.title')}</span>
        <span className="badge">
          <LevelTag level={level} /> {i.earthUp ? t('earth.on') : t('earth.off')}
        </span>
      </div>
      <p className="card__big">{formatDeg(i.sky.earth.el)}</p>
      <p className="card__sub">
        {t('card.elevAz', { az: i.sky.earth.az.toFixed(1), card: cardinal(i.sky.earth.az) })} ·{' '}
        {t('earth.phase', { pct: formatPct(i.sky.earthPhase * 100) })}
      </p>
      <p className="card__sub">
        {t('earth.horizon', { hz: formatDeg(i.earthHorizonDeg) })}
        {linkMarginDeg > 0 && (
          <> ({t('link.required', { deg: formatDeg(i.earthHorizonDeg + linkMarginDeg) })})</>
        )}{' '}
        · {t('earth.disc', { pct: formatPct(i.earthFrac * 100) })}
        {ridge && <> · {ridge}</>}
      </p>
      <Countdown
        on={i.earthUp}
        nextMs={i.earth.nextChangeMs}
        now={i.timeMs}
        onKey="ev.earthset"
        offKey="ev.earthrise"
      />
      <DsnRow i={i} />
    </div>
  )
}

/** Earth-Moon range, path loss and which DSN complex would receive the signal now. */
function DsnRow({ i }: { i: InstantState }) {
  const t = useT()
  const primary = primaryStation(i.dsn)
  const rel = relativeFsplDb(i.earthDistKm)
  return (
    <div className="dsn">
      <p className="card__sub">
        {t('dsn.range', {
          km: Math.round(i.earthDistKm).toLocaleString(),
          db: fsplDb(i.earthDistKm).toFixed(1),
          rel: `${rel >= 0 ? '+' : ''}${rel.toFixed(2)}`,
        })}
      </p>
      <ul className="dsn__list" aria-label={t('dsn.aria')}>
        {i.dsn.map((s) => (
          <li
            key={s.id}
            className="chip"
            data-level={s.visible ? 'good' : 'bad'}
            data-primary={primary?.id === s.id || undefined}
          >
            <span aria-hidden>{s.visible ? '✓' : '✕'}</span> {t(`dsn.${s.id}`)} {formatDeg(s.el, 0)}
            {primary?.id === s.id && <> · {t('dsn.receiving')}</>}
          </li>
        ))}
      </ul>
      {i.earthUp && !primary && <p className="card__sub warn">{t('dsn.none')}</p>}
    </div>
  )
}

function Stat({ label, value, level }: { label: string; value: string; level?: Level }) {
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

export function WindowSummary({ m }: { m: ScenarioMetrics }) {
  const t = useT()
  return (
    <dl className="stats">
      <Stat
        label={t('stats.energy')}
        value={formatPct(m.energyPct)}
        level={energyLevel(m.energyPct)}
      />
      <Stat label={t('stats.sunlit')} value={formatPct(m.sunlitPct)} />
      <Stat label={t('stats.dte')} value={formatPct(m.dtePct)} level={dteLevel(m.dtePct)} />
      <Stat label={t('stats.both')} value={formatPct(m.bothPct)} />
      <Stat
        label={t('stats.night')}
        value={formatHours(m.longestDarkH)}
        level={nightLevel(m.longestDarkH)}
      />
      <Stat label={t('stats.noDte')} value={formatHours(m.longestNoDteH)} />
      <Stat
        label={t('stats.sunEl')}
        value={`${formatDeg(m.meanSunElLit, 1)} / ${formatDeg(m.maxSunEl, 1)}`}
      />
    </dl>
  )
}

/** One-line state for the collapsed header: Sun elevation and Earth visibility. */
function InstantSummary({ i }: { i: InstantState }) {
  const t = useT()
  return (
    <>
      <span className="chip" data-level={i.sunUp ? 'good' : 'bad'}>
        <span aria-hidden>☀</span>{' '}
        {i.sunUp ? t('panel.sunEl', { el: formatDeg(i.sky.sun.el, 1) }) : t('panel.sunDown')}
      </span>
      <span className="chip" data-level={i.earthUp ? 'good' : 'bad'}>
        <span aria-hidden>⊕</span> {i.earthUp ? t('panel.earthUp') : t('panel.earthDown')}
      </span>
    </>
  )
}

export function MetricsPanel() {
  const t = useT()
  const siteText = useSiteText()
  const sourceText = useSourceText()
  const scenario = useMissionStore(selectActiveScenario)
  const missionDays = useMissionStore((s) => s.missionDays)
  const { info, detail, instant, result, loading, error, timeMs } = useInstant(scenario)
  const battery = useBattery(result?.series)
  const thermal = useThermal(result?.series)
  const ice = useIceAccess(detail)
  const science = ice.data ? scienceScore(ice.data, ice.rover) : undefined

  return (
    <CollapsiblePanel
      id="right"
      title={t('panel.right')}
      label={t('metrics.aria')}
      icon={<IconGauge />}
      help="metrics"
      busy={loading}
      summary={instant && <InstantSummary i={instant} />}
    >
      <p className="panel__label">{t('metrics.now')}</p>
      <h2 className="panel__title">{siteText(info)?.name ?? '…'}</h2>
      {detail && <p className="hint">{sourceText(detail)}</p>}
      {error && <p className="error">{t('metrics.error', { msg: error.message })}</p>}
      {instant ? (
        <>
          <SunCard i={instant} detail={detail} />
          <EarthCard i={instant} detail={detail} />
        </>
      ) : (
        <p className="hint">{t('common.computing')}</p>
      )}
      <ThermalCard
        thermal={thermal}
        startMs={scenario.startMs}
        stepMs={result?.series.stepMs ?? 600_000}
        timeMs={timeMs}
      />
      {result && (
        <>
          <div className="score">
            <span className="panel__label">{t('metrics.window', { days: missionDays })}</span>
            <span className="score__value" title={t('metrics.scoreTitle')}>
              {result.metrics.score}
              <small>/100</small>
            </span>
          </div>
          <ScienceWeight engineering={result.metrics.score} science={science} />
          <WindowSummary m={result.metrics} />
        </>
      )}
      <IceCard detail={detail} />
      <EnergyCard
        battery={battery}
        startMs={scenario.startMs}
        stepMs={result?.series.stepMs ?? 600_000}
        timeMs={timeMs}
      />
      <TerrainCard detail={detail} />
      <DispersionCard scenario={scenario} />
    </CollapsiblePanel>
  )
}
