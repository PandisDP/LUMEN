import type { DemGrid } from '../../astro/dem.ts'
import type { TraverseResult } from '../../astro/traverse.ts'
import type { SiteDetail } from '../../data/catalog.ts'

/** Placeholder: wheel tracks left behind the rover and the dust its wheels throw. */
export function RoverTracks(props: {
  detail: SiteDetail
  grids: DemGrid[]
  traverse: TraverseResult
}) {
  void props
  return null
}
