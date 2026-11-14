import { describe, expect, it } from 'vitest'
import { type DemGrid, lolaProductMeta, pixelToMap, sampleDemStack } from './dem.ts'
import {
  DESCENT_DURATION_S,
  DESCENT_EYE_M,
  DESCENT_MAX_START_FRACTION,
  DESCENT_PROFILE,
  angleBetweenDeg,
  descentAttitude,
  descentPhase,
  descentTimeMap,
  descentWaypoints,
  groundSampler,
  halfDiagonalFovDeg,
  monotoneCubic,
  panelIllumination,
  rayGround,
  skyDirection,
  sunAheadApproach,
  sunBehindApproach,
} from './descent.ts'
import { southPolarToMap } from './frames.ts'

/** 100 m/px synthetic DEM around the pole, height = f(map x, map y). */
function grid(f: (x: number, y: number) => number, size = 600): DemGrid {
  const meta = lolaProductMeta(size, 100)
  const data = new Int16Array(size * size)
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) {
      const { x, y } = pixelToMap(meta, c, r)
      data[r * size + c] = Math.round(f(x, y) / meta.heightScale)
    }
  return { ...meta, data }
}

const site = { lat: -89.5, lon: 30, heightM: 0 }
const horiz = (p: readonly number[]) => Math.hypot(p[0], p[2])

describe('descentWaypoints', () => {
  const flat = [grid(() => 0)]

  it('starts inside the tile and ends at eye height over the site', () => {
    for (const half of [10_000, 15_000, 5_000]) {
      const w = descentWaypoints(site, flat, half, 120)
      // +0.5 %: at 3.5 km up the point is radially outward, (R + h)·sin(d/R) > d.
      expect(horiz(w[0].p)).toBeLessThanOrEqual(DESCENT_MAX_START_FRACTION * half * 1.005)
      const end = w[w.length - 1].p
      expect(Math.abs(end[0])).toBeLessThan(1e-6)
      expect(end[1]).toBeCloseTo(DESCENT_EYE_M, 3)
      expect(Math.abs(end[2])).toBeLessThan(1e-6)
    }
  })

  it('comes from the requested azimuth', () => {
    // Approaching from the east: the start is at +x (east) and z ≈ 0 (no north component).
    const w = descentWaypoints(site, flat, 10_000, 90)
    expect(w[0].p[0]).toBeGreaterThan(7_000)
    expect(Math.abs(w[0].p[2])).toBeLessThan(100)
  })

  it('never climbs and keeps its clearance over a ridge on the track', () => {
    // 2.5 km high annular ridge 3–5 km around the site: whatever the azimuth, it is on the track.
    const s = { lat: -89.5, lon: 30, heightM: 0 }
    const c = southPolarToMap(s.lat, s.lon)
    const ring = [
      grid((x, y) => {
        const d = Math.hypot(x - c.x, y - c.y)
        return d > 3_000 && d < 5_000 ? 2_500 : 0
      }),
    ]
    const w = descentWaypoints(s, ring, 10_000, 200)
    // Altitude (not scene y, which curvature bends) never increases.
    for (let i = 1; i < w.length; i++) expect(w[i].altM).toBeLessThanOrEqual(w[i - 1].altM)
    // The 4 km point sits on the ridge: at least 2.5 km + 150 m up.
    expect(w[1].altM).toBeGreaterThanOrEqual(2_650 - 1)
    // And every waypoint clears the terrain right below it.
    const g = groundSampler(s, ring)
    for (const p of w)
      expect(p.p[1] - g.groundY(p.p[0], p.p[2])).toBeGreaterThan(DESCENT_EYE_M - 0.5)
  })

  it('works without topography', () => {
    const w = descentWaypoints(site, [], 15_000, 0)
    expect(w.map((x) => x.altM)).toEqual(DESCENT_PROFILE.map((x) => x.altM))
  })
})

describe('time map and phases', () => {
  it('maps the animation time monotonically onto the curve', () => {
    const map = descentTimeMap(descentWaypoints(site, [], 10_000, 0))
    let prev = -1
    for (let t = 0; t <= DESCENT_DURATION_S; t += 0.25) {
      const u = map(t)
      expect(u).toBeGreaterThanOrEqual(prev)
      prev = u
    }
    expect(map(0)).toBe(0)
    expect(map(DESCENT_DURATION_S)).toBe(1)
  })

  it('monotoneCubic interpolates the knots without overshoot', () => {
    const f = monotoneCubic([0, 1, 2, 10], [0, 0.5, 0.6, 1])
    expect(f(1)).toBeCloseTo(0.5)
    for (let x = 0; x <= 10; x += 0.1) {
      expect(f(x)).toBeGreaterThanOrEqual(0)
      expect(f(x)).toBeLessThanOrEqual(1)
    }
  })

  it('names the phases', () => {
    expect(descentPhase(0)).toBe('braking')
    expect(descentPhase(25)).toBe('approach')
    expect(descentPhase(41)).toBe('terminal')
    expect(descentPhase(DESCENT_DURATION_S)).toBe('landed')
  })
})

describe('attitude and sensors', () => {
  it('looks 15–25° down during the approach and ends in the surface pose', () => {
    expect(descentAttitude(3_500, 7_500, 300, { az: 10, el: 2 }).el).toBeCloseTo(-25, 0)
    expect(descentAttitude(500, 4_000, 300, { az: 10, el: 2 }).el).toBeCloseTo(-15, 5)
    const end = descentAttitude(DESCENT_EYE_M, 0, 300, { az: 10, el: 2 })
    expect(end.az).toBeCloseTo(10, 6)
    expect(end.el).toBeCloseTo(2, 6)
  })

  it('approach presets put the Sun behind or ahead', () => {
    expect(sunBehindApproach(350)).toBe(350)
    expect(sunAheadApproach(350)).toBe(170)
  })

  it('field of view and angles', () => {
    expect(halfDiagonalFovDeg(60, 0)).toBeCloseTo(30, 6)
    expect(halfDiagonalFovDeg(60, 16 / 9)).toBeGreaterThan(30)
    expect(angleBetweenDeg(skyDirection(0, 0), skyDirection(90, 0))).toBeCloseTo(90, 6)
    // North at the horizon is -z in the scene frame.
    expect(skyDirection(0, 0)[2]).toBeCloseTo(-1, 9)
  })

  it('finds where a ray hits flat ground', () => {
    const g = groundSampler(site, [grid(() => 0)])
    // From 1000 m up looking 45° down: about 1000 m away horizontally (minus a little curvature).
    const hit = rayGround(g, [0, 1000, 0], [0, -1, -1])!
    expect(hit).not.toBeNull()
    expect(hit.point[1] - g.groundY(hit.point[0], hit.point[2])).toBeLessThan(0.5)
    expect(-hit.point[2]).toBeGreaterThan(990)
    expect(-hit.point[2]).toBeLessThan(1010)
    expect(rayGround(g, [0, 100, 0], [0, 1, 0])).toBeNull()
  })

  it('ground sampler agrees with the DEM', () => {
    const dem = [grid((x) => x * 0.05)]
    const g = groundSampler(site, dem)
    const { lat, lon } = g.latLon(500, -300)
    expect(g.heightAt(lat, lon)).toBeCloseTo(sampleDemStack(dem, lat, lon), 6)
  })

  it('panel illumination', () => {
    const p = panelIllumination(2, 1)
    expect(p.sidePct).toBeGreaterThan(99)
    expect(p.topPct).toBeCloseTo(3.49, 1)
    expect(panelIllumination(2, 0)).toEqual({ topPct: 0, sidePct: 0 })
  })
})
