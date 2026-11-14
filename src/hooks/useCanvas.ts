import { useEffect, useRef, useState } from 'react'

/** Tracks a canvas' CSS size and sets its backing store for the device pixel ratio. */
export function useCanvasSize() {
  const ref = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0, dpr: 1 })
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ width, height, dpr: Math.min(window.devicePixelRatio || 1, 2) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, ...size }
}

/** Prepares a 2D context scaled to CSS pixels, or null when not drawable (e.g. jsdom). */
export function context2d(canvas: HTMLCanvasElement | null, w: number, h: number, dpr: number) {
  if (!canvas || w === 0 || h === 0) return null
  let ctx: CanvasRenderingContext2D | null
  try {
    ctx = canvas.getContext('2d')
  } catch {
    return null
  }
  if (!ctx) return null
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  return ctx
}
