import { Html, Line } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  type BufferGeometry,
  type Group,
  type Mesh,
  MeshStandardMaterial,
  type PerspectiveCamera,
  Quaternion,
  type SpotLight,
  Vector3,
} from 'three'
import type { DemGrid } from '../../astro/dem.ts'
import { groundSampler } from '../../astro/descent.ts'
import { latLonToScene } from '../../astro/terrainMesh.ts'
import {
  type RoverId,
  type TraverseResult,
  sampleTraverse,
  traverseDurationMs,
} from '../../astro/traverse.ts'
import { HOUR_MS } from '../../astro/constants.ts'
import type { SiteDetail } from '../../data/catalog.ts'
import { useT } from '../../i18n/index.ts'
import { FOV, useMissionStore } from '../../store/useMissionStore.ts'
import { useRoverStore } from '../../store/useRoverStore.ts'
import { formatDistance } from '../../ui/format.ts'
import { roverTelemetry } from './roverTelemetry.ts'

type P3 = [number, number, number]
const DEG = Math.PI / 180
const UP = new Vector3(0, 1, 0)
const PUBLISH_EVERY_S = 0.1
/** Body length of each rover model, m (the micro-rover is drawn larger than life: see ROVER_SCALE). */
const ROVER_SCALE: Record<RoverId, number> = { rover: 1.4, 'csa-rover': 2.2 }
const WHEEL_R = 0.16
const WHEELS: [number, number][] = [
  [-0.36, -0.42],
  [0.36, -0.42],
  [-0.38, 0],
  [0.38, 0],
  [-0.36, 0.42],
  [0.36, 0.42],
]

function useRoverMaterials() {
  const m = useMemo(
    () => ({
      body: new MeshStandardMaterial({ color: '#d9dde3', metalness: 0.55, roughness: 0.45 }),
      gold: new MeshStandardMaterial({ color: '#d4a733', metalness: 0.85, roughness: 0.35 }),
      dark: new MeshStandardMaterial({ color: '#2b2d33', metalness: 0.6, roughness: 0.6 }),
      panel: new MeshStandardMaterial({ color: '#1b2f6b', metalness: 0.4, roughness: 0.25 }),
      lamp: new MeshStandardMaterial({
        color: '#fff7d6',
        emissive: '#fff2b0',
        emissiveIntensity: 0,
      }),
    }),
    [],
  )
  useEffect(() => () => Object.values(m).forEach((x) => x.dispose()), [m])
  return m
}

/**
 * Six-wheeled rover (procedural, about 1 m long before scaling): chassis, rocker wheels, a
 * camera mast, a tilted solar panel and a small dish. Built facing -z (north); the rig turns it
 * to its heading and lays it on the local slope.
 */
function RoverModel({
  wheels,
  lampRef,
  lampMesh,
  m,
}: {
  wheels: React.RefObject<Group | null>
  lampRef: React.RefObject<SpotLight | null>
  lampMesh: React.RefObject<Mesh<BufferGeometry, MeshStandardMaterial> | null>
  m: ReturnType<typeof useRoverMaterials>
}) {
  return (
    <>
      <mesh position={[0, 0.34, 0]} material={m.body} castShadow receiveShadow>
        <boxGeometry args={[0.58, 0.2, 0.96]} />
      </mesh>
      <mesh position={[0, 0.46, 0.05]} material={m.gold} castShadow>
        <boxGeometry args={[0.5, 0.06, 0.7]} />
      </mesh>
      {/* Solar panel, tilted back. */}
      <mesh position={[0, 0.62, 0.12]} rotation={[-0.35, 0, 0]} material={m.panel} castShadow>
        <boxGeometry args={[0.78, 0.02, 0.66]} />
      </mesh>
      {/* Camera mast and head. */}
      <mesh position={[0.18, 0.78, -0.36]} material={m.dark} castShadow>
        <cylinderGeometry args={[0.018, 0.018, 0.66, 8]} />
      </mesh>
      <mesh position={[0.18, 1.12, -0.38]} material={m.body} castShadow>
        <boxGeometry args={[0.2, 0.09, 0.1]} />
      </mesh>
      <mesh ref={lampMesh} position={[0.18, 1.12, -0.435]} material={m.lamp}>
        <boxGeometry args={[0.16, 0.05, 0.012]} />
      </mesh>
      {/* High-gain dish. */}
      <mesh position={[-0.2, 0.74, -0.2]} rotation={[0.9, 0, 0]} material={m.body} castShadow>
        <cylinderGeometry args={[0.14, 0.02, 0.05, 16]} />
      </mesh>
      <group ref={wheels}>
        {WHEELS.map(([x, z], i) => (
          <mesh
            key={i}
            position={[x, WHEEL_R, z]}
            rotation={[0, 0, Math.PI / 2]}
            material={m.dark}
            castShadow
          >
            <cylinderGeometry args={[WHEEL_R, WHEEL_R, 0.1, 12]} />
          </mesh>
        ))}
      </group>
      {/* Faint fill (light bounced off the regolith) so the craft reads against the low Sun. */}
      <pointLight
        position={[0.6, 1.6, 1.2]}
        intensity={2.2}
        distance={7}
        decay={1.4}
        color="#cfd8ff"
      />
      {/* Headlights for the permanent shadow. */}
      <spotLight
        ref={lampRef}
        position={[0.18, 1.12, -0.45]}
        angle={0.6}
        penumbra={0.5}
        distance={60}
        decay={1.2}
        intensity={0}
        color="#fff3c4"
      />
    </>
  )
}

/**
 * The rover, its route and the camera that follows it. Each frame the traverse result is
 * sampled at the rover clock (mission time since departure), the craft is placed on the terrain
 * with its heading and tilt, the telemetry singleton is written and the camera eased behind it.
 * The mission clock follows too (10 Hz), so the Sun, the shadows and the panels show that hour.
 */
export function RoverRig({
  detail,
  grids,
  traverse,
}: {
  detail: SiteDetail
  grids: DemGrid[]
  traverse: TraverseResult
}) {
  const t = useT()
  const gl = useThree((s) => s.gl)
  const run = useRoverStore((s) => s.run)
  const seek = useRoverStore((s) => s.seek)
  const roverId = useRoverStore((s) => s.roverId)
  const m = useRoverMaterials()
  const rover = useRef<Group>(null)
  const wheels = useRef<Group>(null)
  const lamp = useRef<SpotLight>(null)
  const lampMesh = useRef<Mesh<BufferGeometry, MeshStandardMaterial>>(null)

  const ground = useMemo(() => groundSampler(detail.site, grids), [detail, grids])
  const duration = traverseDurationMs(traverse)
  const departMs = traverse.t[0]
  const route = useMemo(
    () =>
      traverse.plan.points.map(
        (p) => latLonToScene(detail.site, p.lat, p.lon, p.heightM + 0.6) as P3,
      ),
    [traverse, detail],
  )
  const goal = route[route.length - 1]

  const clock = useRef(0)
  const spin = useRef(0)
  const sincePublish = useRef(0)
  /** Camera orbit around the rover (follow view): yaw from behind, pitch, distance. */
  const orbit = useRef({ yaw: 35, pitch: 16, dist: 8 })
  const dragging = useRef(false)
  const tmp = useMemo(
    () => ({
      pos: new Vector3(),
      want: new Vector3(),
      look: new Vector3(),
      n: new Vector3(),
      q: new Quaternion(),
      yaw: new Quaternion(),
    }),
    [],
  )
  const first = useRef(true)

  useEffect(() => {
    clock.current = 0
    first.current = true
  }, [run, traverse])
  useEffect(() => {
    if (seek) clock.current = seek.tMs
  }, [seek])
  useEffect(() => {
    roverTelemetry.active = true
    return () => {
      roverTelemetry.active = false
    }
  }, [])

  useEffect(() => {
    const el = gl.domElement
    let lastX = 0
    let lastY = 0
    const down = (e: PointerEvent) => {
      dragging.current = true
      lastX = e.clientX
      lastY = e.clientY
      el.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (!dragging.current) return
      const o = orbit.current
      o.yaw = (o.yaw - (e.clientX - lastX) * 0.4) % 360
      o.pitch = Math.max(3, Math.min(80, o.pitch + (e.clientY - lastY) * 0.3))
      lastX = e.clientX
      lastY = e.clientY
    }
    const up = (e: PointerEvent) => {
      dragging.current = false
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const o = orbit.current
      o.dist = Math.max(4, Math.min(400, o.dist * Math.exp(e.deltaY * 0.001)))
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('wheel', wheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('wheel', wheel)
    }
  }, [gl])

  useFrame((state, delta) => {
    const store = useRoverStore.getState()
    const dt = Math.min(delta, 0.1)
    if (store.playing) clock.current = Math.min(duration, clock.current + dt * store.speed * 1000)
    const s = sampleTraverse(traverse, departMs + clock.current)
    const g = rover.current
    if (!s || !g) return

    const p = latLonToScene(detail.site, s.lat, s.lon, s.heightM)
    tmp.pos.set(p[0], ground.groundY(p[0], p[2]), p[2])
    // Lay the chassis on the local slope, then turn it to its heading.
    const d = 3
    const dydx = (ground.groundY(p[0] + d, p[2]) - ground.groundY(p[0] - d, p[2])) / (2 * d)
    const dydz = (ground.groundY(p[0], p[2] + d) - ground.groundY(p[0], p[2] - d)) / (2 * d)
    tmp.n.set(-dydx, 1, -dydz).normalize()
    tmp.q.setFromUnitVectors(UP, tmp.n)
    tmp.yaw.setFromAxisAngle(UP, -s.headingDeg * DEG)
    g.position.copy(tmp.pos)
    g.quaternion.copy(tmp.q).multiply(tmp.yaw)
    const scale = ROVER_SCALE[roverId]
    g.scale.setScalar(scale)
    if (wheels.current && store.playing) {
      spin.current += (s.speedMs * dt * store.speed) / (WHEEL_R * scale)
      for (const w of wheels.current.children) w.rotation.x = spin.current
    }
    const dark = s.sunFrac < 0.05
    if (lamp.current) lamp.current.intensity = dark ? 18 : 0
    lampMesh.current?.material.setValues({ emissiveIntensity: dark ? 3 : 0 })

    const tm = roverTelemetry
    tm.x = tmp.pos.x
    tm.y = tmp.pos.y
    tm.z = tmp.pos.z
    tm.distM = s.distM
    tm.lengthM = traverse.plan.lengthM
    tm.speedMs = s.speedMs
    tm.slopeDeg = s.slopeDeg
    tm.gradeDeg = s.gradeDeg
    tm.headingDeg = s.headingDeg
    tm.socPct = s.socPct
    tm.solarW = s.solarW
    tm.loadW = s.loadW
    tm.sunFrac = s.sunFrac
    tm.earthFrac = s.earthFrac
    tm.tempK = s.tempK
    tm.inPsr = s.inPsr
    tm.driving = s.driving
    tm.timeMs = departMs + clock.current
    tm.done = clock.current >= duration

    // Camera.
    const camera = state.camera as PerspectiveCamera
    const fx = Math.sin(s.headingDeg * DEG)
    const fz = -Math.cos(s.headingDeg * DEG)
    let fov = 50
    if (store.cam === 'mast') {
      tmp.want.set(tmp.pos.x + fx * 0.2, tmp.pos.y + 1.25 * scale, tmp.pos.z + fz * 0.2)
      tmp.look.set(tmp.pos.x + fx * 30, tmp.pos.y + 1.1 * scale, tmp.pos.z + fz * 30)
      fov = 70
    } else if (store.cam === 'top') {
      const h = Math.max(120, orbit.current.dist * 14)
      tmp.want.set(tmp.pos.x - fx * 1, tmp.pos.y + h, tmp.pos.z - fz * 1)
      tmp.look.copy(tmp.pos)
    } else {
      const o = orbit.current
      const yaw = (s.headingDeg + 180 + o.yaw) * DEG
      const horiz = Math.cos(o.pitch * DEG) * o.dist
      tmp.want.set(
        tmp.pos.x + Math.sin(yaw) * horiz,
        tmp.pos.y + Math.sin(o.pitch * DEG) * o.dist + 1,
        tmp.pos.z - Math.cos(yaw) * horiz,
      )
      // Never under the terrain.
      tmp.want.setY(Math.max(tmp.want.y, ground.groundY(tmp.want.x, tmp.want.z) + 1))
      tmp.look.set(tmp.pos.x, tmp.pos.y + 0.6 * scale, tmp.pos.z)
    }
    if (first.current) {
      camera.position.copy(tmp.want)
      first.current = false
    } else camera.position.lerp(tmp.want, 1 - Math.exp(-dt * 4))
    camera.lookAt(tmp.look)
    const wantFov = Math.max(FOV.min, Math.min(FOV.max, fov))
    if (Math.abs(camera.fov - wantFov) > 1e-3) {
      camera.fov = wantFov
      camera.updateProjectionMatrix()
    }

    sincePublish.current += delta
    if (sincePublish.current >= PUBLISH_EVERY_S) {
      sincePublish.current = 0
      store.publishT(clock.current)
      // The mission clock rides with the rover: Sun, shadows and panels show its hour.
      const mission = useMissionStore.getState()
      const offsetH = clock.current / HOUR_MS
      if (Math.abs(mission.offsetH - offsetH) > 1e-4) mission.setOffset(offsetH)
      if (tm.done && store.playing) store.setPlaying(false)
    }
  })

  return (
    <>
      <group ref={rover}>
        <RoverModel wheels={wheels} lampRef={lamp} lampMesh={lampMesh} m={m} />
      </group>
      {route.length > 1 && (
        <Line points={route} color="#7fd4ff" lineWidth={2} dashed dashSize={6} gapSize={4} />
      )}
      {goal && (
        <Html position={goal} center className="label label--ice" style={{ pointerEvents: 'none' }}>
          ❄ {t('rover.goal', { d: formatDistance(traverse.plan.lengthM) })}
        </Html>
      )}
    </>
  )
}
