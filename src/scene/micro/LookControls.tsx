import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import type { PerspectiveCamera } from 'three'
import { DEG } from '../../astro/constants.ts'
import { AERIAL_HEIGHT_M, FOV, useMissionStore } from '../../store/useMissionStore.ts'
import { useViewStore } from '../../store/useViewStore.ts'

const EYE_HEIGHT = 2

/**
 * First-person "look around" from the lander: drag to turn, wheel/pinch to zoom (narrow FOV
 * is needed to see the Sun grazing a ridge 1° high), arrow keys too. Requests from the UI
 * ("look at the Sun") arrive through the mission store and are animated.
 */
export function LookControls() {
  const gl = useThree((s) => s.gl)
  const view = useRef({ ...useViewStore.getState() })
  const target = useRef<{ az: number; el: number; fov: number } | null>(null)
  const look = useMissionStore((s) => s.look)
  const aerial = useMissionStore((s) => s.aerial)
  const eye = useRef(EYE_HEIGHT)
  // Ease between the lander's eye and the aerial height.
  const eyeTarget = aerial ? AERIAL_HEIGHT_M : EYE_HEIGHT

  useEffect(() => {
    if (look) target.current = { az: look.az, el: look.el, fov: look.fov }
  }, [look])

  useEffect(() => {
    const el = gl.domElement
    let dragging = false
    let lastX = 0
    let lastY = 0
    const publish = () => useViewStore.getState().set({ ...view.current })
    const down = (e: PointerEvent) => {
      dragging = true
      lastX = e.clientX
      lastY = e.clientY
      target.current = null
      el.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (!dragging) return
      const k = view.current.fov / el.clientHeight
      view.current.az = (view.current.az - (e.clientX - lastX) * k + 360) % 360
      view.current.el = Math.max(-89, Math.min(89, view.current.el + (e.clientY - lastY) * k))
      lastX = e.clientX
      lastY = e.clientY
      publish()
    }
    const up = (e: PointerEvent) => {
      dragging = false
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      target.current = null
      view.current.fov = Math.max(
        FOV.min,
        Math.min(FOV.max, view.current.fov * Math.exp(e.deltaY * 0.001)),
      )
      publish()
    }
    const key = (e: KeyboardEvent) => {
      const step = view.current.fov / 20
      if (e.key === 'ArrowLeft') view.current.az = (view.current.az - step + 360) % 360
      else if (e.key === 'ArrowRight') view.current.az = (view.current.az + step) % 360
      else if (e.key === 'ArrowUp') view.current.el = Math.min(89, view.current.el + step)
      else if (e.key === 'ArrowDown') view.current.el = Math.max(-89, view.current.el - step)
      else return
      target.current = null
      publish()
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('wheel', wheel, { passive: false })
    window.addEventListener('keydown', key)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('wheel', wheel)
      window.removeEventListener('keydown', key)
    }
  }, [gl])

  useFrame((state, delta) => {
    const camera = state.camera as PerspectiveCamera
    const v = view.current
    const t = target.current
    if (t) {
      const k = 1 - Math.exp(-delta * 4)
      const dAz = ((t.az - v.az + 540) % 360) - 180
      v.az = (v.az + dAz * k + 360) % 360
      v.el += (t.el - v.el) * k
      v.fov += (t.fov - v.fov) * k
      if (Math.abs(dAz) < 0.01 && Math.abs(t.el - v.el) < 0.01 && Math.abs(t.fov - v.fov) < 0.05) {
        target.current = null
      }
      useViewStore.getState().set({ ...v })
    }
    const az = v.az * DEG
    const el = v.el * DEG
    eye.current += (eyeTarget - eye.current) * (1 - Math.exp(-delta * 3))
    if (Math.abs(eyeTarget - eye.current) < 0.05) eye.current = eyeTarget
    const h = eye.current
    camera.position.set(0, h, 0)
    camera.lookAt(Math.cos(el) * Math.sin(az), h + Math.sin(el), -Math.cos(el) * Math.cos(az))
    if (Math.abs(camera.fov - v.fov) > 1e-3) {
      camera.fov = v.fov
      camera.updateProjectionMatrix()
    }
  })

  return null
}
