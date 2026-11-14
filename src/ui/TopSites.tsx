import { TOP_N, useTopSites } from '../hooks/useTopSites.ts'
import { useT } from '../i18n/index.ts'
import { useSiteText } from '../i18n/sites.ts'
import { selectActiveScenario, useMissionStore } from '../store/useMissionStore.ts'
import { formatNight, formatPct } from './format.ts'
import { type Level, dteLevel, energyLevel, nightLevel, scoreLevel } from './levels.ts'
import { MoonLocator } from './MoonLocator.tsx'

function Fact({
  icon,
  value,
  level,
  title,
}: {
  icon: string
  value: string
  level: Level
  title: string
}) {
  return (
    <span className="fact" data-level={level} title={title}>
      <span aria-hidden>{icon}</span> {value}
    </span>
  )
}

/**
 * Three ranked cards (medal, name, score and three facts with a traffic light). Used by the
 * site choice at the start and at the top of the site panel.
 */
export function TopSites({
  onPick,
  variant = 'list',
  selectedId,
  selectOnPick = true,
}: {
  onPick?: (siteId: string) => void
  variant?: 'list' | 'hero' | 'compact'
  /** Highlighted card (default: the active site). */
  selectedId?: string
  /** Also make it the active scenario's site (off in the scenario editor). */
  selectOnPick?: boolean
}) {
  const t = useT()
  const siteText = useSiteText()
  const { top, loading } = useTopSites()
  const sites = useMissionStore((s) => s.sites)
  const activeSiteId = useMissionStore((s) => selectActiveScenario(s).siteId)
  const selectSite = useMissionStore((s) => s.selectSite)
  const pick = (id: string) => {
    if (selectOnPick) selectSite(id)
    onPick?.(id)
  }

  // While the ranking is computed, keep the slots with the curated order (no layout jump).
  const placeholders = sites.filter((s) => s.category === 'south-pole' && !s.custom).slice(0, TOP_N)

  return (
    <ol className={`top top--${variant}`} aria-label={t('top.title')} aria-busy={loading}>
      {(top ?? placeholders.map((info) => ({ info, metrics: undefined, score: undefined }))).map(
        (row, i) => {
          const m = row.metrics
          const text = siteText(row.info)
          return (
            <li key={row.info.id}>
              <button
                type="button"
                className="top__card"
                data-active={row.info.id === (selectedId ?? activeSiteId)}
                onClick={() => pick(row.info.id)}
                title={text?.description}
              >
                <span className="top__medal" data-rank={i + 1} aria-hidden>
                  {i + 1}
                </span>
                <MoonLocator
                  points={[{ lat: row.info.lat, lon: row.info.lon }]}
                  size={variant === 'hero' ? 64 : 46}
                />
                <span className="top__body">
                  <span className="top__name">{text?.name}</span>
                  {m && row.score !== undefined ? (
                    <span className="top__facts">
                      <span className="top__score" data-level={scoreLevel(row.score)}>
                        {row.score}
                        <small>/100</small>
                      </span>
                      <Fact
                        icon="☀"
                        value={formatPct(m.sunlitPct)}
                        level={energyLevel(m.energyPct)}
                        title={t('fact.sun')}
                      />
                      <Fact
                        icon="⊕"
                        value={formatPct(m.dtePct)}
                        level={dteLevel(m.dtePct)}
                        title={t('fact.earth')}
                      />
                      <Fact
                        icon="☾"
                        value={formatNight(m.longestDarkH)}
                        level={nightLevel(m.longestDarkH)}
                        title={t('fact.night')}
                      />
                    </span>
                  ) : (
                    <span className="top__facts top__facts--loading">{t('top.computing')}</span>
                  )}
                </span>
              </button>
            </li>
          )
        },
      )}
    </ol>
  )
}
