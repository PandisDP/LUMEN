import type { RoverId } from '../../astro/traverse.ts'

/**
 * Suspension and steering geometry of the rovers: pure functions, no three.js. Side-view
 * coordinates are (u, y): u forward along the chassis (the model's -z), y up from the ground the
 * rover stands on when everything is level. Angles are radians, positive nose-up.
 */
export interface SidePoint {
  u: number
  y: number
}

export interface RigSpec {
  id: RoverId
  /** Overall size, m (wheel to wheel, tyre to tyre, ground to the top of the mast). */
  lengthM: number
  widthM: number
  heightM: number
  wheelR: number
  wheelW: number
  /**
   * Lateral distance from the centre line to the wheel centres (the wheel lines of
   * trackGeometry.ts ROVER_TRACKS and of the lander's ramps) and to the suspension arms.
   */
  trackHalf: number
  armX: number
  /** Rocker pivot on the chassis. */
  pivot: SidePoint
  /** Forward position of the front and rear axles. */
  frontU: number
  rearU: number
  /** Rocker-bogie: the bogie hangs from the rocker's rear end and carries two wheels. */
  bogie?: { pivot: SidePoint; midU: number }
  /** Travel limits of the rocker (against the level chassis) and of the bogie. */
  maxRockerRad: number
  maxBogieRad: number
  /** The corner wheels steer (otherwise the rover skid-steers). */
  steers: boolean
  maxSteerRad: number
  /** Grousers per wheel. */
  grousers: number
  /** Mast camera (the "mast" view looks out of it). */
  eye: { x: number; y: number; u: number }
  /** Follow-camera distance, relative to the 8 m default of a 2 m long craft. */
  camScale: number
}

export const ROVER_RIGS: Record<RoverId, RigSpec> = {
  // Micro-rover (40 kg): four wheels on one rocker per side, skid-steered.
  rover: {
    id: 'rover',
    lengthM: 0.74,
    widthM: 0.56,
    heightM: 0.6,
    wheelR: 0.1,
    wheelW: 0.08,
    trackHalf: 0.24,
    armX: 0.176,
    pivot: { u: 0, y: 0.2 },
    frontU: 0.27,
    rearU: -0.27,
    maxRockerRad: 0.4,
    maxBogieRad: 0,
    steers: false,
    maxSteerRad: 0,
    grousers: 14,
    eye: { x: -0.1, y: 0.57, u: 0.3 },
    camScale: 0.4,
  },
  // Utility rover (350 kg): six wheels on a rocker-bogie, the four corner wheels steer.
  'csa-rover': {
    id: 'csa-rover',
    lengthM: 1.62,
    widthM: 1.22,
    heightM: 1.8,
    wheelR: 0.25,
    wheelW: 0.18,
    trackHalf: 0.52,
    armX: 0.355,
    pivot: { u: 0.08, y: 0.56 },
    frontU: 0.56,
    rearU: -0.56,
    bogie: { pivot: { u: -0.28, y: 0.4 }, midU: 0 },
    maxRockerRad: 0.38,
    maxBogieRad: 0.5,
    steers: true,
    maxSteerRad: 0.6,
    grousers: 22,
    eye: { x: 0.24, y: 1.4, u: 0.4 },
    camScale: 0.7,
  },
}

export type WheelStation = 'front' | 'mid' | 'rear'

export interface WheelSpec {
  /** -1 left (the model's -x), +1 right. */
  side: -1 | 1
  station: WheelStation
  /** Forward and lateral position of the wheel centre. */
  u: number
  x: number
  steers: boolean
}

/** The wheels in the order every per-wheel array uses: left side front to rear, then right. */
export function wheelLayout(spec: RigSpec): WheelSpec[] {
  const out: WheelSpec[] = []
  for (const side of [-1, 1] as const) {
    const x = side * spec.trackHalf
    out.push({ side, station: 'front', u: spec.frontU, x, steers: spec.steers })
    if (spec.bogie) out.push({ side, station: 'mid', u: spec.bogie.midU, x, steers: false })
    out.push({ side, station: 'rear', u: spec.rearU, x, steers: spec.steers })
  }
  return out
}

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export interface SideSolution {
  /** Rocker angle against the level chassis plane, rad (nose-up positive). */
  rocker: number
  /** Bogie angle against the same plane, rad (0 without a bogie). */
  bogie: number
  /** Rise of the rocker pivot above its level-ground height, m. */
  lift: number
}

/**
 * One side of the suspension resting on its wheels. `hFront`, `hMid`, `hRear` are the ground
 * heights under the wheels relative to the chassis plane (0 = level); `hMid` is ignored without
 * a bogie. The bogie settles on its two wheels, the rocker on the front wheel and the bogie
 * pivot, and the rocker pivot ends up wherever that leaves it.
 */
export function solveSide(spec: RigSpec, hFront: number, hMid: number, hRear: number) {
  const R = spec.wheelR
  const P = spec.pivot
  let bogie = 0
  // Rear support of the rocker: the bogie pivot, or the rear axle itself.
  let rearU = spec.rearU
  let rearRestY = R
  let rearY = hRear + R
  if (spec.bogie) {
    const B = spec.bogie.pivot
    const span = spec.bogie.midU - spec.rearU
    bogie = clamp(
      Math.asin(clamp((hMid - hRear) / span, -1, 1)),
      -spec.maxBogieRad,
      spec.maxBogieRad,
    )
    // The pivot sits midway (in load) between its wheels: carried by their mean height.
    const du = (spec.bogie.midU + spec.rearU) / 2 - B.u
    const dy = R - B.y
    rearU = B.u
    rearRestY = B.y
    rearY = (hMid + hRear) / 2 + R - (du * Math.sin(bogie) + dy * Math.cos(bogie))
  }
  // (front axle − rear support) turned by the rocker angle must span the height difference.
  const a = spec.frontU - rearU
  const c = R - rearRestY
  const d = hFront + R - rearY
  const rocker = clamp(
    Math.asin(clamp(d / Math.hypot(a, c), -1, 1)) - Math.atan2(c, a),
    -spec.maxRockerRad,
    spec.maxRockerRad,
  )
  // The pivot rides on the mean of what the two ends of the rocker ask for.
  const fu = spec.frontU - P.u
  const fy = R - P.y
  const ru = rearU - P.u
  const ry = rearRestY - P.y
  const fromFront = hFront + R - (fu * Math.sin(rocker) + fy * Math.cos(rocker))
  const fromRear = rearY - (ru * Math.sin(rocker) + ry * Math.cos(rocker))
  return { rocker, bogie, lift: (fromFront + fromRear) / 2 - P.y } satisfies SideSolution
}

export interface SuspensionSolution {
  /** Left and right side. */
  sides: [SideSolution, SideSolution]
  /** Chassis: rise, pitch (nose-up) and roll (right side up) on its two rocker pivots. */
  heave: number
  pitch: number
  roll: number
  /** Swing of the differential bar: half the difference of the rockers (left minus right). */
  diff: number
}

/**
 * Both sides and the chassis between them. The differential holds the body at the mean pitch of
 * the two rockers, and its pivots at their heights. `heights` follows wheelLayout().
 */
export function solveSuspension(spec: RigSpec, heights: readonly number[]): SuspensionSolution {
  const n = spec.bogie ? 3 : 2
  const side = (o: number) =>
    spec.bogie
      ? solveSide(spec, heights[o] ?? 0, heights[o + 1] ?? 0, heights[o + 2] ?? 0)
      : solveSide(spec, heights[o] ?? 0, 0, heights[o + 1] ?? 0)
  const left = side(0)
  const right = side(n)
  return {
    sides: [left, right],
    heave: (left.lift + right.lift) / 2,
    pitch: (left.rocker + right.rocker) / 2,
    roll: Math.atan2(right.lift - left.lift, 2 * spec.armX),
    diff: (left.rocker - right.rocker) / 2,
  }
}

/**
 * Ackermann steering angle of a wheel, rad, positive to the right. `turnPerM` is the path
 * curvature (rad of heading per metre driven, positive turning right), `x` the wheel's lateral
 * position (right positive) and `u` its position ahead of the axle line the turn centre lies on
 * (the middle wheels). All wheel axes then meet at the turn centre: the inner wheels steer more
 * than the outer ones and the rear ones opposite to the front ones.
 */
export function steerAngle(turnPerM: number, x: number, u: number, maxRad: number) {
  if (!turnPerM || !u) return 0
  const lateral = 1 - x * turnPerM
  // Turn centre inside the track: full lock.
  if (lateral <= 1e-6) return Math.sign(u * turnPerM) * maxRad
  return clamp(Math.atan((u * turnPerM) / lateral), -maxRad, maxRad)
}

const wrapPi = (a: number) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2))

/** Path curvature, rad/m (right positive), from two headings (deg) `distM` metres apart. */
export function turnPerM(prevHeadingDeg: number, headingDeg: number, distM: number) {
  if (!(Math.abs(distM) > 1e-6)) return 0
  return wrapPi(((headingDeg - prevHeadingDeg) * Math.PI) / 180) / distM
}

/** Exponential approach of `current` to `target` with time constant `tauS`. */
export function approach(current: number, target: number, dtS: number, tauS: number) {
  return current + (target - current) * (1 - Math.exp(-dtS / tauS))
}

/** Same, for an angle (rad): along the shorter arc. */
export function approachAngle(current: number, target: number, dtS: number, tauS: number) {
  return current + wrapPi(target - current) * (1 - Math.exp(-dtS / tauS))
}

/**
 * Yaw (rotation about the model's +y) that turns a part built facing forward (-z) towards the
 * azimuth `azDeg` (clockwise from north) when the rover heads `headingDeg`.
 */
export function yawTowards(azDeg: number, headingDeg: number) {
  return wrapPi((-(azDeg - headingDeg) * Math.PI) / 180)
}

/** What the model needs each frame; written by RoverRig, read by RoverModel's update(). */
export interface RoverFrame {
  /** Ground height under each wheel relative to the chassis plane, m (order of wheelLayout). */
  wheelHeights: number[]
  /** Wheel rotation, rad (accumulated from the distance driven). */
  spin: number
  /** Path curvature, rad/m, right positive (already low-pass filtered). */
  turnPerM: number
  headingDeg: number
  /** Sun and Earth as seen from the rover; null = unknown (parts keep a rest pose). */
  sunAzDeg: number | null
  sunElDeg: number | null
  earthAzDeg: number | null
  earthElDeg: number | null
  /** The Earth is in view: the dish tracks it (otherwise it stows). */
  link: boolean
  /** In the dark: headlights on. */
  dark: boolean
  driving: boolean
  /** Arrived: the drill works. */
  drilling: boolean
}

export interface RoverModelHandle {
  /** Moves every articulated part; `dtS` is real seconds since the last call (for the slews). */
  update: (frame: RoverFrame, dtS: number) => void
}

export function emptyRoverFrame(wheels: number): RoverFrame {
  return {
    wheelHeights: new Array<number>(wheels).fill(0),
    spin: 0,
    turnPerM: 0,
    headingDeg: 0,
    sunAzDeg: null,
    sunElDeg: null,
    earthAzDeg: null,
    earthElDeg: null,
    link: false,
    dark: false,
    driving: false,
    drilling: false,
  }
}
