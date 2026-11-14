import { SLOPE_CAUTION_DEG, SLOPE_SAFE_DEG } from '../../astro/slope.ts'

/**
 * Slope classes in an Okabe-Ito based ramp (blue / yellow / vermillion): distinguishable with
 * the common colour-vision deficiencies, and also ordered by lightness.
 */
export const SLOPE_COLORS = {
  safe: '#56b4e9',
  caution: '#f0e442',
  steep: '#d55e00',
} as const

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
const SAFE = rgb(SLOPE_COLORS.safe)
const CAUTION = rgb(SLOPE_COLORS.caution)
const STEEP = rgb(SLOPE_COLORS.steep)

/** Fixed "map" light (from the north-west, high), so the layer reads like a shaded relief. */
const L = (() => {
  const v = [-0.5, 0.8, -0.5]
  const n = Math.hypot(v[0], v[1], v[2])
  return v.map((x) => x / n)
})()

/**
 * Per-vertex colours: slope class × baked hillshade. Used with an unlit material so the layer
 * stays readable during the lunar night, when the scene's real lighting is almost black.
 */
export function slopeVertexColors(slopeDeg: Float32Array, normals: ArrayLike<number>) {
  const out = new Float32Array(slopeDeg.length * 3)
  for (let i = 0; i < slopeDeg.length; i++) {
    const s = slopeDeg[i]
    const c = s < SLOPE_SAFE_DEG ? SAFE : s < SLOPE_CAUTION_DEG ? CAUTION : STEEP
    const shade =
      0.45 +
      0.55 *
        Math.max(0, normals[i * 3] * L[0] + normals[i * 3 + 1] * L[1] + normals[i * 3 + 2] * L[2])
    out[i * 3] = c[0] * shade
    out[i * 3 + 1] = c[1] * shade
    out[i * 3 + 2] = c[2] * shade
  }
  return out
}
