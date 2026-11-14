import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { CatmullRomCurve3, type PerspectiveCamera, Vector3 } from 'three'
import {
  DESCENT_DURATION_S,
  angleBetweenDeg,
  descentAttitude,
  descentPhase,
  descentTimeMap,
  descentWaypoints,
  groundSampler,
  halfDiagonalFovDeg,
  skyDirection,
  sunBehindApproach,
} from '../../astro/descent.ts'
import type { DemGrid } from '../../astro/dem.ts'
import type { InstantState } from '../../astro/instant.ts'
import type { SiteDetail } from '../../data/catalog.ts'
import { useDescentStore } from '../../store/useDescentStore.ts'
import { FOV, useMissionStore } from '../../store/useMissionStore.ts'
import { useViewStore } from '../../store/useViewStore.ts'
import { descentTelemetry } from './descentTelemetry.ts'
import { landedPose, surfaceHalfSize } from './surface.ts'

const APPROACH_FOV = 60
/** How far the user may look away from the flight attitude while dragging, deg. */
const MAX_YAW = 60
const MAX_PITCH = 40
const PUBLISH_EVERY_S = 0.1

/**
 * Flies the camera down a Catmull-Rom curve through the descent waypoints. Everything that
 * changes per frame is mutated here (camera, telemetry object); React only sees 10 Hz copies
 * for the slider and the compass.
 */
export function DescentControls({
  detail,
  grids,
  instant,
}: {
  detail: SiteDetail
  grids: DemGrid[]
  instant: InstantState
}) {
  const gl = useThree((s) => s.gl)
  const approachSetting = useMissionStore((s) => s.approachAz)
  // Rounded so the curve is not rebuilt for sub-degree drifts of the Sun.
  const sunAz = Math.round(instant.sky.sun.az)
  const approachAz = approachSetting ?? sunBehindApproach(sunAz)
  const run = useDescentStore((s) => s.run)
  const seek = useDescentStore((s) => s.seek)

  const path = useMemo(() => {
    const waypoints = descentWaypoints(detail.site, grids, surfaceHalfSize(detail), approachAz)
    const curve = new CatmullRomCurve3(
      waypoints.map((w) => new Vector3(w.p[0], w.p[1], w.p[2])),
      false,
      'centripetal',
    )
    return { curve, timeMap: descentTimeMap(waypoints), ground: groundSampler(detail.site, grids) }
  }, [detail, grids, approachAz])

  const finalRef = useRef(landedPose(instant, detail))
  const sunRef = useRef(instant)
  useEffect(() => {
    finalRef.current = landedPose(instant, detail)
    sunRef.current = instant
  }, [instant, detail])

  const clock = useRef(useDescentStore.getState().t)
  const offset = useRef({ az: 0, el: 0 })
  const fov = useRef(APPROACH_FOV)
  const dragging = useRef(false)
  const lastY = useRef(NaN)
  const sincePublish = useRef(0)
  const pos = useMemo(() => new Vector3(), [])
  const fwd = useMemo(() => new Vector3(), [])

  useEffect(() => {
    clock.current = 0
    offset.current = { az: 0, el: 0 }
    lastY.current = NaN
  }, [run])
  useEffect(() => {
    if (seek) clock.current = seek.t
    lastY.current = NaN
  }, [seek])

  useEffect(() => {
    const el = gl.domElement
    let lastX = 0
    let lastPy = 0
    const down = (e: PointerEvent) => {
      dragging.current = true
      lastX = e.clientX
      lastPy = e.clientY
      el.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (!dragging.current) return
      const k = fov.current / el.clientHeight
      const o = offset.current
      o.az = Math.max(-MAX_YAW, Math.min(MAX_YAW, o.az - (e.clientX - lastX) * k))
      o.el = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, o.el + (e.clientY - lastPy) * k))
      lastX = e.clientX
      lastPy = e.clientY
    }
    const up = (e: PointerEvent) => {
      dragging.current = false
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      fov.current = Math.max(FOV.min, Math.min(FOV.max, fov.current * Math.exp(e.deltaY * 0.001)))
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
    const camera = state.camera as PerspectiveCamera
    const store = useDescentStore.getState()
    const step = store.playing ? Math.min(delta, 0.1) * store.speed : 0
    clock.current = Math.min(DESCENT_DURATION_S, clock.current + step)
    const t = clock.current

    path.curve.getPoint(path.timeMap(t), pos)
    camera.position.copy(pos)

    // The look-away offset drifts back to the flight attitude once released.
    if (!dragging.current) {
      const k = Math.exp(-delta * 1.5)
      offset.current.az *= k
      offset.current.el *= k
    }
    const dist = Math.hypot(pos.x, pos.z)
    const att = descentAttitude(pos.y, dist, (approachAz + 180) % 360, finalRef.current)
    const az = (att.az + offset.current.az + 360) % 360
    const el = Math.max(-89, Math.min(89, att.el + offset.current.el))
    const dir = skyDirection(az, el)
    camera.lookAt(pos.x + dir[0], pos.y + dir[1], pos.z + dir[2])
    if (Math.abs(camera.fov - fov.current) > 1e-3) {
      camera.fov = fov.current
      camera.updateProjectionMatrix()
    }

    // Telemetry for the HUD (read at 10 Hz from the DOM side).
    const tm = descentTelemetry
    tm.phase = descentPhase(t)
    tm.altAglM = pos.y - path.ground.groundY(pos.x, pos.z)
    tm.distM = dist
    if (step > 0 && Number.isFinite(lastY.current)) {
      const v = (pos.y - lastY.current) / step
      tm.vSpeed += (v - tm.vSpeed) * 0.2
    }
    lastY.current = pos.y
    const sun = sunRef.current
    camera.getWorldDirection(fwd)
    tm.sunOffAxisDeg = angleBetweenDeg(
      [fwd.x, fwd.y, fwd.z],
      skyDirection(sun.sky.sun.az, sun.sky.sun.el),
    )
    tm.sunInFov =
      sun.sunFrac > 0 &&
      tm.sunOffAxisDeg < halfDiagonalFovDeg(camera.fov, camera.aspect) + sun.sky.sun.radiusDeg

    sincePublish.current += delta
    if (sincePublish.current >= PUBLISH_EVERY_S) {
      sincePublish.current = 0
      store.publishT(t)
      useViewStore.getState().set({ az, el, fov: fov.current })
    }

    if (t >= DESCENT_DURATION_S && !store.landed) {
      // Hand over to the surface view's controls in exactly this pose.
      useViewStore.getState().set({ az, el, fov: fov.current })
      useMissionStore.getState().lookAt(az, el, fov.current)
      store.publishT(t)
      store.land()
    }
  })

  return null
}
