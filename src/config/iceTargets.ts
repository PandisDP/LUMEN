import { surfaceDistance } from '../astro/frames.ts'
import { ICE_TARGET_MARGIN_M, ICE_TARGET_SNAP_M } from '../astro/iceAccess.ts'
import { PLAN_RADII_M } from '../astro/plannerTypes.ts'
import type { SiteInfo } from '../data/catalog.ts'
import { usesPolarProduct } from './sites.ts'

/**
 * Ice targets the planner suggests, derived from the curated polar sites. No texts here: the UI
 * composes the label from `kind` and the site (`siteId`), e.g. "ice next to <site name>".
 */
export interface IceTargetOption {
  /** Stable id: `<kind>:<siteId>`. */
  id: string
  /** Curated site the suggestion comes from (for its name). */
  siteId: string
  /** Curated site whose 20 m tile and illumination map cover the target (PlanProblem.tileSiteId). */
  tileSiteId: string
  lat: number
  lon: number
  /**
   * 'near-site': the permanently shadowed ground a rover reaches from that site (where its
   * precomputed route ends); 'psr-floor': the site itself lies in permanent shadow.
   */
  kind: 'near-site' | 'psr-floor'
  /** Drive from the site to that ice, m (0 on a shadowed floor). */
  routeM: number
}

/** Half side of a curated 20 m tile (1024 px), m. */
const TILE_HALF_M = 10_240

/** Sites with a 20 m polar tile and an illumination map (the ice summary is built from it). */
const hasPlannerTile = (s: SiteInfo) =>
  !s.custom && s.hasTerrain && usesPolarProduct(s) && s.ice !== undefined

export function iceTargetsOf(sites: readonly SiteInfo[]): IceTargetOption[] {
  const out: IceTargetOption[] = []
  for (const s of sites) {
    if (!hasPlannerTile(s) || !s.ice?.reachable) continue
    const kind = s.ice.insidePsr ? 'psr-floor' : 'near-site'
    // Without a published end of route the site stands in: the planner snaps the target to the
    // nearest shadowed cell anyway.
    const at = kind === 'near-site' && s.ice.target ? s.ice.target : s
    out.push({
      id: `${kind}:${s.id}`,
      siteId: s.id,
      tileSiteId: s.id,
      lat: at.lat,
      lon: at.lon,
      kind,
      routeM: s.ice.routeM ?? 0,
    })
  }
  return out
}

/**
 * Curated site whose 20 m tile covers a point with room to spare for a search of `radiusM`
 * around it (plus the snap to the ice and the route window), or null. Tiles are centred on
 * their site; with several, the nearest site wins (as catalog.tileFor does).
 */
export function tileForPoint(
  sites: readonly SiteInfo[],
  lat: number,
  lon: number,
  radiusM: number = PLAN_RADII_M[PLAN_RADII_M.length - 1],
): string | null {
  const reach = TILE_HALF_M - radiusM - ICE_TARGET_SNAP_M - ICE_TARGET_MARGIN_M
  let best: string | null = null
  let bestD = Infinity
  for (const s of sites) {
    if (!hasPlannerTile(s)) continue
    const d = surfaceDistance(s.lat, s.lon, lat, lon)
    if (d <= reach && d < bestD) {
      bestD = d
      best = s.id
    }
  }
  return best
}
