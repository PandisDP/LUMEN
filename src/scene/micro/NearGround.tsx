import type { DemGrid } from '../../astro/dem.ts'
import type { SiteDetail } from '../../data/catalog.ts'

/**
 * Placeholder: decorative close-range ground (micro-relief and rocks) around the rover, or
 * around the lander when `follow` is 'lander'. `route` is the rover path in scene coordinates
 * (kept clear of rocks).
 */
export function NearGround(props: {
  detail: SiteDetail
  grids: DemGrid[]
  follow: 'rover' | 'lander'
  route?: readonly (readonly [number, number, number])[]
  sunElDeg: number
}) {
  void props
  return null
}
