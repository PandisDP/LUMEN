import { Html, Line, PerspectiveCamera } from '@react-three/drei'
import { type ThreeEvent, useFrame } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import {
  BufferAttribute,
  BufferGeometry,
  type DirectionalLight,
  DoubleSide,
  type Object3D,
  Vector3,
} from 'three'
import { DEG } from '../../astro/constants.ts'
import { southPolarToMap } from '../../astro/frames.ts'
import { terrainGridUv } from '../../astro/imagery.ts'
import { maskAt } from '../../astro/horizon.ts'
import type { InstantState } from '../../astro/instant.ts'
import type { SiteSeries } from '../../astro/series.ts'
import {
  buildFlatGeometry,
  buildHorizonRing,
  buildTerrainGeometry,
  sceneToLatLon,
  skyPoint,
} from '../../astro/terrainMesh.ts'
import type { SiteDetail } from '../../data/catalog.ts'
import { terrainTileId, useImageryIndex, useMosaicTexture } from '../../data/loadImagery.ts'
import { useInstant } from '../../hooks/useScenario.ts'
import { useTerrainGrids } from '../../hooks/useTerrain.ts'
import { useT } from '../../i18n/index.ts'
import { FOV, selectActiveScenario, useMissionStore } from '../../store/useMissionStore.ts'
import { useDescentStore } from '../../store/useDescentStore.ts'
import { useViewStore } from '../../store/useViewStore.ts'
import { DescentControls } from './DescentControls.tsx'
import { RoverRig } from './Rover.tsx'
import { roverTelemetry } from './roverTelemetry.ts'
import { useRoverTraverse } from '../../hooks/useRover.ts'
import { useRoverStore } from '../../store/useRoverStore.ts'
import { DescentDust } from './DescentDust.tsx'
import { DescentReticle } from './DescentReticle.tsx'
import { Lander, LanderOrbit } from './Lander.tsx'
import { LookControls } from './LookControls.tsx'
import { surfaceHalfSize } from './surface.ts'
import { slopeVertexColors } from './slopeColors.ts'
import { SkyStars } from './SkyStars.tsx'
import { relocateTo } from './relocate.ts'
import { DispersionMarkers, EllipseRing, IceRoute } from './SurfaceOverlays.tsx'
import { illumVertexColors } from './illumColors.ts'
import { useIllumGrid } from '../../hooks/useScience.ts'
import { planarUv, setRegolithSunElevation, useRegolithMaterial } from './regolith.ts'
import { EarthGlobe } from '../macro/Earth.tsx'
import { SunGlare } from '../SunGlare.tsx'

/** Distances in the surface scene (metres). Sky objects sit beyond the horizon ring. */
const SKY_DIST = 90_000
const MASK_LINE_DIST = 29_000

const toGeometry = (positions: Float32Array, indices: Uint32Array) => {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(positions, 3))
  g.setIndex(new BufferAttribute(indices, 1))
  g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}

function Ground({ detail, sunElDeg }: { detail: SiteDetail; sunElDeg: number }) {
  const { grids, loading } = useTerrainGrids(detail)
  const showSlope = useMissionStore((s) => s.showSlope)
  const showIllum = useMissionStore((s) => s.showIllum)
  const showNac = useMissionStore((s) => s.showNac)
  const pickMode = useMissionStore((s) => s.pickMode)
  const illum = useIllumGrid(detail)
  const ready = !loading && grids !== undefined
  const fine = Boolean(detail.terrain)
  const halfSize = surfaceHalfSize(detail)
  const segments = fine ? 500 : 160
  const geometries = useMemo(() => {
    if (!ready) return null
    const terrain = grids.length
      ? buildTerrainGeometry(grids, detail.site, halfSize, segments)
      : buildFlatGeometry(halfSize, 64)
    const ring = buildHorizonRing(detail.mask, detail.site, grids, halfSize)
    const g = toGeometry(terrain.positions, terrain.indices)
    g.setAttribute('uv', planarUv(terrain.positions))
    if (terrain.slopeDeg) {
      const colors = slopeVertexColors(terrain.slopeDeg, g.getAttribute('normal').array)
      g.setAttribute('color', new BufferAttribute(colors, 3))
    }
    const ringGeometry = toGeometry(ring.positions, ring.indices)
    ringGeometry.setAttribute('uv', planarUv(ring.positions))
    return {
      terrain: g,
      ring: ringGeometry,
      hasSlope: Boolean(terrain.slopeDeg),
      segments,
    }
  }, [ready, grids, detail, halfSize, segments])
  // The illumination layer shares the terrain's vertices with its own colour attribute.
  const illumGeometry = useMemo(() => {
    if (!geometries || !illum || !geometries.hasSlope) return null
    const src = geometries.terrain
    const g = new BufferGeometry()
    g.setIndex(src.getIndex())
    g.setAttribute('position', src.getAttribute('position'))
    g.setAttribute('normal', src.getAttribute('normal'))
    g.setAttribute(
      'color',
      new BufferAttribute(
        illumVertexColors(
          illum,
          detail.site,
          halfSize,
          geometries.segments,
          src.getAttribute('normal').array,
        ),
        3,
      ),
    )
    g.boundingSphere = src.boundingSphere
    return g
  }, [geometries, illum, detail.site, halfSize])
  useEffect(() => () => illumGeometry?.dispose(), [illumGeometry])
  // LROC NAC layer: the orbital photo on the same vertices (loaded only once switched on).
  const nacRef = useImageryIndex()?.sites[terrainTileId(detail.terrain?.file) ?? '']
  const nacTexture = useMosaicTexture(showNac ? nacRef : undefined)
  const nacGeometry = useMemo(() => {
    if (!geometries || !nacRef?.extent || !geometries.hasSlope) return null
    const src = geometries.terrain
    const g = new BufferGeometry()
    g.setIndex(src.getIndex())
    g.setAttribute('position', src.getAttribute('position'))
    g.setAttribute('normal', src.getAttribute('normal'))
    const center = southPolarToMap(detail.site.lat, detail.site.lon)
    g.setAttribute(
      'uv',
      new BufferAttribute(terrainGridUv(center, halfSize, geometries.segments, nacRef.extent), 2),
    )
    g.boundingSphere = src.boundingSphere
    return g
  }, [geometries, nacRef, detail.site, halfSize])
  useEffect(() => () => nacGeometry?.dispose(), [nacGeometry])
  const groundMaterial = useRegolithMaterial('#bab5ad')
  const ringMaterial = useRegolithMaterial('#a39f98', DoubleSide)
  useEffect(() => {
    setRegolithSunElevation(groundMaterial, sunElDeg)
    setRegolithSunElevation(ringMaterial, sunElDeg)
  }, [groundMaterial, ringMaterial, sunElDeg])
  useEffect(
    () => () => {
      geometries?.terrain.dispose()
      geometries?.ring.dispose()
    },
    [geometries],
  )
  if (!geometries) return null
  // R3F reports how far the pointer travelled between down and up: a drag turns the camera,
  // only a still click picks a new landing point.
  const pick = (e: ThreeEvent<MouseEvent>) => {
    if (!pickMode || e.delta > 4 || !grids?.length) return
    e.stopPropagation()
    const { lat, lon } = sceneToLatLon(detail.site, [e.point.x, e.point.y, e.point.z])
    relocateTo(lat, lon)
  }
  // One layer at a time (the HUD keeps them exclusive anyway): NAC, illumination, slope.
  const nacOn = showNac && nacGeometry !== null && nacTexture !== null
  const illumOn = !nacOn && showIllum && illumGeometry !== null
  const slopeOn = !nacOn && !illumOn && showSlope && geometries.hasSlope
  return (
    <>
      <mesh
        geometry={nacOn ? nacGeometry : illumOn ? illumGeometry! : geometries.terrain}
        castShadow
        receiveShadow
        onClick={pick}
      >
        {nacOn ? (
          // The photo already carries the 2010 lighting: shown as is, not re-lit.
          <meshBasicMaterial key="nac" map={nacTexture} toneMapped={false} />
        ) : slopeOn || illumOn ? (
          <meshBasicMaterial key={illumOn ? 'illum' : 'slope'} vertexColors toneMapped={false} />
        ) : (
          <primitive key="plain" object={groundMaterial} attach="material" />
        )}
      </mesh>
      {grids && <EllipseRing detail={detail} grids={grids} />}
      {grids && showIllum && <IceRoute detail={detail} grids={grids} />}
      <mesh geometry={geometries.ring} material={ringMaterial} />
    </>
  )
}

/**
 * The Sun's disc at its true angular size, with glare sprites dimmed by the visible fraction of
 * the disc (a ridge covering half the Sun halves the glare; fully hidden → no glare at all).
 */
function SunDisc({ instant }: { instant: InstantState }) {
  const t = useT()
  const { az, el, radiusDeg } = instant.sky.sun
  const pos = skyPoint(az, el, SKY_DIST)
  const r = SKY_DIST * Math.tan(radiusDeg * DEG)
  return (
    <group position={pos}>
      <SunGlare radius={r} strength={instant.sunFrac} scale={0.6} />
      <Html center className="label label--sun label--sky" style={{ pointerEvents: 'none' }}>
        <span aria-hidden>☀</span> {t('scene.sun')} {el.toFixed(2)}°
      </Html>
    </group>
  )
}

/**
 * Earth at its true angular size, with the same day/night, clouds and atmosphere as the orbital
 * view. It is shaded by the real Sun direction, so the phase seen from the site is right.
 */
function EarthInSky({ instant }: { instant: InstantState }) {
  const t = useT()
  const { az, el, radiusDeg } = instant.sky.earth
  const pos = skyPoint(az, el, SKY_DIST)
  const r = SKY_DIST * Math.tan(radiusDeg * DEG)
  const sunAz = instant.sky.sun.az
  const sunEl = instant.sky.sun.el
  const sunDir = useMemo(() => {
    const p = skyPoint(sunAz, sunEl, 1, 0)
    return new Vector3(p[0], p[1], p[2]).normalize()
  }, [sunAz, sunEl])
  return (
    <group position={pos}>
      <Suspense fallback={null}>
        <EarthGlobe radius={r} sunDir={sunDir} timeMs={instant.timeMs} segments={64} />
      </Suspense>
      <Html center className="label label--earth label--sky" style={{ pointerEvents: 'none' }}>
        <span aria-hidden>⊕</span> {t('scene.earth')} {el.toFixed(2)}°
      </Html>
    </group>
  )
}

function SkyPaths({ series, detail }: { series: SiteSeries; detail: SiteDetail }) {
  const showMask = useMissionStore((s) => s.showMask)
  const showPaths = useMissionStore((s) => s.showPaths)
  const lines = useMemo(() => {
    const stride = Math.max(1, Math.floor(series.count / 600))
    const sun: [number, number, number][] = []
    const earth: [number, number, number][] = []
    for (let i = 0; i < series.count; i += stride) {
      sun.push(
        skyPoint(series.sunAz[i], series.sunEl[i], SKY_DIST * 0.98) as [number, number, number],
      )
      earth.push(
        skyPoint(series.earthAz[i], series.earthEl[i], SKY_DIST * 0.98) as [number, number, number],
      )
    }
    const mask: [number, number, number][] = []
    for (let az = 0; az <= 360; az += 0.5) {
      mask.push(
        skyPoint(az, maskAt(detail.mask, az) + 0.01, MASK_LINE_DIST) as [number, number, number],
      )
    }
    return { sun, earth, mask }
  }, [series, detail])
  return (
    <>
      {showPaths && (
        <>
          <Line
            points={lines.sun}
            color="#ffc94d"
            lineWidth={1.5}
            transparent
            opacity={0.55}
            dashed
            dashSize={600}
            gapSize={400}
          />
          <Line
            points={lines.earth}
            color="#4da6ff"
            lineWidth={1.5}
            transparent
            opacity={0.55}
            dashed
            dashSize={600}
            gapSize={400}
          />
        </>
      )}
      {showMask && (
        <Line points={lines.mask} color="#53e3ff" lineWidth={1.2} transparent opacity={0.8} />
      )}
    </>
  )
}

/**
 * Lateral half-size of the shadow camera, m. The whole tile normally (≈5 m per texel); around
 * the lander in the third-person view (≈7 cm per texel, so the craft casts a real shadow). The
 * box stays 1–60 km deep along the Sun direction, so ridges of the tile that shade the site are
 * still inside it.
 */
const SHADOW_HALF_TILE = 10_500
const SHADOW_HALF_LANDER = 150

function SunLight({
  instant,
  tight = false,
  followRover = false,
}: {
  instant: InstantState
  tight?: boolean
  /** Centre the light and its shadow box on the rover, lit by the Sun as seen from there. */
  followRover?: boolean
}) {
  const lightRef = useRef<DirectionalLight>(null)
  const targetRef = useRef<Object3D>(null)
  const sunDir = useRef<[number, number, number]>([0, 1, 0])
  useFrame(() => {
    const light = lightRef.current
    const target = targetRef.current
    if (!light || !target) return
    const tm = roverTelemetry
    const on = followRover && tm.active
    const [cx, cy, cz] = on ? [tm.x, tm.y, tm.z] : [0, 0, 0]
    if (target.position.x !== cx || target.position.y !== cy || target.position.z !== cz) {
      target.position.set(cx, cy, cz)
      target.updateMatrixWorld()
    }
    const d = sunDir.current
    light.position.set(cx + d[0], cy + d[1], cz + d[2])
    // The site-wide intensity is the Sun at the lander; under the rover use the Sun at the rover.
    if (on && Number.isFinite(tm.sunFrac)) light.intensity = 3.2 * tm.sunFrac
  })
  useEffect(() => {
    if (lightRef.current && targetRef.current) lightRef.current.target = targetRef.current
  }, [])
  const half = tight ? SHADOW_HALF_LANDER : SHADOW_HALF_TILE
  useEffect(() => {
    const light = lightRef.current
    if (!light) return
    light.shadow.camera.updateProjectionMatrix()
    light.shadow.needsUpdate = true
  }, [half])
  const { az, el } = instant.sky.sun
  const pos = skyPoint(az, el, 25_000, 0)
  useEffect(() => {
    sunDir.current = skyPoint(az, el, 25_000, 0) as [number, number, number]
  }, [az, el])
  // Intensity follows the analytically computed visible fraction of the solar disc: when a
  // ridge 100 km away hides the Sun, the whole local tile must go dark too.
  const intensity = 3.2 * instant.sunFrac
  // Floor: light scattered by nearby sunlit ridges (keeps shadowed walls readable).
  // Earthshine on top: scales with how much lit Earth is above the horizon.
  const earthshine = 0.035 + 0.06 * instant.sky.earthPhase * instant.earthFrac
  return (
    <>
      <ambientLight intensity={earthshine} color="#9fb7ff" />
      <object3D ref={targetRef} position={[0, 0, 0]} />
      <directionalLight
        ref={lightRef}
        position={pos}
        intensity={intensity}
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-camera-left={-half}
        shadow-camera-right={half}
        shadow-camera-top={half}
        shadow-camera-bottom={-half}
        shadow-camera-near={1_000}
        shadow-camera-far={60_000}
        shadow-bias={tight ? -0.00005 : -0.0004}
        shadow-normalBias={tight ? 0.05 : 6}
      />
    </>
  )
}

/** Lander's-eye view of the selected site at the current mission time. */
export function MicroScene() {
  const scenario = useMissionStore(selectActiveScenario)
  const pickMode = useMissionStore((s) => s.pickMode)
  useEffect(() => {
    document.body.classList.toggle('picking', pickMode)
    return () => document.body.classList.remove('picking')
  }, [pickMode])
  const { detail, instant, result } = useInstant(scenario)
  const { grids } = useTerrainGrids(detail)
  const landing = useMissionStore((s) => s.view === 'landing')
  const landerCam = useMissionStore((s) => s.landerCam)
  const approachAz = useMissionStore((s) => s.approachAz)
  const landed = useDescentStore((s) => s.landed)

  // Point the camera at the Sun when a new site opens (that's what users come to check).
  const siteKey = detail ? `${detail.site.lat}:${detail.site.lon}` : ''

  // A new descent whenever the landing view opens, or its site or approach changes.
  useEffect(() => {
    if (!landing) return
    useMissionStore.getState().setLanderCam('eye')
    // A link to the rover (or "see the traverse") goes straight to the surface.
    if (useRoverStore.getState().autoDeploy === 'skip-descent') useDescentStore.getState().land()
    else useDescentStore.getState().restart()
  }, [landing, siteKey, approachAz])

  useEffect(() => {
    if (!siteKey || !instant) return
    const st = useMissionStore.getState()
    if (st.aerial || st.view === 'landing') return
    const { az, el } = instant.sky.sun
    useMissionStore.getState().lookAt(az, Math.max(el, maskAt(detail!.mask, az)) + 1, 40)
    // Only on site change, not on every time step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey])

  const orbit = landing && landed && landerCam === 'orbit'
  const roving = landing && landed && landerCam === 'rover'
  const traverse = useRoverTraverse(landing)
  const autoDeploy = useRoverStore((s) => s.autoDeploy)
  // "Full mission": once down (and the route is known), hand over to the rover.
  useEffect(() => {
    if (!landing || !landed || autoDeploy === 'no' || !traverse.data) return
    useRoverStore.getState().setAutoDeploy('no')
    useRoverStore.getState().restart()
    useMissionStore.getState().setLanderCam('rover')
  }, [landing, landed, autoDeploy, traverse.data])

  return (
    <>
      <PerspectiveCamera
        makeDefault
        position={[0, 2, 0]}
        fov={useViewStore.getState().fov || FOV.default}
        near={0.5}
        far={250_000}
      />
      <color attach="background" args={['#000000']} />
      <SkyStars />
      {!landing || (landed && landerCam === 'eye') ? (
        <LookControls />
      ) : roving && detail && grids && traverse.data ? (
        <RoverRig detail={detail} grids={grids} traverse={traverse.data} />
      ) : landed ? (
        instant && <LanderOrbit instant={instant} />
      ) : (
        detail &&
        instant &&
        grids && <DescentControls detail={detail} grids={grids} instant={instant} />
      )}
      {detail && instant && (
        <>
          <SunLight instant={instant} tight={orbit || roving} followRover={roving} />
          <Ground detail={detail} sunElDeg={instant.sky.sun.el} />
          {landing && !landed && grids && <DescentReticle detail={detail} grids={grids} />}
          {landing && grids && <DescentDust detail={detail} grids={grids} />}
          {(orbit || roving) && grids && <Lander detail={detail} grids={grids} />}
          {/* Clickable score labels would clutter (and relocate) the descent. */}
          {!(landing && !landed) && <DispersionMarkers detail={detail} />}
          <SunDisc instant={instant} />
          <EarthInSky instant={instant} />
          {result && <SkyPaths series={result.series} detail={detail} />}
        </>
      )}
    </>
  )
}
