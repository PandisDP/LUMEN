import { DAY_MS } from '../astro/constants.ts'
import {
  type IceAccess,
  type IceSummary,
  ICE_RADIUS_M,
  combinedScore,
  scienceScore,
} from '../astro/iceAccess.ts'
import type { OptimizeResult } from '../astro/optimize.ts'
import type { RoverId, TraverseResult } from '../astro/traverse.ts'
import { energyPreset } from '../config/energyProfiles.ts'
import { type SiteDetail, asset, demRefs } from '../data/catalog.ts'
import { loadIllum } from '../data/loadDem.ts'
import {
  type IceTarget,
  type Scenario,
  selectActiveScenario,
  useMissionStore,
} from '../store/useMissionStore.ts'
import { useRoverStore } from '../store/useRoverStore.ts'
import { runIceAccess, runOptimize, runTraverse } from '../workers/astroClient.ts'
import type { DemRef, IllumRef } from '../workers/protocol.ts'
import { useAsync } from './useAsync.ts'
import { useScenarioData } from './useScenario.ts'
import { useLandingEllipse } from './useTerrain.ts'

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

/**
 * Rover access from the site to permanently shadowed ground (worker): the nearest one, or the
 * cell nearest to the scenario's ice target when it has one (a planner pick). `target` defaults
 * to the active scenario's; pass the scenario's own (or null) when `detail` is another one's.
 */
export function useIceAccess(
  detail: SiteDetail | undefined,
  roverMaxSlopeDeg?: number,
  target?: IceTarget | null,
) {
  const activeRover = useMissionStore((s) => s.hardwareLimits.roverMaxSlopeDeg)
  const activeTarget = useMissionStore((s) => selectActiveScenario(s).iceTarget)
  const rover = roverMaxSlopeDeg ?? activeRover
  const goal = (target === undefined ? activeTarget : target) ?? undefined
  const illum = detail && illumRef(detail)
  const dem = detail && tileRef(detail)
  const key =
    detail && illum && dem
      ? `ice|${detail.site.lat}|${detail.site.lon}|${rover}|${goal ? `${goal.lat},${goal.lon}` : ''}`
      : null
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
          ...(goal && { target: { lat: goal.lat, lon: goal.lon } }),
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
    retry: r.retry,
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
  const ellipse = useLandingEllipse(scenario)
  const missionDays = useMissionStore((s) => s.missionDays)
  const linkMarginDeg = useMissionStore((s) => s.linkMarginDeg)
  const requireDsn = useMissionStore((s) => s.requireDsn)
  const scienceWeight = useMissionStore((s) => s.scienceWeight)
  const rover = useMissionStore((s) => s.hardwareLimits.roverMaxSlopeDeg)
  const dems = detail ? demRefs(detail) : []
  const usable = !!detail?.terrain && dems.length > 0
  const key =
    requested && usable && result && !loading
      ? `opt|${detail!.site.lat}:${detail!.site.lon}|${scenario.startMs}|${missionDays}|${linkMarginDeg}|${requireDsn}|${radiusM}|${ellipse?.semiMinorM}|${ellipse?.orientationDeg}|${scienceWeight}|${rover}`
      : null
  const r = useAsync(key, () => {
    let p = optimizeCache.get(key!)
    if (!p) {
      p = runOptimize(
        {
          lat: detail!.site.lat,
          lon: detail!.site.lon,
          radiusM,
          semiMinorM: ellipse?.semiMinorM,
          orientationDeg: ellipse?.orientationDeg,
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

const traverseCache = new Map<string, Promise<TraverseResult>>()

/**
 * Rover round trip from the scenario's landing point to the nearest permanently shadowed
 * ground along the ice-access route, the sampling there (`samples` × `sampleH` from the rover
 * store) and the drive back (worker; only while `enabled`). The scenario's own energy profile
 * is the lander's, so the rover's budget, vehicle and instrument power come from the preset
 * `energyId`. `departMs` is the mission time at which the rover leaves the lander; the deadline
 * to be back is always the end of the surface mission, counted from the landing
 * (`scenario.startMs + missionDays`), whenever it departs.
 */
export function useTraverse(
  scenario: Scenario,
  enabled: boolean,
  energyId: RoverId = 'rover',
  departMs: number = scenario.startMs,
) {
  const { detail } = useScenarioData(scenario)
  const rover = scenario.hardwareLimits.roverMaxSlopeDeg
  const { linkMarginDeg, requireDsn } = scenario
  const ice = useIceAccess(detail, rover, scenario.iceTarget ?? null)
  const energy = energyPreset(energyId)?.profile
  const samples = useRoverStore((s) => s.samples)
  const sampleH = useRoverStore((s) => s.sampleH)
  const deadlineMs = scenario.startMs + scenario.missionDays * DAY_MS
  const dems = detail ? demRefs(detail) : []
  const route = ice.data
  // useAsync keeps the previous point's route on screen while loading: wait for the current one.
  const available =
    !!route &&
    !!detail &&
    !ice.loading &&
    route.reachable &&
    route.path.length > 0 &&
    !!energy &&
    dems.length > 0
  const key =
    enabled && available
      ? `trv|${detail!.site.lat}:${detail!.site.lon}|${rover}|${departMs}|${energyId}|${linkMarginDeg}|${requireDsn}|${scenario.iceTarget ? `${scenario.iceTarget.lat},${scenario.iceTarget.lon}` : ''}|${samples}x${sampleH}|${deadlineMs}`
      : null
  const r = useAsync<TraverseResult>(key, () => {
    let p = traverseCache.get(key!)
    if (!p) {
      p = runTraverse(
        {
          lat: detail!.site.lat,
          lon: detail!.site.lon,
          path: route!.path,
          startMs: departMs,
          energy: energy!,
          vehicleId: energyId,
          roverMaxSlopeDeg: rover,
          linkMarginDeg,
          requireDsn,
          samples,
          sampleH,
          deadlineMs,
        },
        dems,
        illumRef(detail!),
      )
      p.catch(() => traverseCache.delete(key!))
      if (traverseCache.size > 16) traverseCache.delete(traverseCache.keys().next().value!)
      traverseCache.set(key!, p)
    }
    return p
  })
  const i = r.data?.input
  const fresh =
    !!i &&
    !!detail &&
    i.lat === detail.site.lat &&
    i.lon === detail.site.lon &&
    i.startMs === departMs &&
    i.vehicleId === energyId &&
    i.samples === samples &&
    i.sampleH === sampleH &&
    i.deadlineMs === deadlineMs
  return {
    /** A reachable route exists for this point and rover. */
    available,
    data: key && fresh ? r.data : undefined,
    loading: ice.loading || (key !== null && (r.loading || !fresh) && !r.error),
    error: r.error ?? ice.error,
    ice,
  }
}
