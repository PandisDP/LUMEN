import { Line } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { DoubleSide, type Group, type Mesh, MeshBasicMaterial, Vector3 } from 'three'
import { groundSampler, rayGround } from '../../astro/descent.ts'
import type { DemGrid } from '../../astro/dem.ts'
import { slopeAtStack, slopeClass } from '../../astro/slope.ts'
import type { SiteDetail } from '../../data/catalog.ts'
import { descentTelemetry } from './descentTelemetry.ts'
import { SLOPE_COLORS } from './slopeColors.ts'

type P3 = [number, number, number]
const RAY_EVERY_S = 0.1
/** Reticle size relative to its range: ~4° across, whatever the altitude. */
const SIZE_PER_M = 0.035
const TARGET_RADIUS_M = 40

/**
 * Drawn on top of the terrain: it is a HUD symbol, not an object in the scene. A single shared
 * material (there is only one reticle) whose colour is mutated with the slope class.
 */
const RETICLE_MATERIAL = new MeshBasicMaterial({
  depthTest: false,
  depthWrite: false,
  transparent: true,
  toneMapped: false,
  side: DoubleSide,
})

/** Expanding ring around the reticle (same colour), so the symbol reads at a glance. */
const PULSE_MATERIAL = new MeshBasicMaterial({
  depthTest: false,
  depthWrite: false,
  transparent: true,
  toneMapped: false,
  side: DoubleSide,
})
const PULSE_PERIOD_S = 1.4

/**
 * Hazard-avoidance reticle: where the boresight meets the ground, coloured *and shaped* by the
 * local DEM slope (circle = safe, diamond = marginal, cross = hazardous), plus a fixed marker on
 * the target. The ground hit is ray-marched on the DEM at 10 Hz and applied by mutation.
 */
export function DescentReticle({ detail, grids }: { detail: SiteDetail; grids: DemGrid[] }) {
  const ground = useMemo(() => groundSampler(detail.site, grids), [detail, grids])
  const group = useRef<Group>(null)
  const safe = useRef<Group>(null)
  const caution = useRef<Group>(null)
  const steep = useRef<Group>(null)
  const pulse = useRef<Mesh>(null)
  const since = useRef(RAY_EVERY_S)
  const fwd = useMemo(() => new Vector3(), [])

  const target = useMemo(() => {
    const ring: P3[] = []
    for (let a = 0; a <= 360; a += 6) {
      const x = TARGET_RADIUS_M * Math.sin((a * Math.PI) / 180)
      const z = -TARGET_RADIUS_M * Math.cos((a * Math.PI) / 180)
      ring.push([x, ground.groundY(x, z) + 1, z])
    }
    const g0 = ground.groundY(0, 0)
    return { ring, beam: [[0, g0, 0] as P3, [0, g0 + 400, 0] as P3] }
  }, [ground])

  useFrame((state, delta) => {
    if (pulse.current) {
      const p = (state.clock.elapsedTime % PULSE_PERIOD_S) / PULSE_PERIOD_S
      pulse.current.scale.setScalar(1.15 + p * 0.7)
      PULSE_MATERIAL.opacity = 0.7 * (1 - p)
    }
    since.current += delta
    if (since.current < RAY_EVERY_S || !group.current) return
    since.current = 0
    const cam = state.camera
    cam.getWorldDirection(fwd)
    const origin: P3 = [cam.position.x, cam.position.y, cam.position.z]
    const hit = rayGround(ground, origin, [fwd.x, fwd.y, fwd.z])
    const g = group.current
    if (!hit) {
      g.visible = false
      descentTelemetry.reticleSlopeDeg = NaN
      descentTelemetry.reticleRangeM = NaN
      return
    }
    const [x, y, z] = hit.point
    const { lat, lon } = ground.latLon(x, z)
    const slope = grids.length ? slopeAtStack(grids, lat, lon) : NaN
    descentTelemetry.reticleSlopeDeg = slope
    descentTelemetry.reticleRangeM = hit.distM
    g.visible = true
    g.position.set(x, y + 0.5, z)
    g.scale.setScalar(Math.max(1, hit.distM * SIZE_PER_M))
    const cls = Number.isNaN(slope) ? null : slopeClass(slope)
    // Without slope data, a neutral white circle.
    if (safe.current) safe.current.visible = cls === 'safe' || cls === null
    if (caution.current) caution.current.visible = cls === 'caution'
    if (steep.current) steep.current.visible = cls === 'steep'
    RETICLE_MATERIAL.color.set(cls ? SLOPE_COLORS[cls] : '#ffffff')
    PULSE_MATERIAL.color.copy(RETICLE_MATERIAL.color)
  })

  return (
    <>
      <Line points={target.ring} color="#ffffff" lineWidth={2} transparent opacity={0.9} />
      <Line points={target.beam} color="#ffffff" lineWidth={1} transparent opacity={0.45} />
      <group ref={group} visible={false}>
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <group ref={safe}>
            <mesh renderOrder={20} material={RETICLE_MATERIAL}>
              <ringGeometry args={[0.8, 1, 48]} />
            </mesh>
          </group>
          <group ref={caution} visible={false}>
            {/* A 4-segment ring has its corners on the axes: a diamond. */}
            <mesh renderOrder={20} material={RETICLE_MATERIAL}>
              <ringGeometry args={[0.85, 1.1, 4]} />
            </mesh>
          </group>
          <group ref={steep} visible={false}>
            <mesh rotation={[0, 0, Math.PI / 4]} renderOrder={20} material={RETICLE_MATERIAL}>
              <planeGeometry args={[2.2, 0.22]} />
            </mesh>
            <mesh rotation={[0, 0, -Math.PI / 4]} renderOrder={20} material={RETICLE_MATERIAL}>
              <planeGeometry args={[2.2, 0.22]} />
            </mesh>
          </group>
          <mesh ref={pulse} renderOrder={19} material={PULSE_MATERIAL}>
            <ringGeometry args={[0.92, 1, 48]} />
          </mesh>
          {/* Centre dot, common to all classes. */}
          <mesh renderOrder={20} material={RETICLE_MATERIAL}>
            <circleGeometry args={[0.12, 16]} />
          </mesh>
        </group>
      </group>
    </>
  )
}
