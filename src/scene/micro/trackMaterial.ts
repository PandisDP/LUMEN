import {
  type CanvasTexture,
  ClampToEdgeWrapping,
  MeshStandardMaterial,
  ShaderChunk,
  Vector2,
  Vector4,
} from 'three'
import { canvasTexture } from '../canvasTexture.ts'

/**
 * Look of the wheel tracks: compacted regolith is darker and smoother than the loose soil around
 * it, with the grousers of the wheel printed across it. One texture tile is one repeat of the
 * pattern (u across the tread, v along the route); its alpha softens the edges of the imprint.
 */

/** Grouser bars per repeat of the pattern. */
const BARS = 4
const SIZE = 128
const RELIEF = 0.7
/** Length of one tile over its width (patternM / treadM in trackGeometry.ts). */
const ASPECT = 5
/** Depth of the compacted band and of the grouser grooves, in tread widths. */
const BAND_DEPTH = 0.035
const GROOVE_DEPTH = 0.1

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Compacted band across the tread (0 at the edges, 1 inside). */
const band = (u: number) => smooth(0.02, 0.3, u) * smooth(0.02, 0.3, 1 - u)

/** Chevron grooves left by the grousers (0..1), periodic in v. */
function groove(u: number, v: number) {
  // The chevron points forwards: its apex leads the two ends by 0.3 of the pitch.
  const phase = v * BARS - 0.3 * (1 - Math.abs(2 * u - 1))
  const d = Math.abs(phase - Math.round(phase))
  return Math.exp(-((d / 0.17) ** 2)) * smooth(0.08, 0.26, u) * smooth(0.08, 0.26, 1 - u)
}

/** Relief of the imprint in tread widths (negative = pressed into the soil). */
const relief = (u: number, v: number) => -BAND_DEPTH * band(u) - GROOVE_DEPTH * groove(u, v)

interface TrackTextures {
  map: CanvasTexture
  normalMap: CanvasTexture
}

let cache: TrackTextures | null | undefined

function fill(
  ctx: CanvasRenderingContext2D,
  s: number,
  texel: (u: number, v: number) => readonly [number, number, number, number],
) {
  const img = ctx.createImageData(s, s)
  for (let py = 0; py < s; py++) {
    for (let px = 0; px < s; px++) {
      // Canvas textures are flipped: the top row is v = 1.
      const c = texel((px + 0.5) / s, 1 - (py + 0.5) / s)
      const i = (py * s + px) * 4
      img.data[i] = c[0]
      img.data[i + 1] = c[1]
      img.data[i + 2] = c[2]
      img.data[i + 3] = c[3]
    }
  }
  ctx.putImageData(img, 0, 0)
}

function trackTextures() {
  if (cache !== undefined) return cache
  // Albedo: the pressed soil is darker, the grooves a little more (their relief is in the normal
  // map: strong albedo bars would turn into a dotted line from afar); alpha fades the edges out.
  const map = canvasTexture(
    SIZE,
    (ctx, s) =>
      fill(ctx, s, (u, v) => {
        const g = groove(u, v)
        const shade = 124 - 14 * g
        return [shade, shade * 0.97, shade * 0.93, 255 * band(u) * (0.6 + 0.12 * g)]
      }),
    { repeat: true },
  )
  // Tangent-space normals of the relief: at a grazing Sun the walls of the grooves that face it
  // light up and the others go dark, which is what makes real tracks stand out near the poles.
  const normalMap = canvasTexture(
    SIZE,
    (ctx, s) =>
      fill(ctx, s, (u, v) => {
        const e = 0.5 / s
        const du = (relief(u + e, v) - relief(u - e, v)) / (2 * e)
        const dv = (relief(u, v + e) - relief(u, v - e)) / (2 * e) / ASPECT
        const l = Math.hypot(du, dv, 1)
        return [127.5 - (127.5 * du) / l, 127.5 - (127.5 * dv) / l, 127.5 + 127.5 / l, 255]
      }),
    { srgb: false, repeat: true },
  )
  cache = map && normalMap ? { map, normalMap } : null
  if (cache) cache.map.wrapS = cache.normalMap.wrapS = ClampToEdgeWrapping
  return cache
}

export interface TrackMaterial {
  material: MeshStandardMaterial
  /**
   * Shows the tracks between `fromM` and `toM` driven metres (the last stretch fades in), and
   * keeps them at least a pixel wide: `pixelAngle` is the size of a pixel at unit distance.
   */
  update: (fromM: number, toM: number, pixelAngle: number) => void
}

/** Lit, shadow-receiving decal material for the ribbons of trackGeometry.ts. */
export function createTrackMaterial(treadM: number): TrackMaterial {
  /** x: start, y: end of the visible stretch (m driven); z: pixel angle; w: half tread, m. */
  const reveal = new Vector4(0, 0, 0, treadM / 2)
  const tex = trackTextures()
  const material = new MeshStandardMaterial({
    color: '#ffffff',
    map: tex?.map ?? null,
    normalMap: tex?.normalMap ?? null,
    normalScale: new Vector2(RELIEF, RELIEF),
    roughness: 0.82,
    metalness: 0,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uReveal = { value: reveal }
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        attribute float dist;
        attribute vec2 edge;
        uniform vec4 uReveal;
        varying float vDist;`,
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `vec3 transformed = vec3(position);
        vDist = dist;
        {
          // From far away a tread is thinner than a pixel and would flicker: widen it to one.
          float away = -(modelViewMatrix * vec4(position, 1.0)).z;
          transformed.xz += edge * max(0.0, away * uReveal.z * 0.75 - uReveal.w);
        }`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        uniform vec4 uReveal;
        varying float vDist;`,
      )
      .replace(
        '#include <map_fragment>',
        /* glsl */ `#include <map_fragment>
        if (vDist > uReveal.y || vDist < uReveal.x) discard;
        diffuseColor.a *= (1.0 - smoothstep(uReveal.y - 0.4, uReveal.y, vDist))
          * smoothstep(uReveal.x, uReveal.x + 0.4, vDist);`,
      )
      // The grouser relief is only resolved from close by; further away it would shimmer.
      .replace(
        '#include <normal_fragment_maps>',
        ShaderChunk.normal_fragment_maps.replace(
          'mapN.xy *= normalScale;',
          'mapN.xy *= normalScale * (1.0 - smoothstep(5.0, 30.0, length(vViewPosition)));',
        ),
      )
      // The depth buffer is logarithmic (polygonOffset has no say over gl_FragDepth): pull the
      // decal 0.15 % of its distance towards the eye so it never fights the ground under it.
      .replace(
        '#include <logdepthbuf_fragment>',
        /* glsl */ `#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
          gl_FragDepth = vIsPerspective == 0.0
            ? gl_FragCoord.z
            : log2(vFragDepth * 0.9985) * logDepthBufFC * 0.5;
        #endif`,
      )
  }
  material.customProgramCacheKey = () => 'rover-tracks-v5'
  return {
    material,
    update: (fromM, toM, pixelAngle) => {
      reveal.set(fromM, toM, pixelAngle, treadM / 2)
    },
  }
}
