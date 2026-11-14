import { FREEZE_K, type ThermalSeries, kelvinToC } from '../astro/thermal.ts'
import { useT } from '../i18n/index.ts'
import { formatHours } from './format.ts'
import { LevelTag } from './LevelTag.tsx'
import { type Level, thermalLevel } from './levels.ts'

const fmtT = (k: number) =>
  Number.isFinite(k) ? `${Math.round(kelvinToC(k))} °C · ${Math.round(k)} K` : '—'

/** Simplified radiative temperatures now and over the mission window. */
export function ThermalCard({
  thermal,
  startMs,
  stepMs,
  timeMs,
  freezeK = FREEZE_K,
}: {
  thermal?: ThermalSeries
  startMs: number
  stepMs: number
  timeMs: number
  freezeK?: number
}) {
  const t = useT()
  if (!thermal || !thermal.faceK.length) return null
  const i = Math.min(thermal.faceK.length - 1, Math.max(0, Math.round((timeMs - startMs) / stepMs)))
  const level: Level = thermalLevel(thermal.longestFreezeH, thermal.psr)
  return (
    <div className="card thermal" data-level={level}>
      <div className="card__head">
        <span className="card__icon" aria-hidden>
          🌡
        </span>
        <span className="card__title">{t('thermal.title')}</span>
        <span className="badge">
          <LevelTag level={level} /> {t(`thermal.badge.${level}`)}
        </span>
      </div>
      <p className="card__big">{fmtT(thermal.faceK[i])}</p>
      <p className="card__sub">{t('thermal.face')}</p>
      <p className="card__sub">{t('thermal.regolith', { t: fmtT(thermal.regolithK[i]) })}</p>
      <p className="card__sub">
        {t('thermal.range', { min: fmtT(thermal.minK), max: fmtT(thermal.maxK) })}
      </p>
      <p className="card__sub">
        {thermal.psr
          ? t('thermal.psr')
          : t('thermal.freeze', {
              limit: Math.round(kelvinToC(freezeK)),
              total: formatHours(thermal.hoursBelowFreeze),
              longest: formatHours(thermal.longestFreezeH),
            })}
      </p>
      <p className="hint">{t('thermal.note')}</p>
    </div>
  )
}
