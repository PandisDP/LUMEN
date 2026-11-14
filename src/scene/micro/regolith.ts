import { useEffect, useMemo } from 'react'
import {
  BufferAttribute,
  type CanvasTexture,
  FrontSide,
  MeshStandardMaterial,
  ShaderChunk,
  type Side,
  Vector2,
} from 'three'
import { canvasTexture, mulberry32 } from '../canvasTexture.ts'

/**
 * Procedural lunar regolith for the surface view. The DEM gives the relief down to a few metres
 * per post; this adds what the eye expects below that: grain, small craters and soft variations
 * of albedo. It's purely cosmetic: lighting, shadows and every metric still come from the DEM.
 */

/** Size of one tile of the detail texture on the ground, m. */
export const REGOLITH_TILE_M = 24
const SIZE = 512

/** Tileable value noise: a lattice of random values, wrapped at `period`, smoothly interpolated. */
function periodicNoise(rand: () => number, period: number) {
  const lattice = new Float32Array(period * period)
  for (let i = 0; i < lattice.length; i++) lattice[i] = rand()
  const at = (x: number, y: number) =>
    lattice[(((y % period) + period) % period) * period + (((x % period) + period) % period)]
  return (u: number, v: number) => {
    const x = u * period
    const y = v * period
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const fx = x - x0
    const fy = y - y0
    const sx = fx * fx * (3 - 2 * fx)
    const sy = fy * fy * (3 - 2 * fy)
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx
    return a + (b - a) * sy
  }
}

interface Regolith {
  map: CanvasTexture
  normalMap: CanvasTexture
}

let cache: Regolith | null | undefined

/** Height field (fractal noise + small craters with raised rims) and the matching albedo. */
function buildFields() {
  const rand = mulberry32(1969)
  const octaves = [4, 8, 16, 32, 64, 128].map((p) => periodicNoise(rand, p))
  const tint = periodicNoise(rand, 3)
  const height = new Float32Array(SIZE * SIZE)
  const albedo = new Float32Array(SIZE * SIZE)
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE
      const v = y / SIZE
      let h = 0
      let fine = 0
      let amp = 1
      octaves.forEach((n, k) => {
        const o = (n(u, v) - 0.5) * amp
        h += o
        // The two broadest octaves (metre-scale swells) stay out of the relief: with the Sun a
        // degree or two up they would turn into large fully shadowed blotches.
        if (k >= 2) fine += o
        amp *= 0.55
      })
      const i = y * SIZE + x
      height[i] = fine * 1.6
      // Darker hollows, lighter crests, plus fine speckle.
      albedo[i] = 0.82 + h * 0.18 + (rand() - 0.5) * 0.07 + (tint(u, v) - 0.5) * 0.1
    }
  }
  // Craters: bowl with a raised rim, wrapped across the tile edges so it stays seamless.
  for (let k = 0; k < 70; k++) {
    const cx = rand() * SIZE
    const cy = rand() * SIZE
    const r = 3 + rand() ** 2.2 * 34
    const depth = r * 0.012 * (0.6 + rand() * 0.6)
    const fresh = rand() < 0.25
    const reach = Math.ceil(r * 1.6)
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const d = Math.hypot(dx, dy) / r
        if (d > 1.6) continue
        const x = (((Math.round(cx) + dx) % SIZE) + SIZE) % SIZE
        const y = (((Math.round(cy) + dy) % SIZE) + SIZE) % SIZE
        const i = y * SIZE + x
        const bowl = d < 1 ? (d * d - 1) * depth : 0
        const rim = d >= 0.8 ? Math.exp(-((d - 1.05) ** 2) / 0.03) * depth * 0.35 : 0
        height[i] += bowl + rim
        // Young craters keep a brighter halo of ejecta.
        if (fresh && d < 1.5) albedo[i] += 0.08 * (1 - d / 1.5)
      }
    }
  }
  return { height, albedo }
}

function buildRegolith(): Regolith | null {
  const { height, albedo } = buildFields()
  const map = canvasTexture(
    SIZE,
    (ctx, s) => {
      const img = ctx.createImageData(s, s)
      for (let i = 0; i < s * s; i++) {
        const a = Math.max(0, Math.min(1, albedo[i])) * 255
        // Very slightly warm grey (highland regolith), never saturated.
        img.data[i * 4] = a
        img.data[i * 4 + 1] = a * 0.985
        img.data[i * 4 + 2] = a * 0.955
        img.data[i * 4 + 3] = 255
      }
      ctx.putImageData(img, 0, 0)
    },
    { repeat: true },
  )
  const normalMap = canvasTexture(
    SIZE,
    (ctx, s) => {
      const img = ctx.createImageData(s, s)
      const h = (x: number, y: number) => height[(((y + s) % s) * s + ((x + s) % s)) | 0]
      const strength = 26
      for (let y = 0; y < s; y++) {
        for (let x = 0; x < s; x++) {
          const nx = (h(x - 1, y) - h(x + 1, y)) * strength
          const ny = (h(x, y + 1) - h(x, y - 1)) * strength
          const len = Math.hypot(nx, ny, 1)
          const i = (y * s + x) * 4
          img.data[i] = (nx / len) * 127.5 + 127.5
          img.data[i + 1] = (ny / len) * 127.5 + 127.5
          img.data[i + 2] = (1 / len) * 127.5 + 127.5
          img.data[i + 3] = 255
        }
      }
      ctx.putImageData(img, 0, 0)
    },
    { srgb: false, repeat: true },
  )
  if (!map || !normalMap) {
    map?.dispose()
    normalMap?.dispose()
    return null
  }
  return { map, normalMap }
}

/** The textures are built on first use and kept for the session (they are small: 2 × 1 MB). */
export function regolithTextures(): Regolith | null {
  if (cache === undefined) cache = buildRegolith()
  return cache
}

/** Planar UVs from the scene's horizontal coordinates (x = east, z = −north), in tiles. */
export function planarUv(positions: ArrayLike<number>, tileM = REGOLITH_TILE_M) {
  const n = positions.length / 3
  const uv = new Float32Array(n * 2)
  for (let i = 0; i < n; i++) {
    uv[i * 2] = positions[i * 3] / tileM
    uv[i * 2 + 1] = positions[i * 3 + 2] / tileM
  }
  return new BufferAttribute(uv, 2)
}

/**
 * Replaces the single texture lookup with three scales of the same tile: fine grain near the
 * camera, a 9× coarser layer further away and a very broad one that breaks up repetition. The
 * coefficients keep the mean albedo near 1, so `color` sets the overall brightness.
 */
const MAP_FRAGMENT = /* glsl */ `
#ifdef USE_MAP
  float regDist = length(vViewPosition);
  vec3 regNear = texture2D(map, vMapUv).rgb;
  vec3 regMid = texture2D(map, vMapUv * 0.111 + vec2(0.37, 0.61)).rgb;
  vec3 regFar = texture2D(map, vMapUv * 0.0137 + vec2(0.71, 0.13)).rgb;
  float regNearW = 1.0 - smoothstep(40.0, 500.0, regDist);
  vec3 regColor = mix(regMid, regNear, regNearW);
  regColor *= 0.45 + 0.68 * regFar;
  diffuseColor.rgb *= regColor;
#endif
`

/**
 * Grain relief only near the camera: further away the normal map would alias into shimmering
 * noise, and beyond a few hundred metres the DEM relief alone shades the ground.
 */
const NORMAL_FRAGMENT = ShaderChunk.normal_fragment_maps.replace(
  'mapN.xy *= normalScale;',
  'mapN.xy *= normalScale * (1.0 - smoothstep(10.0, 300.0, length(vViewPosition)));',
)

const RELIEF = 0.5

/**
 * Strength of the grain relief for a given solar elevation. With the Sun a degree or two above
 * the horizon, any facet tilted a little away from it goes black, so full-strength relief turns
 * the ground into high-contrast blotches; it is eased in as the Sun climbs (full at ~10°).
 */
export function setRegolithSunElevation(material: MeshStandardMaterial, sunElDeg: number) {
  const k = Math.min(1, Math.max(0.12, (sunElDeg - 0.5) / 9.5))
  material.normalScale.set(RELIEF * k, RELIEF * k)
}

/** Standard material with the regolith maps; one per mesh, disposed with the component. */
export function useRegolithMaterial(color: string, side: Side = FrontSide) {
  const material = useMemo(() => {
    const tex = regolithTextures()
    const m = new MeshStandardMaterial({
      color,
      roughness: 0.96,
      metalness: 0,
      map: tex?.map ?? null,
      normalMap: tex?.normalMap ?? null,
      normalScale: new Vector2(RELIEF, RELIEF),
      side,
    })
    m.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <map_fragment>', MAP_FRAGMENT)
        .replace('#include <normal_fragment_maps>', NORMAL_FRAGMENT)
    }
    m.customProgramCacheKey = () => 'regolith-v4'
    return m
  }, [color, side])
  useEffect(() => () => material.dispose(), [material])
  return material
}
