import { useEffect, useMemo } from 'react'
import {
  AdditiveBlending,
  DoubleSide,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Vector2,
} from 'three'
import { canvasTexture, mulberry32 } from '../canvasTexture.ts'

/** Crinkled multi-layer insulation: a height field of random creases turned into a normal map. */
export function foilNormalTexture() {
  const S = 256
  const rand = mulberry32(7)
  const height = new Float32Array(S * S)
  for (let k = 0; k < 90; k++) {
    // A crease: a soft ridge along a random line.
    const a = rand() * Math.PI
    const nx = Math.cos(a)
    const ny = Math.sin(a)
    const c = rand() * S * 1.4 - S * 0.2
    const w = 1.5 + rand() * 5
    const amp = (rand() - 0.5) * 2
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const d = Math.abs(x * nx + y * ny - c)
        if (d < w * 3) height[y * S + x] += amp * Math.max(0, 1 - d / (w * 3))
      }
  }
  return canvasTexture(
    S,
    (ctx) => {
      const img = ctx.createImageData(S, S)
      const h = (x: number, y: number) => height[((y + S) % S) * S + ((x + S) % S)]
      for (let y = 0; y < S; y++)
        for (let x = 0; x < S; x++) {
          const gx = (h(x - 1, y) - h(x + 1, y)) * 1.6
          const gy = (h(x, y + 1) - h(x, y - 1)) * 1.6
          const len = Math.hypot(gx, gy, 1)
          const i = (y * S + x) * 4
          img.data[i] = (gx / len) * 127.5 + 127.5
          img.data[i + 1] = (gy / len) * 127.5 + 127.5
          img.data[i + 2] = (1 / len) * 127.5 + 127.5
          img.data[i + 3] = 255
        }
      ctx.putImageData(img, 0, 0)
    },
    { srgb: false, repeat: true },
  )
}

/** Solar array: dark blue cells separated by thin silver bus lines. */
export function cellsTexture() {
  return canvasTexture(
    256,
    (ctx, s) => {
      const g = ctx.createLinearGradient(0, 0, s, s)
      g.addColorStop(0, '#22345e')
      g.addColorStop(1, '#121d38')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, s, s)
      const n = 8
      const cell = s / n
      ctx.strokeStyle = 'rgba(200,210,230,0.55)'
      ctx.lineWidth = 2
      for (let i = 0; i <= n; i++) {
        ctx.beginPath()
        ctx.moveTo(i * cell, 0)
        ctx.lineTo(i * cell, s)
        ctx.moveTo(0, i * cell)
        ctx.lineTo(s, i * cell)
        ctx.stroke()
      }
      // Fine fingers inside each cell.
      ctx.strokeStyle = 'rgba(160,175,205,0.18)'
      ctx.lineWidth = 1
      for (let y = 0; y < s; y += cell / 6) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(s, y)
        ctx.stroke()
      }
    },
    { repeat: true },
  )
}

/**
 * Woven wire of a spring tyre: two families of diagonal wires on a transparent background (the
 * material cuts the gaps out with alphaTest). One tile is one diamond of the weave.
 */
export function wireMeshTexture() {
  return canvasTexture(
    64,
    (ctx, s) => {
      ctx.clearRect(0, 0, s, s)
      ctx.lineCap = 'square'
      const wire = (shade: string, width: number) => {
        ctx.strokeStyle = shade
        ctx.lineWidth = width
        for (const k of [-1, 0, 1]) {
          ctx.beginPath()
          ctx.moveTo(k * s, 0)
          ctx.lineTo(k * s + s, s)
          ctx.moveTo(k * s + s, 0)
          ctx.lineTo(k * s, s)
          ctx.stroke()
        }
      }
      wire('#8d9198', s * 0.3)
      wire('#e6e8ec', s * 0.12)
    },
    { repeat: true },
  )
}

/** Blotchy grey noise: roughness variation, so dark and white parts are never a flat tone. */
export function smudgeTexture() {
  const S = 128
  const rand = mulberry32(21)
  return canvasTexture(
    S,
    (ctx) => {
      ctx.fillStyle = '#b0b0b0'
      ctx.fillRect(0, 0, S, S)
      for (let k = 0; k < 260; k++) {
        const x = rand() * S
        const y = rand() * S
        const r = 3 + rand() * 16
        const v = Math.round(110 + rand() * 145)
        const g = ctx.createRadialGradient(x, y, 0, x, y, r)
        g.addColorStop(0, `rgba(${v},${v},${v},0.5)`)
        g.addColorStop(1, `rgba(${v},${v},${v},0)`)
        ctx.fillStyle = g
        // Drawn nine times so that the tile repeats without seams.
        for (const dx of [-S, 0, S])
          for (const dy of [-S, 0, S]) ctx.fillRect(x + dx - r, y + dy - r, r * 2, r * 2)
      }
    },
    { srgb: false, repeat: true },
  )
}

/** Headlight beam: bright at the lamp (v = 1), gone at the far end of the cone (v = 0). */
export function beamTexture() {
  return canvasTexture(64, (ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, 0, s)
    g.addColorStop(0, 'rgba(255,244,205,1)')
    g.addColorStop(0.25, 'rgba(255,240,196,0.42)')
    g.addColorStop(0.65, 'rgba(255,236,186,0.1)')
    g.addColorStop(1, 'rgba(255,236,186,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s, s)
  })
}

function buildCraftMaterials() {
  const foilNormal = foilNormalTexture()
  const cells = cellsTexture()
  const wire = wireMeshTexture()
  const smudge = smudgeTexture()
  const beamMap = beamTexture()
  const foil = new MeshStandardMaterial({
    color: '#d4a733',
    metalness: 0.85,
    roughness: 0.32,
    normalMap: foilNormal,
    normalScale: new Vector2(0.6, 0.6),
  })
  const silverFoil = new MeshStandardMaterial({
    color: '#c9cdd3',
    metalness: 0.8,
    roughness: 0.3,
    normalMap: foilNormal,
    normalScale: new Vector2(0.5, 0.5),
  })
  const panel = new MeshStandardMaterial({
    color: '#ffffff',
    map: cells,
    metalness: 0.35,
    roughness: 0.28,
  })
  const panelBack = new MeshStandardMaterial({ color: '#d9d9d6', roughness: 0.7 })
  const strut = new MeshStandardMaterial({ color: '#a7a9ad', metalness: 0.75, roughness: 0.4 })
  const dark = new MeshStandardMaterial({ color: '#2b2d31', metalness: 0.6, roughness: 0.5 })
  const white = new MeshStandardMaterial({ color: '#ececea', roughness: 0.55 })
  const bell = new MeshStandardMaterial({
    color: '#5d5a57',
    metalness: 0.9,
    roughness: 0.35,
    side: DoubleSide,
  })
  const dish = new MeshStandardMaterial({ color: '#f0f0ee', roughness: 0.5, side: DoubleSide })

  // Rover.
  /** Flat silver blanket of the decks: the same foil, pulled tighter (less crinkle). */
  const deckFoil = new MeshStandardMaterial({
    color: '#c3c7cd',
    metalness: 0.7,
    roughness: 0.48,
    normalMap: foilNormal,
    normalScale: new Vector2(0.18, 0.18),
  })
  /** Anodised housings (motors, camera bodies): dark, but never black, with uneven sheen. */
  const housing = new MeshStandardMaterial({
    color: '#5b606b',
    metalness: 0.55,
    roughness: 0.85,
    roughnessMap: smudge,
  })
  /** Machined aluminium of the suspension, the wheel rims and the frames. */
  const alloy = new MeshStandardMaterial({
    color: '#bfc3c9',
    metalness: 0.7,
    roughness: 0.75,
    roughnessMap: smudge,
  })
  /** White thermal paint (radiators, camera heads, panel backs), slightly dusty. */
  const paint = new MeshStandardMaterial({
    color: '#eeeeea',
    metalness: 0.05,
    roughness: 0.9,
    roughnessMap: smudge,
  })
  const tyre = new MeshStandardMaterial({
    color: '#ffffff',
    map: wire,
    alphaTest: 0.3,
    metalness: 0.6,
    roughness: 0.5,
    side: DoubleSide,
  })
  const grouser = new MeshStandardMaterial({ color: '#8e9299', metalness: 0.7, roughness: 0.5 })
  /** Kapton-wrapped cable harness. */
  const harness = new MeshStandardMaterial({ color: '#b5722a', metalness: 0.5, roughness: 0.45 })
  /** Camera optics: glossy, with a faint blue coating glow so they are not black holes. */
  const lens = new MeshStandardMaterial({
    color: '#1a2440',
    metalness: 0.9,
    roughness: 0.12,
    emissive: '#18305c',
    emissiveIntensity: 0.35,
  })
  const lamp = new MeshStandardMaterial({
    color: '#fff7d6',
    emissive: '#fff2b0',
    emissiveIntensity: 0,
    roughness: 0.3,
  })
  const nav = new MeshStandardMaterial({
    color: '#ffcf8a',
    emissive: '#ff9d2e',
    emissiveIntensity: 2.5,
  })
  const beam = new MeshBasicMaterial({
    color: '#ffffff',
    map: beamMap,
    transparent: true,
    opacity: 0,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
    fog: false,
    toneMapped: false,
  })
  return {
    foil,
    silverFoil,
    panel,
    panelBack,
    strut,
    dark,
    white,
    bell,
    dish,
    deckFoil,
    housing,
    alloy,
    paint,
    tyre,
    grouser,
    harness,
    lens,
    lamp,
    nav,
    beam,
    textures: [foilNormal, cells, wire, smudge, beamMap],
  }
}

export type CraftMaterials = ReturnType<typeof buildCraftMaterials>

/** Materials of the lander and the rovers, built once per mount and disposed with it. */
export function useCraftMaterials(): CraftMaterials {
  const m = useMemo(() => buildCraftMaterials(), [])
  useEffect(
    () => () => {
      const { textures, ...materials } = m
      Object.values(materials).forEach((x) => x.dispose())
      textures.forEach((x) => x?.dispose())
    },
    [m],
  )
  return m
}
