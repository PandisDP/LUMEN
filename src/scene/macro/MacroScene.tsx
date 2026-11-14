import { Html, Line, OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { type ComponentRef, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { type DirectionalLight, type Object3D, Vector3 } from 'three'
import { HOUR_MS } from '../../astro/constants.ts'
import { bodyFixedEphemeris } from '../../astro/ephemeris.ts'
import { norm } from '../../astro/frames.ts'
import { MACRO_DEM } from '../../data/catalog.ts'
import { useImageryIndex, useMosaicTexture } from '../../data/loadImagery.ts'
import { useAsync } from '../../hooks/useAsync.ts'
import { useT } from '../../i18n/index.ts'
import { useSiteText } from '../../i18n/sites.ts'
import { selectActiveScenario, useMissionStore } from '../../store/useMissionStore.ts'
import { useViewStore } from '../../store/useViewStore.ts'
import { loadDem } from '../../data/loadDem.ts'
import { Starfield } from '../Starfield.tsx'
import { Earth } from './Earth.tsx'
import { Sun } from './Sun.tsx'
import { bodyToScene, globeGeometry, polarCapGeometry, surfacePoint } from './macroGeometry.ts'

/** Relief exaggeration in the orbital view (the true 10 km of relief is 0.6 % of the radius). */
export const MACRO_EXAGGERATION = 2.5
const SOUTH_POLE = new Vector3(0, -1, 0)
const EARTH_DISPLAY = { distance: 14, radius: 1.1 }
const SUN_DISPLAY_DISTANCE = 60

/**
 * Camera for "Sun / Earth behind the Moon": on the far side of the pole from the body, a little
 * below it, aiming between the pole and the body so both share the frame.
 */
function backdropCamera(dir: Vector3) {
  const d = dir.clone().normalize()
  const camera = SOUTH_POLE.clone()
    .addScaledVector(d, -0.95)
    .add(new Vector3(0, -0.16, 0))
  const target = SOUTH_POLE.clone().addScaledVector(d, 0.35)
  return { camera, target }
}

/** "Lunar south pole" tag plus the 85°S circle, so it is clear which part of the Moon this is. */
function PoleMarker() {
  const t = useT()
  const ring = useMemo(
    () =>
      Array.from({ length: 73 }, (_, i) => {
        const [x, y, z] = surfacePoint(-85, i * 5, 0, MACRO_EXAGGERATION)
        return new Vector3(x, y, z).multiplyScalar(1.004)
      }),
    [],
  )
  return (
    <>
      <Line
        points={ring}
        color="#9be7ff"
        lineWidth={1}
        transparent
        opacity={0.45}
        dashed
        dashSize={0.01}
        gapSize={0.008}
      />
      <group position={SOUTH_POLE.clone().multiplyScalar(1.012)}>
        <mesh>
          <sphereGeometry args={[0.004, 12, 12]} />
          <meshBasicMaterial color="#9be7ff" toneMapped={false} />
        </mesh>
        <Html
          center
          distanceFactor={0.8}
          className="label label--pole"
          style={{ pointerEvents: 'none' }}
        >
          {t('scene.southPole')}
        </Html>
      </group>
    </>
  )
}

/** Moon Trek LRO WAC global mosaic; plain grey until (or if never) it loads. */
function Globe() {
  const map = useMosaicTexture(useImageryIndex()?.globe)
  const geometry = useMemo(() => globeGeometry(), [])
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial
        key={map ? 'map' : 'plain'}
        map={map}
        color={map ? '#ffffff' : '#9c9a96'}
        roughness={1}
        metalness={0}
      />
    </mesh>
  )
}

/** LOLA relief of the pole, draped with the Moon Trek LRO WAC south pole mosaic. */
function PolarCap() {
  const { data: dem } = useAsync('macro-dem', () => loadDem(MACRO_DEM.bin, MACRO_DEM.meta))
  const capRef = useImageryIndex()?.cap
  const map = useMosaicTexture(capRef)
  const extent = map ? capRef?.extent : undefined
  const geometry = useMemo(
    () => (dem ? polarCapGeometry(dem, 2, MACRO_EXAGGERATION, extent) : null),
    [dem, extent],
  )
  useEffect(() => () => geometry?.dispose(), [geometry])
  if (!geometry) return null
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      {/* Without the mosaic: albedo close to the WAC mosaic around 75°S. */}
      <meshStandardMaterial
        key={map ? 'map' : 'plain'}
        map={map}
        color={map ? '#ffffff' : '#cfccc5'}
        roughness={1}
        metalness={0}
      />
    </mesh>
  )
}

function SiteMarkers({ onPick }: { onPick: (id: string, pos: Vector3) => void }) {
  const sites = useMissionStore((s) => s.sites)
  const activeSiteId = useMissionStore((s) => selectActiveScenario(s).siteId)
  const [hover, setHover] = useState<string | null>(null)
  const siteText = useSiteText()
  return (
    <>
      {sites.map((site) => {
        const p = surfacePoint(site.lat, site.lon, site.heightM, MACRO_EXAGGERATION)
        const pos = new Vector3(...p).multiplyScalar(1.0015)
        const active = site.id === activeSiteId
        const polar = site.category === 'south-pole'
        return (
          <group key={site.id} position={pos}>
            <mesh
              onClick={(e) => {
                e.stopPropagation()
                onPick(site.id, pos)
              }}
              onPointerOver={() => setHover(site.id)}
              onPointerOut={() => setHover(null)}
            >
              <sphereGeometry args={[active ? 0.006 : 0.004, 16, 16]} />
              <meshBasicMaterial
                color={active ? '#ffc94d' : polar ? '#4da6ff' : '#9aa8bd'}
                toneMapped={false}
              />
            </mesh>
            {(active || hover === site.id) && (
              <Html
                className={active ? 'label label--active' : 'label'}
                distanceFactor={1.2}
                style={{ pointerEvents: 'none' }}
                occlude
              >
                {siteText(site)?.name}
              </Html>
            )}
          </group>
        )
      })}
    </>
  )
}

/** Orbital context view: lit Moon, LOLA south polar relief, sites, Sun and Earth directions. */
export function MacroScene() {
  const scenario = useMissionStore(selectActiveScenario)
  const offsetH = useMissionStore((s) => s.offsetH)
  const setView = useMissionStore((s) => s.setView)
  const selectSite = useMissionStore((s) => s.selectSite)
  const timeMs = scenario.startMs + offsetH * HOUR_MS

  const { sunDir, earthPos } = useMemo(() => {
    const eph = bodyFixedEphemeris(new Date(timeMs))
    const s = bodyToScene(eph.sun)
    const e = bodyToScene(eph.earth)
    const sn = norm(s)
    const en = norm(e)
    return {
      sunDir: new Vector3(s[0] / sn, s[1] / sn, s[2] / sn),
      earthPos: [
        (e[0] / en) * EARTH_DISPLAY.distance,
        (e[1] / en) * EARTH_DISPLAY.distance,
        (e[2] / en) * EARTH_DISPLAY.distance,
      ] as [number, number, number],
    }
  }, [timeMs])

  const lightRef = useRef<DirectionalLight>(null)
  const targetRef = useRef<Object3D>(null)
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null)
  const fly = useRef<{
    from: Vector3
    to: Vector3
    camFrom: Vector3
    camTo: Vector3
    t: number
    /** Land on the surface view when the flight ends (site picks, not framings). */
    thenMicro: boolean
  } | null>(null)

  useEffect(() => {
    if (lightRef.current && targetRef.current) lightRef.current.target = targetRef.current
  }, [])

  // "Sun behind" / "Earth behind": fly to a framing with the body behind the pole. Reads the
  // current directions through a ref so the camera doesn't chase the bodies while time plays.
  const bodies = useRef({ sunDir, earthPos })
  useEffect(() => {
    bodies.current = { sunDir, earthPos }
  })
  const frameNonce = useViewStore((s) => s.frameNonce)
  useEffect(() => {
    const frame = useViewStore.getState().macroFrame
    const controls = controlsRef.current
    if (frame === 'free' || !controls) return
    const { sunDir: s, earthPos: e } = bodies.current
    const { camera, target } = backdropCamera(frame === 'sun' ? s : new Vector3(...e))
    fly.current = {
      from: controls.target.clone(),
      to: target,
      camFrom: controls.object.position.clone(),
      camTo: camera,
      t: 0,
      thenMicro: false,
    }
  }, [frameNonce])

  const onPick = (id: string, pos: Vector3) => {
    selectSite(id)
    const controls = controlsRef.current
    if (!controls) return
    const camTo = pos
      .clone()
      .multiplyScalar(1.06)
      .add(new Vector3(0.02, 0, 0.02))
    fly.current = {
      from: controls.target.clone(),
      to: pos.clone(),
      camFrom: controls.object.position.clone(),
      camTo,
      t: 0,
      thenMicro: true,
    }
  }

  useFrame((_, delta) => {
    const f = fly.current
    const controls = controlsRef.current
    if (!f || !controls) return
    f.t = Math.min(1, f.t + delta / 1.4)
    const k = f.t * f.t * (3 - 2 * f.t)
    controls.target.lerpVectors(f.from, f.to, k)
    controls.object.position.lerpVectors(f.camFrom, f.camTo, k)
    controls.update()
    if (f.t >= 1) {
      fly.current = null
      if (f.thenMicro) setView('micro')
    }
  })

  const lightPos = SOUTH_POLE.clone().addScaledVector(sunDir, 4)
  const sunPos = sunDir.clone().multiplyScalar(SUN_DISPLAY_DISTANCE)

  return (
    <>
      <PerspectiveCamera
        makeDefault
        position={[0.9, -1.75, 0.55]}
        fov={45}
        near={0.001}
        far={500}
      />
      <color attach="background" args={['#00010a']} />
      <ambientLight intensity={0.04} />
      <object3D ref={targetRef} position={SOUTH_POLE} />
      <directionalLight
        ref={lightRef}
        position={lightPos}
        intensity={3}
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-camera-left={-0.3}
        shadow-camera-right={0.3}
        shadow-camera-top={0.3}
        shadow-camera-bottom={-0.3}
        shadow-camera-near={0.5}
        shadow-camera-far={8}
        shadow-bias={-0.0004}
        shadow-normalBias={0.0012}
      />
      {/* Earthshine: a faint bluish fill from the Earth's direction on the Moon's night side. */}
      <directionalLight position={earthPos} intensity={0.08} color="#9cc4ff" />
      <Starfield />
      <Sun position={sunPos} radius={0.8} />
      <Suspense fallback={null}>
        <Globe />
      </Suspense>
      <Suspense fallback={null}>
        <Earth position={earthPos} radius={EARTH_DISPLAY.radius} sunDir={sunDir} timeMs={timeMs} />
      </Suspense>
      <PolarCap />
      <PoleMarker />
      <SiteMarkers onPick={onPick} />
      <OrbitControls
        ref={controlsRef}
        makeDefault
        target={SOUTH_POLE}
        enablePan={false}
        enableDamping
        minDistance={0.04}
        maxDistance={8}
        zoomSpeed={0.8}
        onStart={() => useViewStore.setState({ macroFrame: 'free' })}
      />
    </>
  )
}
