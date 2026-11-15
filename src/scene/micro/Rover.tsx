import { Html, Line } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { type Group, type PerspectiveCamera, Quaternion, Vector3 } from 'three'
import type { DemGrid } from '../../astro/dem.ts'
import { groundSampler } from '../../astro/descent.ts'
import { latLonToScene } from '../../astro/terrainMesh.ts'
import { type TraverseResult, sampleTraverse, traverseDurationMs } from '../../astro/traverse.ts'
import { HOUR_MS } from '../../astro/constants.ts'
import type { SiteDetail } from '../../data/catalog.ts'
import { useT } from '../../i18n/index.ts'
import { FOV, useMissionStore } from '../../store/useMissionStore.ts'
import { useRoverStore } from '../../store/useRoverStore.ts'
import { formatDistance } from '../../ui/format.ts'
import { RoverModel } from './RoverModel.tsx'
import {
  ROVER_RIGS,
  type RoverModelHandle,
  approach,
  emptyRoverFrame,
  turnPerM,
  wheelLayout,
} from './roverRig.ts'
import { EGRESS, egressPose } from './egress.ts'
import { PARK_GAP_M, poseWindowMs } from './roverPlayback.ts'
import { roverTelemetry } from './roverTelemetry.ts'
import { surfaceHalfSize } from './surface.ts'
import { ROVER_TRACKS, returnShiftM, terrainMeshHeight } from './trackGeometry.ts'
import { terrainSegments } from './nearGroundField.ts'
import { SCENE_COLORS } from '../sceneColors.ts'

type P3 = [number, number, number]
const DEG = Math.PI / 180
const UP = new Vector3(0, 1, 0)
const RIGHT = new Vector3(1, 0, 0)
const PUBLISH_EVERY_S = 0.1
/**
 * Visual limits for time-lapse playback (the traverse runs at hundreds of times real speed):
 * the wheels turn as if driving at most this fast, and the steering shows the path curvature
 * amplified, since a real 50 m bend is half a degree of steer.
 */
const MAX_VISUAL_SPEED_MS = 0.9
const STEER_GAIN = 8

/**
 * The rover, its route and the camera that follows it. Each frame the traverse result is
 * sampled at the rover clock (mission time since departure), the craft is placed on the terrain
 * with its heading and tilt, the telemetry singleton is written and the camera eased behind it.
 * The mission clock follows too (10 Hz), so the Sun, the shadows and the panels show that hour.
 *
 * The trip is a round trip: out to the ice, the drill at work for as long as the sampling
 * lasts, a turn on the spot and back by the same route, a little to the side of its own tracks,
 * until it parks in front of the ramps it came down.
 */
export function RoverRig({
  detail,
  grids,
  traverse,
  sunAzDeg,
  sunElDeg,
  earthAzDeg,
  earthElDeg,
  surfaceY,
}: {
  detail: SiteDetail
  grids: DemGrid[]
  traverse: TraverseResult
  /**
   * Sun and Earth in the local sky (azimuth clockwise from north, elevation): the solar array
   * and the high-gain dish point at them. Without them they keep a rest pose.
   */
  sunAzDeg?: number
  sunElDeg?: number
  earthAzDeg?: number
  earthElDeg?: number
  /**
   * Scene height of the surface the wheels stand on, if the caller draws something finer than
   * the terrain (close-range micro-relief). Defaults to the terrain as drawn.
   */
  surfaceY?: (x: number, z: number) => number
}) {
  const t = useT()
  const gl = useThree((s) => s.gl)
  const run = useRoverStore((s) => s.run)
  const seek = useRoverStore((s) => s.seek)
  const roverId = useRoverStore((s) => s.roverId)
  const spec = ROVER_RIGS[roverId]
  const layout = useMemo(() => wheelLayout(spec), [spec])
  const rover = useRef<Group>(null)
  const model = useRef<RoverModelHandle>(null)
  const frame = useRef(emptyRoverFrame(0))
  /** Last heading and distance (for the path curvature) and the filtered curvature. */
  const turn = useRef({ headingDeg: NaN, distM: NaN, perM: 0, target: 0 })

  const ground = useMemo(() => groundSampler(detail.site, grids), [detail, grids])
  /**
   * Height of what is drawn under the wheels: the terrain mesh or the DEM, whichever is on top
   * (the mesh cells are wider than the DEM posts, so the two differ by decimetres on curved
   * ground; the wheel tracks and the close-range ground follow the same surface).
   */
  const surface = useMemo(() => {
    if (surfaceY) return surfaceY
    if (!grids.length) return ground.groundY
    const meshY = terrainMeshHeight(
      detail.site,
      grids,
      ground,
      surfaceHalfSize(detail),
      terrainSegments(Boolean(detail.terrain)),
    )
    return (x: number, z: number) => Math.max(ground.groundY(x, z), meshY(x, z))
  }, [surfaceY, detail, grids, ground])
  const duration = traverseDurationMs(traverse)
  const departMs = traverse.t[0]
  const outLengthM = traverse.plan.outLengthM
  /** The way out only: the way back runs over it, so the line is drawn once. */
  const route = useMemo(() => {
    const { points, turnIndex } = traverse.plan
    return (turnIndex < 0 ? points : points.slice(0, turnIndex + 1)).map(
      (p) => latLonToScene(detail.site, p.lat, p.lon, p.heightM + 0.6) as P3,
    )
  }, [traverse, detail])
  /** The ice: where the rover turns around. */
  const goal = route[route.length - 1]

  /**
   * Clock span in which the rover is drawn where the model has it: the drive starts where the
   * ramps end and, on the way back, stops short of them (the model's route ends on the lander).
   */
  const pose = useMemo(
    () => poseWindowMs(traverse, EGRESS.groundR, EGRESS.groundR + spec.lengthM / 2 + PARK_GAP_M),
    [traverse, spec],
  )
  const driveStartMs = pose.fromMs
  /** Heading on arrival at the ice: the rover samples facing that way. */
  const iceHeadingDeg = traverse.plan.points[Math.max(0, traverse.plan.turnIndex)]?.headingDeg ?? 0
  const track = ROVER_TRACKS[roverId]
  const egressHeadingDeg = traverse.plan.points[0]?.headingDeg ?? 0
  /** Real seconds into the roll down the ramps. */
  const egressS = useRef(0)
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
      w: new Vector3(),
    }),
    [],
  )
  const first = useRef(true)

  useEffect(() => {
    clock.current = 0
    egressS.current = 0
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
      o.dist = Math.max(2.5, Math.min(400, o.dist * Math.exp(e.deltaY * 0.001)))
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
    const egress = store.phase === 'egress' && traverse.plan.points.length > 1
    if (egress) {
      // Rolling off the lander is a real-time prelude: it takes no mission time.
      if (store.playing) egressS.current += dt
      if (egressS.current >= EGRESS.durationS) {
        clock.current = driveStartMs
        store.setPhase('drive')
      }
    } else if (store.playing)
      clock.current = Math.min(duration, clock.current + dt * store.speed * 1000)
    const egressP = egress ? Math.min(1, egressS.current / EGRESS.durationS) : 1
    const now = sampleTraverse(traverse, departMs + clock.current)
    const g = rover.current
    if (!now || !g) return
    // Where it is drawn: held at the foot of the ramps at both ends of the trip.
    const poseMs = Math.min(pose.toMs, Math.max(pose.fromMs, clock.current))
    const held = !egress && poseMs !== clock.current
    const at = held ? sampleTraverse(traverse, departMs + poseMs) : now
    if (!at) return
    const ended = clock.current >= duration
    // The readings are the model's; position, heading and motion are those of the drawn rover.
    const s = held
      ? { ...now, lat: at.lat, lon: at.lon, heightM: at.heightM, headingDeg: at.headingDeg }
      : now
    const driving = now.driving && !held && !ended
    const speedMs = driving ? now.speedMs : 0

    const on = latLonToScene(detail.site, s.lat, s.lon, s.heightM)
    // On the way back it keeps to the right of its outbound tracks, as its own tracks do.
    const shift = returnShiftM(track, at.distM - outLengthM)
    const p = [
      on[0] + Math.cos(s.headingDeg * DEG) * shift,
      on[1],
      on[2] + Math.sin(s.headingDeg * DEG) * shift,
    ]
    tmp.pos.set(p[0], surface(p[0], p[2]), p[2])
    // Lay the chassis on the local slope (over its own footprint), then turn it to its heading.
    const d = spec.lengthM * 0.6
    const dydx = (surface(p[0] + d, p[2]) - surface(p[0] - d, p[2])) / (2 * d)
    const dydz = (surface(p[0], p[2] + d) - surface(p[0], p[2] - d)) / (2 * d)
    tmp.n.set(-dydx, 1, -dydz).normalize()
    tmp.q.setFromUnitVectors(UP, tmp.n)
    tmp.yaw.setFromAxisAngle(UP, -s.headingDeg * DEG)
    if (egress) {
      // On the pallet, then down the ramps along the first heading of the route.
      const e = egressPose(egressP)
      const a = egressHeadingDeg * DEG
      const x = Math.sin(a) * e.r
      const z = -Math.cos(a) * e.r
      tmp.pos.set(x, Math.max(surface(0, 0) + e.h, surface(x, z)), z)
      tmp.yaw.setFromAxisAngle(UP, -egressHeadingDeg * DEG)
      tmp.q.setFromAxisAngle(RIGHT, e.pitch)
      g.position.copy(tmp.pos)
      g.quaternion.copy(tmp.yaw).multiply(tmp.q)
    } else {
      g.position.copy(tmp.pos)
      g.quaternion.copy(tmp.q).multiply(tmp.yaw)
    }

    // What the model articulates on: the ground under each wheel, relative to the chassis plane.
    if (frame.current.wheelHeights.length !== layout.length)
      frame.current = emptyRoverFrame(layout.length)
    const f = frame.current
    for (let i = 0; i < layout.length; i++) {
      tmp.w.set(layout[i].x, 0, -layout[i].u).applyQuaternion(g.quaternion).add(tmp.pos)
      // On the ramps the wheels ride the channels: no articulation.
      f.wheelHeights[i] = egress ? 0 : (surface(tmp.w.x, tmp.w.z) - tmp.w.y) * tmp.n.y
    }
    // Path curvature from the change of heading over the distance driven (not across a seek).
    const tr = turn.current
    const stepM = at.distM - tr.distM
    if (Math.abs(stepM) > 1e-4 && Math.abs(stepM) < 40)
      tr.target = turnPerM(tr.headingDeg, s.headingDeg, stepM)
    else if (!(Math.abs(stepM) < 40)) tr.target = 0
    tr.headingDeg = s.headingDeg
    tr.distM = at.distM
    tr.perM = approach(tr.perM, driving ? tr.target : 0, dt, 0.35)
    if (store.playing) {
      const rolling = egress && egressP > EGRESS.deployShare ? 0.5 : 0
      const v = egress ? rolling : Math.min(speedMs * store.speed, MAX_VISUAL_SPEED_MS)
      spin.current = (spin.current + (v * dt) / spec.wheelR) % (Math.PI * 2)
    }
    const dark = s.sunFrac < 0.05
    f.spin = spin.current
    f.turnPerM = tr.perM * STEER_GAIN
    f.headingDeg = egress ? egressHeadingDeg : s.headingDeg
    f.sunAzDeg = sunAzDeg ?? null
    f.sunElDeg = sunElDeg ?? null
    f.earthAzDeg = earthAzDeg ?? null
    f.earthElDeg = earthElDeg ?? null
    f.link = s.earthFrac >= 0.5
    f.dark = dark
    f.driving = driving && store.playing
    // The drill works for as long as the sampling does (not while recharging, nor once it ends).
    // It lifts it to turn around, which the model does over the last step of the sampling.
    const turned = Math.abs(((now.headingDeg - iceHeadingDeg + 540) % 360) - 180) > 1
    f.drilling = now.phase === 'sample' && !ended && !turned
    model.current?.update(f, dt)

    const tm = roverTelemetry
    tm.x = tmp.pos.x
    tm.y = tmp.pos.y
    tm.z = tmp.pos.z
    tm.distM = s.distM
    tm.lengthM = traverse.plan.lengthM
    tm.outLengthM = outLengthM
    tm.poseDistM = at.distM
    tm.phase = s.phase
    tm.leg = s.leg
    tm.sampleIndex = s.sampleIndex
    tm.samplesDone = s.samplesDone
    tm.speedMs = speedMs
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
    tm.driving = driving
    tm.timeMs = departMs + clock.current
    tm.done = ended
    tm.egress = egressP

    // Camera.
    const camera = state.camera as PerspectiveCamera
    const camHeading = egress ? egressHeadingDeg : s.headingDeg
    const fx = Math.sin(camHeading * DEG)
    const fz = -Math.cos(camHeading * DEG)
    let fov = 50
    if (store.cam === 'mast') {
      // Out of the mast camera, in the rover's own frame (it pitches and rolls with it).
      tmp.want.set(spec.eye.x, spec.eye.y, -spec.eye.u).applyQuaternion(g.quaternion).add(tmp.pos)
      tmp.look
        .set(spec.eye.x, spec.eye.y - 3, -spec.eye.u - 30)
        .applyQuaternion(g.quaternion)
        .add(tmp.pos)
      fov = 70
    } else if (store.cam === 'top') {
      const h = Math.max(120, orbit.current.dist * 14)
      tmp.want.set(tmp.pos.x - fx * 1, tmp.pos.y + h, tmp.pos.z - fz * 1)
      tmp.look.copy(tmp.pos)
    } else {
      // Distances scale with the vehicle, so either rover fills the same part of the frame.
      const o = orbit.current
      // During the egress: pulled back and to the side, so the lander and the ramps are in frame.
      const dist = o.dist * spec.camScale * (egress ? 2.2 : 1)
      const yaw = (camHeading + (egress ? 62 : 180) + o.yaw) * DEG
      const horiz = Math.cos(o.pitch * DEG) * dist
      tmp.want.set(
        tmp.pos.x + Math.sin(yaw) * horiz,
        tmp.pos.y + Math.sin(o.pitch * DEG) * dist + spec.heightM * 0.45,
        tmp.pos.z - Math.cos(yaw) * horiz,
      )
      // Never under the terrain.
      tmp.want.setY(Math.max(tmp.want.y, surface(tmp.want.x, tmp.want.z) + 0.25))
      tmp.look.set(tmp.pos.x, tmp.pos.y + spec.heightM * 0.45, tmp.pos.z)
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
        <RoverModel key={roverId} id={roverId} ref={model} />
      </group>
      {route.length > 1 && (
        <Line
          points={route}
          color={SCENE_COLORS.route}
          lineWidth={2}
          dashed
          dashSize={6}
          gapSize={4}
        />
      )}
      {goal && (
        <Html position={goal} center className="label label--ice" style={{ pointerEvents: 'none' }}>
          ❄ {t('rover.goal', { d: formatDistance(outLengthM) })}
        </Html>
      )}
    </>
  )
}
