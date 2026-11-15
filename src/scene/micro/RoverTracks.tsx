import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { BufferAttribute, BufferGeometry, type Points } from 'three'
import type { DemGrid } from '../../astro/dem.ts'
import { groundSampler } from '../../astro/descent.ts'
import { latLonToScene } from '../../astro/terrainMesh.ts'
import { ROVER_VEHICLES, type TraverseResult } from '../../astro/traverse.ts'
import type { SiteDetail } from '../../data/catalog.ts'
import { useRoverStore } from '../../store/useRoverStore.ts'
import { prefersReducedMotion } from '../canvasTexture.ts'
import { DustSim, LUNAR_G, dustMaterial, setDustOpacity } from './dust.ts'
import { EGRESS } from './egress.ts'
import { terrainSegments } from './nearGroundField.ts'
import { roverTelemetry } from './roverTelemetry.ts'
import { surfaceHalfSize } from './surface.ts'
import {
  type PathPoint,
  RETURN_LIFT_M,
  ROVER_TRACKS,
  TRACK_BIAS_M,
  type TrackSpec,
  buildTrackRibbons,
  resamplePath,
  returnShiftM,
  terrainMeshHeight,
  trackDrawCount,
  trackReveal,
} from './trackGeometry.ts'
import { createTrackMaterial } from './trackMaterial.ts'

const DEG = Math.PI / 180
/** Pool of wheel-dust grains and grains thrown per second by each rear wheel at full speed. */
const DUST_MAX = 400
const DUST_RATE = 150

/** The ribbons of one leg as a geometry that starts hidden. */
function ribbonGeometry(
  path: readonly PathPoint[],
  spec: TrackSpec,
  surfaceY: (x: number, z: number) => number,
  biasM: number,
  lateralM?: (distM: number) => number,
) {
  const ribbons = buildTrackRibbons(
    resamplePath(path, undefined, Math.max(0.6, 1.6 * spec.halfWidthM)),
    spec,
    surfaceY,
    biasM,
    undefined,
    lateralM,
  )
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(ribbons.positions, 3))
  geometry.setAttribute('normal', new BufferAttribute(ribbons.normals, 3))
  geometry.setAttribute('uv', new BufferAttribute(ribbons.uvs, 2))
  geometry.setAttribute('dist', new BufferAttribute(ribbons.dist, 1))
  geometry.setAttribute('edge', new BufferAttribute(ribbons.edge, 2))
  geometry.setIndex(new BufferAttribute(ribbons.indices, 1))
  geometry.setDrawRange(0, 0)
  return { geometry, sampleDist: ribbons.sampleDist }
}

/**
 * What the rover leaves behind: the tracks of its wheels, laid once along the whole route and
 * revealed up to where it is, and the regolith its rear wheels throw. The round trip leaves two
 * sets of tracks: the way out and, a little to its side, the way back (each revealed by the
 * distance driven on its own leg). There is no air, so the
 * dust makes no cloud: each grain flies a low ballistic arc and falls back within a second.
 * The dust is simulated in real time around the rover whatever the playback speed (at hundreds
 * of simulated seconds per second it would otherwise be noise). Purely cosmetic.
 */
export function RoverTracks({
  detail,
  grids,
  traverse,
}: {
  detail: SiteDetail
  grids: DemGrid[]
  traverse: TraverseResult
}) {
  const roverId = useRoverStore((s) => s.roverId)
  const run = useRoverStore((s) => s.run)
  const seek = useRoverStore((s) => s.seek)
  const height = useThree((s) => s.size.height)
  const spec = ROVER_TRACKS[roverId]
  const still = useMemo(() => prefersReducedMotion(), [])

  /** Height of what is drawn at (x, z): the terrain mesh or the DEM, whichever is on top. */
  const surfaceY = useMemo(() => {
    const ground = groundSampler(detail.site, grids)
    if (!grids.length) return ground.groundY
    // The same surface the close-range patch (NearGround) follows along the route.
    const meshY = terrainMeshHeight(
      detail.site,
      grids,
      ground,
      surfaceHalfSize(detail),
      terrainSegments(Boolean(detail.terrain)),
    )
    return (x: number, z: number) => Math.max(ground.groundY(x, z), meshY(x, z))
  }, [detail, grids])

  const tracks = useMemo(() => {
    const { points, turnIndex, outLengthM } = traverse.plan
    const path = points.map((p) => {
      const [x, , z] = latLonToScene(detail.site, p.lat, p.lon, p.heightM)
      return { x, z, distM: p.distM }
    })
    const turn = turnIndex < 0 ? path.length - 1 : turnIndex
    return {
      out: ribbonGeometry(path.slice(0, turn + 1), spec, surfaceY, TRACK_BIAS_M),
      back: ribbonGeometry(
        path.slice(turn + 1),
        spec,
        surfaceY,
        TRACK_BIAS_M + RETURN_LIFT_M,
        (d) => returnShiftM(spec, d - outLengthM),
      ),
    }
  }, [traverse, detail, spec, surfaceY])
  useEffect(
    () => () => {
      tracks.out.geometry.dispose()
      tracks.back.geometry.dispose()
    },
    [tracks],
  )

  // One material per leg: each has its own visible stretch.
  const look = useMemo(
    () => ({ out: createTrackMaterial(spec.treadM), back: createTrackMaterial(spec.treadM) }),
    [spec],
  )
  useEffect(
    () => () => {
      look.out.material.dispose()
      look.back.material.dispose()
    },
    [look],
  )

  const sim = useMemo(
    () => new DustSim({ max: DUST_MAX, seed: 29, peakAlpha: 0.6, settle: true, settleS: 0.35 }),
    [],
  )
  const dust = useMemo(() => dustMaterial(height), [height])
  const points = useRef<Points>(null)
  useEffect(() => () => sim.geometry.dispose(), [sim])
  useEffect(() => () => dust.dispose(), [dust])
  // Restarting or jumping along the route leaves no grains hanging where the rover was.
  useEffect(() => sim.clear(), [sim, run, seek, traverse])

  useFrame((frame, delta) => {
    const tm = roverTelemetry
    const store = useRoverStore.getState()
    const onGround = tm.active && tm.egress >= 1 && Number.isFinite(tm.distM)

    // Tracks: from where the ramps touch the ground up to the front wheels, leg by leg.
    const reveal = trackReveal(
      onGround ? tm.poseDistM : NaN,
      traverse.plan.outLengthM,
      spec,
      EGRESS.groundR,
    )
    const pixelAngle = 2 / (frame.camera.projectionMatrix.elements[5] * frame.size.height)
    for (const leg of ['out', 'back'] as const) {
      const { fromM, toM } = reveal[leg]
      const { geometry, sampleDist } = tracks[leg]
      geometry.setDrawRange(0, toM > fromM ? trackDrawCount(sampleDist, toM) : 0)
      look[leg].update(fromM, toM, pixelAngle)
    }

    // Dust, in a frame that rides with the rover (y up, axes as the scene).
    if (still) return
    points.current?.position.set(tm.x, tm.y, tm.z)
    const dt = Math.min(delta, 0.1)
    const speed = onGround && store.playing && tm.driving && !tm.done ? tm.speedMs : 0
    if (speed > 0) {
      const h = tm.headingDeg * DEG
      const fx = Math.sin(h)
      const fz = -Math.cos(h)
      const rx = -fz
      const rz = fx
      // Local slope: where a grain thrown from the wheels meets the ground again.
      const y0 = surfaceY(tm.x, tm.z)
      const gx = surfaceY(tm.x + 1, tm.z) - y0
      const gz = surfaceY(tm.x, tm.z + 1) - y0
      const k = Math.min(1.2, speed / ROVER_VEHICLES[roverId].speedMs)
      const rand = sim.rand
      for (let n = sim.due(2 * DUST_RATE * k, dt); n > 0; n--) {
        const side = rand() < 0.5 ? -1 : 1
        // Contact patch of a rear wheel, with some scatter across the tread.
        const across = side * spec.halfWidthM + (rand() - 0.5) * spec.treadM
        const back = spec.rearM + rand() * 0.08
        const x = -fx * back + rx * across
        const z = -fz * back + rz * across
        // Thrown backwards and a little outwards, 0.3–1.2 m/s, 15–50° above the ground.
        const v = 0.3 + 0.9 * rand() * rand()
        const el = (15 + 35 * rand()) * DEG
        const out = side * (0.05 + 0.45 * rand())
        const vh = v * Math.cos(el)
        const vy = v * Math.sin(el)
        const norm = Math.hypot(1, out)
        const vx = ((-fx + rx * out) / norm) * vh
        const vz = ((-fz + rz * out) / norm) * vh
        const flight = (2 * vy) / LUNAR_G
        const y = gx * x + gz * z + 0.03
        const floor = gx * (x + vx * flight) + gz * (z + vz * flight) + 0.02
        sim.spawn(x, y, z, vx, vy, vz, floor, flight + 1, spec.treadM * (0.14 + 0.24 * rand()))
      }
    }
    sim.step(dt)
    // No air to scatter light: grains only show where the Sun (or a lamp) reaches them.
    setDustOpacity(dust, Math.max(Number.isFinite(tm.sunFrac) ? tm.sunFrac : 0, 0.15))
  })

  return (
    <>
      <mesh
        geometry={tracks.out.geometry}
        material={look.out.material}
        frustumCulled={false}
        receiveShadow
        renderOrder={2}
      />
      <mesh
        geometry={tracks.back.geometry}
        material={look.back.material}
        frustumCulled={false}
        receiveShadow
        renderOrder={3}
      />
      {!still && (
        <points
          ref={points}
          geometry={sim.geometry}
          material={dust}
          frustumCulled={false}
          renderOrder={5}
        />
      )}
    </>
  )
}
