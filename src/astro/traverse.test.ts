import { describe, expect, it } from 'vitest'
import { DEG, HOUR_MS } from './constants.ts'
import { type DemGrid, lolaProductMeta, pixelToMap } from './dem.ts'
import { type EnergyProfile, stepBattery } from './energy.ts'
import { bodyFixedEphemeris, makeObserver, skyFromVectors } from './ephemeris.ts'
import { mapToSouthPolar, southPolarToMap } from './frames.ts'
import { discVisibleFraction, maskAt } from './horizon.ts'
import { computeHorizonMask } from './horizonFromDem.ts'
import { computeIceAccess } from './iceAccess.ts'
import { type IllumGrid, encodeIllum } from './illumination.ts'
import {
  ROVER_VEHICLES,
  type TraverseSkyFn,
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
    const r = simulateTraverse(plan, { startMs: T0, profile, vehicle: rover }, constantSky(1))
    const s = r.summary
    expect(s.reaches).toBe(true)
    expect(s.reason).toBeUndefined()
    expect(s.arrivalMs).toBeCloseTo(T0 + plan.driveS * 1000, -1)
    expect(s.driveH).toBeCloseTo(plan.driveS / 3600, 6)
    expect(s.waitH).toBe(0)
    expect(s.minSocPct).toBeGreaterThan(profile.hibernateBelowPct)
    for (const soc of r.socPct) expect(soc).toBeGreaterThanOrEqual(profile.hibernateBelowPct)
    expect(s.hoursInShadow).toBe(0)
    expect(s.dtePct).toBeCloseTo(100, 6)
    // Dwell: two more hours after arrival.
    expect(traverseDurationMs(r)).toBeCloseTo(plan.driveS * 1000 + 2 * HOUR_MS, -1)
    // Energy drawn = ∫ load dt over the samples.
    let wh = 0
    for (let i = 0; i + 1 < r.t.length; i++) wh += (r.loadW[i] * (r.t[i + 1] - r.t[i])) / HOUR_MS
    expect(s.energyWh).toBeCloseTo(wh, 6)
    const expected = (profile.activeW + tractionPowerW(rover, rover.speedMs, 0)) * s.driveH
    expect(s.energyWh).toBeCloseTo(expected + 2 * profile.activeW, 3)
    // Arrays are aligned.
    for (const a of [r.distM, r.socPct, r.solarW, r.loadW, r.sunFrac, r.earthFrac, r.tempK])
      expect(a.length).toBe(r.t.length)
    expect(r.driving.length).toBe(r.t.length)
    expect(r.input.startMs).toBe(T0)
    expect(r.input.lat).toBe(plan.points[0].lat)
  })

  it('drains the battery monotonically once inside the shadow', () => {
    const plan = planTraverse(line(0, 1500), flat, { ...planOpts, illum: illum() })
    // The injected sky says "full Sun" everywhere: the PSR flag must still switch it off.
    const r = simulateTraverse(plan, { startMs: T0, profile, vehicle: rover }, constantSky(1))
    expect(r.summary.reaches).toBe(true)
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
    // The dwell is spent stopped, at the last point.
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
    expect(r.summary.arrivalMs!).toBeGreaterThan(T0 + plan.driveS * 1000)
    expect(r.summary.driveH).toBeCloseTo(plan.driveS / 3600, 6)
    // While waiting it stays in place on the survival load.
    const w = r.driving.findIndex((d) => !d)
    expect(r.loadW[w]).toBe(profile.hibernateW)
    expect(r.distM[w + 1]).toBe(r.distM[w])
  })

  it('answers no-route for an empty plan and dwells in place for a single point', () => {
    const none = simulateTraverse(
      planTraverse([], flat, planOpts),
      { startMs: T0, profile, vehicle: rover },
      constantSky(1),
    )
    expect(none.summary).toMatchObject({ reaches: false, reason: 'no-route' })
    expect(sampleTraverse(none, T0)).toBeNull()
    expect(traverseDurationMs(none)).toBe(0)
    const one = simulateTraverse(
      planTraverse([mapToSouthPolar(1500, 500)], flat, { ...planOpts, illum: illum() }),
      { startMs: T0, profile, vehicle: rover, dwellAtIceH: 1 },
      constantSky(1),
    )
    expect(one.summary.reaches).toBe(true)
    expect(one.summary.arrivalMs).toBe(T0)
    expect(one.summary.driveH).toBe(0)
    expect(one.summary.hoursInShadow).toBeCloseTo(1, 6)
    expect(one.summary.energyWh).toBeCloseTo(profile.activeW, 6)
  })
})

describe('sampleTraverse', () => {
  const plan = planTraverse(line(0, 1500), flat, { ...planOpts, illum: illum() })
  const r = simulateTraverse(plan, { startMs: T0, profile, vehicle: rover }, constantSky(1))

  it('starts on the first point and ends on the last sample', () => {
    const a = sampleTraverse(r, T0)!
    expect(a.index).toBe(0)
    expect(a.lat).toBe(plan.points[0].lat)
    expect(a.lon).toBe(plan.points[0].lon)
    expect(a.distM).toBe(0)
    expect(a.socPct).toBe(100)
    expect(a.driving).toBe(true)
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
        energy: profile,
        vehicleId: 'rover',
        roverMaxSlopeDeg: 20,
      },
      map,
    )
    expect(performance.now() - t0).toBeLessThan(2000)
    expect(r.input.lat).toBe(landing.lat)
    expect(r.plan.points[0].lat).toBe(landing.lat)
    expect(r.plan.points[r.plan.points.length - 1].inPsr).toBe(true)
    expect(r.plan.lengthM).toBeGreaterThan(1000)
    expect(r.plan.lengthM).toBeLessThan(1100)
    expect(r.summary.psrEntryM).not.toBeNull()
    expect(r.summary.arrivalMs).not.toBeNull()
    expect(r.summary.hoursInShadow).toBeGreaterThanOrEqual(2)
    // The result survives the worker boundary untouched.
    expect(structuredClone(r)).toEqual(r)
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
