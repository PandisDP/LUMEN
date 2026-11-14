import { CanvasTexture, NoColorSpace, RepeatWrapping, SRGBColorSpace } from 'three'

/**
 * Procedural textures drawn on a 2D canvas: no image assets to download, and they are built once
 * per session. Every helper returns null where there is no DOM (tests, workers).
 */
export function canvasTexture(
  size: number,
  draw: (ctx: CanvasRenderingContext2D, size: number) => void,
  { srgb = true, repeat = false }: { srgb?: boolean; repeat?: boolean } = {},
): CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  let ctx: CanvasRenderingContext2D | null
  try {
    ctx = canvas.getContext('2d')
  } catch {
    return null
  }
  if (!ctx) return null
  draw(ctx, size)
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = srgb ? SRGBColorSpace : NoColorSpace
  if (repeat) tex.wrapS = tex.wrapT = RepeatWrapping
  tex.anisotropy = 8
  return tex
}

/** Soft radial falloff with the given colour stops (0 = centre, 1 = edge). */
export function glowTexture(stops: readonly (readonly [number, string])[], size = 256) {
  return canvasTexture(size, (ctx, s) => {
    const c = s / 2
    const g = ctx.createRadialGradient(c, c, 0, c, c, c)
    for (const [at, color] of stops) g.addColorStop(at, color)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s, s)
  })
}

/** Thin radial streaks (diffraction-spike look), faded towards the edge. */
export function raysTexture(size = 256) {
  return canvasTexture(size, (ctx, s) => {
    const c = s / 2
    ctx.translate(c, c)
    const rays = 12
    for (let i = 0; i < rays; i++) {
      const long = i % 2 === 0
      const len = c * (long ? 0.9 : 0.5)
      const g = ctx.createLinearGradient(0, 0, len, 0)
      g.addColorStop(0, 'rgba(255,240,205,0.3)')
      g.addColorStop(1, 'rgba(255,220,160,0)')
      ctx.save()
      ctx.rotate((i / rays) * Math.PI * 2 + (long ? 0 : 0.11))
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.moveTo(0, -1.6)
      ctx.lineTo(len, 0)
      ctx.lineTo(0, 1.6)
      ctx.fill()
      ctx.restore()
    }
  })
}

/** Deterministic pseudo-random generator (same seed → same texture / star field). */
export function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const prefersReducedMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
