import { ICE_RADIUS_M, scienceScore } from '../astro/iceAccess.ts'
import type { SiteDetail } from '../data/catalog.ts'
import { useIceAccess } from '../hooks/useScience.ts'
import { useRoverTraverse } from '../hooks/useRover.ts'
import { type MsgKey, useT } from '../i18n/index.ts'
import { useRoverStore } from '../store/useRoverStore.ts'
import { useMissionStore } from '../store/useMissionStore.ts'
import { formatDeg, formatDistance, formatHours, formatPct } from './format.ts'
import { LevelTag } from './LevelTag.tsx'
import { type Level, scienceLevel } from './levels.ts'

/** Whether the selected rover makes it to the ice, and a shortcut to watch the traverse. */
function RoverLine() {
  const t = useT()
  const roverId = useRoverStore((s) => s.roverId)
  const { data } = useRoverTraverse()
  if (!data) return null
  const s = data.summary
  const see = () => {
    useRoverStore.getState().setAutoDeploy('skip-descent')
    useMissionStore.getState().setView('landing')
  }
  return (
    <p className="card__sub">
      <LevelTag level={!s.reaches ? 'bad' : s.minSocPct < 25 ? 'warn' : 'good'} />{' '}
      {t('rover.card', {
        name: t(`rover.vehicle.${roverId}` as MsgKey),
        verdict: s.reaches
          ? t('rover.card.ok', { h: formatHours(s.driveH + s.waitH), soc: formatPct(s.minSocPct) })
          : t('rover.card.fail', { soc: formatPct(s.minSocPct) }),
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
  const { available, data, loading, error, rover } = useIceAccess(detail)
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
      {error && <p className="error">{error.message}</p>}
      {!data && <p className="card__sub">{t('common.computing')}</p>}
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
            <p className="card__sub">
              {t('ice.noneInRadius', { r: formatDistance(ICE_RADIUS_M) })}
            </p>
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
