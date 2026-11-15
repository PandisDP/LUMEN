import { useState } from 'react'
import { GOOD_SCORE, type Range } from '../astro/dispersion.ts'
import { SLOPE_SAFE_DEG } from '../astro/slope.ts'
import { type SiteDetail, customSiteInfo } from '../data/catalog.ts'
import { useOptimize } from '../hooks/useScience.ts'
import { useDispersion, useSlopeStats } from '../hooks/useTerrain.ts'
import { useT } from '../i18n/index.ts'
import type { Scenario } from '../store/useMissionStore.ts'
import { useMissionStore } from '../store/useMissionStore.ts'
import { cardinal, formatDeg, formatDistance, formatHours, formatPct } from './format.ts'
import { IconTarget } from './icons.tsx'
import { LevelTag } from './LevelTag.tsx'
import { slopeLevel } from './levels.ts'

/** Local slope and safe-area share around the site (landing safety). */
export function TerrainCard({ detail }: { detail?: SiteDetail }) {
  const t = useT()
  const s = useSlopeStats(detail)
  if (!s || !Number.isFinite(s.center)) return null
  const level = slopeLevel(s.p90)
  return (
    <div className="card" data-level={level}>
      <div className="card__head">
        <span className="card__icon" aria-hidden>
          ⛰
        </span>
        <span className="card__title">{t('terrain.title')}</span>
        <span className="badge">
          <LevelTag level={level} /> {t(`terrain.badge.${level}`)}
        </span>
      </div>
      <p className="card__big">{formatDeg(s.center, 1)}</p>
      <p className="card__sub">{t('terrain.localSlope', { res: s.resolutionM })}</p>
      <p className="card__sub">
        {t('terrain.withinRadius', {
          r: formatDistance(s.radiusM),
          p90: formatDeg(s.p90, 1),
          max: formatDeg(s.max, 1),
          safe: formatPct(s.safePct),
        })}
      </p>
      {s.resolutionM > 20 && (
        <p className="card__sub warn">{t('terrain.coarse', { res: s.resolutionM })}</p>
      )}
    </div>
  )
}

const fmtRange = (r: Range, f: (v: number) => string) =>
  `${f(r.min)} · ${f(r.median)} · ${f(r.max)}`

/** How much the mission changes if the lander touches down anywhere in the ellipse. */
export function DispersionCard({ scenario }: { scenario: Scenario }) {
  const t = useT()
  const radiusM = useMissionStore((s) => s.ellipseRadiusM)
  const aspect = useMissionStore((s) => s.ellipseAspect)
  const { data, loading, error } = useDispersion(scenario)
  if (!radiusM) return null
  const n = data?.points.length ?? 0
  return (
    <div className="card dispersion" aria-busy={loading}>
      <div className="card__head">
        <span className="card__icon" aria-hidden>
          ◎
        </span>
        <span className="card__title">
          {t('dispersion.title', {
            a: formatDistance(radiusM),
            b: formatDistance(radiusM / aspect),
          })}
        </span>
      </div>
      {error && <p className="error">{error.message}</p>}
      {loading && <p className="card__sub">{t('dispersion.loading')}</p>}
      {data && !loading && n > 0 && (
        <>
          <p className="card__sub">
            {t('dispersion.spread', {
              min: data.summary.score.min,
              max: data.summary.score.max,
              n,
            })}
          </p>
          <table className="dispersion__table">
            <thead>
              <tr>
                <th scope="col" />
                <th scope="col">{t('dispersion.range')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">{t('dispersion.score')}</th>
                <td>{fmtRange(data.summary.score, (v) => String(Math.round(v)))}</td>
              </tr>
              <tr>
                <th scope="row">{t('dispersion.sun')}</th>
                <td>{fmtRange(data.summary.sunlitPct, (v) => formatPct(v))}</td>
              </tr>
              <tr>
                <th scope="row">{t('dispersion.dte')}</th>
                <td>{fmtRange(data.summary.dtePct, (v) => formatPct(v))}</td>
              </tr>
              <tr>
                <th scope="row">{t('dispersion.night')}</th>
                <td>{fmtRange(data.summary.longestDarkH, formatHours)}</td>
              </tr>
              <tr>
                <th scope="row">{t('dispersion.slope')}</th>
                <td>{fmtRange(data.summary.slopeDeg, (v) => formatDeg(v, 1))}</td>
              </tr>
            </tbody>
          </table>
          <dl className="stats dispersion__prob">
            <div>
              <dt>{t('dispersion.expected')}</dt>
              <dd>{Math.round(data.summary.expected.score)}</dd>
            </div>
            <div>
              <dt>{t('dispersion.pGood', { score: GOOD_SCORE })}</dt>
              <dd>{formatPct(data.summary.pGoodScore * 100)}</dd>
            </div>
            <div>
              <dt>{t('dispersion.pSafe', { deg: SLOPE_SAFE_DEG })}</dt>
              <dd>{formatPct(data.summary.pSafeSlope * 100)}</dd>
            </div>
          </dl>
          <p className="hint">{t('dispersion.note')}</p>
        </>
      )}
      <OptimizeSection scenario={scenario} />
    </div>
  )
}

/** "Suggest a better point": the safest, best-scoring spots inside the ellipse. */
function OptimizeSection({ scenario }: { scenario: Scenario }) {
  const t = useT()
  const siteKey = `${scenario.siteId}|${scenario.startMs}`
  const [requestedFor, setRequestedFor] = useState<string | null>(null)
  const requested = requestedFor === siteKey
  const { usable, data, loading, error } = useOptimize(scenario, requested)
  const addCustomSite = useMissionStore((s) => s.addCustomSite)
  if (!usable) return null
  const go = (lat: number, lon: number) => {
    setRequestedFor(null)
    addCustomSite(customSiteInfo(lat, lon))
  }
  return (
    <div className="optimize">
      <button
        type="button"
        className="btn"
        aria-pressed={requested}
        disabled={requested && loading}
        onClick={() => setRequestedFor(requested ? null : siteKey)}
      >
        <IconTarget /> {t('opt.button')}
      </button>
      {requested && loading && <p className="card__sub">{t('opt.loading')}</p>}
      {error && <p className="error">{error.message}</p>}
      {requested && data && (
        <>
          <p className="card__sub">
            {t('opt.summary', { safe: data.safeCount, n: data.evaluated })}
          </p>
          {data.best.length === 0 ? (
            <p className="card__sub warn">{t('opt.none')}</p>
          ) : (
            <ol className="optimize__list">
              {data.best.map((c) => {
                const delta = data.target ? c.score - data.target.score : null
                return (
                  <li key={`${c.lat}:${c.lon}`}>
                    <div>
                      <strong>{c.score}</strong>/100
                      {delta !== null && (
                        <span className="hint">
                          {' '}
                          ({delta >= 0 ? '+' : ''}
                          {delta})
                        </span>
                      )}{' '}
                      ·{' '}
                      {t('opt.where', {
                        d: formatDistance(c.distM),
                        dir: cardinal(c.azDeg),
                      })}
                    </div>
                    <div className="hint">
                      {t('opt.stats', {
                        slope: formatDeg(c.slopeDeg, 1),
                        sun: formatPct(c.sunlitPct),
                        dte: formatPct(c.dtePct),
                        night: formatHours(c.longestDarkH),
                      })}
                    </div>
                    <button
                      type="button"
                      className="btn btn--small"
                      onClick={() => go(c.lat, c.lon)}
                    >
                      {t('opt.go')}
                    </button>
                  </li>
                )
              })}
            </ol>
          )}
          <p className="hint">{t('opt.note')}</p>
        </>
      )}
    </div>
  )
}
