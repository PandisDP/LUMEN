import {
  BoxGeometry,
  type BufferGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  Euler,
  LatheGeometry,
  Matrix4,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { RigSpec } from './roverRig.ts'

/**
 * Geometry of the rovers, in metres, built facing -z with the ground at y = 0. Everything that
 * moves together and shares a material is merged into one geometry (one draw call), so a rover
 * with hundreds of parts stays within a few dozen calls.
 */
type V3 = readonly [number, number, number]

const HALF = Math.PI / 2
const UP = new Vector3(0, 1, 0)

function place<T extends BufferGeometry>(g: T, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0]): T {
  g.applyMatrix4(
    new Matrix4().compose(
      new Vector3(...pos),
      new Quaternion().setFromEuler(new Euler(...rot)),
      new Vector3(1, 1, 1),
    ),
  )
  return g
}

const box = (w: number, h: number, d: number, pos: V3, rot?: V3) =>
  place(new BoxGeometry(w, h, d), pos, rot)
/** Cylinders along y, x and z. `r2` is the radius of the far end (+axis). */
const cylY = (r: number, len: number, pos: V3, seg = 14, r2 = r) =>
  place(new CylinderGeometry(r2, r, len, seg), pos)
const cylX = (r: number, len: number, pos: V3, seg = 14) =>
  place(new CylinderGeometry(r, r, len, seg), pos, [0, 0, HALF])
const cylZ = (r: number, len: number, pos: V3, seg = 14, r2 = r) =>
  place(new CylinderGeometry(r2, r, len, seg), pos, [HALF, 0, 0])
const ball = (r: number, pos: V3) => place(new SphereGeometry(r, 10, 8), pos)

function rod(a: V3, b: V3, r: number, seg = 8) {
  const va = new Vector3(...a)
  const vb = new Vector3(...b)
  const g = new CylinderGeometry(r, r, va.distanceTo(vb), seg)
  g.applyMatrix4(
    new Matrix4().compose(
      va.clone().add(vb).multiplyScalar(0.5),
      new Quaternion().setFromUnitVectors(UP, vb.clone().sub(va).normalize()),
      new Vector3(1, 1, 1),
    ),
  )
  return g
}

/** Straight tubes through the points, with a ball at every joint. */
function pipe(points: V3[], r: number): BufferGeometry[] {
  const out: BufferGeometry[] = []
  for (let i = 0; i + 1 < points.length; i++) out.push(rod(points[i], points[i + 1], r))
  for (const p of points) out.push(ball(r * 1.15, p))
  return out
}

/** A smooth tube through the points (cables). */
const cable = (points: V3[], r: number, closed = false) =>
  new TubeGeometry(
    new CatmullRomCurve3(
      points.map((p) => new Vector3(...p)),
      closed,
      'catmullrom',
      0.5,
    ),
    points.length * 7,
    r,
    6,
    closed,
  )

/** One geometry out of many; the parts are disposed. */
function merge(...parts: (BufferGeometry | BufferGeometry[])[]): BufferGeometry {
  const flat = parts.flat().map((p) => {
    if (!p.index) return p
    const n = p.toNonIndexed()
    p.dispose()
    return n
  })
  const out = mergeGeometries(flat, false)
  flat.forEach((p) => p.dispose())
  return out
}

/** Wheel, axle along x, centred on the origin: spring tyre, rims with spokes, one grouser. */
function wheelGeometry(R: number, W: number) {
  // Tyre: a slightly crowned band of woven wire between the two rims.
  const rim = R * 0.82
  const profile = [
    [rim, -0.5],
    [R * 0.95, -0.47],
    [R * 0.99, -0.3],
    [R, 0],
    [R * 0.99, 0.3],
    [R * 0.95, 0.47],
    [rim, 0.5],
  ].map(([r, a]) => new Vector2(r, a * W))
  const tyre = place(new LatheGeometry(profile, 40), [0, 0, 0], [0, 0, -HALF])
  // Square diamonds of the weave, about a sixth of the radius across.
  const cell = R * 0.17
  const uv = tyre.getAttribute('uv')
  const around = Math.round((2 * Math.PI * R) / cell)
  const across = Math.max(2, Math.round((W * 1.25) / cell))
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * around, uv.getY(i) * across)

  const hoop = (x: number) =>
    place(new TorusGeometry(rim, R * 0.04, 6, 40), [x, 0, 0], [0, HALF, 0])
  const spokes: BufferGeometry[] = []
  for (const x of [-0.44 * W, 0.44 * W])
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + (x > 0 ? 0 : Math.PI / 6)
      const mid = R * 0.56
      spokes.push(
        box(R * 0.035, R * 0.56, R * 0.13, [x, Math.cos(a) * mid, Math.sin(a) * mid], [a, 0, 0]),
      )
    }
  const metal = merge(
    hoop(-W / 2),
    hoop(W / 2),
    // Drum (the hub motor sits inside) and the hub caps.
    cylX(R * 0.34, W * 0.92, [0, 0, 0], 20),
    cylX(R * 0.16, W * 1.06, [0, 0, 0], 12),
    spokes,
  )
  // Chevron grouser, lying on the tread at the top of the wheel (instanced around it).
  const half = W * 0.5
  const a = 0.36
  const len = half / Math.cos(a)
  const t = R * 0.036
  const grouser = merge(
    box(len, t, t * 1.2, [-half / 2, R * 0.975 + t * 0.3, 0], [0, a, 0]),
    box(len, t, t * 1.2, [half / 2, R * 0.975 + t * 0.3, 0], [0, -a, 0]),
  )
  return { tyre, wheelMetal: metal, grouser }
}

/** Headlight beams: open cones from each lamp, forward and slightly down. */
function beamGeometry(lamps: V3[], length: number, spread: number, r0: number) {
  const down = 0.16
  return merge(
    lamps.map((p) => {
      const g = new CylinderGeometry(r0, r0 + length * spread, length, 28, 1, true)
      // Narrow end at the lamp (+y of the cylinder), then pointed along -z and tipped down.
      g.translate(0, -length / 2, 0)
      return place(g, p, [HALF - down, 0, 0])
    }),
  )
}

/** Bolt-head positions around a rectangle in a horizontal plane. */
function boltRing(cx: number, y: number, cz: number, w: number, d: number, n: number): V3[] {
  const out: V3[] = []
  const nx = Math.max(2, Math.round((n * w) / (2 * (w + d))))
  const nz = Math.max(2, Math.round((n * d) / (2 * (w + d))))
  for (let i = 0; i <= nx; i++)
    for (const s of [-1, 1]) out.push([cx - w / 2 + (w * i) / nx, y, cz + (s * d) / 2])
  for (let i = 1; i < nz; i++)
    for (const s of [-1, 1]) out.push([cx + (s * w) / 2, y, cz - d / 2 + (d * i) / nz])
  return out
}

/**
 * Utility rover. Chassis coordinates: the warm electronics box spans x ±0.29, y 0.44–0.70,
 * z −0.42 (front) to +0.50.
 */
export function buildUtilityGeometry(spec: RigSpec) {
  const R = spec.wheelR
  const X = spec.armX
  const T = spec.trackHalf
  const P: V3 = [0, spec.pivot.y, -spec.pivot.u]
  const B = spec.bogie!.pivot
  const zF = -spec.frontU
  const zR = -spec.rearU
  const zM = -spec.bogie!.midU
  /** Height of the steering actuators (on the wheel's vertical axis, above the tyre). */
  const actUp = 0.32
  const act = R + actUp
  const deck = 0.72

  // --- Body -----------------------------------------------------------------------------------
  const bodyGold = merge(
    box(0.58, 0.26, 0.92, [0, 0.57, 0.04]),
    // Science deck: a payload box in the same blanket.
    box(0.13, 0.07, 0.13, [0.19, deck + 0.035, 0.1]),
  )
  const bodySilver = merge(
    box(0.64, 0.02, 0.98, [0, deck - 0.01, 0.04]),
    box(0.014, 0.19, 0.6, [-0.292, 0.57, 0.06]),
    // Battery box at the rear and the avionics doghouse at the front of the deck.
    box(0.42, 0.2, 0.13, [0, 0.56, 0.565]),
    box(0.2, 0.06, 0.14, [0, deck + 0.03, -0.32]),
    box(0.5, 0.012, 0.012, [0, 0.445, -0.424]),
  )
  const louvres: BufferGeometry[] = []
  for (let i = 0; i < 9; i++)
    louvres.push(box(0.03, 0.004, 0.56, [0.316, 0.5 + i * 0.02, 0.1], [0, 0, 0.6]))
  const bodyPaint = merge(
    // Radiator with its louvres and frame, on the right flank.
    box(0.014, 0.21, 0.6, [0.297, 0.58, 0.1]),
    louvres,
    box(0.03, 0.22, 0.012, [0.312, 0.58, -0.2]),
    box(0.03, 0.22, 0.012, [0.312, 0.58, 0.4]),
    box(0.03, 0.012, 0.612, [0.312, 0.69, 0.1]),
    // Spectrometer on the deck and the calibration target next to it.
    box(0.18, 0.1, 0.14, [-0.18, deck + 0.05, 0.1]),
    cylY(0.036, 0.008, [0.04, deck + 0.004, 0.12], 18),
    // Sample tray.
    box(0.16, 0.012, 0.1, [0.2, deck + 0.006, 0.42]),
  )
  const bodyHousing = merge(
    // Hazard-camera bar and lens hoods; headlight housings.
    box(0.46, 0.05, 0.03, [0, 0.5, -0.435]),
    cylZ(0.026, 0.04, [-0.19, 0.5, -0.455]),
    cylZ(0.026, 0.04, [0.19, 0.5, -0.455]),
    cylZ(0.045, 0.06, [-0.23, 0.645, -0.44], 16, 0.036),
    cylZ(0.045, 0.06, [0.23, 0.645, -0.44], 16, 0.036),
    // Battery straps and connector.
    box(0.03, 0.21, 0.14, [-0.12, 0.56, 0.567]),
    box(0.03, 0.21, 0.14, [0.12, 0.56, 0.567]),
    cylZ(0.022, 0.03, [0.16, 0.6, 0.64]),
    // Mast, antenna and array bearings on the deck.
    cylY(0.04, 0.04, [0.24, deck + 0.02, -0.34], 16),
    cylY(0.034, 0.03, [-0.24, deck + 0.015, -0.3], 16),
    cylY(0.05, 0.05, [0, deck + 0.025, 0.3], 16),
    cylY(0.018, 0.05, [-0.27, deck + 0.025, 0.46], 10),
    // Differential pivot, neutron spectrometer tube, dust covers on the instruments.
    cylY(0.04, 0.03, [0, deck + 0.015, P[2]], 16),
    cylX(0.028, 0.3, [0, deck + 0.03, 0.44], 12),
    box(0.1, 0.012, 0.08, [-0.18, deck + 0.106, 0.1]),
    // Rocker pivot bosses on the flanks.
    cylX(0.06, 0.03, [-0.3, P[1], P[2]], 18),
    cylX(0.06, 0.03, [0.3, P[1], P[2]], 18),
  )
  const drillZ = -0.53
  const rail = (x: number) => rod([x, 0.3, drillZ], [x, 1.0, drillZ], 0.011)
  const bodyAlloy = merge(
    // Camera mast, antenna post, array post with braces, whip antenna.
    cylY(0.021, 0.58, [0.24, deck + 0.29, -0.34], 12),
    cylY(0.027, 0.03, [0.24, deck + 0.3, -0.34], 12),
    cylY(0.017, 0.2, [-0.24, deck + 0.1, -0.3], 10),
    cylY(0.025, 0.38, [0, deck + 0.19, 0.3], 12),
    rod([0.14, deck, 0.42], [0, deck + 0.26, 0.3], 0.008),
    rod([-0.14, deck, 0.42], [0, deck + 0.26, 0.3], 0.008),
    cylY(0.004, 0.62, [-0.27, deck + 0.36, 0.46], 6),
    ball(0.009, [-0.27, deck + 0.67, 0.46]),
    // Drill frame: two rails, crossbars, a foot ring and the brackets to the chassis.
    rail(-0.075),
    rail(0.075),
    box(0.18, 0.02, 0.03, [0, 1.0, drillZ]),
    box(0.18, 0.02, 0.03, [0, 0.3, drillZ]),
    place(new TorusGeometry(0.045, 0.008, 6, 20), [0, 0.29, drillZ], [HALF, 0, 0]),
    rod([-0.075, 0.47, drillZ], [-0.075, 0.47, -0.42], 0.01),
    rod([0.075, 0.47, drillZ], [0.075, 0.47, -0.42], 0.01),
    rod([-0.075, 0.7, drillZ], [-0.075, 0.7, -0.42], 0.01),
    rod([0.075, 0.7, drillZ], [0.075, 0.7, -0.42], 0.01),
    rod([-0.075, 1.0, drillZ], [-0.09, 0.78, -0.39], 0.008),
    rod([0.075, 1.0, drillZ], [0.09, 0.78, -0.39], 0.008),
    // Handling rails along the deck edges.
    pipe(
      [
        [-0.3, deck, 0.18],
        [-0.3, deck + 0.05, 0.2],
        [-0.3, deck + 0.05, 0.5],
        [-0.3, deck, 0.52],
      ],
      0.007,
    ),
    pipe(
      [
        [0.3, deck, 0.18],
        [0.3, deck + 0.05, 0.2],
        [0.3, deck + 0.05, 0.5],
        [0.3, deck, 0.52],
      ],
      0.007,
    ),
  )
  const harness = merge(
    // From the avionics doghouse up the camera mast (two turns around its foot).
    cable(
      [
        [0.1, deck + 0.04, -0.3],
        [0.17, deck + 0.02, -0.27],
        [0.24, deck + 0.05, -0.3],
        [0.28, deck + 0.07, -0.34],
        [0.24, deck + 0.1, -0.38],
        [0.2, deck + 0.13, -0.34],
        [0.24, deck + 0.17, -0.31],
        [0.265, deck + 0.3, -0.34],
      ],
      0.007,
    ),
    // Along the deck to the array post and to the spectrometer.
    cable(
      [
        [-0.08, deck + 0.03, -0.25],
        [-0.1, deck + 0.012, -0.14],
        [-0.06, deck + 0.012, 0.0],
        [-0.03, deck + 0.012, 0.16],
        [-0.04, deck + 0.03, 0.26],
        [-0.03, deck + 0.12, 0.29],
      ],
      0.008,
    ),
    cable(
      [
        [-0.09, deck + 0.012, -0.02],
        [-0.14, deck + 0.02, 0.0],
        [-0.18, deck + 0.05, 0.03],
      ],
      0.006,
    ),
    // Down the left flank to the drive motors, and across to the drill.
    cable(
      [
        [-0.2, deck + 0.012, -0.2],
        [-0.3, deck + 0.02, -0.19],
        [-0.315, 0.66, -0.17],
        [-0.31, 0.6, -0.13],
      ],
      0.006,
    ),
    cable(
      [
        [-0.05, deck + 0.05, -0.39],
        [-0.04, deck + 0.1, -0.44],
        [-0.03, deck + 0.16, -0.5],
        [0, deck + 0.2, drillZ + 0.02],
      ],
      0.006,
    ),
  )
  const bodyLens = merge(
    cylZ(0.019, 0.012, [-0.19, 0.5, -0.474], 16),
    cylZ(0.019, 0.012, [0.19, 0.5, -0.474], 16),
  )
  const lampPos: V3[] = [
    [-0.23, 0.645, -0.472],
    [0.23, 0.645, -0.472],
  ]
  const lamps = merge(lampPos.map((p) => cylZ(0.034, 0.01, p, 18)))
  const beams = beamGeometry(lampPos, 3.2, 0.2, 0.03)
  const bolt = new CylinderGeometry(0.007, 0.007, 0.007, 6)
  const bolts: V3[] = [
    ...boltRing(0, deck + 0.003, 0.04, 0.6, 0.94, 40),
    ...boltRing(-0.18, deck + 0.103, 0.1, 0.15, 0.11, 8),
    ...boltRing(0, deck + 0.063, -0.32, 0.17, 0.11, 8),
  ]

  // --- Suspension (left side = -1) --------------------------------------------------------------
  const rocker = (s: number) =>
    merge(
      pipe(
        [
          [s * X, P[1], P[2]],
          [s * X, P[1] + 0.05, zF + 0.2],
          [s * X, act, zF],
        ],
        0.022,
      ),
      rod([s * X, P[1], P[2]], [s * X, B.y, -B.u], 0.022),
      // Outrigger over the front wheel to its steering actuator.
      rod([s * X, act, zF], [s * (T - 0.03), act, zF], 0.02),
      // Pivot hub with its axle into the chassis, bogie clevis, horn up to the differential bar.
      cylX(0.05, 0.05, [s * X, P[1], P[2]], 18),
      rod([s * 0.3, P[1], P[2]], [s * X, P[1], P[2]], 0.026),
      cylX(0.04, 0.06, [s * X, B.y, -B.u], 16),
      rod([s * X, P[1], P[2]], [s * X, deck + 0.045, P[2]], 0.012),
      ball(0.018, [s * X, deck + 0.045, P[2]]),
    )
  const bogie = (s: number) =>
    merge(
      rod([s * X, B.y, -B.u], [s * X, R, zM], 0.02),
      pipe(
        [
          [s * X, B.y, -B.u],
          [s * X, act - 0.06, zR - 0.14],
          [s * X, act, zR],
        ],
        0.02,
      ),
      rod([s * X, act, zR], [s * (T - 0.03), act, zR], 0.02),
      cylX(0.03, 0.075, [s * X, B.y, -B.u], 14),
      ball(0.03, [s * X, R, zM]),
    )
  const diffBar = merge(
    box(2 * X + 0.04, 0.022, 0.045, [0, 0.03, 0]),
    cylY(0.03, 0.03, [0, 0.03, 0], 14),
    ball(0.02, [-X, 0.03, 0]),
    ball(0.02, [X, 0.03, 0]),
  )
  // Wheel brackets, about the wheel centre. Steered: actuator on top, fork down the inboard
  // side to the hub motor. `s` is the side the wheel is on (inboard = -s).
  const inboard = spec.wheelW / 2 + 0.038
  const forkAlloy = (s: number) =>
    merge(
      box(inboard + 0.03, 0.022, 0.075, [(-s * (inboard - 0.03)) / 2, actUp - 0.045, 0]),
      box(0.024, actUp - 0.045, 0.075, [-s * inboard, (actUp - 0.045) / 2, 0]),
    )
  const forkHousing = (s: number) =>
    merge(
      cylY(0.043, 0.085, [0, actUp - 0.002, 0], 16),
      cylY(0.03, 0.02, [0, actUp + 0.05, 0], 12),
      cylX(0.06, 0.1, [-s * (inboard - 0.03), 0, 0], 16),
    )
  const hubMotor = (s: number) =>
    merge(
      cylX(0.06, 0.1, [-s * (inboard - 0.03), 0, 0], 16),
      cylX(0.03, 0.05, [-s * (inboard + 0.02), 0, 0], 12),
    )

  // --- Solar array (about its yaw bearing; the panel about its hinge) -------------------------
  const pw = 1.02
  const ph = 0.64
  const arrayYoke = merge(
    cylY(0.04, 0.05, [0, 0.025, 0], 16),
    cylX(0.013, pw * 0.7, [0, 0.07, 0], 10),
    rod([-0.2, 0.07, 0], [0, 0.02, 0], 0.009),
    rod([0.2, 0.07, 0], [0, 0.02, 0], 0.009),
  )
  const py = ph / 2 + 0.03
  const panelCells = box(pw - 0.03, ph - 0.03, 0.006, [0, py, -0.008])
  const panelBack = box(pw, ph, 0.012, [0, py, 0])
  const panelFrame = merge(
    box(pw + 0.02, 0.018, 0.024, [0, py + ph / 2, 0]),
    box(pw + 0.02, 0.018, 0.024, [0, py - ph / 2, 0]),
    box(0.018, ph, 0.024, [-pw / 2, py, 0]),
    box(0.018, ph, 0.024, [pw / 2, py, 0]),
    // Stiffeners on the back and the hinge lugs.
    rod([-pw / 2, py - ph / 2, 0.012], [pw / 2, py + ph / 2, 0.012], 0.006),
    rod([-pw / 2, py + ph / 2, 0.012], [pw / 2, py - ph / 2, 0.012], 0.006),
    box(0.03, 0.05, 0.03, [-0.3, 0.012, 0]),
    box(0.03, 0.05, 0.03, [0.3, 0.012, 0]),
  )

  // --- Camera head (pan about the mast top; the head tilts about its trunnions) ---------------
  const panYoke = merge(
    cylY(0.03, 0.04, [0, 0.02, 0], 14),
    box(0.3, 0.012, 0.045, [0, 0.046, 0]),
    box(0.012, 0.09, 0.045, [-0.146, 0.09, 0]),
    box(0.012, 0.09, 0.045, [0.146, 0.09, 0]),
  )
  const headPaint = merge(
    box(0.27, 0.085, 0.095, [0, 0, 0]),
    // Sun shade over the optics.
    box(0.28, 0.006, 0.05, [0, 0.046, -0.07]),
  )
  const headHousing = merge(
    cylZ(0.031, 0.05, [-0.085, 0, -0.07], 16),
    cylZ(0.031, 0.05, [0.085, 0, -0.07], 16),
    cylZ(0.018, 0.03, [0, -0.008, -0.06], 12),
    cylX(0.014, 0.3, [0, 0, 0], 10),
  )
  const headLens = merge(
    cylZ(0.024, 0.01, [-0.085, 0, -0.092], 16),
    cylZ(0.024, 0.01, [0.085, 0, -0.092], 16),
    cylZ(0.012, 0.008, [0, -0.008, -0.074], 12),
  )
  const navLight = merge(ball(0.014, [0, 0.058, 0.02]), cylY(0.012, 0.016, [0, 0.046, 0.02], 10))

  // --- High-gain antenna (azimuth about its post; the dish in elevation) ----------------------
  const dishR = 0.32
  const cap = 0.58
  const rimR = dishR * Math.sin(cap)
  const rimZ = -dishR * (1 - Math.cos(cap))
  const hgaYoke = merge(
    cylY(0.03, 0.04, [0, 0.02, 0], 14),
    box(0.2, 0.012, 0.03, [0, 0.04, 0.05]),
    box(0.012, 0.12, 0.03, [-0.094, 0.1, 0.05]),
    box(0.012, 0.12, 0.03, [0.094, 0.1, 0.05]),
    rod([0, 0.04, 0], [0, 0.04, 0.05], 0.012),
  )
  // Sphere cap opening towards -z, its vertex at the origin.
  const dish = place(
    new SphereGeometry(dishR, 32, 8, 0, Math.PI * 2, 0, cap),
    [0, 0, -dishR],
    [HALF, 0, 0],
  )
  const feed: BufferGeometry[] = []
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + HALF
    feed.push(
      rod(
        [Math.cos(a) * rimR * 0.92, Math.sin(a) * rimR * 0.92, rimZ],
        [Math.cos(a) * 0.02, Math.sin(a) * 0.02, -0.17],
        0.004,
        6,
      ),
    )
  }
  const dishParts = merge(
    feed,
    cylZ(0.026, 0.012, [0, 0, -0.172], 14),
    cylZ(0.012, 0.05, [0, 0, -0.02], 10),
    // Hub and trunnion behind the reflector.
    cylZ(0.05, 0.04, [0, 0, 0.03], 16, 0.035),
    cylX(0.012, 0.2, [0, 0, 0.05], 10),
    place(new TorusGeometry(rimR, 0.005, 6, 36), [0, 0, rimZ]),
  )

  // --- Drill (the carriage slides on the rails; the auger turns about y) ------------------------
  const drillCarriage = merge(
    box(0.12, 0.13, 0.085, [0, 0.9, drillZ]),
    box(0.2, 0.03, 0.045, [0, 0.86, drillZ]),
    cylY(0.03, 0.04, [0, 0.82, drillZ], 14),
  )
  const augerLen = 0.5
  const turns = 9
  const helix: Vector3[] = []
  for (let i = 0; i <= turns * 12; i++) {
    const a = (i / 12) * Math.PI * 2
    helix.push(
      new Vector3(
        Math.cos(a) * 0.022,
        -(i / (turns * 12)) * (augerLen - 0.04),
        Math.sin(a) * 0.022,
      ),
    )
  }
  const auger = merge(
    cylY(0.012, augerLen - 0.03, [0, -(augerLen - 0.03) / 2, 0], 10),
    new TubeGeometry(new CatmullRomCurve3(helix), turns * 14, 0.007, 5),
    // Bit.
    cylY(0.001, 0.045, [0, -augerLen + 0.012, 0], 10, 0.02),
  )

  return {
    ...wheelGeometry(R, spec.wheelW),
    bodyGold,
    bodySilver,
    bodyPaint,
    bodyHousing,
    bodyAlloy,
    harness,
    bodyLens,
    lamps,
    beams,
    bolt,
    rockerL: rocker(-1),
    rockerR: rocker(1),
    bogieL: bogie(-1),
    bogieR: bogie(1),
    diffBar,
    forkAlloyL: forkAlloy(-1),
    forkAlloyR: forkAlloy(1),
    forkHousingL: forkHousing(-1),
    forkHousingR: forkHousing(1),
    hubMotorL: hubMotor(-1),
    hubMotorR: hubMotor(1),
    arrayYoke,
    panelCells,
    panelBack,
    panelFrame,
    panYoke,
    headPaint,
    headHousing,
    headLens,
    navLight,
    hgaYoke,
    dish,
    dishParts,
    drillCarriage,
    auger,
    /** Not geometry: where the instanced bolts go. */
    points: { bolts },
  }
}

/**
 * Micro-rover: a low gold box under a flat solar deck, four wheels on two rockers, a short mast
 * with one camera and a patch antenna. The box spans x ±0.15, y 0.13–0.27, z −0.29 to +0.27.
 */
export function buildMicroGeometry(spec: RigSpec) {
  const R = spec.wheelR
  const X = spec.armX
  const P: V3 = [0, spec.pivot.y, -spec.pivot.u]
  const zF = -spec.frontU
  const zR = -spec.rearU
  const top = 0.27

  const bodyGold = merge(box(0.3, 0.14, 0.56, [0, 0.2, -0.01]))
  const bodySilver = merge(
    box(0.24, 0.09, 0.012, [0, 0.205, -0.295]),
    box(0.2, 0.08, 0.05, [0, 0.21, 0.29]),
    box(0.012, 0.1, 0.3, [-0.153, 0.2, 0.02]),
  )
  const louvres: BufferGeometry[] = []
  for (let i = 0; i < 5; i++)
    louvres.push(box(0.016, 0.003, 0.3, [0.163, 0.165 + i * 0.018, 0.02], [0, 0, 0.6]))
  const mastX = -0.1
  const mastZ = -0.265
  const headY = 0.56
  const bodyPaint = merge(
    // Substrate of the solar deck (the cells lie on it) and the radiator on the right flank.
    box(0.46, 0.012, 0.56, [0, top + 0.012, 0.04]),
    box(0.01, 0.1, 0.32, [0.154, 0.2, 0.02]),
    louvres,
    // Camera head and the patch antenna on its bracket.
    box(0.08, 0.052, 0.06, [mastX, headY, mastZ]),
    box(0.09, 0.008, 0.09, [0.1, 0.375, 0.285], [0.5, 0, 0]),
  )
  const panelCells = box(0.44, 0.004, 0.54, [0, top + 0.02, 0.04])
  const bodyHousing = merge(
    cylZ(0.02, 0.035, [mastX, headY, mastZ - 0.04], 14),
    cylY(0.018, 0.03, [mastX, top + 0.02, mastZ], 12),
    cylZ(0.024, 0.035, [-0.085, 0.215, -0.303], 14, 0.019),
    cylZ(0.024, 0.035, [0.085, 0.215, -0.303], 14, 0.019),
    cylZ(0.014, 0.02, [0, 0.185, -0.305], 12),
    // Pivot bosses, patch-antenna ground plane, rear connector.
    cylX(0.034, 0.016, [-0.156, P[1], P[2]], 14),
    cylX(0.034, 0.016, [0.156, P[1], P[2]], 14),
    box(0.075, 0.004, 0.075, [0.1, 0.38, 0.283], [0.5, 0, 0]),
    cylZ(0.012, 0.02, [-0.06, 0.21, 0.32], 10),
  )
  const bodyAlloy = merge(
    cylY(0.009, headY - top - 0.02, [mastX, (headY + top) / 2, mastZ], 10),
    rod([mastX, top + 0.03, mastZ], [mastX + 0.05, top + 0.02, mastZ + 0.06], 0.005),
    rod([0.1, 0.25, 0.3], [0.1, 0.37, 0.295], 0.006),
    // Frame of the solar deck and the bumper bar under the nose.
    box(0.47, 0.016, 0.012, [0, top + 0.014, -0.24]),
    box(0.47, 0.016, 0.012, [0, top + 0.014, 0.32]),
    box(0.012, 0.016, 0.572, [-0.23, top + 0.014, 0.04]),
    box(0.012, 0.016, 0.572, [0.23, top + 0.014, 0.04]),
    pipe(
      [
        [-0.11, 0.15, -0.29],
        [-0.11, 0.135, -0.325],
        [0.11, 0.135, -0.325],
        [0.11, 0.15, -0.29],
      ],
      0.006,
    ),
    // Differential bar across the stern.
    rod([-X, P[1] + 0.045, 0.3], [X, P[1] + 0.045, 0.3], 0.007),
    // Low-gain stub next to the mast.
    cylY(0.003, 0.16, [0.12, top + 0.1, -0.265], 6),
  )
  const harness = merge(
    cable(
      [
        [-0.04, 0.24, -0.295],
        [-0.07, 0.27, -0.31],
        [mastX + 0.012, top + 0.06, mastZ - 0.012],
        [mastX - 0.012, top + 0.14, mastZ + 0.012],
        [mastX + 0.01, headY - 0.03, mastZ + 0.01],
      ],
      0.004,
    ),
    cable(
      [
        [0.06, 0.24, 0.31],
        [0.09, 0.26, 0.325],
        [0.105, 0.33, 0.31],
        [0.1, 0.365, 0.292],
      ],
      0.004,
    ),
  )
  const bodyLens = merge(
    cylZ(0.015, 0.008, [mastX, headY, mastZ - 0.058], 14),
    cylZ(0.01, 0.006, [0, 0.185, -0.316], 12),
  )
  const lampPos: V3[] = [
    [-0.085, 0.215, -0.321],
    [0.085, 0.215, -0.321],
  ]
  const lamps = merge(lampPos.map((p) => cylZ(0.018, 0.006, p, 16)))
  const beams = beamGeometry(lampPos, 1.6, 0.2, 0.016)
  const bolt = new CylinderGeometry(0.004, 0.004, 0.004, 6)
  const bolts = boltRing(0, top + 0.024, 0.04, 0.46, 0.56, 28)

  const rocker = (s: number) =>
    merge(
      pipe(
        [
          [s * X, R, zF],
          [s * X, P[1], P[2]],
          [s * X, R, zR],
        ],
        0.011,
      ),
      cylX(0.026, 0.026, [s * X, P[1], P[2]], 14),
      rod([s * 0.15, P[1], P[2]], [s * X, P[1], P[2]], 0.014),
      // Link up to the differential bar.
      rod([s * X, P[1], P[2]], [s * X, P[1] + 0.045, 0.3], 0.006),
    )
  const motors = (s: number) =>
    merge(
      cylX(0.03, 0.05, [s * (X + 0.004), R, zF], 14),
      cylX(0.03, 0.05, [s * (X + 0.004), R, zR], 14),
    )

  return {
    ...wheelGeometry(R, spec.wheelW),
    bodyGold,
    bodySilver,
    bodyPaint,
    bodyHousing,
    bodyAlloy,
    harness,
    bodyLens,
    panelCells,
    lamps,
    beams,
    bolt,
    rockerL: rocker(-1),
    rockerR: rocker(1),
    motorsL: motors(-1),
    motorsR: motors(1),
    points: { bolts },
  }
}

/** Disposes every geometry of a build*Geometry() result. */
export function disposeGeometries(set: Record<string, unknown>) {
  for (const g of Object.values(set))
    if (g && typeof (g as BufferGeometry).dispose === 'function') (g as BufferGeometry).dispose()
}
