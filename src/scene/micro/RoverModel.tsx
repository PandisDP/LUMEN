import { type Ref, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import {
  type BufferGeometry,
  type Group,
  type InstancedMesh,
  Matrix4,
  type Mesh,
  type MeshBasicMaterial,
  type MeshStandardMaterial,
  type Object3D,
  type PointLight,
  type SpotLight,
} from 'three'
import type { RoverId } from '../../astro/traverse.ts'
import { type CraftMaterials, useCraftMaterials } from './craftMaterials.ts'
import { buildMicroGeometry, buildUtilityGeometry, disposeGeometries } from './roverGeometry.ts'
import {
  ROVER_RIGS,
  type RigSpec,
  type RoverModelHandle,
  type WheelSpec,
  approach,
  approachAngle,
  clamp,
  solveSuspension,
  steerAngle,
  wheelLayout,
  yawTowards,
} from './roverRig.ts'

const DEG = Math.PI / 180
type V3 = readonly [number, number, number]
type UtilityGeometry = ReturnType<typeof buildUtilityGeometry>
type MicroGeometry = ReturnType<typeof buildMicroGeometry>

/** Travel of the drill carriage down its rails, m. */
const DRILL_TRAVEL = 0.42
/** Spot-light intensity (cd) and beam-cone opacity with the headlights fully on. */
const LAMP_CD: Record<RoverId, number> = { rover: 10, 'csa-rover': 26 }
/** Fill and ground-bounce point lights, cd per metre of rover length. */
const FILL_CD = 0.5
const BOUNCE_CD = 2.2
const BEAM_OPACITY = 0.16

/** Small parts repeated many times (bolt heads): one instanced draw call. */
function Instances({
  geometry,
  material,
  points,
}: {
  geometry: BufferGeometry
  material: MeshStandardMaterial
  points: readonly V3[]
}) {
  const place = useCallback(
    (mesh: InstancedMesh | null) => {
      if (!mesh) return
      const mat = new Matrix4()
      points.forEach((p, i) => mesh.setMatrixAt(i, mat.makeTranslation(p[0], p[1], p[2])))
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
    },
    [points],
  )
  return <instancedMesh ref={place} args={[geometry, material, points.length]} />
}

/** Chevron grousers around a wheel (axle along x). */
function Grousers({
  geometry,
  material,
  count,
}: {
  geometry: BufferGeometry
  material: MeshStandardMaterial
  count: number
}) {
  const place = useCallback(
    (mesh: InstancedMesh | null) => {
      if (!mesh) return
      const mat = new Matrix4()
      for (let i = 0; i < count; i++)
        mesh.setMatrixAt(i, mat.makeRotationX((i / count) * Math.PI * 2))
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
    },
    [count],
  )
  return <instancedMesh ref={place} args={[geometry, material, count]} />
}

/**
 * A wheel on its bracket. The outer group steers (about the vertical through the wheel centre)
 * and carries `children` (fork, hub motor); the inner one spins about the axle.
 */
function Wheel({
  index,
  wheel,
  spec,
  g,
  m,
  children,
}: {
  index: number
  wheel: WheelSpec
  spec: RigSpec
  g: Pick<UtilityGeometry, 'tyre' | 'wheelMetal' | 'grouser'>
  m: CraftMaterials
  children?: React.ReactNode
}) {
  return (
    <group name={`steer${index}`} position={[wheel.x, spec.wheelR, -wheel.u]}>
      {children}
      <group name={`spin${index}`}>
        <mesh geometry={g.tyre} material={m.tyre} castShadow />
        <mesh geometry={g.wheelMetal} material={m.alloy} castShadow />
        <Grousers geometry={g.grouser} material={m.grouser} count={spec.grousers} />
      </group>
    </group>
  )
}

/** Headlights: emissive lenses, their visible beams and the one real spot light. */
function Headlights({
  g,
  m,
  at,
  reach,
}: {
  g: Pick<UtilityGeometry, 'lamps' | 'beams'>
  m: CraftMaterials
  /** Spot-light position (between the lamps) and how far ahead it aims at the ground. */
  at: V3
  reach: number
}) {
  const spot = useRef<SpotLight>(null)
  const target = useRef<Object3D>(null)
  useEffect(() => {
    if (spot.current && target.current) spot.current.target = target.current
  }, [])
  return (
    <>
      <mesh name="lamps" geometry={g.lamps} material={m.lamp} />
      <mesh name="beams" geometry={g.beams} material={m.beam} visible={false} renderOrder={5} />
      <object3D ref={target} position={[0, 0, -reach]} />
      <spotLight
        ref={spot}
        name="spot"
        position={at}
        angle={0.55}
        penumbra={0.6}
        distance={70}
        decay={1.3}
        intensity={0}
        color="#fff3c4"
      />
    </>
  )
}

/**
 * Utility rover (350 kg class, 1.6 m long): six wire-mesh wheels on a rocker-bogie with a
 * differential bar, steered corner wheels, a gold-blanketed electronics box with a louvred
 * radiator, a Sun-tracking vertical array, a pan-tilt stereo mast, a gimballed high-gain dish
 * and a drill at the bow.
 */
function UtilityRover({ spec, g, m }: { spec: RigSpec; g: UtilityGeometry; m: CraftMaterials }) {
  const wheels = useMemo(() => wheelLayout(spec), [spec])
  const P: V3 = [0, spec.pivot.y, -spec.pivot.u]
  const B: V3 = [0, spec.bogie!.pivot.y, -spec.bogie!.pivot.u]
  const unP: V3 = [0, -P[1], -P[2]]
  const unB: V3 = [0, -B[1], -B[2]]
  const wheel = (i: number) => {
    const w = wheels[i]
    const left = w.side < 0
    return (
      <Wheel key={i} index={i} wheel={w} spec={spec} g={g} m={m}>
        {w.steers ? (
          <>
            <mesh geometry={left ? g.forkAlloyL : g.forkAlloyR} material={m.alloy} />
            <mesh geometry={left ? g.forkHousingL : g.forkHousingR} material={m.housing} />
          </>
        ) : (
          <mesh geometry={left ? g.hubMotorL : g.hubMotorR} material={m.housing} />
        )}
      </Wheel>
    )
  }
  return (
    <>
      {/* Chassis: rides on the two rocker pivots. */}
      <group name="body" position={P}>
        <group position={unP}>
          <mesh geometry={g.bodyGold} material={m.foil} castShadow receiveShadow />
          <mesh geometry={g.bodySilver} material={m.deckFoil} castShadow receiveShadow />
          <mesh geometry={g.bodyPaint} material={m.paint} castShadow receiveShadow />
          <mesh geometry={g.bodyHousing} material={m.housing} castShadow />
          <mesh geometry={g.bodyAlloy} material={m.alloy} castShadow />
          <mesh geometry={g.harness} material={m.harness} />
          <mesh geometry={g.bodyLens} material={m.lens} />
          <Instances geometry={g.bolt} material={m.alloy} points={g.points.bolts} />
          <Headlights g={g} m={m} at={[0, 0.66, -0.5]} reach={7} />
          <group name="diff" position={[0, 0.72, P[2]]}>
            <mesh geometry={g.diffBar} material={m.alloy} castShadow />
          </group>
          {/* Solar array: yaws to the Sun, tilts back by its elevation. */}
          <group name="solarYaw" position={[0, 1.1, 0.3]} rotation={[0, Math.PI / 2, 0]}>
            <mesh geometry={g.arrayYoke} material={m.alloy} castShadow />
            <group name="solarTilt" position={[0, 0.07, 0]}>
              <mesh geometry={g.panelCells} material={m.panel} receiveShadow />
              <mesh geometry={g.panelBack} material={m.paint} castShadow receiveShadow />
              <mesh geometry={g.panelFrame} material={m.alloy} castShadow />
            </group>
          </group>
          {/* Camera head. */}
          <group name="pan" position={[0.24, 1.3, -0.34]}>
            <mesh geometry={g.panYoke} material={m.alloy} castShadow />
            <group name="tilt" position={[0, 0.09, 0]}>
              <mesh geometry={g.headPaint} material={m.paint} castShadow />
              <mesh geometry={g.headHousing} material={m.housing} />
              <mesh geometry={g.headLens} material={m.lens} />
              <mesh geometry={g.navLight} material={m.nav} />
            </group>
          </group>
          {/* High-gain antenna. */}
          <group name="hgaAz" position={[-0.24, 0.92, -0.3]}>
            <mesh geometry={g.hgaYoke} material={m.alloy} castShadow />
            <group name="hgaEl" position={[0, 0.11, 0.05]} rotation={[Math.PI / 2, 0, 0]}>
              <group position={[0, 0, -0.05]}>
                <mesh geometry={g.dish} material={m.dish} castShadow />
                <mesh geometry={g.dishParts} material={m.alloy} />
              </group>
            </group>
          </group>
          {/* Drill. */}
          <group name="drill">
            <mesh geometry={g.drillCarriage} material={m.housing} castShadow />
            <group name="auger" position={[0, 0.8, -0.53]}>
              <mesh geometry={g.auger} material={m.alloy} castShadow />
            </group>
          </group>
        </group>
      </group>
      {/* Suspension: wheel order of wheelLayout() is left front, mid, rear, then right. */}
      {([0, 1] as const).map((side) => (
        <group key={side} name={`rocker${side}`} position={[0, P[1], P[2]]}>
          <group position={unP}>
            <mesh geometry={side ? g.rockerR : g.rockerL} material={m.alloy} castShadow />
            {wheel(side * 3)}
            <group name={`bogie${side}`} position={B}>
              <group position={unB}>
                <mesh geometry={side ? g.bogieR : g.bogieL} material={m.alloy} castShadow />
                {wheel(side * 3 + 1)}
                {wheel(side * 3 + 2)}
              </group>
            </group>
          </group>
        </group>
      ))}
    </>
  )
}

/**
 * Micro-rover (40 kg class, 0.75 m long): four wheels on two rockers, a gold box under a flat
 * solar deck, a short mast with one camera and a patch antenna. Skid-steered.
 */
function MicroRover({ spec, g, m }: { spec: RigSpec; g: MicroGeometry; m: CraftMaterials }) {
  const wheels = useMemo(() => wheelLayout(spec), [spec])
  const P: V3 = [0, spec.pivot.y, -spec.pivot.u]
  const unP: V3 = [0, -P[1], -P[2]]
  return (
    <>
      <group name="body" position={P}>
        <group position={unP}>
          <mesh geometry={g.bodyGold} material={m.foil} castShadow receiveShadow />
          <mesh geometry={g.bodySilver} material={m.silverFoil} castShadow />
          <mesh geometry={g.bodyPaint} material={m.paint} castShadow receiveShadow />
          <mesh geometry={g.panelCells} material={m.panel} receiveShadow />
          <mesh geometry={g.bodyHousing} material={m.housing} castShadow />
          <mesh geometry={g.bodyAlloy} material={m.alloy} castShadow />
          <mesh geometry={g.harness} material={m.harness} />
          <mesh geometry={g.bodyLens} material={m.lens} />
          <Instances geometry={g.bolt} material={m.alloy} points={g.points.bolts} />
          <Headlights g={g} m={m} at={[0, 0.23, -0.33]} reach={3.5} />
        </group>
      </group>
      {([0, 1] as const).map((side) => (
        <group key={side} name={`rocker${side}`} position={[0, P[1], P[2]]}>
          <group position={unP}>
            <mesh geometry={side ? g.rockerR : g.rockerL} material={m.alloy} castShadow />
            <mesh geometry={side ? g.motorsR : g.motorsL} material={m.housing} />
            {[0, 1].map((k) => {
              const i = side * 2 + k
              return <Wheel key={i} index={i} wheel={wheels[i]} spec={spec} g={g} m={m} />
            })}
          </group>
        </group>
      ))}
    </>
  )
}

/** The moving parts, looked up once by name. */
function collectNodes(root: Group, wheels: number) {
  const get = <T extends Object3D>(name: string) => (root.getObjectByName(name) ?? null) as T | null
  const list = (prefix: string, n: number) =>
    Array.from({ length: n }, (_, i) => get<Group>(`${prefix}${i}`))
  return {
    body: get<Group>('body'),
    rockers: list('rocker', 2),
    bogies: list('bogie', 2),
    steer: list('steer', wheels),
    spin: list('spin', wheels),
    diff: get<Group>('diff'),
    solarYaw: get<Group>('solarYaw'),
    solarTilt: get<Group>('solarTilt'),
    pan: get<Group>('pan'),
    tilt: get<Group>('tilt'),
    hgaAz: get<Group>('hgaAz'),
    hgaEl: get<Group>('hgaEl'),
    drill: get<Group>('drill'),
    auger: get<Group>('auger'),
    lamps: get<Mesh<BufferGeometry, MeshStandardMaterial>>('lamps'),
    beams: get<Mesh<BufferGeometry, MeshBasicMaterial>>('beams'),
    spot: get<SpotLight>('spot'),
    fill: get<PointLight>('fill'),
    bounce: get<PointLight>('bounce'),
  }
}

/**
 * Procedural rover (no external model), at real size, built facing -z with its wheels on y = 0.
 * The caller places and orients the group it is in; `ref.update(frame, dt)` moves the
 * suspension, the wheels, the steering, the array, the antenna, the camera head, the drill and
 * the headlights (no React state per frame).
 */
export function RoverModel({ id, ref }: { id: RoverId; ref?: Ref<RoverModelHandle> }) {
  const spec = ROVER_RIGS[id]
  const m = useCraftMaterials()
  const g = useMemo(
    () => (spec.bogie ? buildUtilityGeometry(spec) : buildMicroGeometry(spec)),
    [spec],
  )
  useEffect(() => () => disposeGeometries(g), [g])
  const root = useRef<Group>(null)
  const nodes = useRef<ReturnType<typeof collectNodes> | null>(null)
  const layout = useMemo(() => wheelLayout(spec), [spec])
  /** Slewed values (suspension input, pointing, lights), kept between frames. */
  const state = useRef({
    heights: [] as number[],
    solarYaw: Math.PI / 2,
    solarTilt: 0,
    pan: 0,
    tilt: 0,
    hgaAz: 0,
    hgaEl: Math.PI / 2,
    drill: 0,
    light: 0,
    idle: 0,
  })
  useEffect(() => {
    nodes.current = root.current ? collectNodes(root.current, layout.length) : null
    return () => {
      nodes.current = null
    }
  }, [layout])

  useImperativeHandle(
    ref,
    () => ({
      update(f, dt) {
        const n = nodes.current
        if (!n) return
        const st = state.current
        // Suspension, on slightly smoothed ground heights (time-lapse playback jumps metres).
        if (st.heights.length !== layout.length) st.heights = layout.map(() => 0)
        for (let i = 0; i < layout.length; i++)
          st.heights[i] = approach(st.heights[i], f.wheelHeights[i] ?? 0, dt, 0.08)
        const sol = solveSuspension(spec, st.heights)
        n.body?.position.setY(spec.pivot.y + sol.heave)
        n.body?.rotation.set(sol.pitch, 0, sol.roll)
        for (const side of [0, 1] as const) {
          const s = sol.sides[side]
          n.rockers[side]?.position.setY(spec.pivot.y + s.lift)
          n.rockers[side]?.rotation.set(s.rocker, 0, 0)
          n.bogies[side]?.rotation.set(s.bogie - s.rocker, 0, 0)
        }
        // The bar's ends follow the rocker horns (0.2 m above the pivots), fore and aft.
        n.diff?.rotation.set(0, Math.asin(clamp((0.2 * Math.sin(sol.diff)) / spec.armX, -1, 1)), 0)
        // Wheels: rolling forward (-z) is a negative turn about x; steering right is negative y.
        for (let i = 0; i < layout.length; i++) {
          const w = layout[i]
          n.spin[i]?.rotation.set(-f.spin, 0, 0)
          if (w.steers)
            n.steer[i]?.rotation.set(0, -steerAngle(f.turnPerM, w.x, w.u, spec.maxSteerRad), 0)
        }
        // Solar array to the Sun (rest pose: broadside to port).
        const sunKnown = f.sunAzDeg !== null && f.sunElDeg !== null
        st.solarYaw = approachAngle(
          st.solarYaw,
          sunKnown ? yawTowards(f.sunAzDeg!, f.headingDeg) : Math.PI / 2,
          dt,
          0.6,
        )
        st.solarTilt = approach(
          st.solarTilt,
          sunKnown ? clamp(f.sunElDeg!, 0, 35) * DEG : 0,
          dt,
          0.6,
        )
        n.solarYaw?.rotation.set(0, st.solarYaw, 0)
        n.solarTilt?.rotation.set(st.solarTilt, 0, 0)
        // Dish to the Earth while the link is up; stowed to the zenith otherwise.
        const track = f.link && f.earthAzDeg !== null && f.earthElDeg !== null
        st.hgaAz = approachAngle(
          st.hgaAz,
          track ? yawTowards(f.earthAzDeg!, f.headingDeg) : 0,
          dt,
          0.8,
        )
        st.hgaEl = approach(
          st.hgaEl,
          track ? clamp(f.earthElDeg!, 0, 85) * DEG : Math.PI / 2,
          dt,
          0.8,
        )
        n.hgaAz?.rotation.set(0, st.hgaAz, 0)
        n.hgaEl?.rotation.set(st.hgaEl, 0, 0)
        // Camera head: into the turn while driving, a slow scan when parked, down at the drill.
        st.idle += dt
        let pan = Math.sin(st.idle * 0.5) * 0.7
        let tilt = -0.08
        if (f.drilling) {
          pan = 0.75
          tilt = -0.95
        } else if (f.driving) {
          pan = -2 * steerAngle(f.turnPerM, 0, spec.frontU, 0.35)
          tilt = -0.16
        }
        st.pan = approach(st.pan, pan, dt, 0.5)
        st.tilt = approach(st.tilt, tilt, dt, 0.5)
        n.pan?.rotation.set(0, st.pan, 0)
        n.tilt?.rotation.set(st.tilt, 0, 0)
        // Drill: lowers and turns once the rover has arrived.
        const before = st.drill
        st.drill = approach(st.drill, f.drilling ? 1 : 0, dt, 1.1)
        n.drill?.position.setY(-DRILL_TRAVEL * st.drill)
        if (f.drilling || Math.abs(st.drill - before) > 1e-4) n.auger?.rotateY(-dt * 9)
        // Headlights.
        st.light = approach(st.light, f.dark ? 1 : 0, dt, 0.35)
        const on = st.light > 0.01
        n.lamps?.material.setValues({ emissiveIntensity: 5 * st.light })
        n.beams?.material.setValues({ opacity: BEAM_OPACITY * st.light })
        if (n.beams && n.beams.visible !== on) n.beams.visible = on
        if (n.spot) n.spot.intensity = LAMP_CD[spec.id] * st.light
        // The lit ground ahead throws light back at the rover; its deck lights come on too.
        if (n.bounce) n.bounce.intensity = BOUNCE_CD * spec.lengthM * st.light
        if (n.fill) n.fill.intensity = FILL_CD * spec.lengthM * (1 + 2.5 * st.light)
      },
    }),
    [spec, layout],
  )

  return (
    <group ref={root}>
      {spec.bogie ? (
        <UtilityRover spec={spec} g={g as UtilityGeometry} m={m} />
      ) : (
        <MicroRover spec={spec} g={g as MicroGeometry} m={m} />
      )}
      {/* Faint fill (light bounced off the regolith) so the craft reads against the low Sun. */}
      <pointLight
        name="fill"
        position={[spec.widthM * 0.5, spec.heightM * 1.1, spec.lengthM * 0.75]}
        intensity={FILL_CD * spec.lengthM}
        distance={spec.lengthM * 4}
        decay={1.4}
        color="#cfd8ff"
      />
      {/* What the headlit ground ahead sends back (only with the lamps on). */}
      <pointLight
        name="bounce"
        position={[0, spec.heightM * 0.35, -spec.lengthM * 1.5]}
        intensity={0}
        distance={spec.lengthM * 6}
        decay={1.5}
        color="#ffe6b0"
      />
    </group>
  )
}
