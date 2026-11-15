import { ICE_RADIUS_M, scienceScore } from '../astro/iceAccess.ts'
import type { SiteDetail } from '../data/catalog.ts'
import { useIceAccess } from '../hooks/useScience.ts'
import { useRoverTraverse } from '../hooks/useRover.ts'
import { type MsgKey, useT } from '../i18n/index.ts'
import { useRoverStore } from '../store/useRoverStore.ts'
import { useMissionStore } from '../store/useMissionStore.ts'
import { usePlannerStore } from '../store/usePlannerStore.ts'
import { formatDeg, formatDistance, formatHours, formatPct } from './format.ts'
import { Busy } from './kit/Busy.tsx'
import { Notice } from './kit/Notice.tsx'
import { LevelTag } from './LevelTag.tsx'
import { type Level, scienceLevel } from './levels.ts'
import { type RoverOutcome, outcomeLevel, roverOutcome } from './roverView.ts'

const CARD_KEY: Record<RoverOutcome, MsgKey> = {
  ok: 'rover.card.ok',
  'low-battery': 'rover.card.lowBattery',
  'no-route': 'rover.card.noRoute',
  'battery-out': 'rover.card.batteryOut',
  samples: 'rover.card.samples',
  'no-return': 'rover.card.noReturn',
  late: 'rover.card.late',
}

/**
 * Whether the selected rover does the whole mission (out to the ice, every sample and back to
 * the lander in time, above the planner's minimum battery), and a shortcut to watch the trip.
 */
function RoverLine() {
  const t = useT()
  const roverId = useRoverStore((s) => s.roverId)
  const minSocPct = usePlannerStore((s) => s.minRoverSocPct)
  const { data } = useRoverTraverse()
  if (!data) return null
  const s = data.summary
  const outcome = roverOutcome(s, minSocPct)
  const see = () => {
    useRoverStore.getState().setAutoDeploy('skip-descent')
    useMissionStore.getState().setView('landing')
  }
  return (
    <p className="card__sub">
      <LevelTag level={outcomeLevel(outcome)} />{' '}
      {t('rover.card', {
        name: t(`rover.vehicle.${roverId}` as MsgKey),
        verdict: t(CARD_KEY[outcome], {
          samples: t(s.samples === 1 ? 'rover.sum.sample' : 'rover.sum.samples', { n: s.samples }),
          h: formatHours(s.totalH),
          soc: formatPct(s.minSocPct),
          min: formatPct(minSocPct),
          done: s.samplesDone,
          total: s.samples,
          late: formatHours(-(s.marginH ?? 0)),
        }),
      })}{' '}
      <button type="button" className="linklike" onClick={see}>
        {t('rover.card.see')}
      </button>
    </p>
  )
}

/** Rover access to permanently shadowed ground (water ice) from the landing point. */
export function IceCard({ detail }: { detail?: SiteDetail }) {
  const t = useT()
  const { available, data, loading, error, retry, rover } = useIceAccess(detail)
  if (!available) return null
  const sci = data ? scienceScore(data, rover) : undefined
  const level: Level | undefined = sci === undefined ? undefined : scienceLevel(sci)
  return (
    <div className="card ice" data-level={level} aria-busy={loading}>
      <div className="card__head">
        <span className="card__icon" aria-hidden>
          ❄
        </span>
        <span className="card__title">{t('ice.title')}</span>
        {data && (
          <span className="badge">
            <LevelTag level={level} />{' '}
            {data.insidePsr
              ? t('ice.badge.inside')
              : data.reachable
                ? t('ice.badge.reachable')
                : t('ice.badge.none')}
          </span>
        )}
      </div>
      {error && (
        <Notice tone="error" action={{ label: t('kit.retry'), onClick: retry }}>
          {t('metrics.error', { msg: error.message })}
        </Notice>
      )}
      {!data && !error && <Busy>{t('common.computing')}</Busy>}
      {data && (
        <>
          <p className="card__big">
            {sci}
            <small>/100</small>
          </p>
          <p className="card__sub">{t('ice.score')}</p>
          {data.insidePsr ? (
            <p className="card__sub">{t('ice.inside')}</p>
          ) : data.straightM === null ? (
            <Notice tone="note">
              {t('ice.noneInRadius', { r: formatDistance(ICE_RADIUS_M) })}
            </Notice>
          ) : (
            <>
              <p className="card__sub">
                {t('ice.straight', { d: formatDistance(data.straightM) })}
                {data.routeM !== null && (
                  <>
                    {' · '}
                    {t('ice.route', {
                      d: formatDistance(data.routeM),
                      slope: formatDeg(data.maxSlopeDeg ?? NaN, 1),
                    })}
                  </>
                )}
              </p>
              {!data.reachable && (
                <p className="card__sub warn">{t('ice.blocked', { deg: rover })}</p>
              )}
            </>
          )}
          {data.reachable && !data.insidePsr && <RoverLine />}
          <p className="hint">{t('ice.note', { deg: rover })}</p>
        </>
      )}
    </div>
  )
}

/** Engineering ↔ Science weight, next to the score. */
export function ScienceWeight({ engineering, science }: { engineering: number; science?: number }) {
  const t = useT()
  const w = useMissionStore((s) => s.scienceWeight)
  const setW = useMissionStore((s) => s.setScienceWeight)
  const blended =
    science === undefined ? undefined : Math.round((1 - w) * engineering + w * science)
  return (
    <div className="science">
      <label className="science__slider">
        <span>{t('science.engineering')}</span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={Math.round(w * 100)}
          onChange={(e) => setW(Number(e.target.value) / 100)}
          aria-label={t('science.aria')}
          aria-valuetext={t('science.valueText', { pct: Math.round(w * 100) })}
        />
        <span>{t('science.science')}</span>
      </label>
      {w > 0 && (
        <p className="card__sub">
          {blended === undefined
            ? t('science.noData')
            : t('science.combined', {
                score: blended,
                eng: engineering,
                sci: science!,
                pct: Math.round(w * 100),
              })}
        </p>
      )}
    </div>
  )
}
