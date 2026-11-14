import { southPolarToMap } from '../../astro/frames.ts'
import { ILLUM_NODATA, type IllumGrid, illumPct } from '../../astro/illumination.ts'
import { mapToPixel } from '../../astro/dem.ts'
import type { Site } from '../../astro/ephemeris.ts'

/**
 * Yearly illumination layer. Permanently shadowed ground is blue with diagonal stripes (so it
 * reads without colour); lit ground goes from dark grey (rarely lit) to warm yellow (almost
 * always lit). Same vertex order as buildTerrainGeometry, with a baked hillshade like the
 * slope layer.
 */
export const ILLUM_COLORS = { psr: '#2f6bd8', dim: '#3a3a3a', bright: '#ffd23f' } as const

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
const PSR = rgb(ILLUM_COLORS.psr)
const DIM = rgb(ILLUM_COLORS.dim)
const BRIGHT = rgb(ILLUM_COLORS.bright)
const L = (() => {
  const v = [-0.5, 0.8, -0.5]
  const n = Math.hypot(v[0], v[1], v[2])
  return v.map((x) => x / n)
})()
const STRIPE_M = 120

export function illumVertexColors(
  illum: IllumGrid,
  site: Site,
  halfSizeM: number,
  segments: number,
  normals: ArrayLike<number>,
) {
  const n = segments + 1
  const out = new Float32Array(n * n * 3)
  const center = southPolarToMap(site.lat, site.lon)
  const step = (2 * halfSizeM) / segments
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const i = r * n + c
      const x = center.x - halfSizeM + c * step
      const y = center.y + halfSizeM - r * step
      const p = mapToPixel(illum, x, y)
      const ic = Math.round(p.c)
      const ir = Math.round(p.r)
      const v =
        ic >= 0 && ir >= 0 && ic < illum.width && ir < illum.height
          ? illum.data[ir * illum.width + ic]
          : ILLUM_NODATA
      let col: number[]
      if (v === ILLUM_NODATA) col = DIM
      else if (v === 0) {
        const stripe = Math.floor((x + y) / STRIPE_M) % 2 === 0
        col = stripe ? PSR : PSR.map((k) => k * 0.6)
      } else {
        const f = Math.min(1, illumPct(v) / 100)
        col = DIM.map((k, j) => k + (BRIGHT[j] - k) * Math.sqrt(f))
      }
      const shade =
        0.45 +
        0.55 *
          Math.max(0, normals[i * 3] * L[0] + normals[i * 3 + 1] * L[1] + normals[i * 3 + 2] * L[2])
      out[i * 3] = col[0] * shade
      out[i * 3 + 1] = col[1] * shade
      out[i * 3 + 2] = col[2] * shade
    }
  }
  return out
}
