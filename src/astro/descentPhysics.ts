import type { LanderVehicle } from '../config/landers.ts'
import { DEG, RAD } from './constants.ts'
import type { DescentPhase } from './descent.ts'
import type { Vec3 } from './frames.ts'
import { SLOPE_CAUTION_DEG, SLOPE_SAFE_DEG } from './slope.ts'

/**
 * Powered-descent physics for the landing view: a 3-DOF point mass flown by a closed-form
 * guidance law, in the site's scene frame (metres, x = east, y = up, z = -north).
 *
 * What is simulated: the FINAL APPROACH, from the end of the braking burn (~3.5 km above the
 * site, ~7.5 km up-range) to touchdown. The braking burn from orbital speed (~1.7 km/s) is not
 * integrated; it is accounted for with the rocket equation (BRAKING_DV_MS) so that masses and
 * the total Δv stay consistent.
 *
 * Assumptions (kept deliberately simple):
 *  - flat Moon over the ~8 km of the approach: constant gravity g = 1.62 m/s² along -y, no
 *    curvature, no rotation, no atmosphere;
 *  - point mass with an ideal engine: thrust direction and magnitude follow the command
 *    instantly (no attitude dynamics, no engine lag), magnitude within [minThrottle·T, T];
 *  - perfect navigation: the guidance knows the true state and the true terrain under it;
 *  - the guidance does not look ahead for terrain: a ridge on the track is a failure
 *    ('terrain'), not something it steers around.
 */

/** Lunar surface gravity, m/s². */
export const LUNAR_G = 1.62
/** Standard gravity, m/s² (converts Isp in seconds to an exhaust velocity). */
export const G0 = 9.80665

/**
 * Reference Δv (m/s) of the braking phase the simulation does NOT integrate: from a 100 km
 * circular orbit (1 633 m/s), a ~20 m/s de-orbit burn to a 15 km perilune (1 690 m/s there)
 * and the braking burn down to the ~170 m/s of the start state, plus its gravity losses.
 * Apollo flew ≈ 2 000–2 100 m/s from powered-descent initiation to touchdown, of which the
 * approach and landing phases took ≈ 300–400 m/s.
 */
export const BRAKING_DV_MS = 1700

/** Total descent Δv from orbit ≈ un-simulated braking + simulated final approach, m/s. */
export const totalDescentDvMs = (simulatedDvMs: number) => BRAKING_DV_MS + simulatedDvMs

/**
 * Propellant left at the start of the simulated approach, kg: the vehicle's descent load minus
 * what the braking burn takes by the rocket equation, m1 = m0·exp(−Δv / (Isp·g0)).
 */
export function propellantAfterBraking(vehicle: LanderVehicle, brakingDvMs = BRAKING_DV_MS) {
  const m0 = vehicle.dryKg + vehicle.propKg
  const m1 = m0 * Math.exp(-brakingDvMs / (vehicle.ispS * G0))
  return Math.max(0, m1 - vehicle.dryKg)
}

/** Start of the simulated approach, as in DESCENT_PROFILE[0] of the kinematic view. */
export const START_RANGE_M = 7_500
export const START_ALT_M = 3_500
/** Typical state at the end of the braking phase (Apollo "high gate": ≈ 150 m/s, −45 m/s). */
export const START_SPEED_H_MS = 170
export const START_SPEED_V_MS = -50

/** Above this height over the target the HUD still calls the phase 'braking'. */
export const BRAKING_LABEL_ALT_M = 1_000
/** Hazard-avoidance decision gate: height above the target, m. */
export const RETARGET_ALT_M = 500
/** Candidate grid for the divert: ± RETARGET_REACH_M every RETARGET_STEP_M. */
export const RETARGET_REACH_M = 300
export const RETARGET_STEP_M = 100
/** Extra time-to-go granted per metre of divert (s/m), so the divert stays gentle. */
export const RETARGET_TGO_S_PER_M = 1 / 25

/** The approach aims at a gate this high above the target (DESCENT_PROFILE's hover point)… */
export const HOVER_ALT_M = 30
/** …arriving with this vertical speed and no horizontal speed. */
export const GATE_RATE_MS = -1.5
/** Terminal descent rate, and the slower one of the last metres. */
export const TERMINAL_RATE_MS = -1.5
export const FINAL_RATE_MS = -1
export const FINAL_ALT_M = 5

/** Touchdown limits (landing-gear class values). */
export const TOUCHDOWN_MAX_VZ_MS = 2.5
export const TOUCHDOWN_MAX_VH_MS = 1

/**
 * Initial time-to-go: TGO_FACTOR · distance / speed. With factor 2 the ZEM/ZEV law reduces to
 * a constant deceleration along the line to the gate (d = v·t/2), the profile with the lowest
 * peak thrust; longer times trade thrust for gravity losses (1.62 m/s per second).
 */
const TGO_FACTOR = 2
const TGO_MIN_START_S = 20
/** The ZEM/ZEV gains (6/tgo², 2/tgo) blow up as tgo → 0, so tgo is not decremented below this. */
const TGO_FLOOR_S = 3
/** Handover to the terminal law once at the tgo floor and this close to the gate state. */
const HANDOVER_DIST_M = 20
const HANDOVER_SPEED_MS = 4
/** Terminal PD on the horizontal error (ω ≈ 0.39 rad/s, ζ ≈ 1) and vertical rate gain (1/s). */
const TERMINAL_KP = 0.15
const TERMINAL_KD = 0.8
const TERMINAL_KV = 1.2
/** Above the hover height the terminal law descends faster: +this much (m/s) per metre. */
const TERMINAL_RATE_SLOPE = 0.15
const TERMINAL_RATE_MAX_MS = -6

export interface DescentStart {
  pos: Vec3
  vel: Vec3
}

export interface PowerDescentStartOptions {
  /** Horizontal distance to the target, m (default START_RANGE_M). */
  rangeM?: number
  /** Height above the target, m (default START_ALT_M). */
  altM?: number
  /** Horizontal speed towards the target, m/s (default START_SPEED_H_MS). */
  speedHMs?: number
  /** Vertical speed, m/s, negative = descending (default START_SPEED_V_MS). */
  speedVMs?: number
}

/**
 * State at the end of the braking phase: `rangeM` up-range of the target along
 * `approachAzDeg` (the azimuth, seen from the target, the craft comes from: 0 = N, 90 = E, as
 * in descentWaypoints), `altM` above it, flying towards it. The speed scales with the range if
 * this is shortened (small tiles), so the required deceleration stays the same.
 */
export function powerDescentStart(
  target: Vec3,
  approachAzDeg: number,
  opts: PowerDescentStartOptions = {},
): DescentStart {
  const rangeM = opts.rangeM ?? START_RANGE_M
  const altM = opts.altM ?? START_ALT_M
  const k = Math.sqrt(rangeM / START_RANGE_M)
  const vh = opts.speedHMs ?? START_SPEED_H_MS * k
  const vv = opts.speedVMs ?? START_SPEED_V_MS * Math.sqrt(altM / START_ALT_M)
  const az = approachAzDeg * DEG
  // Unit vector from the target towards the start (scene frame: x = east, z = -north).
  const ux = Math.sin(az)
  const uz = -Math.cos(az)
  return {
    pos: [target[0] + ux * rangeM, target[1] + altM, target[2] + uz * rangeM],
    vel: [-ux * vh, vv, -uz * vh],
  }
}

export interface DescentEnvironment {
  /** Scene y of the ground under (x, z), e.g. groundSampler(...).groundY. */
  ground: (x: number, z: number) => number
  /** Local slope (deg) at (x, z); enables the hazard-avoidance divert. */
  slopeAt?: (x: number, z: number) => number
}

export interface DescentOptions {
  /** Integration step, s (default 0.05). */
  dtS?: number
  /** Give up after this flight time, s (default 600). */
  maxTimeS?: number
  /** Spacing of the stored samples, s (default 0.25). */
  sampleDtS?: number
  /**
   * Propellant on board at the start of the simulated approach, kg. Default:
   * propellantAfterBraking(vehicle).
   */
  startPropKg?: number
}

export type DescentFailure = 'propellant' | 'terrain' | 'hard-landing' | 'timeout'

export interface DescentSummary {
  ok: boolean
  reason?: DescentFailure
  durationS: number
  /** Simulated Δv: ∫ |T| / m dt, m/s. */
  dvMs: number
  /** Propellant burnt in the simulated approach, kg. */
  propUsedKg: number
  propLeftKg: number
  /** Propellant left as % of the vehicle's full descent load (`vehicle.propKg`). */
  propMarginPct: number
  /** Propellant on board at the start of the simulation (after the braking burn), kg. */
  propStartKg: number
  /** Vertical (signed, negative = down) and horizontal speed at ground contact, m/s. */
  touchdownVzMs: number
  touchdownVhMs: number
  /** Peak thrust acceleration |T| / m, in Earth g. */
  maxDecelG: number
  /** Horizontal distance from the requested target to the one actually flown to, m. */
  divertM: number
  /** The target is hazardous and no safe alternative was within reach. */
  hazard: boolean
  /** Final target (after any divert), on the ground. */
  target: Vec3
  /** Times at which 'approach' and 'terminal' began (= durationS if never reached), s. */
  phaseTimes: { approachS: number; terminalS: number }
}

/** Downsampled trajectory; `n` valid entries, 3 floats per vector. */
export interface DescentSamples {
  n: number
  t: Float32Array
  pos: Float32Array
  vel: Float32Array
  massKg: Float32Array
  /** Thrust as a fraction of the maximum, 0..1. */
  throttle: Float32Array
  /** Unit vector of the thrust force on the vehicle (the plume points the other way). */
  thrustDir: Float32Array
  /** Index into DESCENT_PHASES. */
  phase: Uint8Array
}

export const DESCENT_PHASES: readonly DescentPhase[] = ['braking', 'approach', 'terminal', 'landed']

export interface DescentResult {
  samples: DescentSamples
  summary: DescentSummary
}

export interface DescentSample {
  pos: Vec3
  vel: Vec3
  massKg: number
  throttle: number
  thrustDir: Vec3
  phase: DescentPhase
}

/** Safe ground as in optimize.ts: slope < 10° and the 8 neighbours (one grid step) < 15°. */
function safeGround(
  slopeAt: (x: number, z: number) => number,
  x: number,
  z: number,
  stepM: number,
) {
  if (!(slopeAt(x, z) < SLOPE_SAFE_DEG)) return false
  for (let dz = -1; dz <= 1; dz++)
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue
      if (!(slopeAt(x + dx * stepM, z + dz * stepM) < SLOPE_CAUTION_DEG)) return false
    }
  return true
}

/**
 * Hazard-avoidance decision: keeps the target if it is safe ground, else the nearest safe
 * point of the ± RETARGET_REACH_M grid (ties: the one closest to the lander, which is the
 * cheapest to reach). `null` when nothing in reach is safe.
 */
export function retarget(
  target: Vec3,
  slopeAt: (x: number, z: number) => number,
  lander: Vec3 = target,
): { x: number; z: number; divertM: number } | null {
  if (safeGround(slopeAt, target[0], target[2], RETARGET_STEP_M))
    return { x: target[0], z: target[2], divertM: 0 }
  const n = Math.round(RETARGET_REACH_M / RETARGET_STEP_M)
  let best: { x: number; z: number; divertM: number } | null = null
  let bestToLander = Infinity
  for (let j = -n; j <= n; j++)
    for (let i = -n; i <= n; i++) {
      if (!i && !j) continue
      const x = target[0] + i * RETARGET_STEP_M
      const z = target[2] + j * RETARGET_STEP_M
      const divertM = Math.hypot(i, j) * RETARGET_STEP_M
      if (best && divertM > best.divertM + 1e-6) continue
      if (!safeGround(slopeAt, x, z, RETARGET_STEP_M)) continue
      const toLander = Math.hypot(x - lander[0], z - lander[2])
      if (!best || divertM < best.divertM - 1e-6 || toLander < bestToLander) {
        best = { x, z, divertM }
        bestToLander = toLander
      }
    }
  return best
}

/**
 * Flies the final approach and landing.
 *
 * Guidance
 *  1. Approach (labelled 'braking' above BRAKING_LABEL_ALT_M, then 'approach'): the ZEM/ZEV
 *     optimal feedback law towards a gate HOVER_ALT_M above the target with velocity
 *     (0, GATE_RATE_MS, 0). With the zero-effort miss and velocity error predicted under
 *     gravity alone,
 *       ZEM = r_f − (r + v·tgo + ½·g·tgo²),   ZEV = v_f − (v + g·tgo),
 *     the commanded thrust acceleration is  a = 6·ZEM/tgo² − 2·ZEV/tgo  (the minimum-∫a²
 *     solution; gravity is already compensated inside ZEM/ZEV). tgo starts at
 *     TGO_FACTOR·distance/speed, is decremented with time and held at TGO_FLOOR_S, where the
 *     law becomes a well-damped PD around the gate (ζ ≈ 0.8) until the handover tolerance is
 *     met. Thrust never points below the horizon.
 *  2. Hazard gate (only with `env.slopeAt`): the first time the height above the target drops
 *     below RETARGET_ALT_M the target is checked and, if it is not safe ground, replaced by
 *     the nearest safe grid point; tgo is extended in proportion to the divert.
 *  3. Terminal: vertical descent at a commanded rate (TERMINAL_RATE_MS, FINAL_RATE_MS in the
 *     last FINAL_ALT_M above the ground) with a PD law nulling the horizontal error, tilt
 *     limited to `vehicle.maxTiltDeg`.
 *
 * Thrust magnitude is clamped to [minThrottle·T, T]; ṁ = |T| / (Isp·g0). Integration is
 * semi-implicit Euler with a fixed step. If the propellant runs out the engine stops and the
 * craft falls ballistically to the ground ('propellant'); ground contact before the terminal
 * phase is 'terrain'; contact above the touchdown limits is 'hard-landing'.
 */
export function simulateDescent(
  vehicle: LanderVehicle,
  start: DescentStart,
  target: Vec3,
  env: DescentEnvironment,
  opts: DescentOptions = {},
): DescentResult {
  const dt = opts.dtS ?? 0.05
  const maxTimeS = opts.maxTimeS ?? 600
  const sampleEvery = Math.max(1, Math.round((opts.sampleDtS ?? 0.25) / dt))
  const { ground, slopeAt } = env
  const ve = vehicle.ispS * G0
  const tanTilt = Math.tan(vehicle.maxTiltDeg * DEG)
  const minThrustN = vehicle.minThrottle * vehicle.thrustN

  // Target on the ground; the approach aims at the gate above it.
  let tx = target[0]
  let tz = target[2]
  let ty = ground(tx, tz)
  let divertM = 0
  let hazard = false
  let gateDone = !slopeAt

  let px = start.pos[0]
  let py = start.pos[1]
  let pz = start.pos[2]
  let vx = start.vel[0]
  let vy = start.vel[1]
  let vz = start.vel[2]
  const propStartKg = Math.max(0, opts.startPropKg ?? propellantAfterBraking(vehicle))
  let prop = propStartKg
  let ranDry = prop <= 0

  const speed0 = Math.hypot(vx, vy, vz)
  const dist0 = Math.hypot(tx - px, ty + HOVER_ALT_M - py, tz - pz)
  let tgo = Math.max(TGO_MIN_START_S, (TGO_FACTOR * dist0) / Math.max(speed0, 1))

  const cap = Math.ceil(maxTimeS / dt / sampleEvery) + 3
  const samples: DescentSamples = {
    n: 0,
    t: new Float32Array(cap),
    pos: new Float32Array(cap * 3),
    vel: new Float32Array(cap * 3),
    massKg: new Float32Array(cap),
    throttle: new Float32Array(cap),
    thrustDir: new Float32Array(cap * 3),
    phase: new Uint8Array(cap),
  }
  let dx = 0
  let dy = 1
  let dz = 0
  const record = (t: number, throttle: number, phase: number) => {
    const i = samples.n++
    samples.t[i] = t
    samples.pos.set([px, py, pz], i * 3)
    samples.vel.set([vx, vy, vz], i * 3)
    samples.massKg[i] = vehicle.dryKg + prop
    samples.throttle[i] = throttle
    samples.thrustDir.set([dx, dy, dz], i * 3)
    samples.phase[i] = phase
  }

  let t = 0
  let step = 0
  let terminal = false
  let approachS = -1
  let terminalS = -1
  let dv = 0
  let maxAcc = 0
  let reason: DescentFailure | undefined
  let contact = false

  // Already on (or under) the ground at the start: nothing to fly.
  if (py <= ground(px, pz)) contact = true

  while (!contact) {
    if (t >= maxTimeS) {
      reason = 'timeout'
      break
    }
    const m = vehicle.dryKg + prop
    const relAlt = py - ty

    // Hazard-avoidance decision gate.
    if (!gateDone && slopeAt && relAlt < RETARGET_ALT_M) {
      gateDone = true
      const pick = retarget([tx, ty, tz], slopeAt, [px, py, pz])
      if (!pick) hazard = true
      else if (pick.divertM > 0) {
        divertM = Math.hypot(pick.x - target[0], pick.z - target[2])
        tx = pick.x
        tz = pick.z
        ty = ground(tx, tz)
        if (!terminal) tgo += pick.divertM * RETARGET_TGO_S_PER_M
      }
    }

    // Guidance → commanded thrust acceleration (ax, ay, az).
    let ax: number
    let ay: number
    let az: number
    if (!terminal) {
      const ex = tx - px
      const ey = ty + HOVER_ALT_M - py
      const ez = tz - pz
      if (
        tgo <= TGO_FLOOR_S &&
        Math.hypot(ex, ez) <= HANDOVER_DIST_M &&
        Math.abs(ey) <= HANDOVER_DIST_M &&
        Math.hypot(vx, vy - GATE_RATE_MS, vz) <= HANDOVER_SPEED_MS
      ) {
        terminal = true
        terminalS = t
        if (approachS < 0) approachS = t
      }
    }
    if (!terminal) {
      if (approachS < 0 && py - ty <= BRAKING_LABEL_ALT_M) approachS = t
      const k1 = 6 / (tgo * tgo)
      const k2 = 2 / tgo
      const zemX = tx - (px + vx * tgo)
      const zemY = ty + HOVER_ALT_M - (py + vy * tgo - 0.5 * LUNAR_G * tgo * tgo)
      const zemZ = tz - (pz + vz * tgo)
      ax = k1 * zemX + k2 * vx
      ay = k1 * zemY - k2 * (GATE_RATE_MS - (vy - LUNAR_G * tgo))
      az = k1 * zemZ + k2 * vz
      if (ay < 0) ay = 0
    } else {
      const h = py - ground(px, pz)
      const rate =
        h <= FINAL_ALT_M
          ? FINAL_RATE_MS
          : Math.max(
              TERMINAL_RATE_MAX_MS,
              TERMINAL_RATE_MS - TERMINAL_RATE_SLOPE * Math.max(0, h - HOVER_ALT_M),
            )
      ay = Math.max(0.05 * LUNAR_G, LUNAR_G + TERMINAL_KV * (rate - vy))
      ax = TERMINAL_KP * (tx - px) - TERMINAL_KD * vx
      az = TERMINAL_KP * (tz - pz) - TERMINAL_KD * vz
      const ah = Math.hypot(ax, az)
      const ahMax = ay * tanTilt
      if (ah > ahMax) {
        ax *= ahMax / ah
        az *= ahMax / ah
      }
    }

    // Thrust vector: direction of the command, magnitude within the throttle range.
    let thrustN = 0
    if (prop > 0) {
      const a = Math.hypot(ax, ay, az)
      if (a > 1e-9) {
        dx = ax / a
        dy = ay / a
        dz = az / a
      }
      thrustN = Math.min(vehicle.thrustN, Math.max(minThrustN, m * a))
      // Last drops: the engine burns only the fraction of the step the propellant allows.
      const need = (thrustN / ve) * dt
      if (need >= prop) {
        thrustN *= prop / need
        ranDry = true
      }
    }
    const phase = terminal ? 2 : approachS >= 0 ? 1 : 0
    if (step % sampleEvery === 0) record(t, thrustN / vehicle.thrustN, phase)

    // Semi-implicit Euler: velocity first, then position with the new velocity.
    const acc = thrustN / m
    dv += acc * dt
    if (acc > maxAcc) maxAcc = acc
    prop = Math.max(0, prop - (thrustN / ve) * dt)
    const h0 = py - ground(px, pz)
    const x0 = px
    const y0 = py
    const z0 = pz
    vx += acc * dx * dt
    vy += (acc * dy - LUNAR_G) * dt
    vz += acc * dz * dt
    px += vx * dt
    py += vy * dt
    pz += vz * dt
    const h1 = py - ground(px, pz)
    if (h1 <= 0) {
      // Ground contact inside the step: back up to the crossing.
      const f = h0 > h1 ? Math.min(1, Math.max(0, h0 / (h0 - h1))) : 1
      px = x0 + (px - x0) * f
      pz = z0 + (pz - z0) * f
      py = Math.max(ground(px, pz), y0 + (py - y0) * f)
      t += f * dt
      contact = true
      break
    }
    t += dt
    step++
    if (!terminal) tgo = Math.max(TGO_FLOOR_S, tgo - dt)
  }

  const vh = Math.hypot(vx, vz)
  if (contact) {
    if (ranDry) reason = 'propellant'
    else if (!terminal) reason = 'terrain'
    else if (Math.abs(vy) > TOUCHDOWN_MAX_VZ_MS || vh > TOUCHDOWN_MAX_VH_MS) reason = 'hard-landing'
  }
  const ok = reason === undefined
  // Final sample: the state at contact (or at the timeout), engine off.
  const lastPhase = samples.n ? samples.phase[samples.n - 1] : 0
  record(t, 0, ok ? 3 : lastPhase)

  return {
    samples,
    summary: {
      ok,
      reason,
      durationS: t,
      dvMs: dv,
      propUsedKg: propStartKg - prop,
      propLeftKg: prop,
      propMarginPct: vehicle.propKg > 0 ? (100 * prop) / vehicle.propKg : 0,
      propStartKg,
      touchdownVzMs: vy,
      touchdownVhMs: vh,
      maxDecelG: maxAcc / G0,
      divertM,
      hazard,
      target: [tx, ty, tz],
      phaseTimes: {
        approachS: approachS < 0 ? t : approachS,
        terminalS: terminalS < 0 ? t : terminalS,
      },
    },
  }
}

const vec = (a: Float32Array, i: number, j: number, f: number): Vec3 => [
  a[i * 3] + (a[j * 3] - a[i * 3]) * f,
  a[i * 3 + 1] + (a[j * 3 + 1] - a[i * 3 + 1]) * f,
  a[i * 3 + 2] + (a[j * 3 + 2] - a[i * 3 + 2]) * f,
]

/**
 * State at time `tS` (s from the start), linearly interpolated between the stored samples and
 * clamped to the ends: t ≤ 0 is the start state, t ≥ duration the touchdown state (phase
 * 'landed' if the landing succeeded, else the phase of the failure). Cheap enough to call
 * every frame (binary search).
 */
export function sampleDescent(result: DescentResult, tS: number): DescentSample {
  const s = result.samples
  const last = s.n - 1
  let i = 0
  let j = 0
  let f = 0
  // durationS, not s.t[last]: the stored times are rounded to float32.
  if (tS >= result.summary.durationS || tS >= s.t[last]) i = j = last
  else if (tS > s.t[0]) {
    let lo = 0
    let hi = last
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (s.t[mid] <= tS) lo = mid
      else hi = mid
    }
    i = lo
    j = hi
    f = (tS - s.t[lo]) / (s.t[hi] - s.t[lo])
  }
  const d = vec(s.thrustDir, i, j, f)
  const len = Math.hypot(d[0], d[1], d[2])
  return {
    pos: vec(s.pos, i, j, f),
    vel: vec(s.vel, i, j, f),
    massKg: s.massKg[i] + (s.massKg[j] - s.massKg[i]) * f,
    // The final sample has the engine off; hold the last running value up to it.
    throttle:
      j === last && i !== j ? s.throttle[i] : s.throttle[i] + (s.throttle[j] - s.throttle[i]) * f,
    thrustDir: len > 1e-6 ? [d[0] / len, d[1] / len, d[2] / len] : [0, 1, 0],
    phase: DESCENT_PHASES[s.phase[i]],
  }
}

/** Tilt of the thrust axis from the vertical, deg (0 = engine pointing straight down). */
export const thrustTiltDeg = (thrustDir: Vec3) =>
  Math.acos(Math.min(1, Math.max(-1, thrustDir[1]))) * RAD
