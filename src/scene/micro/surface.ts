import { maskAt } from '../../astro/horizon.ts'
import type { InstantState } from '../../astro/instant.ts'
import type { SiteDetail } from '../../data/catalog.ts'

/** Half side of the local terrain patch, m: the 20 m tile where there is one, else coarser. */
export const surfaceHalfSize = (detail: SiteDetail) => (detail.terrain ? 10_000 : 15_000)

/** Pose the surface view opens with: towards the Sun, just above it or the ridge hiding it. */
export function landedPose(instant: InstantState, detail: SiteDetail) {
  const { az, el } = instant.sky.sun
  return { az, el: Math.max(el, maskAt(detail.mask, az)) + 1 }
}
