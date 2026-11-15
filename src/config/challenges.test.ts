import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { DemGrid, DemMeta } from '../astro/dem.ts'
import type { EphemTableMeta } from '../astro/ephemTable.ts'
import { setEphemerisTable } from '../astro/ephemeris.ts'
import { DEFAULT_LIMITS } from '../astro/hardware.ts'
import { computeIceAccess } from '../astro/iceAccess.ts'
import type { IllumGrid, IllumMeta } from '../astro/illumination.ts'
import { type RoverId, SAMPLING_DEFAULTS, computeTraverse } from '../astro/traverse.ts'
import { hasKey } from '../i18n/index.ts'
import {
  type ChallengeSetupCtx,
  type ChallengeState,
  CHALLENGES,
  CHALLENGE_LIMITS,
  challengeScore,
  findChallenge,
  goalsMet,
  nextChallenge,
  totalScore,
} from './challenges.ts'
import { energyPreset } from './energyProfiles.ts'
import { SITE_SEEDS } from './sites.ts'

const base: ChallengeState = {
  siteId: 'shackleton-floor',
  lat: -89.7,
  lon: 0,
  startMs: Date.UTC(2027, 2, 1),
  missionDays: 14,
  view: 'macro',
  scenarios: 1,
  compareOpen: false,
  descent: { landed: false, physics: false, ok: false, vehicleId: 'clps' },
}
const metrics = (m: Partial<NonNullable<ChallengeState['metrics']>>) => ({
  sunlitPct: 0,
  energyPct: 0,
  dtePct: 0,
  longestDarkH: 336,
  longestLightH: 0,
  score: 0,
  ...m,
})

/** Synthetic states with the real figures of each starting point and of one known solution. */
const CASES: Record<string, { start: ChallengeState; solved: ChallengeState }> = {
  light: {
    start: { ...base, metrics: metrics({}), verdict: 'bad' },
    // Shackleton rim, 2027-03-01.
    solved: {
      ...base,
      siteId: 'shackleton-rim',
      lat: -89.44,
      metrics: metrics({ sunlitPct: 100, dtePct: 54, longestDarkH: 1 }),
    },
  },
  earth: {
    start: {
      ...base,
      siteId: 'shackleton-rim',
      lat: -89.44,
      view: 'micro',
      metrics: metrics({ sunlitPct: 61, dtePct: 0, longestDarkH: 94 }),
      verdict: 'bad',
    },
    // Same site, landing ten days later.
    solved: {
      ...base,
      siteId: 'shackleton-rim',
      lat: -89.44,
      view: 'micro',
      startMs: Date.UTC(2027, 2, 29),
      metrics: metrics({ sunlitPct: 94, dtePct: 60, longestDarkH: 18 }),
      verdict: 'good',
    },
  },
  night: {
    start: {
      ...base,
      siteId: 'malapert-massif',
      lat: -85.99,
      missionDays: 30,
      metrics: metrics({ sunlitPct: 57, dtePct: 56, longestDarkH: 312 }),
      verdict: 'bad',
    },
    // Connecting ridge, same month.
    solved: {
      ...base,
      siteId: 'connecting-ridge',
      lat: -89.01,
      missionDays: 30,
      metrics: metrics({ sunlitPct: 60, dtePct: 36, longestDarkH: 114 }),
      verdict: 'warn',
    },
  },
  landing: {
    start: {
      ...base,
      siteId: 'nobile-rim',
      lat: -85.2,
      slopeP90Deg: 16.62,
      descent: { landed: false, physics: false, ok: false, vehicleId: 'heavy' },
    },
    solved: {
      ...base,
      siteId: 'mons-mouton',
      lat: -84.79,
      view: 'landing',
      slopeP90Deg: 4.99,
      descent: {
        landed: true,
        physics: true,
        ok: true,
        propMarginPct: 25.4,
        dvMs: 1900,
        vehicleId: 'clps',
      },
    },
  },
  ice: {
    start: {
      ...base,
      siteId: 'change-7',
      lat: -88.8,
      view: 'micro',
      ice: { reachable: false, routeM: null, insidePsr: false },
    },
    // Mons Mouton with the utility rover, 3 samples × 2 h, landing 2027-03-15.
    solved: {
      ...base,
      siteId: 'mons-mouton',
      lat: -84.79,
      view: 'micro',
      ice: { reachable: true, routeM: 868, insidePsr: false },
      rover: {
        reaches: true,
        samples: 3,
        samplesDone: 3,
        returns: true,
        onTime: true,
        minSocPct: 57.1,
      },
    },
  },
}

const setupSpy = () => {
  const ctx = {
    mission: {
      setScenarios: vi.fn(() => true),
      setView: vi.fn(),
      setCompareOpen: vi.fn(),
      setOffset: vi.fn(),
    },
    descent: { setMode: vi.fn(), setVehicle: vi.fn() },
    rover: { setRover: vi.fn(), setSamples: vi.fn(), setSampleH: vi.fn() },
  }
  return ctx satisfies ChallengeSetupCtx
}

describe('challenge definitions', () => {
  it('there are five, with unique ids and at least one goal each', () => {
    expect(CHALLENGES).toHaveLength(5)
    expect(new Set(CHALLENGES.map((c) => c.id)).size).toBe(5)
    for (const c of CHALLENGES) {
      expect(c.goals.length).toBeGreaterThan(0)
      expect(new Set(c.goals.map((g) => g.id)).size).toBe(c.goals.length)
      expect(CASES[c.id]).toBeDefined()
    }
  })

  it('every text key exists in the dictionary', () => {
    for (const c of CHALLENGES) {
      const keys = [
        c.titleKey,
        c.briefKey,
        c.whyKey,
        ...c.goals.flatMap((g) => [g.labelKey, ...(g.hintKey ? [g.hintKey] : [])]),
      ]
      for (const k of keys) expect(hasKey(k), k).toBe(true)
    }
  })

  it('every goal is unmet in the starting state and met in a solved one', () => {
    for (const c of CHALLENGES) {
      const { start, solved } = CASES[c.id]
      for (const g of c.goals) {
        expect(g.check(start), `${c.id}.${g.id} at start`).toBe(false)
        expect(g.check(solved), `${c.id}.${g.id} solved`).toBe(true)
      }
      expect(goalsMet(c, solved).every(Boolean)).toBe(true)
    }
  })

  it('no goal is met while the figures are still being computed', () => {
    for (const c of CHALLENGES) {
      const blank: ChallengeState = { ...base, siteId: 'x', lat: undefined, lon: undefined }
      expect(goalsMet(c, blank).some(Boolean), c.id).toBe(false)
    }
  })

  it('setup starts from a curated site with one clean scenario', () => {
    for (const c of CHALLENGES) {
      const ctx = setupSpy()
      c.setup(ctx)
      expect(ctx.mission.setScenarios).toHaveBeenCalledTimes(1)
      const [list] = ctx.mission.setScenarios.mock.calls[0] as unknown as [
        { siteId: string; startMs: number; missionDays: number }[],
      ]
      expect(list).toHaveLength(1)
      expect(
        SITE_SEEDS.some((s) => s.id === list[0].siteId),
        c.id,
      ).toBe(true)
      expect(Number.isFinite(list[0].startMs)).toBe(true)
      expect(ctx.mission.setCompareOpen).toHaveBeenCalledWith(false)
      expect(ctx.mission.setView).toHaveBeenCalledTimes(1)
    }
  })

  it('the landing challenge starts with the heavy lander and the ice one with the micro-rover and the full workload', () => {
    const a = setupSpy()
    findChallenge('landing')!.setup(a)
    expect(a.descent.setVehicle).toHaveBeenCalledWith('heavy')
    expect(a.descent.setMode).toHaveBeenCalledWith('physics')
    const b = setupSpy()
    findChallenge('ice')!.setup(b)
    expect(b.rover.setRover).toHaveBeenCalledWith('rover')
    expect(b.rover.setSamples).toHaveBeenCalledWith(3)
    expect(b.rover.setSampleH).toHaveBeenCalledWith(2)
  })
})

describe('goal thresholds', () => {
  const goal = (cid: string, gid: string) =>
    findChallenge(cid)!.goals.find((g) => g.id === gid)!.check

  it('light: 80 % Sun, at the pole, without shortening the mission', () => {
    const s = CASES.light.solved
    const sun = goal('light', 'sun')
    expect(sun({ ...s, metrics: metrics({ sunlitPct: CHALLENGE_LIMITS.sunlitPct }) })).toBe(true)
    expect(sun({ ...s, metrics: metrics({ sunlitPct: 79.9 }) })).toBe(false)
    // Apollo 11 in daylight does not count, nor does a 3-day mission.
    expect(sun({ ...s, lat: 0.67 })).toBe(false)
    expect(sun({ ...s, missionDays: 3 })).toBe(false)
  })

  it('earth: DTE at least half of the time', () => {
    const s = CASES.earth.solved
    const dte = goal('earth', 'dte')
    expect(dte({ ...s, metrics: metrics({ dtePct: 50 }) })).toBe(true)
    expect(dte({ ...s, metrics: metrics({ dtePct: 49 }) })).toBe(false)
    expect(dte({ ...s, metrics: undefined })).toBe(false)
  })

  it('night: 120 h and a verdict other than no-go, over 30 days', () => {
    const s = CASES.night.solved
    const dark = goal('night', 'dark')
    const verdict = goal('night', 'verdict')
    expect(dark({ ...s, metrics: metrics({ longestDarkH: 120 }) })).toBe(true)
    // Shackleton rim that month: 125 h, just over.
    expect(dark({ ...s, metrics: metrics({ longestDarkH: 125 }) })).toBe(false)
    expect(dark({ ...s, missionDays: 14 })).toBe(false)
    expect(verdict({ ...s, verdict: 'good' })).toBe(true)
    expect(verdict({ ...s, verdict: 'bad' })).toBe(false)
    expect(verdict({ ...s, verdict: undefined })).toBe(false)
  })

  it('landing: safe slope, 20 % of propellant and an actual physical touchdown', () => {
    const s = CASES.landing.solved
    const d = s.descent
    expect(goal('landing', 'slope')({ ...s, slopeP90Deg: 15 })).toBe(false)
    expect(goal('landing', 'slope')({ ...s, slopeP90Deg: undefined })).toBe(false)
    const margin = goal('landing', 'margin')
    expect(margin({ ...s, descent: { ...d, propMarginPct: 20 } })).toBe(true)
    // The heavy lander.
    expect(margin({ ...s, descent: { ...d, propMarginPct: 18 } })).toBe(false)
    expect(margin({ ...s, view: 'micro' })).toBe(false)
    const touchdown = goal('landing', 'touchdown')
    expect(touchdown({ ...s, descent: { ...d, landed: false } })).toBe(false)
    expect(touchdown({ ...s, descent: { ...d, physics: false } })).toBe(false)
    expect(touchdown({ ...s, descent: { ...d, ok: false } })).toBe(false)
  })

  it('ice: a real round trip from outside the shadow, battery never under 30 %', () => {
    const s = CASES.ice.solved
    const r = s.rover!
    const route = goal('ice', 'route')
    const samples = goal('ice', 'samples')
    const back = goal('ice', 'return')
    const battery = goal('ice', 'battery')
    // Landing inside the PSR (Shackleton floor) is not a traverse.
    const inside = { ...s, ice: { reachable: true, routeM: 0, insidePsr: true } }
    for (const check of [route, samples, back, battery]) expect(check(inside)).toBe(false)
    expect(battery({ ...s, rover: { ...r, minSocPct: 30 } })).toBe(true)
    // The micro-rover from Mons Mouton with 2 samples × 2 h: back in time, but with 28 %.
    const tight = { ...s, rover: { ...r, samples: 2, samplesDone: 2, minSocPct: 28.5 } }
    expect([samples(tight), back(tight), battery(tight)]).toEqual([true, true, false])
    // The micro-rover from the Shackleton rim with 3 × 2 h: one sample and it stays there.
    const stuck = {
      ...s,
      rover: { ...r, samplesDone: 1, returns: false, onTime: false, minSocPct: 20 },
    }
    expect(route(stuck)).toBe(true)
    expect([samples(stuck), back(stuck), battery(stuck)]).toEqual([false, false, false])
    // All the samples, but the battery runs out on the way back; or it is back too late.
    const stranded = { ...s, rover: { ...r, returns: false, onTime: false, minSocPct: 45 } }
    expect([samples(stranded), back(stranded), battery(stranded)]).toEqual([true, false, false])
    const late = { ...s, rover: { ...r, onTime: false } }
    expect([samples(late), back(late), battery(late)]).toEqual([true, false, false])
    // It never arrived: the battery it still has does not count.
    const short = { ...s, rover: { ...r, reaches: false, samplesDone: 0, returns: false } }
    expect([samples(short), back(short), battery(short)]).toEqual([false, false, false])
    expect(battery({ ...s, rover: undefined })).toBe(false)
  })

  it('shows the current value of the figure a goal looks at', () => {
    const sun = findChallenge('light')!.goals[0]
    expect(sun.current?.(CASES.light.solved)).toBe('100 %')
    expect(sun.current?.({ ...base })).toBeUndefined()
    expect(findChallenge('night')!.goals[0].current?.(CASES.night.start)).toBe('312 h')
    const ice = findChallenge('ice')!.goals
    expect(ice.map((g) => g.current?.(CASES.ice.solved))).toEqual([
      '868 m',
      '3 / 3',
      undefined,
      '57 %',
    ])
    expect(ice.map((g) => g.current?.(CASES.ice.start))).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ])
  })
})

/*
 * The ice challenge against the published data: the real route and the real round trip of each
 * rover, as the app computes them (landing 2027-03-15, 14 days, default hardware limits).
 */
describe('ice challenge on the real terrain', () => {
  const START = Date.UTC(2027, 2, 15)
  const DAY = 86_400_000
  const bin = (f: string) => {
    const b = readFileSync(`public/data/${f}`)
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
  }
  const json = <T>(f: string) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8')) as T
  let coarse: DemGrid

  beforeAll(() => {
    const em = json<EphemTableMeta>('ephem/de441.json')
    setEphemerisTable({ ...em, data: new Float32Array(bin('ephem/de441.bin')) })
    coarse = {
      ...json<DemMeta>('dem/south_480m.json'),
      data: new Int16Array(bin('dem/south_480m.bin')),
    }
  })
  afterAll(() => setEphemerisTable(null))

  /** The state the app would show at `siteId` with that rover and workload. */
  function real(siteId: string, roverId: RoverId, samples: number, sampleH: number) {
    const d = json<{
      lat: number
      lon: number
      terrain: { file: string; meta: DemMeta }
      illum: { file: string; meta: IllumMeta }
    }>(`sites/${siteId}.json`)
    const tile: DemGrid = { ...d.terrain.meta, data: new Int16Array(bin(d.terrain.file)) }
    const illum: IllumGrid = { ...d.illum.meta, data: new Uint8Array(bin(d.illum.file)) }
    const route = computeIceAccess(tile, illum, d.lat, d.lon, {
      roverMaxSlopeDeg: DEFAULT_LIMITS.roverMaxSlopeDeg,
    })
    const state: ChallengeState = {
      ...base,
      siteId,
      lat: d.lat,
      lon: d.lon,
      startMs: START,
      view: 'micro',
      ice: { reachable: route.reachable, routeM: route.routeM, insidePsr: route.insidePsr },
    }
    if (!route.reachable || !route.path.length) return state
    const { summary } = computeTraverse(
      [tile, coarse],
      {
        lat: d.lat,
        lon: d.lon,
        path: route.path,
        startMs: START,
        energy: energyPreset(roverId)!.profile,
        vehicleId: roverId,
        roverMaxSlopeDeg: DEFAULT_LIMITS.roverMaxSlopeDeg,
        linkMarginDeg: 3,
        requireDsn: false,
        samples,
        sampleH,
        deadlineMs: START + CHALLENGE_LIMITS.shortMissionDays * DAY,
      },
      illum,
    )
    state.rover = {
      reaches: summary.reaches,
      samples: summary.samples,
      samplesDone: summary.samplesDone,
      returns: summary.returns,
      onTime: summary.onTime,
      minSocPct: summary.minSocPct,
    }
    return state
  }
  const ice = findChallenge('ice')!
  const { samples: N, sampleH: H } = SAMPLING_DEFAULTS

  it('starts unsolved: no route from Chang’e-7, and the micro-rover cannot do 3 × 2 h', () => {
    const start = real('change-7', 'rover', N, H)
    expect(start.ice?.reachable).toBe(false)
    expect(goalsMet(ice, start)).toEqual([false, false, false, false])
    // Moving the site is not enough: the starting rover and workload fail from the best ones.
    for (const siteId of ['mons-mouton', 'connecting-ridge']) {
      const s = real(siteId, 'rover', N, H)
      expect(s.rover!.samplesDone, siteId).toBeLessThan(N)
      expect(goalsMet(ice, s), siteId).toEqual([true, false, false, false])
    }
  }, 60_000)

  it('is solved with the utility rover, or with the micro-rover and less work', () => {
    const utility = real('mons-mouton', 'csa-rover', N, H)
    expect(utility.ice!.routeM).toBeCloseTo(868, 0)
    expect(utility.rover!.minSocPct).toBeCloseTo(57.1, 0)
    expect(goalsMet(ice, utility)).toEqual([true, true, true, true])
    // The hardest candidate for the utility rover still clears the 30 %.
    const far = real('de-gerlache-rim', 'csa-rover', N, H)
    expect(far.rover!.minSocPct).toBeCloseTo(37, 0)
    expect(goalsMet(ice, far)).toEqual([true, true, true, true])
    const micro = real('mons-mouton', 'rover', 3, 1)
    expect(micro.rover!.minSocPct).toBeCloseTo(45, 0)
    expect(goalsMet(ice, micro)).toEqual([true, true, true, true])
  }, 60_000)

  it('the battery goal still bites: the micro-rover with 2 × 2 h comes back under 30 %', () => {
    const tight = real('mons-mouton', 'rover', 2, 2)
    expect(tight.rover!.minSocPct).toBeCloseTo(28.5, 0)
    expect(goalsMet(ice, tight)).toEqual([true, true, true, false])
  }, 60_000)
})

describe('score', () => {
  it('100 unaided, 15 less per hint, never under 40', () => {
    expect(challengeScore(0)).toBe(100)
    expect(challengeScore(1)).toBe(85)
    expect(challengeScore(3)).toBe(55)
    expect(challengeScore(9)).toBe(40)
    expect(challengeScore(-2)).toBe(100)
  })

  it('adds the best scores of the known challenges', () => {
    expect(totalScore({})).toBe(0)
    expect(totalScore({ light: 100, ice: 85, unknown: 100 })).toBe(185)
  })

  it('chains the challenges in order', () => {
    expect(nextChallenge('light')?.id).toBe('earth')
    expect(nextChallenge('ice')).toBeUndefined()
    expect(findChallenge(null)).toBeUndefined()
  })
})
