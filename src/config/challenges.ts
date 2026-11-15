import { DEFAULT_LIMITS, type Verdict } from '../astro/hardware.ts'
import type { ScenarioMetrics } from '../astro/metrics.ts'
import { SLOPE_CAUTION_DEG } from '../astro/slope.ts'
import { type RoverId, SAMPLING_DEFAULTS } from '../astro/traverse.ts'
import type { MsgKey } from '../i18n/index.ts'
import type { PresetScenario } from './presets.ts'
import { DEFAULT_ENERGY_ID } from './energyProfiles.ts'

/**
 * "Retos": five short guided missions on top of what the app already computes. Each one puts
 * the app in a starting state where its goals are NOT met, and the user solves it with the
 * normal controls (site, date, view, lander, rover). Nothing here computes astronomy: the goal
 * checks are pure functions of `ChallengeState`, a snapshot assembled from the stores and hooks
 * (see hooks/useChallengeState.ts).
 */
export type ChallengeView = 'macro' | 'micro' | 'landing'

export interface ChallengeState {
  siteId: string
  /** Undefined until the site catalogue is loaded. */
  lat?: number
  lon?: number
  startMs: number
  missionDays: number
  view: ChallengeView
  /** Number of scenarios being compared, and whether Compare is on screen. */
  scenarios: number
  compareOpen: boolean
  /** Window metrics of the active scenario; undefined while they are being computed. */
  metrics?: Pick<
    ScenarioMetrics,
    'sunlitPct' | 'energyPct' | 'dtePct' | 'longestDarkH' | 'longestLightH' | 'score'
  >
  /** Go / marginal / no-go against the hardware limits (same rule as the metrics panel). */
  verdict?: Verdict
  /** 90th-percentile slope around the site, deg (the figure the verdict uses). */
  slopeP90Deg?: number
  /** Rover access to the nearest permanently shadowed ground. */
  ice?: { reachable: boolean; routeM: number | null; insidePsr: boolean }
  /**
   * Rover round trip to the ice, once simulated: drive there, take the samples, drive back.
   * `minSocPct` is the lowest battery of the whole trip (or of what it managed to do).
   */
  rover?: {
    /** It arrives at the ice. */
    reaches: boolean
    /** Samples asked for and samples it finished. */
    samples: number
    samplesDone: number
    /** It is back at the lander, and before the surface mission ends. */
    returns: boolean
    onTime: boolean
    minSocPct: number
  }
  descent: {
    /** The descent on screen reached the ground. */
    landed: boolean
    /** It was flown by the physical model (not the quick illustrative fly-down). */
    physics: boolean
    /** The guidance closed: soft touchdown with propellant left. */
    ok: boolean
    propMarginPct?: number
    dvMs?: number
    vehicleId: string
  }
}

/** What a challenge may touch to set its starting state (store actions, injected). */
export interface ChallengeSetupCtx {
  mission: {
    setScenarios: (list: readonly PresetScenario[], activeIndex?: number) => boolean
    setView: (view: ChallengeView) => void
    setCompareOpen: (open: boolean) => void
    setOffset: (hours: number) => void
  }
  descent: { setMode: (mode: 'physics' | 'kinematic') => void; setVehicle: (id: string) => void }
  rover: {
    setRover: (id: RoverId) => void
    setSamples: (samples: number) => void
    setSampleH: (hours: number) => void
  }
}

export interface Goal {
  id: string
  labelKey: MsgKey
  hintKey?: MsgKey
  check: (s: ChallengeState) => boolean
  /** Current value of the figure the goal looks at, for the live checklist ("now: 57 %"). */
  current?: (s: ChallengeState) => string | undefined
}

export interface Challenge {
  id: string
  titleKey: MsgKey
  briefKey: MsgKey
  /** What the challenge teaches; shown on success. */
  whyKey: MsgKey
  /** The traverse to the ice is only simulated for the challenges that look at it. */
  needsRover?: boolean
  setup: (ctx: ChallengeSetupCtx) => void
  goals: Goal[]
}

/** Thresholds of the goals (also quoted in the texts: keep the dictionaries in sync). */
export const CHALLENGE_LIMITS = {
  /** South of this latitude a site counts as "at the south pole". */
  polarLatDeg: -80,
  sunlitPct: 80,
  dtePct: 50,
  nightH: 120,
  longMissionDays: 30,
  shortMissionDays: 14,
  propMarginPct: 20,
  slopeDeg: SLOPE_CAUTION_DEG,
  roverSocPct: 30,
} as const

const L = CHALLENGE_LIMITS

const isPolar = (s: ChallengeState) => s.lat !== undefined && s.lat <= L.polarLatDeg
const pct = (v: number | undefined) => (v === undefined ? undefined : `${Math.round(v)} %`)
const hours = (v: number | undefined) => (v === undefined ? undefined : `${Math.round(v)} h`)

/** One clean scenario (default hardware, energy and link margin), so every run starts alike. */
function begin(
  ctx: ChallengeSetupCtx,
  o: { siteId: string; startMs: number; missionDays: number; view: ChallengeView },
) {
  ctx.mission.setScenarios([
    {
      siteId: o.siteId,
      startMs: o.startMs,
      missionDays: o.missionDays,
      linkMarginDeg: 3,
      requireDsn: false,
      energyId: DEFAULT_ENERGY_ID,
      hardwareLimits: { ...DEFAULT_LIMITS },
      scienceWeight: 0,
    },
  ])
  ctx.mission.setCompareOpen(false)
  ctx.mission.setOffset(0)
  ctx.mission.setView(o.view)
}

/*
 * Starting states and thresholds were checked against the published LOLA horizons
 * (public/data/sites), link margin 3°, default hardware limits:
 *  - light: Shackleton floor is at 0 % Sun any date; from 2027-03-01 the rim (1.4 km up) and
 *    Chang'e-7 are at 100 % over 14 days.
 *  - earth: from 2027-03-19 the Shackleton rim has 0 % DTE over 14 days; ≥ 50 % from
 *    2027-03-01…03-11 or 03-28…04-07, or at Malapert (83 % from 03-29).
 *  - night: Malapert from 2027-03-01, 30 days: 312 h of night. The connecting ridge has 114 h
 *    that month (Shackleton rim 125 h: just over), and the rim 0–40 h in January–February.
 *  - landing: the propellant margin depends on the vehicle, not on the site: heavy 18.0 %,
 *    CLPS-class 25.4 %, small 34.7 %. Nobile rim has a p90 slope of 16.6° (limit 15°).
 *  - ice (round trip, landing 2027-03-15, 14 days): Chang'e-7 has no route to a PSR within
 *    2 km. With the starting workload (3 samples × 2 h) the micro-rover never finishes: it
 *    completes 0–2 samples at every site and cannot recharge in the shadow. The utility rover
 *    does the whole trip from every candidate with a route; its lowest battery is Mons Mouton
 *    57 %, Nobile rim 2 54 %, connecting ridge 48 %, Shackleton rim 41 %, Malapert 40 %, Nobile
 *    rim 40 %, de Gerlache 37 %. The micro-rover also solves it with less work from the closest
 *    sites: 3 × 1 h from Mons Mouton (45 %), 1 × 2 h from Mons Mouton (61 %) or Nobile rim 2
 *    (45 %), 1 × 1 h from the connecting ridge (31 %). With too little margin it does not:
 *    2 × 2 h from Mons Mouton comes back with 28 %, 3 × 1 h from Nobile rim 2 with 28 %.
 */
export const CHALLENGES: readonly Challenge[] = [
  {
    id: 'light',
    titleKey: 'challenge.light.title',
    briefKey: 'challenge.light.brief',
    whyKey: 'challenge.light.why',
    setup: (ctx) =>
      begin(ctx, {
        siteId: 'shackleton-floor',
        startMs: Date.UTC(2027, 2, 1),
        missionDays: L.shortMissionDays,
        view: 'macro',
      }),
    goals: [
      {
        id: 'sun',
        labelKey: 'challenge.light.goal.sun',
        hintKey: 'challenge.light.hint.sun',
        check: (s) =>
          isPolar(s) &&
          s.missionDays >= L.shortMissionDays &&
          s.metrics !== undefined &&
          s.metrics.sunlitPct >= L.sunlitPct,
        current: (s) => pct(s.metrics?.sunlitPct),
      },
    ],
  },
  {
    id: 'earth',
    titleKey: 'challenge.earth.title',
    briefKey: 'challenge.earth.brief',
    whyKey: 'challenge.earth.why',
    setup: (ctx) =>
      begin(ctx, {
        siteId: 'shackleton-rim',
        startMs: Date.UTC(2027, 2, 19),
        missionDays: L.shortMissionDays,
        view: 'micro',
      }),
    goals: [
      {
        id: 'dte',
        labelKey: 'challenge.earth.goal.dte',
        hintKey: 'challenge.earth.hint.dte',
        check: (s) =>
          isPolar(s) &&
          s.missionDays >= L.shortMissionDays &&
          s.metrics !== undefined &&
          s.metrics.dtePct >= L.dtePct,
        current: (s) => pct(s.metrics?.dtePct),
      },
    ],
  },
  {
    id: 'night',
    titleKey: 'challenge.night.title',
    briefKey: 'challenge.night.brief',
    whyKey: 'challenge.night.why',
    setup: (ctx) =>
      begin(ctx, {
        siteId: 'malapert-massif',
        startMs: Date.UTC(2027, 2, 1),
        missionDays: L.longMissionDays,
        view: 'macro',
      }),
    goals: [
      {
        id: 'dark',
        labelKey: 'challenge.night.goal.dark',
        hintKey: 'challenge.night.hint.dark',
        check: (s) =>
          isPolar(s) &&
          s.missionDays >= L.longMissionDays &&
          s.metrics !== undefined &&
          s.metrics.longestDarkH <= L.nightH,
        current: (s) => hours(s.metrics?.longestDarkH),
      },
      {
        id: 'verdict',
        labelKey: 'challenge.night.goal.verdict',
        hintKey: 'challenge.night.hint.verdict',
        check: (s) =>
          isPolar(s) &&
          s.missionDays >= L.longMissionDays &&
          s.verdict !== undefined &&
          s.verdict !== 'bad',
      },
    ],
  },
  {
    id: 'landing',
    titleKey: 'challenge.landing.title',
    briefKey: 'challenge.landing.brief',
    whyKey: 'challenge.landing.why',
    setup: (ctx) => {
      begin(ctx, {
        siteId: 'nobile-rim',
        startMs: Date.UTC(2027, 2, 1),
        missionDays: L.shortMissionDays,
        view: 'macro',
      })
      ctx.descent.setMode('physics')
      ctx.descent.setVehicle('heavy')
    },
    goals: [
      {
        id: 'slope',
        labelKey: 'challenge.landing.goal.slope',
        hintKey: 'challenge.landing.hint.slope',
        check: (s) => s.slopeP90Deg !== undefined && s.slopeP90Deg < L.slopeDeg,
        current: (s) => (s.slopeP90Deg === undefined ? undefined : `${s.slopeP90Deg.toFixed(1)}°`),
      },
      {
        id: 'margin',
        labelKey: 'challenge.landing.goal.margin',
        hintKey: 'challenge.landing.hint.margin',
        check: (s) =>
          s.view === 'landing' &&
          s.descent.physics &&
          s.descent.ok &&
          s.descent.propMarginPct !== undefined &&
          s.descent.propMarginPct >= L.propMarginPct,
        current: (s) => (s.view === 'landing' ? pct(s.descent.propMarginPct) : undefined),
      },
      {
        id: 'touchdown',
        labelKey: 'challenge.landing.goal.touchdown',
        hintKey: 'challenge.landing.hint.touchdown',
        check: (s) => s.view === 'landing' && s.descent.physics && s.descent.ok && s.descent.landed,
      },
    ],
  },
  {
    id: 'ice',
    titleKey: 'challenge.ice.title',
    briefKey: 'challenge.ice.brief',
    whyKey: 'challenge.ice.why',
    needsRover: true,
    setup: (ctx) => {
      begin(ctx, {
        siteId: 'change-7',
        startMs: Date.UTC(2027, 2, 15),
        missionDays: L.shortMissionDays,
        view: 'micro',
      })
      // The trip that cannot be done: the small rover with the full default workload.
      ctx.rover.setRover('rover')
      ctx.rover.setSamples(SAMPLING_DEFAULTS.samples)
      ctx.rover.setSampleH(SAMPLING_DEFAULTS.sampleH)
    },
    goals: [
      {
        id: 'route',
        labelKey: 'challenge.ice.goal.route',
        hintKey: 'challenge.ice.hint.route',
        // Landing inside the shadow is not a traverse: the lander itself would have no Sun.
        check: (s) => iceRoute(s),
        current: (s) =>
          s.ice?.reachable && s.ice.routeM != null ? `${Math.round(s.ice.routeM)} m` : undefined,
      },
      {
        id: 'samples',
        labelKey: 'challenge.ice.goal.samples',
        hintKey: 'challenge.ice.hint.samples',
        check: (s) => sampled(s),
        current: (s) =>
          iceRoute(s) && s.rover ? `${s.rover.samplesDone} / ${s.rover.samples}` : undefined,
      },
      {
        id: 'return',
        labelKey: 'challenge.ice.goal.return',
        hintKey: 'challenge.ice.hint.return',
        check: (s) => roundTrip(s),
      },
      {
        id: 'battery',
        labelKey: 'challenge.ice.goal.battery',
        hintKey: 'challenge.ice.hint.battery',
        // Over the whole trip: a rover that stops halfway has not shown its lowest battery yet.
        check: (s) => roundTrip(s) && s.rover!.minSocPct >= L.roverSocPct,
        current: (s) => (iceRoute(s) ? pct(s.rover?.minSocPct) : undefined),
      },
    ],
  },
]

function iceRoute(s: ChallengeState) {
  return !!s.ice && s.ice.reachable && !s.ice.insidePsr && (s.ice.routeM ?? 0) > 0
}

/** The rover drove to the ice and finished every sample it was asked for. */
function sampled(s: ChallengeState) {
  const r = s.rover
  return iceRoute(s) && !!r && r.reaches && r.samples > 0 && r.samplesDone >= r.samples
}

/** ...and it is back at the lander before the surface mission ends. */
function roundTrip(s: ChallengeState) {
  return sampled(s) && s.rover!.returns && s.rover!.onTime
}

export const findChallenge = (id: string | null | undefined) => CHALLENGES.find((c) => c.id === id)

/** The challenge after `id`, or undefined after the last one. */
export const nextChallenge = (id: string) =>
  CHALLENGES[CHALLENGES.findIndex((c) => c.id === id) + 1] as Challenge | undefined

/** Which goals are met, in order. */
export const goalsMet = (c: Challenge, s: ChallengeState) => c.goals.map((g) => g.check(s))

export const MAX_CHALLENGE_SCORE = 100
export const HINT_PENALTY = 15
export const MIN_CHALLENGE_SCORE = 40

/** 100 for solving it unaided, 15 less per hint revealed, never below 40. */
export const challengeScore = (hintsUsed: number) =>
  Math.max(
    MIN_CHALLENGE_SCORE,
    MAX_CHALLENGE_SCORE - HINT_PENALTY * Math.max(0, Math.floor(hintsUsed)),
  )

/** Sum of the best scores of the known challenges. */
export const totalScore = (done: Readonly<Record<string, number>>) =>
  CHALLENGES.reduce((sum, c) => sum + (done[c.id] ?? 0), 0)
