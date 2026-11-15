import { type Constraint, type HardwareLimits, LIMIT_RANGES } from '../astro/hardware.ts'
import { type CatalogRow, useCatalogViability } from '../hooks/useCatalogViability.ts'
import { type MsgKey, useT } from '../i18n/index.ts'
import { useSiteText } from '../i18n/sites.ts'
import { MAX_SCENARIOS, selectActiveScenario, useMissionStore } from '../store/useMissionStore.ts'
import { formatDeg, formatHours, formatPct } from './format.ts'
import { Busy } from './kit/Busy.tsx'
import { Notice } from './kit/Notice.tsx'
import { LevelTag } from './LevelTag.tsx'

const FIELDS: [keyof HardwareLimits, MsgKey, number][] = [
  ['maxSlopeDeg', 'hw.field.slope', 1],
  ['maxNightH', 'hw.field.night', 6],
  ['minDtePct', 'hw.field.dte', 5],
  ['roverMaxSlopeDeg', 'hw.field.rover', 1],
]

const CONSTRAINT_KEY: Record<Constraint, MsgKey> = {
  slope: 'hw.c.slope',
  night: 'hw.c.night',
  dte: 'hw.c.dte',
}

function Row({ row, rank }: { row: CatalogRow; rank: number }) {
  const t = useT()
  const siteText = useSiteText()
  const { viability: v, metrics: m, info } = row
  const notes = v.failed.length ? v.failed : v.tight
  return (
    <tr data-level={v.verdict}>
      <td>
        <LevelTag level={v.verdict} /> {t(`hw.verdict.${v.verdict}`)}
      </td>
      <th scope="row">
        {rank}. {siteText(info)?.name ?? info.id}
      </th>
      <td>{row.score}</td>
      <td>{info.slopeP90Deg !== undefined ? formatDeg(info.slopeP90Deg, 1) : '—'}</td>
      <td>{formatHours(m.longestDarkH)}</td>
      <td>{formatPct(m.dtePct)}</td>
      <td className="hint">{notes.map((c) => t(CONSTRAINT_KEY[c])).join(' · ')}</td>
    </tr>
  )
}

/**
 * "Filter by hardware": the user's lander limits applied to every catalogue site at once,
 * with the viable ones sent to Compare in one click.
 */
export function HardwareFilter() {
  const t = useT()
  const open = useMissionStore((s) => s.hardwareOpen)
  const limits = useMissionStore((s) => s.hardwareLimits)
  const startMs = useMissionStore((s) => selectActiveScenario(s).startMs)
  const missionDays = useMissionStore((s) => s.missionDays)
  const { setHardwareOpen, setHardwareLimits, setScenarios, setCompareOpen } =
    useMissionStore.getState()
  const { rows, loading, error, retry } = useCatalogViability(open)
  if (!open) return null

  const viable = rows?.filter((r) => r.viability.verdict !== 'bad') ?? []
  const send = () => {
    if (!setScenarios(viable.slice(0, MAX_SCENARIOS).map((r) => ({ siteId: r.info.id, startMs }))))
      return
    setHardwareOpen(false)
    setCompareOpen(true)
  }

  return (
    <section className="overlay hwfilter" aria-label={t('hw.aria')} aria-busy={loading}>
      <header className="overlay__head">
        <h2>{t('hw.title', { days: missionDays })}</h2>
        <div>
          <button
            type="button"
            className="btn btn--accent"
            disabled={!viable.length}
            onClick={send}
          >
            {t('hw.send', { n: Math.min(viable.length, MAX_SCENARIOS) })}
          </button>
          <button type="button" className="btn" onClick={() => setHardwareOpen(false)}>
            {t('common.close')}
          </button>
        </div>
      </header>
      <p className="hint">{t('hw.intro')}</p>
      <div className="hwfilter__fields">
        {FIELDS.map(([k, label, step]) => (
          <label key={k} className="field">
            <span>{t(label)}</span>
            <input
              type="number"
              min={LIMIT_RANGES[k].min}
              max={LIMIT_RANGES[k].max}
              step={step}
              value={limits[k]}
              onChange={(e) => setHardwareLimits({ [k]: e.target.value })}
            />
          </label>
        ))}
      </div>
      {error && (
        <Notice tone="error" action={{ label: t('kit.retry'), onClick: retry }}>
          {t('metrics.error', { msg: error.message })}
        </Notice>
      )}
      {!rows && !error && <Busy>{t('common.computing')}</Busy>}
      {rows && (
        <table className="hwfilter__table">
          <thead>
            <tr>
              <th scope="col">{t('hw.col.verdict')}</th>
              <th scope="col">{t('hw.col.site')}</th>
              <th scope="col">{t('hw.col.score')}</th>
              <th scope="col">{t('hw.col.slope')}</th>
              <th scope="col">{t('hw.col.night')}</th>
              <th scope="col">{t('hw.col.dte')}</th>
              <th scope="col">{t('hw.col.notes')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <Row key={r.info.id} row={r} rank={i + 1} />
            ))}
          </tbody>
        </table>
      )}
      <p className="hint">{t('hw.note')}</p>
    </section>
  )
}
