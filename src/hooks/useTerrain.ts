import { useMemo } from 'react'
import type { DemGrid } from '../astro/dem.ts'
import type { DispersionResult } from '../astro/dispersion.ts'
import { slopeStats } from '../astro/slope.ts'
import { type SiteDetail, demRefs, loadTerrainGrids } from '../data/catalog.ts'
import { type Scenario, useMissionStore } from '../store/useMissionStore.ts'
import { runDispersion } from '../workers/astroClient.ts'
import { useAsync } from './useAsync.ts'
import { useScenarioData } from './useScenario.ts'

const siteKey = (d: SiteDetail) => `${d.site.lat}:${d.site.lon}`

/** DEM stack behind the site (finest first); [] where there is no topography. */
export function useTerrainGrids(detail: SiteDetail | undefined) {
  const { data, loading } = useAsync(detail ? `terrain:${siteKey(detail)}` : null, () =>
    loadTerrainGrids(detail!),
  )
  return { grids: data as DemGrid[] | undefined, loading }
}

/** Slope summary around the site, over the landing ellipse (or ~100 m when it is off). */
export function useSlopeStats(detail: SiteDetail | undefined) {
  const radius = useMissionStore((s) => s.ellipseRadiusM)
  const { grids } = useTerrainGrids(detail)
  return useMemo(() => {
    if (!detail || !grids?.length) return undefined
    const r = radius || 100
    return { radiusM: r, ...slopeStats(grids[0], detail.site.lat, detail.site.lon, r) }
  }, [detail, grids, radius])
}

/** Shared between the metrics panel and the 3D markers so the work runs once. */
const dispersionCache = new Map<string, Promise<DispersionResult>>()

export function useDispersion(scenario: Scenario) {
  const { detail, result, loading } = useScenarioData(scenario)
  const radiusM = useMissionStore((s) => s.ellipseRadiusM)
  const missionDays = useMissionStore((s) => s.missionDays)
  const linkMarginDeg = useMissionStore((s) => s.linkMarginDeg)
  const dems = detail ? demRefs(detail) : []
  const key =
    detail && result && !loading && radiusM > 0 && dems.length
      ? `${siteKey(detail)}|${scenario.startMs}|${missionDays}|${linkMarginDeg}|${radiusM}`
      : null
  const r = useAsync(key, () => {
    let p = dispersionCache.get(key!)
    if (!p) {
      p = runDispersion(
        {
          lat: detail!.site.lat,
          lon: detail!.site.lon,
          radiusM,
          startMs: scenario.startMs,
          missionDays,
          linkMarginDeg,
        },
        dems,
      )
      p.catch(() => dispersionCache.delete(key!))
      if (dispersionCache.size > 24) dispersionCache.delete(dispersionCache.keys().next().value!)
      dispersionCache.set(key!, p)
    }
    return p
  })
  // useAsync keeps the last value while a new one is pending (or while the key is null because
  // the scenario itself is still loading): only hand out results for the current inputs.
  const i = r.data?.input
  const current =
    i !== undefined &&
    detail !== undefined &&
    i.lat === detail.site.lat &&
    i.lon === detail.site.lon &&
    i.startMs === scenario.startMs &&
    i.missionDays === missionDays &&
    i.linkMarginDeg === linkMarginDeg &&
    i.radiusM === radiusM
  const wanted = radiusM > 0 && dems.length > 0
  return {
    data: current ? r.data : undefined,
    error: r.error,
    loading: wanted && !r.error && (r.loading || !current),
  }
}
