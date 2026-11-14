import { OrbitControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import {
  DoubleSide,
  MeshStandardMaterial,
  type PerspectiveCamera,
  Quaternion,
  Vector2,
  Vector3,
} from 'three'
import { DEG } from '../../astro/constants.ts'
import { groundSampler } from '../../astro/descent.ts'
import type { DemGrid } from '../../astro/dem.ts'
import type { InstantState } from '../../astro/instant.ts'
import type { SiteDetail } from '../../data/catalog.ts'
import { useMissionStore } from '../../store/useMissionStore.ts'
import { canvasTexture, mulberry32 } from '../canvasTexture.ts'

/** Lander size, m: a small CLPS-class craft (~4 m tall, ~4.4 m across the footpads). */
const LEG_SPREAD = 2.2
const BODY_R = 1.1
const BODY_BOTTOM = 0.9
const BODY_H = 1.6
const DECK_Y = BODY_BOTTOM + BODY_H
/** Distance from the axis to the centre of each flat face of the octagonal body. */
const BODY_INRADIUS = BODY_R * Math.cos(Math.PI / 8)

/** Crinkled multi-layer insulation: a height field of random creases turned into a normal map. */
function foilNormalTexture() {
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
function cellsTexture() {
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

/** Materials of the craft, built once per mount and disposed with it. */
function useLanderMaterials() {
  const m = useMemo(() => {
    const foilNormal = foilNormalTexture()
    const cells = cellsTexture()
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
      textures: [foilNormal, cells],
    }
  }, [])
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

type Materials = ReturnType<typeof useLanderMaterials>

/** Tilt of the ground at the site, from the DEM ±10 m around it. */
function useGroundPose(detail: SiteDetail, grids: DemGrid[]) {
  return useMemo(() => {
    const g = groundSampler(detail.site, grids)
    const d = 10
    const dydx = (g.groundY(d, 0) - g.groundY(-d, 0)) / (2 * d)
    const dydz = (g.groundY(0, d) - g.groundY(0, -d)) / (2 * d)
    const normal = new Vector3(-dydx, 1, -dydz).normalize()
    return {
      y: g.groundY(0, 0),
      tilt: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), normal),
    }
  }, [detail, grids])
}

/** A cylinder between two points (struts, braces). */
function Rod({
  from,
  to,
  r,
  material,
}: {
  from: Vector3
  to: Vector3
  r: number
  material: MeshStandardMaterial
}) {
  const mid = from.clone().add(to).multiplyScalar(0.5)
  const len = from.distanceTo(to)
  const q = new Quaternion().setFromUnitVectors(
    new Vector3(0, 1, 0),
    to.clone().sub(from).normalize(),
  )
  return (
    <mesh position={mid} quaternion={q} material={material} castShadow>
      <cylinderGeometry args={[r, r, len, 10]} />
    </mesh>
  )
}

/** Landing leg: primary strut with a shock-absorber sleeve, two side braces and a footpad. */
function Leg({ angle, m }: { angle: number; m: Materials }) {
  const x = Math.sin(angle)
  const z = Math.cos(angle)
  const top = new Vector3(x * BODY_R * 0.9, BODY_BOTTOM + 0.35, z * BODY_R * 0.9)
  const foot = new Vector3(x * LEG_SPREAD, 0.1, z * LEG_SPREAD)
  const sleeveEnd = top.clone().lerp(foot, 0.45)
  // Braces from the body's lower ring, left and right of the leg, to the knee.
  const knee = top.clone().lerp(foot, 0.7)
  const side = new Vector3(z, 0, -x).multiplyScalar(BODY_R * 0.55)
  const base = new Vector3(x * BODY_R * 0.75, BODY_BOTTOM + 0.02, z * BODY_R * 0.75)
  return (
    <>
      <Rod from={top} to={foot} r={0.045} material={m.strut} />
      <Rod from={top} to={sleeveEnd} r={0.08} material={m.dark} />
      <Rod from={base.clone().add(side)} to={knee} r={0.03} material={m.strut} />
      <Rod from={base.clone().sub(side)} to={knee} r={0.03} material={m.strut} />
      <mesh position={foot} material={m.silverFoil} castShadow receiveShadow>
        <cylinderGeometry args={[0.24, 0.32, 0.1, 20]} />
      </mesh>
    </>
  )
}

/** Small reaction-control thruster cluster on the body's rim. */
function RcsPod({ angle, m }: { angle: number; m: Materials }) {
  const x = Math.sin(angle) * (BODY_R + 0.08)
  const z = Math.cos(angle) * (BODY_R + 0.08)
  return (
    <group position={[x, DECK_Y - 0.15, z]} rotation={[0, angle, 0]}>
      <mesh material={m.dark} castShadow>
        <boxGeometry args={[0.18, 0.14, 0.14]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          position={[s * 0.12, 0, 0]}
          rotation={[0, 0, (s * Math.PI) / 2]}
          material={m.bell}
        >
          <cylinderGeometry args={[0.025, 0.05, 0.08, 10, 1, true]} />
        </mesh>
      ))}
    </group>
  )
}

/**
 * Procedural lander (no external model): octagonal body in gold MLI with a silver band, four legs
 * with shock absorbers and braces, side solar panels and a top deck array, RCS pods, propellant
 * tanks under the deck, a camera mast and a high-gain antenna. Face 0 points to the energy
 * profile's panel azimuth, and the craft sits on the DEM's local slope, so the lighting of its
 * panels and the shadow it casts are those of the chosen date.
 */
export function Lander({ detail, grids }: { detail: SiteDetail; grids: DemGrid[] }) {
  const pose = useGroundPose(detail, grids)
  const panelAz = useMissionStore((s) => s.energy.panelAzDeg)
  const m = useLanderMaterials()
  return (
    <group position={[0, pose.y, 0]} quaternion={pose.tilt}>
      <group rotation={[0, -panelAz * DEG, 0]}>
        {[45, 135, 225, 315].map((a) => (
          <Leg key={a} angle={a * DEG} m={m} />
        ))}
        {/* Body: gold MLI with a silver band at mid-height. */}
        <mesh
          position={[0, BODY_BOTTOM + BODY_H / 2, 0]}
          rotation={[0, Math.PI / 8, 0]}
          material={m.foil}
          castShadow
          receiveShadow
        >
          <cylinderGeometry args={[BODY_R, BODY_R * 0.96, BODY_H, 8]} />
        </mesh>
        <mesh
          position={[0, BODY_BOTTOM + BODY_H * 0.28, 0]}
          rotation={[0, Math.PI / 8, 0]}
          material={m.silverFoil}
          castShadow
        >
          <cylinderGeometry args={[BODY_R + 0.015, BODY_R + 0.015, 0.16, 8]} />
        </mesh>
        {/* Propellant tanks peeking out under the body. */}
        {[0, 180].map((a) => (
          <mesh
            key={a}
            position={[Math.sin(a * DEG) * 0.45, BODY_BOTTOM + 0.05, Math.cos(a * DEG) * 0.45]}
            material={m.white}
            castShadow
          >
            <sphereGeometry args={[0.32, 24, 16]} />
          </mesh>
        ))}
        {/* Side panels on four of the eight faces; the first faces local -z (= panel azimuth). */}
        {[0, 90, 180, 270].map((a) => (
          <group
            key={a}
            position={[
              -Math.sin(a * DEG) * (BODY_INRADIUS + 0.03),
              BODY_BOTTOM + BODY_H * 0.62,
              -Math.cos(a * DEG) * (BODY_INRADIUS + 0.03),
            ]}
            rotation={[0, a * DEG, 0]}
          >
            <mesh material={m.panel} castShadow receiveShadow>
              <boxGeometry args={[0.82, 0.9, 0.03]} />
            </mesh>
            <mesh position={[0, 0, 0.02]} material={m.panelBack}>
              <boxGeometry args={[0.86, 0.94, 0.01]} />
            </mesh>
          </group>
        ))}
        {[22.5, 112.5, 202.5, 292.5].map((a) => (
          <RcsPod key={a} angle={a * DEG} m={m} />
        ))}
        {/* Top deck with its array and a rim. */}
        <mesh position={[0, DECK_Y + 0.03, 0]} material={m.silverFoil} castShadow receiveShadow>
          <boxGeometry args={[2.5, 0.06, 2.5]} />
        </mesh>
        <mesh
          position={[0, DECK_Y + 0.065, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          material={m.panel}
          receiveShadow
        >
          <planeGeometry args={[2.36, 2.36]} />
        </mesh>
        {/* Payload box and camera mast. */}
        <mesh position={[-0.6, DECK_Y + 0.28, -0.55]} material={m.foil} castShadow>
          <boxGeometry args={[0.6, 0.42, 0.5]} />
        </mesh>
        <mesh position={[-0.75, DECK_Y + 0.7, 0.55]} material={m.strut} castShadow>
          <cylinderGeometry args={[0.035, 0.035, 1.3, 8]} />
        </mesh>
        <mesh position={[-0.75, DECK_Y + 1.38, 0.55]} material={m.dark} castShadow>
          <boxGeometry args={[0.26, 0.16, 0.18]} />
        </mesh>
        {/* Mast and high-gain dish with its feed. */}
        <mesh position={[0.6, DECK_Y + 0.6, 0.6]} material={m.strut} castShadow>
          <cylinderGeometry args={[0.04, 0.04, 1.1, 8]} />
        </mesh>
        <group position={[0.6, DECK_Y + 1.2, 0.6]} rotation={[-0.6, 0, 0]}>
          <mesh material={m.dish} castShadow>
            <sphereGeometry args={[0.45, 32, 8, 0, Math.PI * 2, 0, Math.PI / 4]} />
          </mesh>
          <mesh position={[0, -0.12, 0]} material={m.strut}>
            <cylinderGeometry args={[0.012, 0.012, 0.36, 6]} />
          </mesh>
        </group>
        {/* Main engine bell under the body. */}
        <mesh position={[0, BODY_BOTTOM - 0.22, 0]} material={m.bell} castShadow>
          <cylinderGeometry args={[0.16, 0.36, 0.44, 24, 1, true]} />
        </mesh>
      </group>
    </group>
  )
}

/** Third-person camera around the landed craft; opens with the Sun behind the viewer. */
export function LanderOrbit({ instant }: { instant: InstantState }) {
  const get = useThree((s) => s.get)
  const sunAz = instant.sky.sun.az
  useEffect(() => {
    const camera = get().camera as PerspectiveCamera
    const a = sunAz * DEG
    camera.position.set(Math.sin(a) * 16, 6, -Math.cos(a) * 16)
    camera.lookAt(0, 2, 0)
    camera.fov = 50
    camera.updateProjectionMatrix()
    // Only when entering the orbit view, not when the Sun moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [get])
  return (
    <OrbitControls
      makeDefault
      target={[0, 2, 0]}
      minDistance={6}
      maxDistance={80}
      maxPolarAngle={Math.PI / 2 - 0.03}
      enablePan={false}
    />
  )
}
