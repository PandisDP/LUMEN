import { describe, expect, it } from 'vitest'
import { DEG, HOUR_MS } from './constants.ts'
import { type DemGrid, lolaProductMeta, pixelToMap } from './dem.ts'
import { type EnergyProfile, stepBattery } from './energy.ts'
import { bodyFixedEphemeris, makeObserver, skyFromVectors } from './ephemeris.ts'
import { mapToSouthPolar, southPolarToMap, wrap180 } from './frames.ts'
import { discVisibleFraction, maskAt } from './horizon.ts'
import { computeHorizonMask } from './horizonFromDem.ts'
import { computeIceAccess } from './iceAccess.ts'
import { type IllumGrid, encodeIllum } from './illumination.ts'
import {
  ROVER_VEHICLES,
  SAMPLING_DEFAULTS,
  SAMPLING_LIMITS,
  type TraverseResult,
  type TraverseSkyFn,
  clampSampleH,
  clampSamples,
  computeTraverse,
  planTraverse,
  sampleTraverse,
  simulateTraverse,
  tractionPowerW,
  traverseAnchors,
  traverseDurationMs,
  traverseSky,
} from './traverse.ts'

const SIZE = 241 // ±2.4 km at 20 m/px, centred on the pole
const meta = lolaProductMeta(SIZE, 20)

function dem(f: (x: number, y: number) => number): DemGrid {
  const data = new Int16Array(SIZE * SIZE)
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) {
      const { x, y } = pixelToMap(meta, c, r)
      data[r * SIZE + c] = Math.round(f(x, y) / meta.heightScale)
    }
  return { ...meta, data }
}

/** Permanent shadow east of x = 1000 m, 75 % mean light elsewhere. */
function illum(): IllumGrid {
  const data = new Uint8Array(SIZE * SIZE)
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) {
      const { x } = pixelToMap(meta, c, r)
      data[r * SIZE + c] = x > 1000 ? 0 : encodeIllum(75, 1)
    }
  return { ...meta, data }
}

/** Straight route along map x (y fixed), with vertices every 80 m like computeIceAccess. */
function line(x0: number, x1: number, y = 500) {
  const n = Math.max(1, Math.round(Math.abs(x1 - x0) / 80))
  return Array.from({ length: n + 1 }, (_, i) => mapToSouthPolar(x0 + ((x1 - x0) * i) / n, y))
}

const flat = [dem(() => 0)]
const RAMP = Math.tan(15 * DEG)
/** 15° ramp rising towards +x. */
const ramp = [dem((x) => x * RAMP)]
const rover = ROVER_VEHICLES.rover
const planOpts = { speedMs: rover.speedMs, roverMaxSlopeDeg: 20 }

const profile: EnergyProfile = {
  panel: 'tracking',
  panelAzDeg: 0,
  peakW: 120,
  batteryWh: 600,
  activeW: 70,
  hibernateW: 18,
  hibernateBelowPct: 20,
  initialSocPct: 100,
}

const constantSky =
  (sunFrac: number, earthFrac = 1): TraverseSkyFn =>
  () => ({ sunAz: 90, sunEl: 1.5, sunFrac, earthAz: 0, earthEl: 5, earthFrac })

const T0 = Date.UTC(2027, 2, 1)

/** Energy drawn over the steps that start in `phase` (Wh). */
const phaseWh = (r: TraverseResult, phase: TraverseResult['phase'][number]) => {
  let wh = 0
  for (let i = 0; i + 1 < r.t.length; i++)
    if (r.phase[i] === phase) wh += (r.loadW[i] * (r.t[i + 1] - r.t[i])) / HOUR_MS
  return wh
}

describe('planTraverse', () => {
  it('resamples the route into equal steps ending on the last vertex', () => {
    const path = line(-400, 605)
    const plan = planTraverse(path, flat, planOpts)
    const pts = plan.points
    expect(pts.length).toBeGreaterThan(95)
    for (let i = 1; i < pts.length; i++) {
      const step = pts[i].distM - pts[i - 1].distM
      expect(step).toBeGreaterThan(9)
      expect(step).toBeLessThan(11)
      expect(pts[i].tS).toBeGreaterThan(pts[i - 1].tS)
    }
    const end = pts[pts.length - 1]
    expect(end.lat).toBe(path[path.length - 1].lat)
    expect(end.lon).toBe(path[path.length - 1].lon)
    expect(pts[0].lat).toBe(path[0].lat)
    expect(plan.lengthM).toBeCloseTo(1005, 0)
    // Flat ground: nominal speed all the way.
    expect(plan.driveS).toBeCloseTo(plan.lengthM / rover.speedMs, 3)
    expect(plan.maxSlopeDeg).toBeCloseTo(0, 6)
    expect(plan.psrEntryM).toBeNull()
    // Every resampled point stays on the line y = 500.
    for (const p of pts) expect(southPolarToMap(p.lat, p.lon).y).toBeCloseTo(500, 3)
  })

  it('keeps going through the pole itself', () => {
    const plan = planTraverse(line(-300, 300, 0), flat, planOpts)
    expect(plan.lengthM).toBeCloseTo(600, 0)
    for (const p of plan.points) expect(Number.isFinite(p.lat + p.lon + p.headingDeg)).toBe(true)
  })

  it('honours stepM and a single-vertex route', () => {
    const plan = planTraverse(line(0, 400), flat, { ...planOpts, stepM: 25 })
    expect(plan.points.length).toBe(17)
    const one = planTraverse([mapToSouthPolar(0, 500)], flat, planOpts)
    expect(one.points.length).toBe(1)
    expect(one.lengthM).toBe(0)
    expect(planTraverse([], flat, planOpts).points.length).toBe(0)
  })

  it('is slower on a 15° ramp, with the grade signed by the driving direction', () => {
    const level = planTraverse(line(200, 1000), flat, planOpts)
    const up = planTraverse(line(200, 1000), ramp, planOpts)
    const down = planTraverse(line(1000, 200), ramp, planOpts)
    const mid = Math.floor(up.points.length / 2)
    expect(up.points[mid].slopeDeg).toBeCloseTo(15, 0)
    expect(up.points[mid].gradeDeg).toBeCloseTo(15, 0)
    expect(down.points[mid].gradeDeg).toBeCloseTo(-15, 0)
    // v = v0 · (1 − slope / limit): a quarter of the commanded speed at 15° of 20°.
    expect(up.points[mid].speedMs).toBeCloseTo(
      rover.speedMs * (1 - up.points[mid].slopeDeg / 20),
      9,
    )
    expect(up.points[mid].speedMs).toBeCloseTo(rover.speedMs * 0.25, 2)
    expect(up.driveS).toBeGreaterThan(3 * level.driveS)
    // 3-D length: 800 m of ground on a 15° incline.
    expect(up.lengthM).toBeCloseTo(800 / Math.cos(15 * DEG), 0)
    expect(up.maxSlopeDeg).toBeCloseTo(15, 0)
    // Heading: +x is towards lon 90°E; at (x > 0, y = 500) that is roughly "east-ish" and the
    // way back is the opposite direction.
    const dh = Math.abs(up.points[mid].headingDeg - down.points[mid].headingDeg)
    expect(dh).toBeCloseTo(180, 0)
  })

  it('never drives slower than 20 % of the commanded speed', () => {
    const plan = planTraverse(line(200, 1000), ramp, { ...planOpts, roverMaxSlopeDeg: 10 })
    expect(plan.points[20].speedMs).toBeCloseTo(rover.speedMs * 0.2, 6)
  })

  it('reports where the route enters permanent shadow', () => {
    const plan = planTraverse(line(0, 1500), flat, { ...planOpts, illum: illum() })
    // Illumination cells are tested by nearest centre: the boundary sits within one pixel.
    expect(plan.psrEntryM!).toBeGreaterThan(985)
    expect(plan.psrEntryM!).toBeLessThan(1025)
    expect(plan.points[0].inPsr).toBe(false)
    expect(plan.points[plan.points.length - 1].inPsr).toBe(true)
  })

  it('is one way unless asked: every point outbound, the turn at the last one', () => {
    const plan = planTraverse(line(0, 400), flat, planOpts)
    expect(plan.roundTrip).toBe(false)
    expect(plan.turnIndex).toBe(plan.points.length - 1)
    expect(plan.outLengthM).toBe(plan.lengthM)
    expect(plan.outDriveS).toBe(plan.driveS)
    for (const p of plan.points) expect(p.leg).toBe('out')
    expect(planTraverse([], flat, planOpts)).toMatchObject({ turnIndex: -1, outLengthM: 0 })
  })

  it('round trip: comes back over the same points and ends where it left', () => {
    const one = planTraverse(line(0, 1500), flat, { ...planOpts, illum: illum() })
    const plan = planTraverse(line(0, 1500), flat, { ...planOpts, illum: illum(), roundTrip: true })
    const pts = plan.points
    const turn = plan.turnIndex
    expect(plan.roundTrip).toBe(true)
    expect(turn).toBe(one.points.length - 1)
    expect(pts.length).toBe(2 * (turn + 1))
    // The outbound leg is the one-way plan, untouched.
    expect(pts.slice(0, turn + 1)).toEqual(one.points)
    expect(plan.outLengthM).toBe(one.lengthM)
    expect(plan.outDriveS).toBe(one.driveS)
    expect(plan.psrEntryM).toBe(one.psrEntryM)
    expect(plan.maxSlopeDeg).toBe(one.maxSlopeDeg)
    // Total length and time: twice the way out.
    expect(plan.lengthM).toBeCloseTo(2 * plan.outLengthM, 6)
    expect(plan.driveS).toBeCloseTo(2 * plan.outDriveS, 6)
    // The last point is the first one; the two at the ice are the same place and instant.
    const end = pts[pts.length - 1]
    expect([end.lat, end.lon, end.heightM]).toEqual([pts[0].lat, pts[0].lon, pts[0].heightM])
    expect(end.distM).toBe(plan.lengthM)
    expect(end.tS).toBe(plan.driveS)
    expect(pts[turn + 1]).toMatchObject({
      lat: pts[turn].lat,
      lon: pts[turn].lon,
      distM: pts[turn].distM,
      tS: pts[turn].tS,
      leg: 'back',
    })
    for (let k = 0; k <= turn; k++) {
      const o = pts[k]
      const b = pts[pts.length - 1 - k]
      expect(o.leg).toBe('out')
      expect(b.leg).toBe('back')
      expect([b.lat, b.lon, b.heightM, b.slopeDeg, b.inPsr, b.speedMs]).toEqual([
        o.lat,
        o.lon,
        o.heightM,
        o.slopeDeg,
        o.inPsr,
        o.speedMs,
      ])
      // Odometer and clock mirror the way out around the turn.
      expect(b.distM).toBeCloseTo(plan.lengthM - o.distM, 6)
      expect(b.tS).toBeCloseTo(plan.driveS - o.tS, 6)
    }
    for (let i = turn + 2; i < pts.length; i++) {
      expect(pts[i].distM).toBeGreaterThan(pts[i - 1].distM)
      expect(pts[i].tS).toBeGreaterThan(pts[i - 1].tS)
    }
    // Horizons are only needed once per place: anchors stay on the outbound leg.
    expect(traverseAnchors(plan, 200)).toEqual(traverseAnchors(one, 200))
  })

  it('round trip: the grade changes sign and the heading turns around on the way back', () => {
    const plan = planTraverse(line(200, 1000), ramp, { ...planOpts, roundTrip: true })
    const pts = plan.points
    const turn = plan.turnIndex
    for (let k = 0; k <= turn; k++) {
      const o = pts[k]
      const b = pts[pts.length - 1 - k]
      expect(b.gradeDeg).toBeCloseTo(-o.gradeDeg, 9)
      // Same straight line driven the other way (the two ends copy their neighbour's heading).
      expect(Math.abs(wrap180(b.headingDeg - o.headingDeg))).toBeGreaterThan(178)
    }
    const mid = Math.floor(turn / 2)
    expect(pts[mid].gradeDeg).toBeCloseTo(15, 0)
    expect(pts[pts.length - 1 - mid].gradeDeg).toBeCloseTo(-15, 0)
    // Speed depends on the slope, not on its sign: the way back takes as long.
    expect(plan.driveS).toBeCloseTo(2 * plan.outDriveS, 6)
    // A single point: out and back are the same place, nothing to drive.
    const one = planTraverse([mapToSouthPolar(0, 500)], flat, { ...planOpts, roundTrip: true })
    expect(one).toMatchObject({ turnIndex: 0, lengthM: 0, outLengthM: 0, driveS: 0 })
    expect(one.points.map((p) => p.leg)).toEqual(['out', 'back'])
    expect(planTraverse([], flat, { ...planOpts, roundTrip: true }).points).toEqual([])
  })
})

describe('sampling inputs', () => {
  it('have defaults inside their limits and clamp what they are given', () => {
    expect(SAMPLING_DEFAULTS).toEqual({ samples: 3, sampleH: 2 })
    expect(SAMPLING_LIMITS.samples).toMatchObject({ min: 1, max: 10 })
    expect(SAMPLING_LIMITS.sampleH).toMatchObject({ min: 0.5, max: 6 })
    expect([0, 2.6, 99, NaN].map(clampSamples)).toEqual([1, 3, 10, 3])
    expect([0, 1.25, 99, NaN].map(clampSampleH)).toEqual([0.5, 1.25, 6, 2])
  })
})

describe('tractionPowerW', () => {
  it('costs more uphill than on the flat and is never negative downhill', () => {
    const level = tractionPowerW(rover, 0.1, 0)
    // 40 kg · 1.62 m/s² · 0.1 m/s · 0.15 / 0.6
    expect(level).toBeCloseTo(1.62, 6)
    expect(tractionPowerW(rover, 0.1, 10)).toBeGreaterThan(2 * level)
    expect(tractionPowerW(rover, 0.1, -3)).toBeGreaterThan(0)
    expect(tractionPowerW(rover, 0.1, -30)).toBe(0)
  })

  it('shows up in the simulated load', () => {
    const csa = ROVER_VEHICLES['csa-rover']
    const opts = { speedMs: csa.speedMs, roverMaxSlopeDeg: 60 }
    const run = (grids: DemGrid[], x0: number, x1: number) =>
      simulateTraverse(
        planTraverse(line(x0, x1), grids, opts),
        { startMs: T0, profile, vehicle: csa },
        constantSky(1),
      )
    const level = run(flat, 200, 1000)
    const up = run(ramp, 200, 1000)
    const down = run(ramp, 1000, 200)
    const mid = 40
    expect(up.loadW[mid]).toBeGreaterThan(level.loadW[mid] + 10)
    expect(level.loadW[mid]).toBeGreaterThan(profile.activeW)
    expect(down.loadW[mid]).toBeCloseTo(profile.activeW, 6)
    for (const w of down.loadW) expect(w).toBeGreaterThanOrEqual(profile.hibernateW)
  })
})

describe('simulateTraverse', () => {
  it('reaches the end under a constant Sun without touching the survival threshold', () => {
    const plan = planTraverse(line(0, 1000), flat, planOpts)
    // One way, one 2 h sample with a 30 W instrument.
    const r = simulateTraverse(
      plan,
      { startMs: T0, profile, vehicle: rover, samples: 1, sampleH: 2, sampleW: 30 },
      constantSky(1),
    )
    const s = r.summary
    expect(s.reaches).toBe(true)
    expect(s.reason).toBeUndefined()
    expect(s).toMatchObject({ samples: 1, samplesDone: 1, returns: false, returnMs: null })
    expect(s).toMatchObject({ onTime: false, marginH: null, success: false })
    expect(s.workH).toBeCloseTo(2, 9)
    expect(s.outDriveH).toBe(s.driveH)
    expect(s.returnDriveH).toBe(0)
    expect(s.totalH).toBeCloseTo(s.driveH + s.workH, 6)
    expect(s.lengthM).toBe(plan.lengthM)
    expect(s.outLengthM).toBe(plan.outLengthM)
    expect(s.arrivalMs).toBeCloseTo(T0 + plan.driveS * 1000, -1)
    expect(s.driveH).toBeCloseTo(plan.driveS / 3600, 6)
    expect(s.waitH).toBe(0)
    expect(s.minSocPct).toBeGreaterThan(profile.hibernateBelowPct)
    for (const soc of r.socPct) expect(soc).toBeGreaterThanOrEqual(profile.hibernateBelowPct)
    expect(s.hoursInShadow).toBe(0)
    expect(s.dtePct).toBeCloseTo(100, 6)
    // The sample: two more hours after arrival, in steps of 10 min at most.
    expect(traverseDurationMs(r)).toBeCloseTo(plan.driveS * 1000 + 2 * HOUR_MS, -1)
    const first = r.phase.indexOf('sample')
    expect(r.t[first]).toBe(s.arrivalMs)
    expect(r.phase.filter((x) => x === 'sample')).toHaveLength(12)
    expect(r.loadW[first]).toBe(profile.activeW + 30)
    expect(r.phase[r.phase.length - 1]).toBe('done')
    // Energy drawn = ∫ load dt over the samples.
    let wh = 0
    for (let i = 0; i + 1 < r.t.length; i++) wh += (r.loadW[i] * (r.t[i + 1] - r.t[i])) / HOUR_MS
    expect(s.energyWh).toBeCloseTo(wh, 6)
    const expected = (profile.activeW + tractionPowerW(rover, rover.speedMs, 0)) * s.driveH
    expect(s.energyWh).toBeCloseTo(expected + 2 * (profile.activeW + 30), 3)
    // Arrays are aligned.
    for (const a of [r.distM, r.socPct, r.solarW, r.loadW, r.sunFrac, r.earthFrac, r.tempK])
      expect(a.length).toBe(r.t.length)
    for (const a of [r.driving, r.phase, r.sampleIndex, r.pointIndex])
      expect(a.length).toBe(r.t.length)
    expect(r.input).toMatchObject({ samples: 1, sampleH: 2, sampleW: 30, roundTrip: false })
    expect(r.input.deadlineMs).toBeNull()
    expect(r.input.startMs).toBe(T0)
    expect(r.input.lat).toBe(plan.points[0].lat)
  })

  it('drains the battery monotonically once inside the shadow', () => {
    const plan = planTraverse(line(0, 1500), flat, { ...planOpts, illum: illum() })
    // The injected sky says "full Sun" everywhere: the PSR flag must still switch it off.
    const r = simulateTraverse(
      plan,
      { startMs: T0, profile, vehicle: rover, samples: 1, sampleH: 2 },
      constantSky(1),
    )
    expect(r.summary.reaches).toBe(true)
    expect(r.summary.samplesDone).toBe(1)
    expect(r.summary.psrEntryM).toBe(plan.psrEntryM)
    const first = r.distM.findIndex((d) => d >= plan.psrEntryM!)
    expect(first).toBeGreaterThan(0)
    expect(r.solarW[first - 1]).toBeGreaterThan(0)
    for (let i = first; i < r.t.length; i++) {
      expect(r.sunFrac[i]).toBe(0)
      expect(r.solarW[i]).toBe(0)
      if (i > first) expect(r.socPct[i]).toBeLessThan(r.socPct[i - 1])
    }
    expect(r.summary.hoursInShadow).toBeGreaterThan(2)
    expect(r.summary.endSocPct).toBeLessThan(100)
    expect(r.summary.endSocPct).toBeCloseTo(r.summary.minSocPct, 6)
    // The sampling is spent stopped, at the last point.
    const end = r.t.length - 1
    expect(r.driving[end]).toBe(false)
    expect(r.distM[end]).toBeCloseTo(plan.lengthM, 6)
    // Equipment cools towards the PSR floor, never below it.
    expect(r.tempK[end]).toBeLessThan(r.tempK[first - 1])
    expect(r.tempK[end]).toBeGreaterThanOrEqual(40)
  })

  it('gives up with a tiny battery and no Sun', () => {
    const plan = planTraverse(line(0, 1000), flat, planOpts)
    const r = simulateTraverse(
      plan,
      {
        startMs: T0,
        profile: { ...profile, batteryWh: 5 },
        vehicle: rover,
        maxWaitDays: 1,
      },
      constantSky(0, 0),
    )
    expect(r.summary.reaches).toBe(false)
    expect(r.summary.reason).toBe('battery')
    expect(r.summary.arrivalMs).toBeNull()
    expect(r.summary).toMatchObject({ samplesDone: 0, returns: false, success: false, workH: 0 })
    expect(r.summary.outWaitH).toBe(r.summary.waitH)
    expect(r.summary.totalH).toBeCloseTo(r.summary.driveH + r.summary.waitH, 9)
    // A failed trip ends on the phase it failed in, not on 'done'.
    expect(r.phase[r.phase.length - 1]).toBe('wait')
    expect(r.summary.waitH).toBeCloseTo(24, 6)
    expect(r.summary.minSocPct).toBe(0)
    expect(r.summary.dtePct).toBe(0)
    expect(r.distM[r.distM.length - 1]).toBeLessThan(plan.lengthM)
  })

  it('hibernates, recharges and resumes when the Sun allows it', () => {
    const plan = planTraverse(line(0, 1000), flat, planOpts)
    // 30 W of Sun: less than driving (71.6 W), more than survival (18 W).
    const r = simulateTraverse(
      plan,
      { startMs: T0, profile: { ...profile, batteryWh: 40, peakW: 30 }, vehicle: rover },
      constantSky(1),
    )
    expect(r.summary.reaches).toBe(true)
    expect(r.summary.waitH).toBeGreaterThan(0)
    expect(r.summary.outWaitH).toBeGreaterThan(0)
    expect(r.summary.arrivalMs!).toBeGreaterThan(T0 + plan.driveS * 1000)
    expect(r.summary.arrivalMs!).toBeCloseTo(
      T0 + (r.summary.outDriveH + r.summary.outWaitH) * HOUR_MS,
      -1,
    )
    expect(r.summary.driveH).toBeCloseTo(plan.driveS / 3600, 6)
    // While waiting it stays in place on the survival load.
    const w = r.driving.findIndex((d) => !d)
    expect(r.phase[w]).toBe('wait')
    expect(r.loadW[w]).toBe(profile.hibernateW)
    expect(r.distM[w + 1]).toBe(r.distM[w])
    // The sampling spot is lit: there too it stops to recharge and then carries on (3 × 2 h by
    // default), keeping the number of the sample it was on.
    expect(r.summary.samplesDone).toBe(3)
    expect(r.summary.workH).toBeCloseTo(6, 9)
    expect(r.summary.waitH).toBeGreaterThan(r.summary.outWaitH)
    const paused = r.phase.findIndex((x, i) => x === 'wait' && r.sampleIndex[i] > 0)
    expect(paused).toBeGreaterThan(0)
    expect(r.t[paused]).toBeGreaterThan(r.summary.arrivalMs!)
    expect(r.distM[paused]).toBe(plan.lengthM)
    expect(r.summary.totalH).toBeCloseTo(r.summary.driveH + r.summary.waitH + r.summary.workH, 6)
  })

  it('answers no-route for an empty plan and works in place for a single point', () => {
    const none = simulateTraverse(
      planTraverse([], flat, planOpts),
      { startMs: T0, profile, vehicle: rover },
      constantSky(1),
    )
    expect(none.summary).toMatchObject({ reaches: false, reason: 'no-route', success: false })
    expect(none.summary).toMatchObject({ samples: 3, samplesDone: 0, returns: false, totalH: 0 })
    expect(sampleTraverse(none, T0)).toBeNull()
    expect(traverseDurationMs(none)).toBe(0)
    const one = simulateTraverse(
      planTraverse([mapToSouthPolar(1500, 500)], flat, { ...planOpts, illum: illum() }),
      { startMs: T0, profile, vehicle: rover, samples: 1, sampleH: 1 },
      constantSky(1),
    )
    expect(one.summary.reaches).toBe(true)
    expect(one.summary.arrivalMs).toBe(T0)
    expect(one.summary.driveH).toBe(0)
    expect(one.summary.hoursInShadow).toBeCloseTo(1, 6)
    // The test profile has no instrument power of its own: the sample costs the active load.
    expect(one.input.sampleW).toBe(0)
    expect(one.summary.energyWh).toBeCloseTo(profile.activeW, 6)
    // The same point as a round trip: back at once after the work, on time.
    const back = simulateTraverse(
      planTraverse([mapToSouthPolar(1500, 500)], flat, {
        ...planOpts,
        illum: illum(),
        roundTrip: true,
      }),
      { startMs: T0, profile, vehicle: rover, samples: 1, sampleH: 1, deadlineMs: T0 + HOUR_MS },
      constantSky(1),
    )
    expect(back.summary).toMatchObject({ returns: true, returnMs: T0 + HOUR_MS, success: true })
    expect(back.summary.marginH).toBe(0)
  })
})

describe('simulateTraverse, round trip', () => {
  // 1000 m in the Sun, then 500 m of permanent shadow up to the ice.
  const shadowed = planTraverse(line(0, 1500), flat, {
    ...planOpts,
    illum: illum(),
    roundTrip: true,
  })
  const sunny = planTraverse(line(0, 1000), flat, { ...planOpts, roundTrip: true })
  const withDrill = { ...profile, sampleW: 30 }

  it('drives out, takes every sample and comes back to where it left', () => {
    const r = simulateTraverse(
      sunny,
      { startMs: T0, profile: withDrill, vehicle: rover, samples: 2, sampleH: 1.5 },
      constantSky(1),
    )
    const s = r.summary
    expect(s).toMatchObject({ reaches: true, samples: 2, samplesDone: 2, returns: true })
    expect(s).toMatchObject({ onTime: true, marginH: null, success: true })
    expect(s.reason).toBeUndefined()
    // The profile's own instrument power is the default.
    expect(r.input.sampleW).toBe(30)
    expect(r.input.roundTrip).toBe(true)
    expect(s.arrivalMs).toBeCloseTo(T0 + sunny.outDriveS * 1000, -1)
    expect(s.returnMs).toBeCloseTo(T0 + sunny.driveS * 1000 + 3 * HOUR_MS, -1)
    expect(s.outDriveH).toBeCloseTo(sunny.outDriveS / 3600, 6)
    expect(s.returnDriveH).toBeCloseTo(s.outDriveH, 6)
    expect(s.driveH).toBeCloseTo(s.outDriveH + s.returnDriveH, 9)
    expect(s.workH).toBeCloseTo(3, 9)
    expect(s.waitH).toBe(0)
    expect(s.totalH).toBeCloseTo((s.returnMs! - T0) / HOUR_MS, 9)
    expect(traverseDurationMs(r)).toBe(s.returnMs! - T0)
    expect(s.lengthM).toBeCloseTo(2 * s.outLengthM, 6)
    // The series ends on the last point of the plan, which is the first one.
    const end = r.t.length - 1
    expect(r.pointIndex[end]).toBe(sunny.points.length - 1)
    expect(r.distM[end]).toBeCloseTo(2 * sunny.outLengthM, 6)
    expect(r.phase[end]).toBe('done')
    expect(r.driving[end]).toBe(false)
    const z = sampleTraverse(r, s.returnMs!)!
    expect([z.lat, z.lon]).toEqual([sunny.points[0].lat, sunny.points[0].lon])
    // Phases in order, each sample cut at its own end.
    expect([...new Set(r.phase)]).toEqual(['out', 'sample', 'back', 'done'])
    expect(r.t[r.sampleIndex.indexOf(2)]).toBe(s.arrivalMs! + 1.5 * HOUR_MS)
    expect(r.t[r.phase.indexOf('back')]).toBe(s.arrivalMs! + 3 * HOUR_MS)
    for (let i = 0; i < r.t.length; i++) {
      expect(r.driving[i]).toBe(r.phase[i] === 'out' || r.phase[i] === 'back')
      expect(r.sampleIndex[i] > 0).toBe(r.phase[i] === 'sample')
      if (r.phase[i] === 'sample') {
        expect(r.loadW[i]).toBe(profile.activeW + 30)
        expect(r.pointIndex[i]).toBe(sunny.turnIndex)
        expect(r.t[i + 1] - r.t[i]).toBeLessThanOrEqual(10 * 60_000)
      }
    }
    // Energy = ∫ load dt, over the three stages.
    expect(s.energyWh).toBeCloseTo(phaseWh(r, 'out') + phaseWh(r, 'sample') + phaseWh(r, 'back'), 6)
    expect(phaseWh(r, 'sample')).toBeCloseTo(3 * (profile.activeW + 30), 6)
    expect(structuredClone(r)).toEqual(r)
  })

  it('pays for the climb on one leg only when the route has a net height change', () => {
    const csa = ROVER_VEHICLES['csa-rover']
    const opts = { speedMs: csa.speedMs, roverMaxSlopeDeg: 60, roundTrip: true }
    const run = (grids: DemGrid[], x0: number, x1: number) =>
      simulateTraverse(
        planTraverse(line(x0, x1), grids, opts),
        { startMs: T0, profile: { ...profile, batteryWh: 50_000 }, vehicle: csa, samples: 0 },
        constantSky(0),
      )
    const level = run(flat, 200, 1000)
    const up = run(ramp, 200, 1000)
    const down = run(ramp, 1000, 200)
    expect(phaseWh(level, 'back')).toBeCloseTo(phaseWh(level, 'out'), 6)
    // Up the ramp and back down: the way back only costs the active load (brakes, no traction).
    expect(phaseWh(up, 'out')).toBeGreaterThan(1.5 * phaseWh(up, 'back'))
    expect(phaseWh(up, 'back')).toBeCloseTo(profile.activeW * up.summary.returnDriveH, 6)
    // Starting at the top it is the other way round, and the whole trip costs the same.
    expect(phaseWh(down, 'back')).toBeGreaterThan(1.5 * phaseWh(down, 'out'))
    expect(down.summary.energyWh).toBeCloseTo(up.summary.energyWh, 0)
    expect(up.summary.returnDriveH).toBeCloseTo(up.summary.outDriveH, 6)
    // The battery only goes down without Sun: the lowest charge is the one it comes back with.
    expect(up.summary.endSocPct).toBe(up.summary.minSocPct)
    expect(up.summary).toMatchObject({ returns: true, samplesDone: 0, success: true })
  })

  it('fails with "samples" when the work in the shadow drains the battery', () => {
    // Arrives with ~84 %: 100 W of work cross the 20 % threshold just before the fourth hour,
    // in the middle of the third 1.5 h sample.
    const r = simulateTraverse(
      shadowed,
      { startMs: T0, profile: withDrill, vehicle: rover, samples: 4, sampleH: 1.5 },
      constantSky(1),
    )
    const s = r.summary
    expect(s).toMatchObject({ reaches: true, reason: 'samples', samples: 4, samplesDone: 2 })
    expect(s).toMatchObject({ returns: false, returnMs: null, onTime: false, success: false })
    expect(s.marginH).toBeNull()
    expect(s.arrivalMs).toBeCloseTo(T0 + shadowed.outDriveS * 1000, -1)
    expect(s.returnDriveH).toBe(0)
    expect(s.workH).toBeGreaterThan(3)
    expect(s.workH).toBeLessThan(4.5)
    expect(s.totalH).toBeCloseTo(s.outDriveH + s.workH, 6)
    expect(s.waitH).toBe(0)
    expect(s.minSocPct).toBeLessThan(profile.hibernateBelowPct)
    expect(s.minSocPct).toBeGreaterThan(profile.hibernateBelowPct - 3)
    expect(s.endSocPct).toBe(s.minSocPct)
    // It stops at the ice, in the middle of the third sample.
    const end = r.t.length - 1
    expect(r.phase[end]).toBe('sample')
    expect(r.sampleIndex[end]).toBe(3)
    expect(r.pointIndex[end]).toBe(shadowed.turnIndex)
    expect(sampleTraverse(r, r.t[end])).toMatchObject({ sampleIndex: 3, samplesDone: 2 })
    expect(sampleTraverse(r, s.arrivalMs! + 2 * HOUR_MS)).toMatchObject({
      phase: 'sample',
      sampleIndex: 2,
      samplesDone: 1,
    })
    // Two samples fit.
    const two = simulateTraverse(
      shadowed,
      { startMs: T0, profile: withDrill, vehicle: rover, samples: 2, sampleH: 1.5 },
      constantSky(1),
    ).summary
    expect(two.samplesDone).toBe(2)
    expect(two.reason).not.toBe('samples')
  })

  it('fails with "battery" and no return when the charge runs out on the way back', () => {
    // 3 h of work leave ~34 %; the 480 m of shadow on the way back need ~16 %.
    const r = simulateTraverse(
      shadowed,
      { startMs: T0, profile: withDrill, vehicle: rover, samples: 3, sampleH: 1 },
      constantSky(1),
    )
    const s = r.summary
    expect(s).toMatchObject({ reaches: true, reason: 'battery', samplesDone: 3, returns: false })
    expect(s).toMatchObject({ returnMs: null, onTime: false, marginH: null, success: false })
    expect(s.returnDriveH).toBeGreaterThan(0)
    expect(s.returnDriveH).toBeLessThan(s.outDriveH)
    const end = r.t.length - 1
    expect(r.phase[end]).toBe('wait')
    expect(shadowed.points[r.pointIndex[end]]).toMatchObject({ leg: 'back', inPsr: true })
    expect(r.distM[end]).toBeGreaterThan(shadowed.outLengthM)
    expect(r.distM[end]).toBeLessThan(shadowed.lengthM)
    // With a bigger battery it gets out of the shadow and home.
    const big = simulateTraverse(
      shadowed,
      {
        startMs: T0,
        profile: { ...withDrill, batteryWh: 1200 },
        vehicle: rover,
        samples: 3,
        sampleH: 1,
      },
      constantSky(1),
    ).summary
    expect(big).toMatchObject({ returns: true, samplesDone: 3, success: true })
    expect(big.minSocPct).toBeGreaterThan(profile.hibernateBelowPct)
    // Back in the Sun the battery recovers: the end is above the minimum of the trip.
    expect(big.endSocPct).toBeGreaterThan(big.minSocPct)
    expect(big.hoursInShadow).toBeCloseTo(3 + (2 * 500) / rover.speedMs / 3600, 0)
  })

  it('judges the return against the deadline and reports the margin', () => {
    const base = { startMs: T0, profile: withDrill, vehicle: rover, samples: 1, sampleH: 1 }
    const free = simulateTraverse(sunny, base, constantSky(1)).summary
    const tripMs = sunny.driveS * 1000 + HOUR_MS
    expect(free.returnMs).toBeCloseTo(T0 + tripMs, -1)
    // Two hours to spare.
    const early = simulateTraverse(
      sunny,
      { ...base, deadlineMs: free.returnMs! + 2 * HOUR_MS },
      constantSky(1),
    )
    expect(early.summary).toMatchObject({ returns: true, onTime: true, success: true })
    expect(early.summary.reason).toBeUndefined()
    expect(early.summary.marginH).toBeCloseTo(2, 9)
    expect(early.input.deadlineMs).toBe(free.returnMs! + 2 * HOUR_MS)
    // A deadline before it can be back: it still returns, half an hour late.
    const late = simulateTraverse(
      sunny,
      { ...base, deadlineMs: free.returnMs! - 0.5 * HOUR_MS },
      constantSky(1),
    ).summary
    expect(late).toMatchObject({ reaches: true, samplesDone: 1, returns: true })
    expect(late).toMatchObject({ onTime: false, reason: 'late', success: false })
    expect(late.returnMs).toBe(free.returnMs)
    expect(late.marginH).toBeCloseTo(-0.5, 9)
    // Exactly on the deadline counts as on time.
    const exact = simulateTraverse(sunny, { ...base, deadlineMs: free.returnMs! }, constantSky(1))
    expect(exact.summary).toMatchObject({ onTime: true, marginH: 0, success: true })
  })

  it('with no samples and no return it is the old one-way drive, without the dwell', () => {
    const oneWayPlan = planTraverse(line(0, 1500), flat, { ...planOpts, illum: illum() })
    const input = { startMs: T0, profile, vehicle: rover, samples: 0, roundTrip: false }
    const old = simulateTraverse(oneWayPlan, input, constantSky(1))
    // Arrival = departure + driving time; the result ends there.
    expect(old.summary.reaches).toBe(true)
    expect(old.summary.reason).toBeUndefined()
    expect(old.summary.arrivalMs).toBeCloseTo(T0 + oneWayPlan.driveS * 1000, -1)
    expect(traverseDurationMs(old)).toBe(old.summary.arrivalMs! - T0)
    expect(old.summary.driveH).toBeCloseTo(oneWayPlan.driveS / 3600, 6)
    expect(old.summary).toMatchObject({ waitH: 0, workH: 0, samplesDone: 0, returns: false })
    expect(old.summary.energyWh).toBeCloseTo(
      (profile.activeW + tractionPowerW(rover, rover.speedMs, 0)) * old.summary.driveH,
      3,
    )
    expect(old.t).toHaveLength(oneWayPlan.points.length)
    expect(old.phase.slice(0, -1).every((x) => x === 'out')).toBe(true)
    expect(old.phase[old.phase.length - 1]).toBe('done')
    expect(old.distM[old.distM.length - 1]).toBe(oneWayPlan.lengthM)
    // The same on a round-trip plan told not to return: the outbound series, sample by sample.
    const cut = simulateTraverse(shadowed, input, constantSky(1))
    expect(cut.input.roundTrip).toBe(false)
    for (const k of ['t', 'pointIndex', 'distM', 'socPct', 'loadW', 'driving', 'phase'] as const)
      expect(cut[k]).toEqual(old[k])
    expect({ ...cut.summary, lengthM: 0 }).toEqual({ ...old.summary, lengthM: 0 })
    expect(cut.summary.lengthM).toBeCloseTo(2 * old.summary.lengthM, 6)
    // No samples but a return: straight back from the ice.
    const bounce = simulateTraverse(shadowed, { ...input, roundTrip: true }, constantSky(1))
    expect(bounce.summary).toMatchObject({ returns: true, workH: 0, success: true })
    expect(bounce.summary.returnMs).toBeCloseTo(T0 + shadowed.driveS * 1000, -1)
    expect(bounce.phase).not.toContain('sample')
  })
})

describe('sampleTraverse', () => {
  const plan = planTraverse(line(0, 1500), flat, { ...planOpts, illum: illum() })
  const r = simulateTraverse(
    plan,
    { startMs: T0, profile, vehicle: rover, samples: 1, sampleH: 2 },
    constantSky(1),
  )

  it('starts on the first point and ends on the last sample', () => {
    const a = sampleTraverse(r, T0)!
    expect(a.index).toBe(0)
    expect(a.lat).toBe(plan.points[0].lat)
    expect(a.lon).toBe(plan.points[0].lon)
    expect(a.distM).toBe(0)
    expect(a.socPct).toBe(100)
    expect(a.driving).toBe(true)
    expect(a).toMatchObject({ phase: 'out', leg: 'out', sampleIndex: 0, samplesDone: 0 })
    expect(sampleTraverse(r, T0 - HOUR_MS)).toEqual(a)

    const end = r.t.length - 1
    const z = sampleTraverse(r, r.t[end] + 5 * HOUR_MS)!
    const lastPt = plan.points[plan.points.length - 1]
    expect(z.index).toBe(end)
    expect(z.lat).toBe(lastPt.lat)
    expect(z.lon).toBe(lastPt.lon)
    expect(z.socPct).toBe(r.socPct[end])
    expect(z.distM).toBe(r.distM[end])
    expect(z.inPsr).toBe(true)
    expect(z.driving).toBe(false)
    expect(z.speedMs).toBe(0)
    expect(z).toMatchObject({ phase: 'done', leg: 'out', sampleIndex: 0, samplesDone: 1 })
  })

  it('moves forward monotonically and interpolates between samples', () => {
    const dur = traverseDurationMs(r)
    let prev = -1
    for (let k = 0; k <= 400; k++) {
      const s = sampleTraverse(r, T0 + (dur * k) / 400)!
      expect(s.distM).toBeGreaterThanOrEqual(prev)
      prev = s.distM
    }
    // Halfway through the first step: halfway between the first two points.
    const h = sampleTraverse(r, (r.t[0] + r.t[1]) / 2)!
    expect(h.distM).toBeCloseTo(r.distM[1] / 2, 6)
    expect(southPolarToMap(h.lat, h.lon).x).toBeCloseTo(5, 2)
    expect(h.speedMs).toBeCloseTo(rover.speedMs, 6)
    // 500 m from the pole the heading of a straight line turns ~1° every 10 m.
    const [h0, h1] = [plan.points[0].headingDeg, plan.points[1].headingDeg]
    expect(h.headingDeg).toBeGreaterThan(Math.min(h0, h1))
    expect(h.headingDeg).toBeLessThan(Math.max(h0, h1))
  })

  it('round trip: out, each sample in turn, back and done, holding still while it works', () => {
    const trip = planTraverse(line(0, 1000), flat, { ...planOpts, roundTrip: true })
    const rr = simulateTraverse(
      trip,
      { startMs: T0, profile, vehicle: rover, samples: 3, sampleH: 0.5 },
      constantSky(1),
    )
    expect(rr.summary.success).toBe(true)
    const ice = trip.points[trip.turnIndex]
    const dur = traverseDurationMs(rr)
    const phases: string[] = []
    const indices: number[] = []
    let prevDist = -1
    let prevDone = 0
    const N = 2000
    for (let k = 0; k <= N; k++) {
      const s = sampleTraverse(rr, T0 + (dur * k) / N)!
      if (phases[phases.length - 1] !== s.phase) phases.push(s.phase)
      if (s.sampleIndex > 0 && indices[indices.length - 1] !== s.sampleIndex)
        indices.push(s.sampleIndex)
      // The odometer never runs backwards; the samples done only add up.
      expect(s.distM).toBeGreaterThanOrEqual(prevDist)
      prevDist = s.distM
      expect(s.samplesDone).toBeGreaterThanOrEqual(prevDone)
      prevDone = s.samplesDone
      const x = southPolarToMap(s.lat, s.lon).x
      if (s.phase === 'sample') {
        // Stopped exactly on the ice point, on the sample its clock says.
        expect([s.lat, s.lon]).toEqual([ice.lat, ice.lon])
        expect(s.speedMs).toBe(0)
        expect(s.driving).toBe(false)
        expect(s.distM).toBe(trip.outLengthM)
        const sinceArrivalH = (T0 + (dur * k) / N - rr.summary.arrivalMs!) / HOUR_MS
        expect(s.sampleIndex).toBe(Math.min(3, Math.floor(sinceArrivalH / 0.5) + 1))
        expect(s.samplesDone).toBe(s.sampleIndex - 1)
        expect(s.leg).toBe('out')
      } else {
        expect(s.sampleIndex).toBe(0)
        if (s.phase === 'out') {
          expect(s.samplesDone).toBe(0)
          expect(x).toBeCloseTo(s.distM, 1)
        } else {
          expect(s.samplesDone).toBe(3)
          expect(s.leg).toBe('back')
          // On the way back the position runs down the line while the odometer runs up.
          expect(x).toBeCloseTo(trip.lengthM - s.distM, 1)
        }
      }
    }
    expect(phases).toEqual(['out', 'sample', 'back', 'done'])
    expect(indices).toEqual([1, 2, 3])
    // Mid-way back: heading opposite to the one it had at the same place on the way out.
    const backT = rr.t[rr.phase.indexOf('back')]
    const there = sampleTraverse(rr, T0 + 0.5 * trip.outDriveS * 1000)!
    const home = sampleTraverse(rr, backT + 0.5 * trip.outDriveS * 1000)!
    expect(home.lat).toBeCloseTo(there.lat, 6)
    expect(home.driving).toBe(true)
    expect(Math.abs(wrap180(home.headingDeg - there.headingDeg))).toBeGreaterThan(178)
    // The end: parked where it started.
    const z = sampleTraverse(rr, rr.summary.returnMs! + HOUR_MS)!
    expect(z).toMatchObject({ phase: 'done', leg: 'back', driving: false, samplesDone: 3 })
    expect([z.lat, z.lon]).toEqual([trip.points[0].lat, trip.points[0].lon])
    expect(z.distM).toBe(trip.lengthM)
  })
})

describe('traverseSky', () => {
  const plan = planTraverse(line(0, 1000), flat, planOpts)

  it('places anchors every ~200 m, both ends included', () => {
    const a = traverseAnchors(plan, 200)
    expect(a).toEqual([0, 20, 40, 60, 80, 100])
    expect(traverseAnchors(planTraverse([mapToSouthPolar(0, 0)], flat, planOpts))).toEqual([0])
  })

  it('matches a horizon computed at the point itself on an anchor', () => {
    const sky = traverseSky(flat, plan)
    const p = plan.points[0]
    const mask = computeHorizonMask(flat, p.lat, p.lon, { azStepDeg: 2, growth: 0.02 })
    for (let d = 0; d < 28; d += 3) {
      const t = T0 + d * 24 * HOUR_MS
      const got = sky(p.lat, p.lon, p.heightM, t)
      const { sun, earth } = bodyFixedEphemeris(new Date(t))
      const ref = skyFromVectors(sun, earth, makeObserver({ ...p }))
      expect(got.sunAz).toBeCloseTo(ref.sun.az, 6)
      expect(got.sunEl).toBeCloseTo(ref.sun.el, 6)
      expect(got.sunFrac).toBeCloseTo(
        discVisibleFraction(ref.sun.el, maskAt(mask, ref.sun.az), ref.sun.radiusDeg),
        6,
      )
      expect(got.earthFrac).toBeGreaterThanOrEqual(0)
      expect(got.earthFrac).toBeLessThanOrEqual(1)
    }
  })

  it('a link margin can only reduce the Earth fraction; a wall hides the Sun', () => {
    const p = plan.points[50]
    const open = traverseSky(flat, plan)
    const margin = traverseSky(flat, plan, { linkMarginDeg: 5 })
    // A 400 m cliff ring 300 m around the route blocks everything within ~40° of the horizon.
    const pit = [dem((x, y) => (Math.abs(x - 500) < 800 && Math.abs(y - 500) < 300 ? 0 : 400))]
    const walled = traverseSky(pit, planTraverse(line(0, 1000), pit, planOpts))
    for (let d = 0; d < 28; d += 2) {
      const t = T0 + d * 24 * HOUR_MS
      expect(margin(p.lat, p.lon, 0, t).earthFrac).toBeLessThanOrEqual(
        open(p.lat, p.lon, 0, t).earthFrac,
      )
      expect(walled(p.lat, p.lon, 0, t).sunFrac).toBe(0)
    }
  })
})

describe('computeTraverse', () => {
  it('drives the ice-access route end to end, starting at the landing point', () => {
    const grids = [dem(() => 0)]
    const map = illum()
    const landing = mapToSouthPolar(7, 3) // off the pixel centre on purpose
    const ice = computeIceAccess(grids[0], map, landing.lat, landing.lon)
    expect(ice.reachable).toBe(true)
    const t0 = performance.now()
    const r = computeTraverse(
      grids,
      {
        lat: landing.lat,
        lon: landing.lon,
        path: ice.path,
        startMs: T0,
        // Room for the whole trip whatever the Sun does on this date.
        energy: { ...profile, batteryWh: 3000, sampleW: 30 },
        vehicleId: 'rover',
        roverMaxSlopeDeg: 20,
        samples: 1,
        sampleH: 2,
        deadlineMs: T0 + 14 * 24 * HOUR_MS,
      },
      map,
    )
    expect(performance.now() - t0).toBeLessThan(2000)
    expect(r.input.lat).toBe(landing.lat)
    expect(r.input).toMatchObject({ samples: 1, sampleH: 2, sampleW: 30, roundTrip: true })
    // A round trip by default: to the shadow and back to the landing point.
    const pts = r.plan.points
    expect(r.plan.roundTrip).toBe(true)
    expect(pts[0].lat).toBe(landing.lat)
    expect(pts[r.plan.turnIndex].inPsr).toBe(true)
    expect([pts[pts.length - 1].lat, pts[pts.length - 1].lon]).toEqual([landing.lat, landing.lon])
    expect(r.plan.outLengthM).toBeGreaterThan(1000)
    expect(r.plan.outLengthM).toBeLessThan(1100)
    expect(r.plan.lengthM).toBeCloseTo(2 * r.plan.outLengthM, 6)
    expect(r.summary.lengthM).toBe(r.plan.lengthM)
    expect(r.summary.outLengthM).toBe(r.plan.outLengthM)
    expect(r.summary.psrEntryM).not.toBeNull()
    expect(r.summary.arrivalMs).not.toBeNull()
    expect(r.summary).toMatchObject({ reaches: true, samplesDone: 1, returns: true, onTime: true })
    expect(r.summary.returnMs!).toBeGreaterThan(r.summary.arrivalMs! + 2 * HOUR_MS)
    expect(r.summary.marginH!).toBeCloseTo(14 * 24 - r.summary.totalH, 6)
    expect(r.summary.hoursInShadow).toBeGreaterThanOrEqual(2)
    expect(r.phase[r.phase.length - 1]).toBe('done')
    // The result survives the worker boundary untouched.
    expect(structuredClone(r)).toEqual(r)
    // `roundTrip: false` still gives the one-way plan and drive.
    const oneWay = computeTraverse(
      grids,
      {
        lat: landing.lat,
        lon: landing.lon,
        path: ice.path,
        startMs: T0,
        energy: profile,
        vehicleId: 'rover',
        roverMaxSlopeDeg: 20,
        roundTrip: false,
        samples: 0,
      },
      map,
    )
    expect(oneWay.plan.roundTrip).toBe(false)
    expect(oneWay.plan.lengthM).toBe(r.plan.outLengthM)
    expect(oneWay.summary.arrivalMs).toBe(r.summary.arrivalMs)
    expect(oneWay.summary.returns).toBe(false)
    expect(traverseDurationMs(oneWay)).toBe(oneWay.summary.arrivalMs! - T0)
  })
})

describe('stepBattery', () => {
  it('integrates, clamps to the capacity and reports when it runs dry', () => {
    // +50 W for 2 h from 100 Wh.
    expect(stepBattery(100, 80, 30, 2, 1000)).toEqual({
      energyWh: 200,
      inWh: 160,
      outWh: 60,
      emptyAtFraction: null,
      hoursAtZero: 0,
    })
    // Surplus is curtailed at the capacity.
    expect(stepBattery(990, 100, 0, 1, 1000).energyWh).toBe(1000)
    // 10 Wh against a 40 W deficit: empty a quarter of the way into the hour.
    const dry = stepBattery(10, 0, 40, 1, 1000)
    expect(dry.energyWh).toBe(0)
    expect(dry.emptyAtFraction).toBeCloseTo(0.25, 9)
    expect(dry.hoursAtZero).toBeCloseTo(0.75, 9)
    // Already empty: the whole step is dead time.
    expect(stepBattery(0, 0, 40, 1, 1000)).toMatchObject({ emptyAtFraction: 0, hoursAtZero: 1 })
    // Reaching exactly zero with the load covered is not a depletion.
    expect(stepBattery(0, 40, 40, 1, 1000).emptyAtFraction).toBeNull()
  })
})
