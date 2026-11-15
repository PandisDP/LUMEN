import {
  type IceAccess,
  type IceSummary,
  ICE_RADIUS_M,
  combinedScore,
  scienceScore,
} from '../astro/iceAccess.ts'
import type { OptimizeResult } from '../astro/optimize.ts'
import { type SiteDetail, asset, demRefs } from '../data/catalog.ts'
import { loadIllum } from '../data/loadDem.ts'
import { type Scenario, useMissionStore } from '../store/useMissionStore.ts'
import { runIceAccess, runOptimize } from '../workers/astroClient.ts'
import type { DemRef, IllumRef } from '../workers/protocol.ts'
import { useAsync } from './useAsync.ts'
import { useScenarioData } from './useScenario.ts'

/**
 * Score shown when the Engineering↔Science control is moved: the engineering score blended
 * with ice access. With weight 0 it is exactly the engineering score.
 */
export function siteScore(
  engineering: number,
  ice: Pick<IceSummary, 'routeM' | 'maxSlopeDeg' | 'reachable'> | undefined,
  weight: number,
  roverMaxSlopeDeg = 20,
): number {
  if (weight <= 0) return engineering
  return combinedScore(engineering, scienceScore(ice, roverMaxSlopeDeg), weight)
}

export const illumRef = (detail: SiteDetail): IllumRef | undefined =>
  detail.illum ? { bin: asset(`data/${detail.illum.file}`), meta: detail.illum.meta } : undefined

/** The site's 20 m tile, which the illumination map belongs to. */
const tileRef = (detail: SiteDetail): DemRef | undefined =>
  detail.terrain
    ? { bin: asset(`data/${detail.terrain.file}`), meta: detail.terrain.meta }
    : undefined

const iceCache = new Map<string, Promise<IceAccess>>()

/** Rover access to the nearest permanently shadowed ground from the site (worker). */
export function useIceAccess(detail: SiteDetail | undefined, roverMaxSlopeDeg?: number) {
  const activeRover = useMissionStore((s) => s.hardwareLimits.roverMaxSlopeDeg)
  const rover = roverMaxSlopeDeg ?? activeRover
  const illum = detail && illumRef(detail)
  const dem = detail && tileRef(detail)
  const key = detail && illum && dem ? `ice|${detail.site.lat}|${detail.site.lon}|${rover}` : null
  const r = useAsync<IceAccess>(key, () => {
    // Shared by the card, the score and the 3D route: one worker request per point.
    let p = iceCache.get(key!)
    if (!p) {
      p = runIceAccess(
        {
          lat: detail!.site.lat,
          lon: detail!.site.lon,
          radiusM: ICE_RADIUS_M,
          roverMaxSlopeDeg: rover,
        },
        dem!,
        illum!,
      )
      p.catch(() => iceCache.delete(key!))
      if (iceCache.size > 32) iceCache.delete(iceCache.keys().next().value!)
      iceCache.set(key!, p)
    }
    return p
  })
  return {
    available: key !== null,
    data: key ? r.data : undefined,
    loading: r.loading,
    error: r.error,
    rover,
  }
}

const optimizeCache = new Map<string, Promise<OptimizeResult>>()

/**
 * Best safe landing points inside the ellipse. Runs only on demand (`requested`), because
 * it evaluates ~40 full horizons.
 */
export function useOptimize(scenario: Scenario, requested: boolean) {
  const { detail, result, loading } = useScenarioData(scenario)
  const radiusM = useMissionStore((s) => s.ellipseRadiusM) || 500
  const missionDays = useMissionStore((s) => s.missionDays)
  const linkMarginDeg = useMissionStore((s) => s.linkMarginDeg)
  const requireDsn = useMissionStore((s) => s.requireDsn)
  const scienceWeight = useMissionStore((s) => s.scienceWeight)
  const rover = useMissionStore((s) => s.hardwareLimits.roverMaxSlopeDeg)
  const dems = detail ? demRefs(detail) : []
  const usable = !!detail?.terrain && dems.length > 0
  const key =
    requested && usable && result && !loading
      ? `opt|${detail!.site.lat}:${detail!.site.lon}|${scenario.startMs}|${missionDays}|${linkMarginDeg}|${requireDsn}|${radiusM}|${scienceWeight}|${rover}`
      : null
  const r = useAsync(key, () => {
    let p = optimizeCache.get(key!)
    if (!p) {
      p = runOptimize(
        {
          lat: detail!.site.lat,
          lon: detail!.site.lon,
          radiusM,
          startMs: scenario.startMs,
          missionDays,
          linkMarginDeg,
          requireDsn,
          scienceWeight,
          roverMaxSlopeDeg: rover,
        },
        dems,
        illumRef(detail!),
      )
      p.catch(() => optimizeCache.delete(key!))
      if (optimizeCache.size > 16) optimizeCache.delete(optimizeCache.keys().next().value!)
      optimizeCache.set(key!, p)
    }
    return p
  })
  const i = r.data?.input
  const current =
    !!i &&
    !!detail &&
    i.lat === detail.site.lat &&
    i.lon === detail.site.lon &&
    i.radiusM === radiusM
  return {
    usable,
    data: key && current ? r.data : undefined,
    loading: key !== null && (r.loading || !current) && !r.error,
    error: r.error,
  }
}

/** The site's yearly illumination map on the main thread (for the 3D PSR layer). */
export function useIllumGrid(detail: SiteDetail | undefined) {
  const ref = detail && illumRef(detail)
  const { data } = useAsync(ref ? `illum:${ref.bin}` : null, () => loadIllum(ref!.bin, ref!.meta))
  return ref ? data : undefined
}
