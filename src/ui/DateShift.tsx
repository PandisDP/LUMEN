import { DAY_MS } from '../astro/constants.ts'
import { SHIFT_SPAN_DAYS, shiftScores } from '../astro/dateShift.ts'
import type { SiteDetail } from '../data/catalog.ts'
import { useAsync } from '../hooks/useAsync.ts'
import { useT } from '../i18n/index.ts'
import { type Scenario, useMissionStore } from '../store/useMissionStore.ts'
import { runDateSweep } from '../workers/astroClient.ts'
import { LevelTag } from './LevelTag.tsx'
import { scoreLevel } from './levels.ts'

/**
 * "What if the landing slips a few days?": the mission score for the same site landing 1, 3 or
 * 7 days earlier or later. The counterpart in time of the dispersion zone in space.
 */
export function DateShift({ scenario, detail }: { scenario: Scenario; detail?: SiteDetail }) {
  const t = useT()
  const setStart = useMissionStore((s) => s.setStart)
  const { startMs, missionDays, linkMarginDeg, requireDsn } = scenario
  const key = detail
    ? `shift|${detail.site.lat}:${detail.site.lon}|${startMs}|${missionDays}|${linkMarginDeg}|${requireDsn}`
    : null
  const { data } = useAsync(key, () =>
    runDateSweep({
      site: detail!.site,
      mask: detail!.mask,
      fromMs: startMs - SHIFT_SPAN_DAYS * DAY_MS,
      days: 2 * SHIFT_SPAN_DAYS,
      missionDays,
      linkMarginDeg,
      requireDsn,
    }),
  )
  if (!data) return null
  const scores = shiftScores(data, startMs)
  if (scores.length < 2) return null
  const values = scores.map((s) => s.score)
  return (
    <div className="shift" title={t('shift.title')}>
      <p className="panel__label">
        {t('shift.label', { min: Math.min(...values), max: Math.max(...values) })}
      </p>
      <div className="shift__row">
        {scores.map((s) => (
          <button
            key={s.days}
            type="button"
            className="shift__cell"
            data-level={scoreLevel(s.score)}
            aria-current={s.days === 0 ? 'date' : undefined}
            aria-label={t('shift.cell', {
              days: s.days > 0 ? `+${s.days}` : s.days,
              score: s.score,
            })}
            onClick={() => s.days !== 0 && setStart(s.startMs)}
          >
            <small>{s.days === 0 ? t('shift.now') : `${s.days > 0 ? '+' : ''}${s.days} d`}</small>
            <strong>
              {s.score} <LevelTag level={scoreLevel(s.score)} />
            </strong>
          </button>
        ))}
      </div>
    </div>
  )
}
