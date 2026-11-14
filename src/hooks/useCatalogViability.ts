import { useMemo } from 'react'
import { type Viability, classifySite } from '../astro/hardware.ts'
import type { ScenarioMetrics } from '../astro/metrics.ts'
import { type SiteInfo, loadSiteDetail } from '../data/catalog.ts'
import { selectActiveScenario, useMissionStore } from '../store/useMissionStore.ts'
import { runScenario } from '../workers/astroClient.ts'
import { useAsync } from './useAsync.ts'
import { siteScore } from './useScience.ts'

export interface CatalogRow {
  info: SiteInfo
  metrics: ScenarioMetrics
  viability: Viability
  /** Engineering score blended with the science score by the current weight. */
  score: number
}

/**
 * Every curated site evaluated with the active landing date, mission length and link margin,
 * then judged against the hardware limits. The worker queues the 15 requests; the limits
 * themselves are applied on the main thread, so moving a slider is instant.
 */
export function useCatalogViability(enabled: boolean) {
  const sites = useMissionStore((s) => s.sites)
  const startMs = useMissionStore((s) => selectActiveScenario(s).startMs)
  const missionDays = useMissionStore((s) => s.missionDays)
  const linkMarginDeg = useMissionStore((s) => s.linkMarginDeg)
  const limits = useMissionStore((s) => s.hardwareLimits)
  const scienceWeight = useMissionStore((s) => s.scienceWeight)
  const curated = useMemo(() => sites.filter((s) => !s.custom), [sites])
  const key =
    enabled && curated.length
      ? `catalog|${startMs}|${missionDays}|${linkMarginDeg}|${curated.map((s) => s.id).join(',')}`
      : null
  const { data, loading, error } = useAsync(key, () =>
    cached(key!, () =>
      Promise.all(
        curated.map(async (info) => {
          const detail = await loadSiteDetail(info)
          const r = await runScenario({
            site: detail.site,
            mask: detail.mask,
            startMs,
            missionDays,
            linkMarginDeg,
          })
          return { info, metrics: r.metrics }
        }),
      ),
    ),
  )
  const rows = useMemo<CatalogRow[] | undefined>(
    () =>
      data
        ?.map(({ info, metrics }) => ({
          info,
          metrics,
          viability: classifySite(limits, {
            slopeP90Deg: info.slopeP90Deg,
            longestDarkH: metrics.longestDarkH,
            dtePct: metrics.dtePct,
          }),
          score: siteScore(metrics.score, info.ice, scienceWeight, limits.roverMaxSlopeDeg),
        }))
        .sort((a, b) => rank(a) - rank(b) || b.score - a.score),
    [data, limits, scienceWeight],
  )
  return { rows, loading, error }
}

const ORDER = { good: 0, warn: 1, bad: 2 } as const
const rank = (r: CatalogRow) => ORDER[r.viability.verdict]

type CatalogData = { info: SiteInfo; metrics: ScenarioMetrics }[]
const cache = new Map<string, Promise<CatalogData>>()

/**
 * The Top 3, the assistant, the scenario editor and the hardware filter all ask for the same
 * catalogue evaluation: share one run per (date, mission, margin). A failed run is forgotten.
 */
function cached(key: string, run: () => Promise<CatalogData>): Promise<CatalogData> {
  let p = cache.get(key)
  if (!p) {
    p = run().catch((e: unknown) => {
      cache.delete(key)
      throw e
    })
    cache.set(key, p)
    if (cache.size > 8) cache.delete(cache.keys().next().value!)
  }
  return p
}
