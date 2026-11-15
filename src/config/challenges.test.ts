import { describe, expect, it, vi } from 'vitest'
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
    solved: {
      ...base,
      siteId: 'mons-mouton',
      lat: -84.79,
      view: 'micro',
      ice: { reachable: true, routeM: 868, insidePsr: false },
      rover: { reaches: true, minSocPct: 74 },
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
    rover: { setRover: vi.fn() },
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

  it('the landing challenge starts with the heavy lander and the ice one with the micro-rover', () => {
    const a = setupSpy()
    findChallenge('landing')!.setup(a)
    expect(a.descent.setVehicle).toHaveBeenCalledWith('heavy')
    expect(a.descent.setMode).toHaveBeenCalledWith('physics')
    const b = setupSpy()
    findChallenge('ice')!.setup(b)
    expect(b.rover.setRover).toHaveBeenCalledWith('rover')
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

  it('ice: a real traverse from outside the shadow, battery never under 30 %', () => {
    const s = CASES.ice.solved
    const route = goal('ice', 'route')
    const battery = goal('ice', 'battery')
    // Landing inside the PSR (Shackleton floor) is not a traverse.
    const inside = { ...s, ice: { reachable: true, routeM: 0, insidePsr: true } }
    expect(route(inside)).toBe(false)
    expect(battery(inside)).toBe(false)
    expect(battery({ ...s, rover: { reaches: true, minSocPct: 30 } })).toBe(true)
    // de Gerlache rim on 2027-03-15.
    expect(battery({ ...s, rover: { reaches: true, minSocPct: 20 } })).toBe(false)
    expect(battery({ ...s, rover: { reaches: false, minSocPct: 45 } })).toBe(false)
    expect(battery({ ...s, rover: undefined })).toBe(false)
  })

  it('shows the current value of the figure a goal looks at', () => {
    const sun = findChallenge('light')!.goals[0]
    expect(sun.current?.(CASES.light.solved)).toBe('100 %')
    expect(sun.current?.({ ...base })).toBeUndefined()
    expect(findChallenge('night')!.goals[0].current?.(CASES.night.start)).toBe('312 h')
  })
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
