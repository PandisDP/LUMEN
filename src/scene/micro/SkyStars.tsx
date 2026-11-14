import { useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { AdditiveBlending, BufferAttribute, BufferGeometry, ShaderMaterial, Vector3 } from 'three'
import { mulberry32 } from '../canvasTexture.ts'

const FIELD_STARS = 4200
const BAND_STARS = 5200
const RADIUS = 200_000

/** Galactic pole direction for the faint band (cosmetic: no real sky catalogue is used). */
const BAND_POLE = new Vector3(0.35, 0.55, -0.76).normalize()

/** Star tints from cool red to hot blue-white (blackbody-ish, kept desaturated). */
const TINTS = [
  [1.0, 0.82, 0.68],
  [1.0, 0.92, 0.82],
  [1.0, 0.98, 0.95],
  [0.92, 0.95, 1.0],
  [0.8, 0.88, 1.0],
] as const

const VERT = /* glsl */ `
  attribute float size;
  attribute vec3 tint;
  uniform float pixelRatio;
  varying vec3 vTint;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main() {
    vTint = tint;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * pixelRatio;
    gl_Position = projectionMatrix * mv;
    #include <logdepthbuf_vertex>
  }
`

const FRAG = /* glsl */ `
  varying vec3 vTint;
  #include <logdepthbuf_pars_fragment>
  void main() {
    #include <logdepthbuf_fragment>
    // Round, soft-edged point: bright core with a short falloff.
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.0, d);
    a *= a;
    gl_FragColor = vec4(vTint * a, a);
  }
`

/**
 * Background stars on a far sphere: brightness follows a steep magnitude distribution (few
 * bright stars, many faint ones), with a slight colour by temperature and a faint band of
 * denser, dimmer stars. Fixed screen size, deterministic layout (no reshuffle between renders).
 */
export function SkyStars() {
  const dpr = useThree((s) => s.viewport.dpr)
  const geometry = useMemo(() => {
    const rand = mulberry32(42)
    const total = FIELD_STARS + BAND_STARS
    const pos = new Float32Array(total * 3)
    const size = new Float32Array(total)
    const tint = new Float32Array(total * 3)
    const v = new Vector3()
    const a = new Vector3()
    const b = new Vector3()
    // Orthonormal basis of the band's plane.
    a.set(1, 0, 0).cross(BAND_POLE).normalize()
    b.copy(BAND_POLE).cross(a).normalize()
    for (let i = 0; i < total; i++) {
      const band = i >= FIELD_STARS
      if (band) {
        // Around a great circle, Gaussian-ish spread of a few degrees.
        const t = rand() * Math.PI * 2
        const spread = (rand() + rand() + rand() - 1.5) * 0.16
        v.copy(a)
          .multiplyScalar(Math.cos(t))
          .addScaledVector(b, Math.sin(t))
          .addScaledVector(BAND_POLE, spread)
          .normalize()
      } else {
        const u = rand() * 2 - 1
        const t = rand() * Math.PI * 2
        const s = Math.sqrt(1 - u * u)
        v.set(s * Math.cos(t), u, s * Math.sin(t))
      }
      pos.set([v.x * RADIUS, v.y * RADIUS, v.z * RADIUS], i * 3)
      // Many faint stars, a handful of bright ones.
      const m = rand() ** (band ? 6 : 3.2)
      size[i] = band ? 1.1 + m * 1.4 : 1.2 + m * 3.6
      const c = TINTS[Math.floor(rand() * TINTS.length)]
      const lum = band ? 0.28 + m * 0.35 : 0.4 + m * 0.75
      tint.set([c[0] * lum, c[1] * lum, c[2] * lum], i * 3)
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(pos, 3))
    g.setAttribute('size', new BufferAttribute(size, 1))
    g.setAttribute('tint', new BufferAttribute(tint, 3))
    return g
  }, [])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: { pixelRatio: { value: dpr } },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    [dpr],
  )
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])

  return <points geometry={geometry} material={material} frustumCulled={false} />
}
