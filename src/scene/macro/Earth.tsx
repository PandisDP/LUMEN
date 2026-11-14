import { Html, useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BackSide,
  type BufferGeometry,
  type Mesh,
  RepeatWrapping,
  SRGBColorSpace,
  ShaderMaterial,
  type Texture,
  Vector3,
} from 'three'
import { DEG, HOUR_MS } from '../../astro/constants.ts'
import { DSN_STATIONS, dsnVisibility } from '../../astro/dsn.ts'
import { earthSpin } from './macroGeometry.ts'
import { asset } from '../../data/catalog.ts'
import { useT } from '../../i18n/index.ts'

const DAY_MS = 24 * HOUR_MS

/**
 * Earth seen from the Moon: day/night terminator driven by the real Sun direction, city lights
 * on the night side, ocean glint, drifting clouds and an atmospheric rim. The texture is spun so
 * the sub-solar longitude faces the Sun at the scenario's UTC time, which makes the visible
 * phase and the continents facing the Moon plausible (Earth's tilt is ignored: it only shifts the
 * terminator by up to 23°, and the label already says it is not to scale).
 */

const VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewW;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewW = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
    #include <logdepthbuf_vertex>
  }
`

const SURFACE_FRAG = /* glsl */ `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform sampler2D specMap;
  uniform sampler2D cloudMap;
  uniform vec3 sunDir;
  uniform float cloudOffset;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewW;
  #include <logdepthbuf_pars_fragment>
  void main() {
    #include <logdepthbuf_fragment>
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(vViewW);
    vec3 l = normalize(sunDir);
    float ndl = dot(n, l);
    float diffuse = max(ndl, 0.0);
    float dayMix = smoothstep(-0.12, 0.18, ndl);

    vec3 day = texture2D(dayMap, vUv).rgb;
    // A little extra saturation: the blue marble reads better at the small size it is drawn.
    day = mix(vec3(dot(day, vec3(0.299, 0.587, 0.114))), day, 1.2);
    vec3 night = texture2D(nightMap, vUv).rgb;
    float ocean = texture2D(specMap, vUv).r;
    vec4 c = texture2D(cloudMap, vUv + vec2(cloudOffset, 0.0));
    float cloud = clamp(c.r * c.a, 0.0, 1.0);

    vec3 color = day * (0.015 + diffuse * 1.25);
    color = mix(color, vec3(0.015 + diffuse * 1.35), cloud * 0.85);

    vec3 h = normalize(l + v);
    float nh = max(dot(n, h), 0.0);
    // Sharp sun glint plus a faint wide sheen, only over open (cloud-free) ocean.
    float glint = (pow(nh, 400.0) * 0.45 + pow(nh, 24.0) * 0.05) * ocean * (1.0 - cloud);
    color += vec3(1.0, 0.93, 0.8) * glint * smoothstep(0.0, 0.15, ndl);

    color += night * vec3(1.0, 0.78, 0.5) * 1.8 * (1.0 - dayMix) * (1.0 - cloud * 0.85);

    // Warm twilight band along the terminator.
    float twilight = smoothstep(-0.16, 0.0, ndl) * (1.0 - smoothstep(0.0, 0.22, ndl));
    color += vec3(1.0, 0.5, 0.25) * twilight * 0.07;

    float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    color += vec3(0.32, 0.6, 1.0) * rim * smoothstep(-0.35, 0.5, ndl) * 1.7;

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const ATMOSPHERE_FRAG = /* glsl */ `
  uniform vec3 sunDir;
  uniform float inner;
  varying vec3 vNormalW;
  varying vec3 vViewW;
  #include <logdepthbuf_pars_fragment>
  void main() {
    #include <logdepthbuf_fragment>
    vec3 n = normalize(vNormalW);
    // Back faces of the outer shell: 0 at the shell's edge, 'inner' at the planet's limb.
    float d = clamp(-dot(n, normalize(vViewW)), 0.0, 1.0);
    float glow = pow(smoothstep(0.0, inner, d), 2.2);
    float lit = smoothstep(-0.45, 0.4, dot(n, normalize(sunDir)));
    vec3 color = mix(vec3(0.25, 0.5, 1.0), vec3(0.55, 0.78, 1.0), lit);
    gl_FragColor = vec4(color * glow * lit * 1.8, glow * lit);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const ATMOSPHERE_SCALE = 1.09

function prepare(t: Texture, srgb: boolean) {
  if (srgb) t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
}

/**
 * The shaded globe on its own (surface + atmosphere shell), lit only by `sunDir` (a world-space
 * direction towards the Sun). Shared by the orbital view and the surface sky.
 */
export function EarthGlobe({
  radius,
  sunDir,
  timeMs,
  segments = 96,
}: {
  radius: number
  sunDir: Vector3
  timeMs: number
  segments?: number
}) {
  const [day, night, spec, clouds] = useTexture(
    [
      asset('textures/earth_day.jpg'),
      asset('textures/earth_night.png'),
      asset('textures/earth_specular.jpg'),
      asset('textures/earth_clouds.png'),
    ],
    (tex) => {
      const list = Array.isArray(tex) ? tex : [tex]
      list.forEach((x, i) => prepare(x, i < 2))
      if (list[3]) list[3].wrapS = RepeatWrapping
    },
  )

  const surface = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: SURFACE_FRAG,
        uniforms: {
          dayMap: { value: day },
          nightMap: { value: night },
          specMap: { value: spec },
          cloudMap: { value: clouds },
          sunDir: { value: new Vector3(1, 0, 0) },
          cloudOffset: { value: 0 },
        },
      }),
    [day, night, spec, clouds],
  )

  const atmosphere = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: ATMOSPHERE_FRAG,
        uniforms: {
          sunDir: { value: new Vector3(1, 0, 0) },
          inner: { value: Math.sqrt(1 - 1 / (ATMOSPHERE_SCALE * ATMOSPHERE_SCALE)) },
        },
        side: BackSide,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    [],
  )

  const surfaceMesh = useRef<Mesh<BufferGeometry, ShaderMaterial>>(null)
  const atmosphereMesh = useRef<Mesh<BufferGeometry, ShaderMaterial>>(null)
  useFrame(() => {
    const s = surfaceMesh.current?.material
    const a = atmosphereMesh.current?.material
    if (!s || !a) return
    s.uniforms.sunDir.value.copy(sunDir)
    a.uniforms.sunDir.value.copy(sunDir)
    // Clouds drift slowly with mission time so a scrub shows them moving.
    s.uniforms.cloudOffset.value = ((timeMs / DAY_MS) * 0.02) % 1
  })
  useEffect(
    () => () => {
      surface.dispose()
      atmosphere.dispose()
    },
    [surface, atmosphere],
  )

  const spin = earthSpin(timeMs, sunDir)

  return (
    <>
      <mesh ref={surfaceMesh} material={surface} rotation={[0, spin, 0]}>
        <sphereGeometry args={[radius, segments, segments]} />
        <DsnMarkers radius={radius} timeMs={timeMs} />
      </mesh>
      <mesh ref={atmosphereMesh} material={atmosphere} scale={ATMOSPHERE_SCALE}>
        <sphereGeometry args={[radius, Math.round(segments * 0.67), Math.round(segments * 0.67)]} />
      </mesh>
    </>
  )
}

/**
 * The three DSN complexes on the spinning globe (same longitude mapping as the texture, tilt
 * ignored). The station that sees the Moon glows; the others are dimmed.
 */
function DsnMarkers({ radius, timeMs }: { radius: number; timeMs: number }) {
  // Hourly resolution is plenty for a marker and keeps playback from recomputing every frame.
  const hour = Math.floor(timeMs / HOUR_MS)
  const states = useMemo(() => dsnVisibility(new Date(hour * HOUR_MS)), [hour])
  return (
    <>
      {DSN_STATIONS.map((s, k) => {
        const lat = s.lat * DEG
        const lon = s.lon * DEG
        const r = radius * 1.01
        const on = states[k].visible
        return (
          <mesh
            key={s.id}
            position={[
              r * Math.cos(lat) * Math.cos(lon),
              r * Math.sin(lat),
              -r * Math.cos(lat) * Math.sin(lon),
            ]}
          >
            <sphereGeometry args={[radius * (on ? 0.06 : 0.035), 12, 12]} />
            <meshBasicMaterial color={on ? '#ffd23f' : '#5a6475'} toneMapped={false} />
          </mesh>
        )
      })}
    </>
  )
}

/** Earth in the orbital view, with its "not to scale" label. */
export function Earth({
  position,
  radius,
  sunDir,
  timeMs,
}: {
  position: [number, number, number]
  radius: number
  sunDir: Vector3
  timeMs: number
}) {
  const t = useT()
  return (
    <group position={position}>
      <EarthGlobe radius={radius} sunDir={sunDir} timeMs={timeMs} />
      <Html
        center
        distanceFactor={18}
        position={[0, -radius * 1.6, 0]}
        className="label label--earth"
      >
        {t('scene.earthNotToScale')}
      </Html>
    </group>
  )
}
