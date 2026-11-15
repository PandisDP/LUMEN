import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { type Group, MeshStandardMaterial, Quaternion, Vector3 } from 'three'
import type { DemGrid } from '../../astro/dem.ts'
import { groundSampler } from '../../astro/descent.ts'
import type { SiteDetail } from '../../data/catalog.ts'
import { useRoverStore } from '../../store/useRoverStore.ts'
import { EGRESS, RAMP_TRACK, rampAngle } from './egress.ts'
import { roverTelemetry } from './roverTelemetry.ts'

const DEG = Math.PI / 180
const UP = new Vector3(0, 1, 0)

/**
 * The rover's pallet on the side of the lander and the two ramps it rolls down. The ramps face
 * the first heading of the route, stay folded up until the rover is deployed and lower as its
 * egress starts (`roverTelemetry.egress`).
 */
export function LanderRamp({
  detail,
  grids,
  headingDeg,
}: {
  detail: SiteDetail
  grids: DemGrid[]
  /** Azimuth the rover leaves along, deg clockwise from north. */
  headingDeg: number
}) {
  const roverId = useRoverStore((s) => s.roverId)
  const { half, width } = RAMP_TRACK[roverId]
  const hinge = useRef<Group>(null)

  const m = useMemo(
    () => ({
      rail: new MeshStandardMaterial({ color: '#b9bcc2', metalness: 0.8, roughness: 0.38 }),
      deck: new MeshStandardMaterial({ color: '#8f9299', metalness: 0.7, roughness: 0.5 }),
      dark: new MeshStandardMaterial({ color: '#34363c', metalness: 0.6, roughness: 0.55 }),
    }),
    [],
  )
  useEffect(() => () => Object.values(m).forEach((x) => x.dispose()), [m])

  // Same ground pose as the lander: its height and the local slope.
  const pose = useMemo(() => {
    const g = groundSampler(detail.site, grids)
    const d = 10
    const dydx = (g.groundY(d, 0) - g.groundY(-d, 0)) / (2 * d)
    const dydz = (g.groundY(0, d) - g.groundY(0, -d)) / (2 * d)
    return {
      y: g.groundY(0, 0),
      tilt: new Quaternion().setFromUnitVectors(UP, new Vector3(-dydx, 1, -dydz).normalize()),
    }
  }, [detail, grids])

  const length = Math.hypot(EGRESS.groundR - EGRESS.palletR, EGRESS.palletH)
  useFrame(() => {
    // Local frame: forward is -z, so a positive rotation about x lifts the far end.
    hinge.current?.rotation.set(rampAngle(roverTelemetry.egress), 0, 0)
  })

  const rungs = Math.floor(length / 0.22)
  return (
    <group position={[0, pose.y, 0]} quaternion={pose.tilt}>
      <group rotation={[0, -headingDeg * DEG, 0]}>
        {/* Pallet: a small deck bracketed to the lander's side. */}
        <mesh
          position={[0, EGRESS.palletH - 0.03, -(EGRESS.palletR - 0.45)]}
          material={m.deck}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[2 * half + width + 0.3, 0.05, 1.1]} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh
            key={s}
            position={[
              s * (half + width / 2 + 0.1),
              EGRESS.palletH * 0.5,
              -(EGRESS.palletR - 0.75),
            ]}
            rotation={[0.5, 0, 0]}
            material={m.dark}
            castShadow
          >
            <cylinderGeometry args={[0.02, 0.02, EGRESS.palletH * 1.15, 8]} />
          </mesh>
        ))}
        {/* Ramps, hinged at the outer edge of the pallet. */}
        <group ref={hinge} position={[0, EGRESS.palletH, -EGRESS.palletR]}>
          {[-1, 1].map((s) => (
            <group key={s} position={[s * half, 0, 0]}>
              <mesh position={[0, -0.012, -length / 2]} material={m.rail} castShadow receiveShadow>
                <boxGeometry args={[width, 0.018, length]} />
              </mesh>
              {[-1, 1].map((e) => (
                <mesh
                  key={e}
                  position={[(e * width) / 2, 0.012, -length / 2]}
                  material={m.rail}
                  castShadow
                >
                  <boxGeometry args={[0.014, 0.05, length]} />
                </mesh>
              ))}
              {Array.from({ length: rungs }, (_, i) => (
                <mesh
                  key={i}
                  position={[0, 0.002, -((i + 0.5) * length) / rungs]}
                  material={m.dark}
                >
                  <boxGeometry args={[width - 0.02, 0.012, 0.03]} />
                </mesh>
              ))}
            </group>
          ))}
          {/* Cross brace keeping the two ramps parallel. */}
          <mesh
            position={[0, -0.03, -length * 0.55]}
            rotation={[0, 0, Math.PI / 2]}
            material={m.dark}
          >
            <cylinderGeometry args={[0.012, 0.012, 2 * half, 8]} />
          </mesh>
        </group>
      </group>
    </group>
  )
}
