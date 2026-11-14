import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, ShaderMaterial, type Sprite, type SpriteMaterial } from 'three'
import { glowTexture, prefersReducedMotion, raysTexture } from './canvasTexture.ts'

const RAYS_SCALE = 16

/**
 * Solar disc with limb darkening (whiter, brighter centre; warmer, dimmer edge), so the Sun reads
 * as a sphere instead of a flat white dot. Includes the log-depth chunks the canvas uses.
 */
const DISC_VERT = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vV = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
    #include <logdepthbuf_vertex>
  }
`
const DISC_FRAG = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  #include <logdepthbuf_pars_fragment>
  void main() {
    #include <logdepthbuf_fragment>
    float mu = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
    // Eddington-like law: I(mu) = 1 - 0.6 (1 - mu).
    float limb = 1.0 - 0.6 * (1.0 - mu);
    vec3 core = vec3(1.0, 0.985, 0.93);
    vec3 edge = vec3(1.0, 0.72, 0.38);
    gl_FragColor = vec4(mix(edge, core, pow(mu, 0.6)) * (0.55 + 0.75 * limb), 1.0);
  }
`

/**
 * The Sun as a bright disc with a halo and a slowly turning corona. No post-processing: additive
 * sprites read as glare against the black sky and cost nothing. `strength` (0–1) dims the glare,
 * e.g. by the visible fraction of the disc when a ridge covers part of it. Used by the orbital
 * and the surface scenes.
 */
export function SunGlare({
  radius,
  strength = 1,
  scale = 1,
}: {
  radius: number
  strength?: number
  /** Multiplier on the size of the halo sprites (the disc keeps `radius`). */
  scale?: number
}) {
  const textures = useMemo(
    () => ({
      halo: glowTexture([
        [0, 'rgba(255,250,235,1)'],
        [0.12, 'rgba(255,236,190,0.9)'],
        [0.35, 'rgba(255,196,105,0.32)'],
        [1, 'rgba(255,170,60,0)'],
      ]),
      corona: glowTexture([
        [0, 'rgba(255,225,170,0.35)'],
        [0.4, 'rgba(255,190,110,0.08)'],
        [1, 'rgba(255,160,60,0)'],
      ]),
      rays: raysTexture(),
    }),
    [],
  )
  useEffect(() => () => Object.values(textures).forEach((x) => x?.dispose()), [textures])

  const disc = useMemo(
    () =>
      new ShaderMaterial({ vertexShader: DISC_VERT, fragmentShader: DISC_FRAG, toneMapped: false }),
    [],
  )
  useEffect(() => () => disc.dispose(), [disc])

  const rays = useRef<Sprite>(null)
  const still = useMemo(() => prefersReducedMotion(), [])
  const s = radius * scale
  useFrame((state) => {
    if (!rays.current || still) return
    const time = state.clock.elapsedTime
    ;(rays.current.material as SpriteMaterial).rotation = time * 0.02
    rays.current.scale.setScalar(s * RAYS_SCALE * (1 + Math.sin(time * 0.8) * 0.03))
  })

  const sprite = (
    map: NonNullable<typeof textures.halo>,
    size: number,
    opacity: number,
    ref?: React.Ref<Sprite>,
  ) => (
    <sprite ref={ref} scale={size}>
      <spriteMaterial
        map={map}
        blending={AdditiveBlending}
        depthWrite={false}
        transparent
        toneMapped={false}
        opacity={opacity * strength}
      />
    </sprite>
  )

  return (
    <>
      <mesh>
        <sphereGeometry args={[radius, 32, 32]} />
        <primitive object={disc} attach="material" />
      </mesh>
      {strength > 0 && (
        <>
          {textures.corona && sprite(textures.corona, s * 30, 1)}
          {textures.halo && sprite(textures.halo, s * 7, 1)}
          {textures.rays && sprite(textures.rays, s * RAYS_SCALE, 0.55, rays)}
        </>
      )}
    </>
  )
}
