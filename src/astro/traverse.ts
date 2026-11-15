import { DAY_MS, DEG, HOUR_MS, MOON_RADIUS_M, RAD } from './constants.ts'
import { type DemGrid, sampleDemStack } from './dem.ts'
import { anyStationSeesMoon } from './dsn.ts'
import { type EnergyProfile, incidenceFactor, stepBattery } from './energy.ts'
import { bodyFixedEphemeris, makeObserver, skyFromVectors } from './ephemeris.ts'
import {
  type Vec3,
  dot,
  enuBasis,
  norm,
  selenographicToVector,
  sub,
  toHorizontal,
  vectorToSelenographic,
  wrap180,
  wrap360,
} from './frames.ts'
import { type HorizonMask, discVisibleFraction, maskAt } from './horizon.ts'
import { computeHorizonMask } from './horizonFromDem.ts'
import { type IllumGrid, isPsrAt } from './illumination.ts'
import { VISIBLE_THRESHOLD } from './metrics.ts'
import { slopeAtStack } from './slope.ts'
import { COOLING_TAU_H, T_NIGHT_K, T_PSR_K, litTemps } from './thermal.ts'

/**
 * Rover traverse from the landing point to the nearest permanently shadowed ground (the route
 * found by `computeIceAccess`), the sampling work there and the drive back to the lander along
 * the same route: where the rover is at each instant, how fast it drives, what the Sun gives it
 * and what the trip costs, so the battery can be followed into the shadow and out again.
 *
 * The mission is a success when the rover reaches the ice, takes every sample asked for and is
 * back at the landing point before the deadline (`TraverseSummary.success`). Handing the samples
 * over to the lander is not simulated: it is taken for granted on arrival.
 *
 * First-order model, in the same spirit as energy.ts: constant commanded speed derated by the
 * terrain slope, rigid-wheel rolling resistance, no slip or sinkage, no obstacle avoidance
 * below the 20 m DEM, no regenerative braking, no thermal power (heaters are inside the
 * profile's loads). It answers "does it get there and back, and with how much charge?", nothing
 * finer.
 */

/** Lunar surface gravity (m/s²). */
export const MOON_GRAVITY = 1.62

export interface RoverVehicle {
  massKg: number
  /** Commanded speed on flat ground (m/s). */
  speedMs: number
  /** Rolling-resistance coefficient of the wheels on loose regolith (dimensionless). */
  rollingResistance: number
  /** Battery-to-wheel efficiency (motors, gears, electronics), 0..1. */
  drivetrainEfficiency: number
}

export type RoverId = 'rover' | 'csa-rover'

/**
 * Illustrative vehicles matching the energy presets of the same id (orders of magnitude for a
 * lunar micro-rover and a utility rover, not the specs of any real vehicle).
 */
export const ROVER_VEHICLES: Record<RoverId, RoverVehicle> = {
  rover: { massKg: 40, speedMs: 0.1, rollingResistance: 0.15, drivetrainEfficiency: 0.6 },
  'csa-rover': { massKg: 350, speedMs: 0.2, rollingResistance: 0.15, drivetrainEfficiency: 0.6 },
}

/** Speed never drops below this share of the commanded speed, however steep the ground. */
export const MIN_SPEED_FACTOR = 0.2

export interface TraversePoint {
  lat: number
  lon: number
  /** Terrain height above the reference sphere (m). */
  heightM: number
  /**
   * Cumulative 3-D distance driven since leaving the lander (m). It keeps growing on the way
   * back: it is the odometer, not the distance to the lander.
   */
  distM: number
  /** Terrain slope at the point, whatever the driving direction (deg). */
  slopeDeg: number
  /**
   * Along-track grade in the direction actually driven: positive uphill, negative downhill
   * (deg). A climb on the way out is a descent on the way back.
   */
  gradeDeg: number
  /** Driving direction, deg clockwise from local north (reversed on the way back). */
  headingDeg: number
  /** The 100 m illumination map marks this cell as permanently shadowed. */
  inPsr: boolean
  /** Driving speed at the point (m/s). */
  speedMs: number
  /** Cumulative driving time since leaving the lander, without stops (s). */
  tS: number
  /** Leg the point belongs to. The turning point at the ice is the last 'out' point. */
  leg: TraverseLeg
}

/**
 * The route as driven. One way: `points` run from the lander to the ice. Round trip
 * (`roundTrip`): they are followed by the same positions in reverse order, starting with a
 * second copy of the ice point (same place, `distM` and `tS`; heading turned around), so
 * `points.length === 2 · (turnIndex + 1)` and the last point is where the first one is.
 */
export interface TraversePlan {
  points: TraversePoint[]
  /** The plan includes the drive back to the lander. */
  roundTrip: boolean
  /** Index of the last outbound point (the ice, where the rover works); -1 for an empty plan. */
  turnIndex: number
  /**
   * TOTAL 3-D length driven (m): out and back for a round trip (2 · outLengthM), the same as
   * `outLengthM` one way. For "how far is the ice" use `outLengthM`.
   */
  lengthM: number
  /** 3-D length of the outbound leg, lander to ice (m). */
  outLengthM: number
  /** TOTAL driving time without stops, both legs for a round trip (s). */
  driveS: number
  /** Driving time of the outbound leg without stops (s). */
  outDriveS: number
  maxSlopeDeg: number
  /** Distance along the OUTBOUND leg at which the route first enters a PSR cell (m), or null. */
  psrEntryM: number | null
}

export interface PlanOptions {
  /** Spacing of the resampled points along the ground (m). Default 10. */
  stepM?: number
  /** Commanded speed on flat ground (m/s). */
  speedMs: number
  /** Slope at which the speed derating bottoms out (the rover's hardware limit, deg). */
  roverMaxSlopeDeg: number
  /** Yearly illumination map: without it no point is flagged as PSR. */
  illum?: IllumGrid
  /**
   * Append the drive back along the same route. Default false here (a bare one-way plan);
   * `prepareTraverse` and `computeTraverse` ask for the round trip unless told otherwise.
   */
  roundTrip?: boolean
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * Work at the ice: number of samples and hours per sample (drilling plus analysis), shared by
 * the simulation, the planner (`PLAN_DEFAULTS`) and the rover store. Assumptions the user can
 * change, not the figures of a real instrument.
 */
export const SAMPLING_DEFAULTS = { samples: 3, sampleH: 2 } as const
/** What the inputs of the app accept (the simulation itself also takes 0 samples). */
export const SAMPLING_LIMITS = {
  samples: { min: 1, max: 10, step: 1 },
  sampleH: { min: 0.5, max: 6, step: 0.5 },
} as const

/** Number of samples within SAMPLING_LIMITS (an integer); the default for anything not finite. */
export const clampSamples = (v: number) =>
  Number.isFinite(v)
    ? clamp(Math.round(v), SAMPLING_LIMITS.samples.min, SAMPLING_LIMITS.samples.max)
    : SAMPLING_DEFAULTS.samples
/** Hours per sample within SAMPLING_LIMITS; the default for anything not finite. */
export const clampSampleH = (v: number) =>
  Number.isFinite(v)
    ? clamp(v, SAMPLING_LIMITS.sampleH.min, SAMPLING_LIMITS.sampleH.max)
    : SAMPLING_DEFAULTS.sampleH

/** Which way the rover is driving: out to the ice, or back to the lander. */
export type TraverseLeg = 'out' | 'back'

/** Point at fraction `t` of the great-circle arc between two unit vectors. */
function slerp(a: Vec3, b: Vec3, t: number): Vec3 {
  const theta = Math.acos(clamp(dot(a, b), -1, 1))
  // Below ~60 m of arc sin θ loses precision and the chord is the arc anyway.
  const s = Math.sin(theta)
  const wa = theta < 1e-4 ? 1 - t : Math.sin((1 - t) * theta) / s
  const wb = theta < 1e-4 ? t : Math.sin(t * theta) / s
  const v: Vec3 = [wa * a[0] + wb * b[0], wa * a[1] + wb * b[1], wa * a[2] + wb * b[2]]
  const n = norm(v)
  return [v[0] / n, v[1] / n, v[2] / n]
}

const arcM = (a: Vec3, b: Vec3) => {
  // Chord → arc: accurate for the metre-scale steps that acos(dot) cannot resolve.
  const chord = norm(sub(a, b))
  return 2 * Math.asin(Math.min(1, chord / 2)) * MOON_RADIUS_M
}

/** Speed on ground of slope `slopeDeg`: linear derating down to MIN_SPEED_FACTOR at the limit. */
export const slopeSpeed = (speedMs: number, slopeDeg: number, roverMaxSlopeDeg: number) =>
  speedMs * clamp(1 - slopeDeg / Math.max(1e-9, roverMaxSlopeDeg), MIN_SPEED_FACTOR, 1)

/**
 * Resamples the route polyline every `stepM` (great-circle interpolation in 3-D, so it also
 * works across the pole) and attaches terrain and kinematics to every point.
 *
 * Assumptions: heights are bilinear samples of the DEM stack (finest first) and the slope is
 * Horn's on the same stack, so anything smaller than the 20 m pixels is invisible; missing
 * data counts as the previous height and a flat slope. The time between two points is their
 * 3-D distance over the mean of their speeds.
 *
 * With `roundTrip` the way back reuses the outbound points in reverse order (see TraversePlan):
 * same terrain, slope, shadow flag and speed per position, the grade with its sign flipped, the
 * heading recomputed towards the previous point, and distance and time still accumulating.
 */
export function planTraverse(
  path: readonly { lat: number; lon: number }[],
  grids: readonly DemGrid[],
  opts: PlanOptions,
): TraversePlan {
  const roundTrip = opts.roundTrip ?? false
  const empty: TraversePlan = {
    points: [],
    roundTrip,
    turnIndex: -1,
    lengthM: 0,
    outLengthM: 0,
    driveS: 0,
    outDriveS: 0,
    maxSlopeDeg: 0,
    psrEntryM: null,
  }
  if (!path.length) return empty
  const stepM = Math.max(0.5, opts.stepM ?? 10)

  // Cumulative ground length at each route vertex.
  const verts = path.map((p) => selenographicToVector(p.lat, p.lon, 1))
  const cum = [0]
  for (let i = 1; i < verts.length; i++) cum.push(cum[i - 1] + arcM(verts[i - 1], verts[i]))
  const total = cum[cum.length - 1]
  // Equal steps as close to stepM as the route length allows, ending exactly on the last vertex.
  const n = total > 0 ? Math.max(1, Math.round(total / stepM)) : 0
  const ground = n ? total / n : 0

  const unit: Vec3[] = []
  let seg = 0
  for (let k = 0; k <= n; k++) {
    if (k === 0) unit.push(verts[0])
    else if (k === n) unit.push(verts[verts.length - 1])
    else {
      const s = k * ground
      while (seg < cum.length - 2 && cum[seg + 1] < s) seg++
      const len = cum[seg + 1] - cum[seg]
      unit.push(slerp(verts[seg], verts[seg + 1], len > 0 ? (s - cum[seg]) / len : 0))
    }
  }

  const points: TraversePoint[] = []
  let lastH = 0
  for (let k = 0; k < unit.length; k++) {
    // Keep the caller's exact coordinates at both ends.
    const ll = k === 0 ? path[0] : k === n ? path[path.length - 1] : vectorToSelenographic(unit[k])
    const h = sampleDemStack(grids, ll.lat, ll.lon)
    if (!Number.isNaN(h)) lastH = h
    const slope = slopeAtStack(grids, ll.lat, ll.lon)
    const slopeDeg = Number.isNaN(slope) ? 0 : slope
    points.push({
      lat: ll.lat,
      lon: ll.lon,
      heightM: lastH,
      distM: 0,
      slopeDeg,
      gradeDeg: 0,
      headingDeg: 0,
      inPsr: opts.illum ? isPsrAt(opts.illum, ll.lat, ll.lon) : false,
      speedMs: slopeSpeed(opts.speedMs, slopeDeg, opts.roverMaxSlopeDeg),
      tS: 0,
      leg: 'out',
    })
  }

  let maxSlopeDeg = 0
  let psrEntryM: number | null = null
  for (let k = 0; k < points.length; k++) {
    const p = points[k]
    if (k > 0) {
      const q = points[k - 1]
      const len = Math.hypot(ground, p.heightM - q.heightM)
      p.distM = q.distM + len
      p.tS = q.tS + len / (0.5 * (p.speedMs + q.speedMs))
    }
    // Central difference inside the route, one-sided at its ends.
    const a = points[Math.max(0, k - 1)]
    const b = points[Math.min(points.length - 1, k + 1)]
    const run = (Math.min(points.length - 1, k + 1) - Math.max(0, k - 1)) * ground
    p.gradeDeg = run > 0 ? Math.atan2(b.heightM - a.heightM, run) * RAD : 0
    if (k < points.length - 1) {
      const dir = sub(unit[k + 1], unit[k])
      p.headingDeg = toHorizontal(dir, enuBasis(p.lat, p.lon)).az
    } else if (k > 0) p.headingDeg = points[k - 1].headingDeg
    maxSlopeDeg = Math.max(maxSlopeDeg, p.slopeDeg)
    if (p.inPsr && psrEntryM === null) psrEntryM = p.distM
  }
  const turnIndex = points.length - 1
  const { distM: outLengthM, tS: outDriveS } = points[turnIndex]
  if (roundTrip) {
    for (let k = turnIndex; k >= 0; k--) {
      const o = points[k]
      const prev = points[points.length - 1]
      // The stretch just driven is the outbound one between k and k + 1, the other way round.
      const from = k < turnIndex ? points[k + 1] : o
      points.push({
        ...o,
        leg: 'back',
        distM: prev.distM + (from.distM - o.distM),
        tS: prev.tS + (from.tS - o.tS),
        gradeDeg: o.gradeDeg === 0 ? 0 : -o.gradeDeg,
        headingDeg:
          k > 0
            ? toHorizontal(sub(unit[k - 1], unit[k]), enuBasis(o.lat, o.lon)).az
            : prev.headingDeg,
      })
    }
  }
  const last = points[points.length - 1]
  return {
    points,
    roundTrip,
    turnIndex,
    lengthM: last.distM,
    outLengthM,
    driveS: last.tS,
    outDriveS,
    maxSlopeDeg,
    psrEntryM,
  }
}

/**
 * Electrical power needed to drive at `speedMs` on a grade (W): the weight component along the
 * track plus rolling resistance, over the drivetrain efficiency. Never negative: going downhill
 * the brakes take the energy, nothing is fed back to the battery.
 */
export function tractionPowerW(v: RoverVehicle, speedMs: number, gradeDeg: number): number {
  const g = gradeDeg * DEG
  const force = v.massKg * MOON_GRAVITY * (Math.sin(g) + v.rollingResistance * Math.cos(g))
  return Math.max(0, (force * speedMs) / Math.max(1e-9, v.drivetrainEfficiency))
}

/** Sun and Earth seen from a point of the route at an instant. */
export interface TraverseSky {
  sunAz: number
  sunEl: number
  /** Visible fraction of the solar disc over the local horizon (0..1). */
  sunFrac: number
  earthAz: number
  earthEl: number
  /** Usable fraction of the Earth disc for the link (0..1). */
  earthFrac: number
}

export type TraverseSkyFn = (
  lat: number,
  lon: number,
  heightM: number,
  timeMs: number,
) => TraverseSky

export interface TraverseSimInput {
  /** Departure from the landing point, UTC ms. */
  startMs: number
  profile: EnergyProfile
  vehicle: RoverVehicle
  /** Echoed only: which preset `profile` and `vehicle` came from. */
  vehicleId?: string
  /** Echoed only: both are applied by the sky function (see `traverseSky`). */
  linkMarginDeg?: number
  requireDsn?: boolean
  /** Samples to take at the ice (integer ≥ 0). Default SAMPLING_DEFAULTS.samples (3). */
  samples?: number
  /** Hours of work per sample: drilling plus analysis. Default SAMPLING_DEFAULTS.sampleH (2). */
  sampleH?: number
  /**
   * Power of the sampling instrument, on top of `activeW` while it works (W). Default: the
   * profile's `sampleW`, or 0 when it has none.
   */
  sampleW?: number
  /**
   * Drive back to the lander after the work at the ice. Default true; it only happens when the
   * plan carries the return leg (`plan.roundTrip`). With false the result ends at the ice.
   */
  roundTrip?: boolean
  /** The rover must be back at the lander by this instant, UTC ms. Omitted: no deadline. */
  deadlineMs?: number
  /** Time step while stopped: hibernating or sampling (min). Default 10. */
  waitStepMin?: number
  /** Longest hibernation the rover waits through before the traverse is given up (days). */
  maxWaitDays?: number
}

/**
 * What the rover is doing over the step that starts at a sample: driving 'out' or 'back',
 * stopped in hibernation to recharge ('wait'), or working on a sample ('sample'). 'done' marks
 * the last sample of a trip that ended as planned (back at the lander; at the ice one way). A
 * trip that fails ends on the phase it failed in ('wait' or 'sample').
 */
export type TraversePhase = 'out' | 'wait' | 'sample' | 'back' | 'done'

export interface TraverseSummary {
  /** The rover arrives at the ice (whatever happens afterwards). */
  reaches: boolean
  /**
   * Why the mission is not a success. 'no-route': empty plan. 'battery': the charge ran out
   * while driving and waiting could not bring it back (before the ice if `!reaches`, on the way
   * back otherwise). 'samples': it could not finish the sampling. 'late': it came back after
   * the deadline. Absent on success, and on a one-way run that reached its end.
   */
  reason?: 'battery' | 'no-route' | 'samples' | 'late'
  /** Arrival at the ice, UTC ms (null if it never gets there). */
  arrivalMs: number | null
  /** Samples asked for. */
  samples: number
  /** Samples completed (a sample cut short does not count). */
  samplesDone: number
  /** The rover made it back to the landing point (always false one way). */
  returns: boolean
  /** Arrival back at the landing point, UTC ms (null if it does not return). */
  returnMs: number | null
  /** Back by the deadline (true without one); false if it does not return. */
  onTime: boolean
  /** Deadline minus return, h: negative when late; null without a deadline or without return. */
  marginH: number | null
  /** reaches && samplesDone === samples && returns && onTime. */
  success: boolean
  /** TOTAL 3-D length of the plan, both legs for a round trip (m): `plan.lengthM`. */
  lengthM: number
  /** 3-D length of the outbound leg, lander to ice (m): `plan.outLengthM`. */
  outLengthM: number
  /** Time actually spent driving, both legs (h): outDriveH + returnDriveH. */
  driveH: number
  /** Driving time on the way to the ice (h). */
  outDriveH: number
  /** Driving time on the way back (h). */
  returnDriveH: number
  /** Time spent stopped in hibernation, waiting to recharge, over the whole trip (h). */
  waitH: number
  /** The part of `waitH` before reaching the ice (h). */
  outWaitH: number
  /** Time spent sampling, instrument on (h): samples × sampleH when all are done. */
  workH: number
  /** Departure to the end of the result: back at the lander, or the failure (h). */
  totalH: number
  /** Lowest and final state of charge over the whole trip (%). */
  minSocPct: number
  endSocPct: number
  /** Energy drawn by the loads over the whole trip, sampling included (Wh). */
  energyWh: number
  /** Time with no direct sunlight at all, whole trip (h). */
  hoursInShadow: number
  /** Share of the whole trip with at least half the Earth disc usable for the link (%). */
  dtePct: number
  /** Distance along the outbound leg at which the route enters permanent shadow (m), or null. */
  psrEntryM: number | null
}

/**
 * Structured-clone friendly (plain arrays): it crosses the worker boundary as is. Sample `i`
 * is the state at `t[i]`; `solarW[i]` and `loadW[i]` hold until `t[i + 1]` (explicit Euler).
 */
export interface TraverseResult {
  input: {
    lat: number
    lon: number
    startMs: number
    vehicleId?: string
    linkMarginDeg: number
    requireDsn: boolean
    /** As simulated, defaults applied. */
    samples: number
    sampleH: number
    sampleW: number
    /** The return was simulated (asked for, and the plan has the leg). */
    roundTrip: boolean
    deadlineMs: number | null
    profile: EnergyProfile
    vehicle: RoverVehicle
  }
  plan: TraversePlan
  /** Mission time of each sample, UTC ms. */
  t: number[]
  /** Index into `plan.points` of the point the rover is at (or leaving) at each sample. */
  pointIndex: number[]
  /** Odometer (m): it keeps growing on the way back. */
  distM: number[]
  socPct: number[]
  solarW: number[]
  loadW: number[]
  sunFrac: number[]
  earthFrac: number[]
  /** Sun-facing equipment temperature, radiative estimate (K). */
  tempK: number[]
  /** True while the rover is moving from this sample to the next. */
  driving: boolean[]
  /** What the rover does from this sample to the next (see TraversePhase). */
  phase: TraversePhase[]
  /**
   * 1-based number of the sample being taken (also while a recharge stop interrupts it), 0
   * outside the sampling.
   */
  sampleIndex: number[]
  summary: TraverseSummary
}

/**
 * Walks the plan in mission time and integrates the battery with the same step function as
 * `simulateBattery`. Three stages: the drive out to the ice (`plan.turnIndex`), the sampling
 * there, and the drive back to the first point.
 *
 * - Solar input: `peakW · sunFrac · incidenceFactor`. Inside a PSR cell the Sun is forced to
 *   0 even if the horizon used by `sky` lets a sliver through: the 100 m illumination map
 *   (a full year of full-resolution horizons) is the authority on permanent shadow, while the
 *   traverse horizon is interpolated between anchors ~200 m apart.
 * - Load while driving: `activeW` + traction (`tractionPowerW`), the grade taken in the
 *   direction driven, so the way back costs what the reversed slopes cost.
 * - Hibernate rule: when the charge falls below `hibernateBelowPct` the rover stops where it
 *   is, drops to `hibernateW` and waits in fixed steps until it is back above that threshold
 *   + 10 points. If that takes longer than `maxWaitDays` (or it stopped on permanently
 *   shadowed ground, where waiting cannot help) the traverse fails with reason 'battery'
 *   (`reaches` tells whether that was before the ice or on the way back).
 * - Sampling: from the arrival at the ice, `samples × sampleH` hours stopped at
 *   `activeW + sampleW`, in steps no longer than the waiting step and cut at the end of each
 *   sample. It can fail: if the charge falls below `hibernateBelowPct` on permanently shadowed
 *   ground there is nothing to recharge with and the result ends with reason 'samples' and the
 *   samples completed so far. On lit ground the rover hibernates and resumes the sample, as
 *   when driving (giving up after `maxWaitDays`, also with reason 'samples').
 * - End: back at the first point (`returns`), judged against `deadlineMs` (`onTime`, 'late').
 *   One way (`roundTrip: false`, or a plan without the return leg) it ends at the ice when the
 *   sampling does; with `samples: 0` that is the instant of arrival.
 * - Temperature: Sun-facing equipment in radiative equilibrium while lit, cooling
 *   exponentially (thermal.ts constants) towards the night floor, or the PSR floor inside one.
 */
export function simulateTraverse(
  plan: TraversePlan,
  input: TraverseSimInput,
  sky: TraverseSkyFn,
): TraverseResult {
  const { profile: p, vehicle } = input
  const finite = (v: number | undefined, fallback: number) =>
    v !== undefined && Number.isFinite(v) ? v : fallback
  const samples = Math.max(0, Math.round(finite(input.samples, SAMPLING_DEFAULTS.samples)))
  const sampleH = Math.max(0, finite(input.sampleH, SAMPLING_DEFAULTS.sampleH))
  const sampleW = Math.max(0, finite(input.sampleW, p.sampleW ?? 0))
  const deadlineMs = input.deadlineMs ?? null
  const waitMs = Math.max(1, input.waitStepMin ?? 10) * 60_000
  const maxWaitMs = Math.max(0, input.maxWaitDays ?? 14) * DAY_MS
  const pts = plan.points
  const last = pts.length - 1
  const turn = plan.turnIndex
  const roundTrip = (input.roundTrip ?? true) && last > turn
  const out: TraverseResult = {
    input: {
      lat: pts[0]?.lat ?? NaN,
      lon: pts[0]?.lon ?? NaN,
      startMs: input.startMs,
      vehicleId: input.vehicleId,
      linkMarginDeg: input.linkMarginDeg ?? 0,
      requireDsn: input.requireDsn ?? false,
      samples,
      sampleH,
      sampleW,
      roundTrip,
      deadlineMs,
      profile: p,
      vehicle,
    },
    plan,
    t: [],
    pointIndex: [],
    distM: [],
    socPct: [],
    solarW: [],
    loadW: [],
    sunFrac: [],
    earthFrac: [],
    tempK: [],
    driving: [],
    phase: [],
    sampleIndex: [],
    summary: {
      reaches: false,
      reason: 'no-route',
      arrivalMs: null,
      samples,
      samplesDone: 0,
      returns: false,
      returnMs: null,
      onTime: false,
      marginH: null,
      success: false,
      lengthM: plan.lengthM,
      outLengthM: plan.outLengthM,
      driveH: 0,
      outDriveH: 0,
      returnDriveH: 0,
      waitH: 0,
      outWaitH: 0,
      workH: 0,
      totalH: 0,
      minSocPct: 0,
      endSocPct: 0,
      energyWh: 0,
      hoursInShadow: 0,
      dtePct: 0,
      psrEntryM: plan.psrEntryM,
    },
  }
  if (!pts.length) return out

  const capWh = Math.max(1e-9, p.batteryWh)
  const resumePct = Math.min(100, p.hibernateBelowPct + 10)
  const sampleMs = sampleH * HOUR_MS
  let e = (capWh * clamp(p.initialSocPct, 0, 100)) / 100
  let t = input.startMs
  let i = 0
  let mode: 'drive' | 'wait' | 'sample' = 'drive'
  /** What a hibernation stop interrupted. */
  let resume: 'drive' | 'sample' = 'drive'
  let leg: TraverseLeg = 'out'
  let waitedMs = 0
  let samplesDone = 0
  let inSampleMs = 0
  let arrivalMs: number | null = null
  let returnMs: number | null = null
  let fail: 'battery' | 'samples' | null = null
  let temp = NaN
  let prevDtMs = 0
  let outDriveMs = 0
  let backDriveMs = 0
  let waitTotalMs = 0
  let outWaitMs = 0
  let workMs = 0
  let shadowMs = 0
  let linkMs = 0
  let energyWh = 0
  let minSoc = Infinity

  for (;;) {
    let pt = pts[i]
    const s = sky(pt.lat, pt.lon, pt.heightM, t)
    const sunFrac = pt.inPsr ? 0 : clamp(s.sunFrac, 0, 1)
    const solar = p.peakW * sunFrac * incidenceFactor(p, s.sunAz, s.sunEl)
    const soc = (100 * e) / capWh
    minSoc = Math.min(minSoc, soc)

    const floor = pt.inPsr ? T_PSR_K : T_NIGHT_K
    const lit = sunFrac > 0 ? litTemps(s.sunEl, sunFrac, floor).faceK : floor
    if (Number.isNaN(temp)) temp = lit
    else {
      // Heating is fast compared with cooling: the larger of equilibrium and decay.
      const cooled = floor + (temp - floor) * Math.exp(-prevDtMs / (COOLING_TAU_H * HOUR_MS))
      temp = sunFrac > 0 ? Math.max(lit, cooled) : cooled
    }

    // Ended as planned (`finished`) or given up (`fail`): this sample is the last one.
    let finished = false
    if (mode === 'wait') {
      if (soc >= resumePct) mode = resume
      else if (waitedMs >= maxWaitMs || (pt.inPsr && waitedMs > 0))
        fail = resume === 'sample' ? 'samples' : 'battery'
    }
    if (mode === 'drive' && leg === 'out' && i === turn) {
      arrivalMs = t
      mode = 'sample'
    }
    if (mode === 'sample') {
      if (sampleMs <= 0) samplesDone = samples
      if (samplesDone >= samples) {
        if (roundTrip) {
          // Turn around on the spot: the next point is the same place, facing home.
          leg = 'back'
          i = turn + 1
          pt = pts[i]
          mode = 'drive'
        } else finished = true
      } else if (soc < p.hibernateBelowPct) {
        // No Sun to wait for in permanent shadow: the work stops here.
        if (pt.inPsr) fail = 'samples'
        else {
          mode = 'wait'
          resume = 'sample'
          waitedMs = 0
        }
      }
    }
    if (mode === 'drive' && !finished) {
      if (leg === 'back' && i === last) {
        returnMs = t
        finished = true
      } else if (soc < p.hibernateBelowPct) {
        mode = 'wait'
        resume = 'drive'
        waitedMs = 0
      }
    }
    const stop = finished || fail !== null

    let load: number
    let dtMs = 0
    if (stop) load = fail ? p.hibernateW : p.activeW
    else if (mode === 'drive') {
      load = p.activeW + tractionPowerW(vehicle, pt.speedMs, pt.gradeDeg)
      dtMs = (pts[i + 1].tS - pt.tS) * 1000
    } else if (mode === 'wait') {
      load = p.hibernateW
      dtMs = waitMs
    } else {
      load = p.activeW + sampleW
      dtMs = Math.min(waitMs, sampleMs - inSampleMs)
    }
    const sampling = mode === 'sample' || (mode === 'wait' && resume === 'sample')

    out.t.push(t)
    out.pointIndex.push(i)
    out.distM.push(pt.distM)
    out.socPct.push(soc)
    out.solarW.push(solar)
    out.loadW.push(load)
    out.sunFrac.push(sunFrac)
    out.earthFrac.push(s.earthFrac)
    out.tempK.push(temp)
    out.driving.push(mode === 'drive' && !stop)
    out.phase.push(finished ? 'done' : mode === 'drive' ? leg : mode)
    out.sampleIndex.push(sampling && !finished ? samplesDone + 1 : 0)
    if (stop) break

    const dtH = dtMs / HOUR_MS
    const step = stepBattery(e, solar, load, dtH, capWh)
    e = step.energyWh
    energyWh += step.outWh
    if (sunFrac <= 0) shadowMs += dtMs
    if (s.earthFrac >= VISIBLE_THRESHOLD) linkMs += dtMs
    if (mode === 'drive') {
      if (leg === 'out') outDriveMs += dtMs
      else backDriveMs += dtMs
      i++
    } else if (mode === 'wait') {
      waitedMs += dtMs
      waitTotalMs += dtMs
      if (arrivalMs === null) outWaitMs += dtMs
    } else {
      workMs += dtMs
      inSampleMs += dtMs
      // Tolerance: a sample length that is not a whole number of ms.
      if (inSampleMs >= sampleMs - 1e-6) {
        samplesDone++
        inSampleMs = 0
      }
    }
    t += dtMs
    prevDtMs = dtMs
  }

  const totalMs = t - input.startMs
  const linkNow = out.earthFrac[out.earthFrac.length - 1] >= VISIBLE_THRESHOLD
  const reaches = arrivalMs !== null
  const returns = returnMs !== null
  const onTime = returnMs !== null && (deadlineMs === null || returnMs <= deadlineMs)
  const reason = fail ?? (returns && !onTime ? ('late' as const) : null)
  out.summary = {
    reaches,
    ...(reason ? { reason } : {}),
    arrivalMs,
    samples,
    samplesDone,
    returns,
    returnMs,
    onTime,
    marginH: returnMs !== null && deadlineMs !== null ? (deadlineMs - returnMs) / HOUR_MS : null,
    success: reaches && samplesDone === samples && returns && onTime,
    lengthM: plan.lengthM,
    outLengthM: plan.outLengthM,
    driveH: (outDriveMs + backDriveMs) / HOUR_MS,
    outDriveH: outDriveMs / HOUR_MS,
    returnDriveH: backDriveMs / HOUR_MS,
    waitH: waitTotalMs / HOUR_MS,
    outWaitH: outWaitMs / HOUR_MS,
    workH: workMs / HOUR_MS,
    totalH: totalMs / HOUR_MS,
    minSocPct: minSoc,
    endSocPct: out.socPct[out.socPct.length - 1],
    energyWh,
    hoursInShadow: shadowMs / HOUR_MS,
    // Time-weighted; a zero-length result (already at the ice, nothing to do) is its only sample.
    dtePct: totalMs > 0 ? (100 * linkMs) / totalMs : linkNow ? 100 : 0,
    psrEntryM: plan.psrEntryM,
  }
  return out
}

export const traverseDurationMs = (r: Pick<TraverseResult, 't'>) =>
  r.t.length ? r.t[r.t.length - 1] - r.t[0] : 0

/** State of the rover at an instant, interpolated between samples (for the animation). */
export interface TraverseSample {
  /** Sample at or before `timeMs`. */
  index: number
  lat: number
  lon: number
  heightM: number
  headingDeg: number
  slopeDeg: number
  gradeDeg: number
  /** 0 while stopped. */
  speedMs: number
  /** Odometer (m): keeps growing on the way back. */
  distM: number
  socPct: number
  solarW: number
  loadW: number
  sunFrac: number
  earthFrac: number
  tempK: number
  inPsr: boolean
  driving: boolean
  /** What the rover is doing (see TraversePhase); 'done' from the end of a completed trip. */
  phase: TraversePhase
  /** Leg of the point it is at: 'out' up to and during the sampling, 'back' afterwards. */
  leg: TraverseLeg
  /** 1-based sample in progress (also during a recharge stop in the middle of it), else 0. */
  sampleIndex: number
  /** Samples completed by this instant. */
  samplesDone: number
}

const lerp = (a: number, b: number, f: number) => a + (b - a) * f

/**
 * Rover state at `timeMs`, clamped to the simulated span: the first sample before departure,
 * the last one after the end. Null only for a result without samples (no route).
 * Position, attitude and continuous quantities are interpolated linearly; `solarW`/`loadW`
 * are the values that hold over the current step, as in the integration. While sampling the
 * rover stays exactly on the ice point; it turns to face home over the last step of the
 * sampling (the plan's two points at the ice differ only in heading).
 */
export function sampleTraverse(r: TraverseResult, timeMs: number): TraverseSample | null {
  const n = r.t.length
  if (!n) return null
  let lo = 0
  let hi = n - 1
  if (timeMs >= r.t[hi]) lo = hi
  else if (timeMs > r.t[0]) {
    // Last sample with t ≤ timeMs.
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (r.t[mid] <= timeMs) lo = mid
      else hi = mid
    }
  }
  const j = Math.min(n - 1, lo + 1)
  const span = r.t[j] - r.t[lo]
  const f = span > 0 ? clamp((timeMs - r.t[lo]) / span, 0, 1) : 0
  const a = r.plan.points[r.pointIndex[lo]]
  const b = r.plan.points[r.pointIndex[j]]
  const driving = r.driving[lo]
  let { lat, lon } = a
  if (f > 0 && (a.lat !== b.lat || a.lon !== b.lon)) {
    // Through 3-D so that it also works next to the pole, where longitudes jump.
    const v = slerp(
      selenographicToVector(a.lat, a.lon, 1),
      selenographicToVector(b.lat, b.lon, 1),
      f,
    )
    ;({ lat, lon } = vectorToSelenographic(v))
  }
  const sampleIndex = r.sampleIndex[lo]
  const { arrivalMs, samplesDone } = r.summary
  return {
    index: lo,
    lat,
    lon,
    heightM: lerp(a.heightM, b.heightM, f),
    headingDeg: wrap360(a.headingDeg + wrap180(b.headingDeg - a.headingDeg) * f),
    slopeDeg: lerp(a.slopeDeg, b.slopeDeg, f),
    gradeDeg: lerp(a.gradeDeg, b.gradeDeg, f),
    speedMs: driving ? lerp(a.speedMs, b.speedMs, f) : 0,
    distM: lerp(r.distM[lo], r.distM[j], f),
    socPct: lerp(r.socPct[lo], r.socPct[j], f),
    solarW: r.solarW[lo],
    loadW: r.loadW[lo],
    sunFrac: lerp(r.sunFrac[lo], r.sunFrac[j], f),
    earthFrac: lerp(r.earthFrac[lo], r.earthFrac[j], f),
    tempK: lerp(r.tempK[lo], r.tempK[j], f),
    inPsr: (f >= 0.5 ? b : a).inPsr,
    driving,
    phase: r.phase[lo],
    leg: a.leg,
    sampleIndex,
    samplesDone:
      sampleIndex > 0
        ? sampleIndex - 1
        : arrivalMs === null || r.t[lo] < arrivalMs
          ? 0
          : samplesDone,
  }
}

export interface TraverseSkyOptions {
  /** Distance between the points where a full horizon is computed (m). Default 200. */
  anchorSpacingM?: number
  /** Minimum clearance of the Earth above the terrain for a usable link (deg). */
  linkMarginDeg?: number
  /** Also require a DSN complex with the Moon in view. */
  requireDsn?: boolean
  azStepDeg?: number
  growth?: number
}

/**
 * Indices of the plan points that carry a horizon: evenly spaced along the OUTBOUND leg, both
 * of its ends included (the way back passes through the same places, so it needs no more).
 */
export function traverseAnchors(plan: TraversePlan, anchorSpacingM = 200): number[] {
  const n = plan.turnIndex + 1
  if (n <= 1) return n === 1 ? [0] : []
  const count = Math.max(1, Math.round(plan.outLengthM / Math.max(1, anchorSpacingM)))
  const idx: number[] = []
  let k = 0
  for (let a = 0; a <= count; a++) {
    const target = (a * plan.outLengthM) / count
    while (k < n - 1 && plan.points[k + 1].distM <= target + 1e-6) k++
    const pick =
      k < n - 1 && plan.points[k + 1].distM - target < target - plan.points[k].distM ? k + 1 : k
    if (idx[idx.length - 1] !== pick) idx.push(pick)
  }
  if (idx[idx.length - 1] !== n - 1) idx.push(n - 1)
  return idx
}

/**
 * Real sky for `simulateTraverse`. A full horizon per 10 m point would be far too slow, so
 * masks are ray-marched only at anchors every ~200 m of route (lazily, each one once) and the
 * terrain horizon at the rover is the distance-weighted blend of its two nearest anchors. The
 * direction of the Sun and the Earth is exact for the rover's own position, height and time
 * (same chain as `evaluateSite`). As there, the link margin lifts the horizon for the Earth
 * only, and `requireDsn` zeroes the link while no DSN complex sees the Moon.
 *
 * Limits: between anchors the near-field relief (a boulder field, the rim the rover has just
 * crossed) is that of the anchors, not of the point; the masks are coarse (2° bins, 2 %
 * step growth) compared with the curated site mask.
 */
export function traverseSky(
  grids: readonly DemGrid[],
  plan: TraversePlan,
  opts: TraverseSkyOptions = {},
): TraverseSkyFn {
  const { linkMarginDeg = 0, requireDsn = false, azStepDeg = 2, growth = 0.02 } = opts
  const anchors = traverseAnchors(plan, opts.anchorSpacingM).map((i) => {
    const p = plan.points[i]
    return { lat: p.lat, lon: p.lon, unit: selenographicToVector(p.lat, p.lon, 1) }
  })
  const masks: (HorizonMask | null | undefined)[] = anchors.map(() => undefined)
  const maskOf = (k: number): HorizonMask | null => {
    let m = masks[k]
    if (m === undefined) {
      try {
        const h = computeHorizonMask(grids, anchors[k].lat, anchors[k].lon, { azStepDeg, growth })
        m = { azStepDeg: h.azStepDeg, elevDeg: h.elevDeg }
      } catch {
        // No DEM under the anchor: its neighbour (or the bare horizon) stands in.
        m = null
      }
      masks[k] = m
    }
    return m
  }

  return (lat, lon, heightM, timeMs) => {
    const { sun, earth } = bodyFixedEphemeris(new Date(timeMs))
    const state = skyFromVectors(sun, earth, makeObserver({ lat, lon, heightM }))

    // Two nearest anchors (chord distance on the unit sphere).
    const u = selenographicToVector(lat, lon, 1)
    let k1 = -1
    let k2 = -1
    let d1 = Infinity
    let d2 = Infinity
    for (let k = 0; k < anchors.length; k++) {
      const d = norm(sub(anchors[k].unit, u))
      if (d < d1) {
        k2 = k1
        d2 = d1
        k1 = k
        d1 = d
      } else if (d < d2) {
        k2 = k
        d2 = d
      }
    }
    const m1 = k1 >= 0 ? maskOf(k1) : null
    const m2 = k2 >= 0 && d1 > 0 ? maskOf(k2) : null
    const w1 = m1 && m2 ? d2 / (d1 + d2) : m1 ? 1 : 0
    const horizonAt = (az: number) => {
      if (!m1 && !m2) return 0
      return (m1 ? w1 * maskAt(m1, az) : 0) + (m2 ? (1 - w1) * maskAt(m2, az) : 0)
    }

    let earthFrac = discVisibleFraction(
      state.earth.el,
      horizonAt(state.earth.az) + linkMarginDeg,
      state.earth.radiusDeg,
    )
    if (requireDsn && earthFrac > 0 && !anyStationSeesMoon(timeMs)) earthFrac = 0
    return {
      sunAz: state.sun.az,
      sunEl: state.sun.el,
      sunFrac: discVisibleFraction(state.sun.el, horizonAt(state.sun.az), state.sun.radiusDeg),
      earthAz: state.earth.az,
      earthEl: state.earth.el,
      earthFrac,
    }
  }
}

/** Worker job: everything needed to plan and simulate one traverse. */
export interface TraverseJobInput {
  /** Landing point (the first vertex of `path`). */
  lat: number
  lon: number
  /**
   * Route from `computeIceAccess`, landing end first. Its first vertex is the centre of the
   * DEM pixel under the lander, so the landing point itself is put in front when they differ.
   */
  path: { lat: number; lon: number }[]
  /** Departure, UTC ms. */
  startMs: number
  /** The rover's own power budget (not the lander's); its `sampleW` is the instrument's. */
  energy: EnergyProfile
  vehicleId: RoverId
  roverMaxSlopeDeg: number
  linkMarginDeg?: number
  requireDsn?: boolean
  stepM?: number
  /** Drive back to the lander after the work at the ice. Default true. */
  roundTrip?: boolean
  /** As in TraverseSimInput (defaults: SAMPLING_DEFAULTS, the profile's `sampleW`, no deadline). */
  samples?: number
  sampleH?: number
  sampleW?: number
  deadlineMs?: number
}

/** The date-independent part of a traverse job: the plan and its (lazily ray-marched) sky. */
export interface PreparedTraverse {
  plan: TraversePlan
  sky: TraverseSkyFn
}

/**
 * Plans the route (a round trip unless `roundTrip: false`) and sets up its sky. Neither depends
 * on the departure date, the power budget, the samples or the deadline, so one prepared traverse
 * can be simulated for many dates and workloads (the planner does).
 */
export function prepareTraverse(
  grids: readonly DemGrid[],
  input: Pick<
    TraverseJobInput,
    | 'lat'
    | 'lon'
    | 'path'
    | 'vehicleId'
    | 'roverMaxSlopeDeg'
    | 'linkMarginDeg'
    | 'requireDsn'
    | 'stepM'
    | 'roundTrip'
  >,
  illum?: IllumGrid,
): PreparedTraverse {
  const vehicle = ROVER_VEHICLES[input.vehicleId]
  const landing = { lat: input.lat, lon: input.lon }
  const first = input.path[0]
  const offM = first
    ? arcM(
        selenographicToVector(first.lat, first.lon, 1),
        selenographicToVector(landing.lat, landing.lon, 1),
      )
    : 0
  const path = offM > 1 ? [landing, ...input.path] : input.path
  const plan = planTraverse(path, grids, {
    stepM: input.stepM,
    speedMs: vehicle.speedMs,
    roverMaxSlopeDeg: input.roverMaxSlopeDeg,
    illum,
    roundTrip: input.roundTrip ?? true,
  })
  const { linkMarginDeg, requireDsn } = input
  return { plan, sky: traverseSky(grids, plan, { linkMarginDeg, requireDsn }) }
}

/** Simulates a prepared traverse for one departure (`input` as given to `prepareTraverse`). */
export function simulatePrepared(
  { plan, sky }: PreparedTraverse,
  input: TraverseJobInput,
): TraverseResult {
  const { linkMarginDeg, requireDsn } = input
  const result = simulateTraverse(
    plan,
    {
      startMs: input.startMs,
      profile: input.energy,
      vehicle: ROVER_VEHICLES[input.vehicleId],
      vehicleId: input.vehicleId,
      linkMarginDeg,
      requireDsn,
      roundTrip: input.roundTrip,
      samples: input.samples,
      sampleH: input.sampleH,
      sampleW: input.sampleW,
      deadlineMs: input.deadlineMs,
    },
    sky,
  )
  // Always the caller's landing point, so a result can be matched to its request.
  result.input.lat = input.lat
  result.input.lon = input.lon
  return result
}

/** Plan + real sky + simulation, as run by the worker. */
export function computeTraverse(
  grids: readonly DemGrid[],
  input: TraverseJobInput,
  illum?: IllumGrid,
): TraverseResult {
  return simulatePrepared(prepareTraverse(grids, input, illum), input)
}
