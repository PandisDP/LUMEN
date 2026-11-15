import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { groundSampler } from '../../astro/descent.ts'
import type { DemGrid } from '../../astro/dem.ts'
import type { SiteDetail } from '../../data/catalog.ts'
import { useDescentStore } from '../../store/useDescentStore.ts'
import { DustSim, dustMaterial } from './dust.ts'

/** The plume starts to lift dust below this height above the ground, m. */
const DUST_ALT_M = 32
/** Grains per second at touchdown. */
const MAX_RATE = 900

/** Lifts grains around (x, z) with a rate that grows as the craft gets close to the ground. */
function emitPlume(sim: DustSim, x: number, z: number, groundY: number, altM: number, dt: number) {
  if (altM >= DUST_ALT_M) return
  const k = 1 - Math.max(0, altM) / DUST_ALT_M
  for (let n = sim.due(MAX_RATE * k * k, dt); n > 0; n--) {
    const a = sim.rand() * Math.PI * 2
    const r0 = sim.rand() * (1 + altM * 0.15)
    const speed = (12 + sim.rand() * 28) * (0.4 + 0.6 * k)
    const vy = 0.5 + sim.rand() * 3.5 * k
    const life = 1.4 + sim.rand() * 1.8
    const size = 0.25 + sim.rand() * 0.6
    sim.spawn(
      x + Math.cos(a) * r0,
      groundY + 0.2,
      z + Math.sin(a) * r0,
      Math.cos(a) * speed,
      vy,
      Math.sin(a) * speed,
      groundY - 0.5,
      life,
      size,
    )
  }
}

/**
 * Dust blown off by the engine plume in the last tens of metres. In vacuum there is no cloud:
 * grains leave on fast, flat ballistic paths and fall back under lunar gravity, which is what the
 * Apollo footage shows. Purely cosmetic; it does not touch any metric.
 */
export function DescentDust({ detail, grids }: { detail: SiteDetail; grids: DemGrid[] }) {
  const ground = useMemo(() => groundSampler(detail.site, grids), [detail, grids])
  const height = useThree((s) => s.size.height)
  const run = useDescentStore((s) => s.run)
  const sim = useMemo(() => new DustSim(), [])

  const material = useMemo(() => dustMaterial(height), [height])
  useEffect(() => () => sim.geometry.dispose(), [sim])
  useEffect(() => () => material.dispose(), [material])
  // A restarted descent starts with clean ground.
  useEffect(() => sim.clear(), [sim, run])

  useFrame((frame, delta) => {
    const store = useDescentStore.getState()
    // Grains keep flying for a moment after touchdown; a paused descent freezes them.
    const dt = store.playing || store.landed ? Math.min(delta, 0.1) * store.speed : 0
    if (dt === 0) return
    if (!store.landed) {
      // Emit below the camera, which is the lander's eye while it flies.
      const cam = frame.camera.position
      const gy = ground.groundY(cam.x, cam.z)
      emitPlume(sim, cam.x, cam.z, gy, cam.y - gy, dt)
    }
    sim.step(dt)
  })

  return (
    <points geometry={sim.geometry} material={material} frustumCulled={false} renderOrder={5} />
  )
}
