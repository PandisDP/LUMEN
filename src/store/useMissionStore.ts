import { create } from 'zustand'
import { DAY_MS } from '../astro/constants.ts'
import type { EnergyProfile } from '../astro/energy.ts'
import { DEFAULT_LIMITS, type HardwareLimits, sanitizeLimits } from '../astro/hardware.ts'
import { DEFAULT_ENERGY_ID, energyPreset } from '../config/energyProfiles.ts'
import { type Preset, type PresetScenario } from '../config/presets.ts'
import { DEFAULT_SITE_ID } from '../config/sites.ts'
import type { SiteInfo } from '../data/catalog.ts'

/**
 * Mission settings that belong to each scenario, so Compare can test "same site, other battery"
 * or "other site, longer mission". The store's top-level fields with the same names always
 * mirror the active scenario: panels that edit "the current mission" keep using them directly.
 */
export interface ScenarioParams {
  missionDays: number
  /** Minimum Earth elevation over the terrain for a DTE link, deg. */
  linkMarginDeg: number
  /** The DTE link also needs a DSN complex with the Moon in view. */
  requireDsn: boolean
  /** Preset id, or 'custom' once any field is edited. */
  energyId: string
  energy: EnergyProfile
  /** What the lander tolerates; drives the hardware filter. */
  hardwareLimits: HardwareLimits
  /** 0 = engineering score only, 1 = science (ice access) only. */
  scienceWeight: number
}

/** One site + landing date + mission settings. Up to MAX_SCENARIOS are compared side by side. */
export interface Scenario extends ScenarioParams {
  id: string
  siteId: string
  /** Landing (start of the analysis window), UTC ms. */
  startMs: number
}

/** What creating or editing a scenario may set (ids are assigned by the store). */
export type ScenarioPatch = Partial<Omit<Scenario, 'id'>>

export type View = 'macro' | 'micro' | 'landing'
/** After touchdown: through the lander's eye, or orbiting around the craft. */
export type LanderCam = 'eye' | 'orbit'
export type BottomPanel = 'timeline' | 'horizon' | 'dates' | 'seasons' | 'map'

export const MAX_SCENARIOS = 4
export const SCENARIO_COLORS = ['#ffc94d', '#4da6ff', '#ff6b9a', '#7ee081'] as const
export const SCENARIO_LABELS = ['A', 'B', 'C', 'D'] as const
export const MISSION_DAYS = { min: 1, max: 60, default: 14 } as const
/** Playback speeds, in simulated hours per real second. */
export const PLAY_SPEEDS = [1, 6, 24, 72] as const
export const FOV = { min: 2, max: 75, default: 60 } as const
/** Minimum Earth elevation over the terrain for a DTE link (antenna multipath margin), deg. */
export const LINK_MARGIN = { min: 0, max: 10, default: 3 } as const
/** Landing-dispersion radii offered in the UI (m); 0 disables the ellipse analysis. */
export const ELLIPSE_RADII = [0, 500, 1000, 2000] as const
/** Camera height of the aerial (map-like) surface view, m. */
export const AERIAL_HEIGHT_M = 3_000

/** Today at 00:00 UTC. */
export const todayUtc = (now = Date.now()) => Math.floor(now / DAY_MS) * DAY_MS

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export const defaultParams = (): ScenarioParams => ({
  missionDays: MISSION_DAYS.default,
  linkMarginDeg: LINK_MARGIN.default,
  requireDsn: false,
  energyId: DEFAULT_ENERGY_ID,
  energy: { ...energyPreset(DEFAULT_ENERGY_ID)!.profile },
  hardwareLimits: { ...DEFAULT_LIMITS },
  scienceWeight: 0,
})

/** The mission settings of a scenario (or of the store mirror), copied. */
export const paramsOf = (x: ScenarioParams): ScenarioParams => ({
  missionDays: x.missionDays,
  linkMarginDeg: x.linkMarginDeg,
  requireDsn: x.requireDsn,
  energyId: x.energyId,
  energy: { ...x.energy },
  hardwareLimits: { ...x.hardwareLimits },
  scienceWeight: x.scienceWeight,
})

function cleanEnergy(patch: object): Partial<EnergyProfile> {
  return Object.fromEntries(
    Object.entries(patch).filter(
      ([, v]) => typeof v === 'string' || (Number.isFinite(v) && (v as number) >= 0),
    ),
  ) as Partial<EnergyProfile>
}

/**
 * Applies a (possibly untrusted) patch of mission settings over `base`, clamping numbers to their
 * ranges and ignoring anything invalid.
 */
export function sanitizeParams(
  patch: Partial<Record<keyof ScenarioParams, unknown>>,
  base: ScenarioParams,
): ScenarioParams {
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
  const out = paramsOf(base)
  const days = num(patch.missionDays)
  if (days !== undefined)
    out.missionDays = Math.round(clamp(days, MISSION_DAYS.min, MISSION_DAYS.max))
  const link = num(patch.linkMarginDeg)
  if (link !== undefined) out.linkMarginDeg = clamp(link, LINK_MARGIN.min, LINK_MARGIN.max)
  if (typeof patch.requireDsn === 'boolean') out.requireDsn = patch.requireDsn
  const sci = num(patch.scienceWeight)
  if (sci !== undefined) out.scienceWeight = Math.round(clamp(sci, 0, 1) * 100) / 100
  if (patch.hardwareLimits && typeof patch.hardwareLimits === 'object')
    out.hardwareLimits = sanitizeLimits(
      patch.hardwareLimits as Partial<Record<keyof HardwareLimits, unknown>>,
      out.hardwareLimits,
    )
  const preset = typeof patch.energyId === 'string' ? energyPreset(patch.energyId) : undefined
  if (preset) {
    out.energyId = patch.energyId as string
    out.energy = { ...preset.profile }
  }
  if (patch.energy && typeof patch.energy === 'object') {
    out.energy = { ...out.energy, ...cleanEnergy(patch.energy) }
    // An explicit profile is a custom one unless it comes with its preset id.
    if (!preset) out.energyId = 'custom'
  } else if (patch.energyId === 'custom') out.energyId = 'custom'
  return out
}

/** Longest mission among the scenarios, days: the shared clock runs up to it. */
export const maxMissionDays = (s: { scenarios: readonly ScenarioParams[] }) =>
  Math.max(MISSION_DAYS.min, ...s.scenarios.map((x) => x.missionDays))

export interface LookRequest {
  az: number
  el: number
  fov: number
  /** Changes on every request so the camera reacts even to identical targets. */
  nonce: number
}

export interface MissionState extends ScenarioParams {
  sites: SiteInfo[]
  scenarios: Scenario[]
  activeId: string
  /** Hours since landing shown by every scenario (so A/B compare at the same mission time). */
  offsetH: number
  view: View
  bottomPanel: BottomPanel
  compareOpen: boolean
  explainOpen: boolean
  /** Hide the side/bottom panels to see the 3D view unobstructed. */
  panelsHidden: boolean
  playing: boolean
  speed: number
  showMask: boolean
  showPaths: boolean
  look: LookRequest | null
  /** Colour the terrain by slope (landing safety layer). */
  showSlope: boolean
  ellipseRadiusM: number
  /** Surface view from above instead of the lander's eye. */
  aerial: boolean
  /** Next click on the terrain relocates the site. */
  pickMode: boolean
  /** Azimuth the descent comes from (deg); null = automatic, Sun behind the craft. */
  approachAz: number | null
  landerCam: LanderCam
  hardwareOpen: boolean
  /** Colour the terrain by yearly illumination (PSR layer). */
  showIllum: boolean
  /** Surface view: LROC NAC orbital image draped on the terrain (lighting of 2010, not simulated). */
  showNac: boolean

  setSites: (sites: SiteInfo[]) => void
  addCustomSite: (site: SiteInfo) => void
  selectSite: (siteId: string) => void
  setStart: (startMs: number) => void
  /** New scenario: a copy of the active one with `patch` applied; it becomes active. */
  addScenario: (patch?: ScenarioPatch) => void
  /** Edits any scenario: site, date and mission settings. */
  updateScenario: (id: string, patch: ScenarioPatch) => void
  duplicateScenario: (id: string) => void
  /** Replaces all scenarios (unknown sites dropped, capped at MAX_SCENARIOS). */
  setScenarios: (list: readonly PresetScenario[], activeIndex?: number) => boolean
  /** Builds a preset from the active scenario and opens Compare. */
  applyPreset: (preset: Preset) => void
  removeScenario: (id: string) => void
  setActive: (id: string) => void
  setOffset: (hours: number) => void
  setMissionDays: (days: number) => void
  setView: (view: View) => void
  setBottomPanel: (panel: BottomPanel) => void
  setCompareOpen: (open: boolean) => void
  setExplainOpen: (open: boolean) => void
  togglePanels: () => void
  togglePlay: () => void
  setSpeed: (speed: number) => void
  setShowMask: (show: boolean) => void
  setShowPaths: (show: boolean) => void
  lookAt: (az: number, el: number, fov?: number) => void
  setLinkMargin: (deg: number) => void
  setRequireDsn: (on: boolean) => void
  setShowSlope: (show: boolean) => void
  setEllipseRadius: (m: number) => void
  setAerial: (aerial: boolean) => void
  setPickMode: (on: boolean) => void
  setEnergyPreset: (id: string) => void
  updateEnergy: (patch: Partial<EnergyProfile>) => void
  setEnergy: (profile: EnergyProfile) => void
  setApproachAz: (az: number | null) => void
  setLanderCam: (cam: LanderCam) => void
  setHardwareLimits: (patch: Partial<Record<keyof HardwareLimits, unknown>>) => void
  setHardwareOpen: (open: boolean) => void
  setScienceWeight: (w: number) => void
  setShowIllum: (show: boolean) => void
  setShowNac: (show: boolean) => void
  reset: () => void
}

let scenarioSeq = 1
const newScenarioId = () => `s${scenarioSeq++}`

const initialState = () => {
  const first: Scenario = {
    id: 's0',
    siteId: DEFAULT_SITE_ID,
    startMs: todayUtc(),
    ...defaultParams(),
  }
  return {
    ...paramsOf(first),
    sites: [] as SiteInfo[],
    scenarios: [first],
    activeId: first.id,
    offsetH: 0,
    view: 'macro' as View,
    bottomPanel: 'timeline' as BottomPanel,
    compareOpen: false,
    explainOpen: false,
    panelsHidden: false,
    playing: false,
    speed: 6,
    showMask: true,
    showPaths: true,
    look: null as LookRequest | null,
    showSlope: false,
    ellipseRadiusM: 500 as number,
    aerial: false,
    pickMode: false,
    approachAz: null as number | null,
    landerCam: 'eye' as LanderCam,
    hardwareOpen: false,
    showIllum: false,
    showNac: false,
  }
}

/** Keeps the shared clock inside the longest mission. */
const clampOffset = (offsetH: number, scenarios: readonly Scenario[]) =>
  Math.min(offsetH, maxMissionDays({ scenarios }) * 24)

export const useMissionStore = create<MissionState>()((set, get) => {
  /** Applies a scenario list + active id and refreshes the top-level mirror. */
  const commit = (scenarios: Scenario[], activeId = get().activeId) => {
    const active = scenarios.find((x) => x.id === activeId) ?? scenarios[0]
    set({
      scenarios,
      activeId: active.id,
      ...paramsOf(active),
      offsetH: clampOffset(get().offsetH, scenarios),
    })
  }

  const patchScenario = (id: string, patch: ScenarioPatch) => {
    const { scenarios, sites } = get()
    const next = scenarios.map((sc) => {
      if (sc.id !== id) return sc
      const siteOk =
        patch.siteId === undefined || !sites.length || sites.some((x) => x.id === patch.siteId)
      return {
        ...sc,
        ...sanitizeParams(patch, sc),
        siteId: siteOk && patch.siteId ? patch.siteId : sc.siteId,
        startMs:
          patch.startMs !== undefined && Number.isFinite(patch.startMs)
            ? patch.startMs
            : sc.startMs,
      }
    })
    commit(next)
  }

  const updateActive = (patch: ScenarioPatch) => patchScenario(get().activeId, patch)

  return {
    ...initialState(),
    setSites: (sites) => set({ sites }),
    addCustomSite: (site) => {
      set((s) => ({ sites: [...s.sites.filter((x) => x.id !== site.id), site] }))
      updateActive({ siteId: site.id })
    },
    selectSite: (siteId) => {
      const { sites } = get()
      if (sites.length && !sites.some((x) => x.id === siteId)) return
      updateActive({ siteId })
    },
    setStart: (startMs) => {
      if (Number.isFinite(startMs)) updateActive({ startMs })
    },
    addScenario: (patch = {}) => {
      const { scenarios, activeId } = get()
      if (scenarios.length >= MAX_SCENARIOS) return
      const base = scenarios.find((s) => s.id === activeId) ?? scenarios[0]
      const id = newScenarioId()
      commit([...scenarios, { ...base, ...paramsOf(base), id }], id)
      if (Object.keys(patch).length) patchScenario(id, patch)
    },
    updateScenario: (id, patch) => {
      if (get().scenarios.some((s) => s.id === id)) patchScenario(id, patch)
    },
    duplicateScenario: (id) => {
      const { scenarios } = get()
      const src = scenarios.find((s) => s.id === id)
      if (!src || scenarios.length >= MAX_SCENARIOS) return
      const copy = { ...src, ...paramsOf(src), id: newScenarioId() }
      const i = scenarios.indexOf(src)
      commit([...scenarios.slice(0, i + 1), copy, ...scenarios.slice(i + 1)], copy.id)
    },
    setScenarios: (list, activeIndex = 0) => {
      const { sites } = get()
      const base = paramsOf(get())
      const valid = list
        .filter((x) => Number.isFinite(x.startMs))
        .filter((x) => !sites.length || sites.some((site) => site.id === x.siteId))
        .slice(0, MAX_SCENARIOS)
      if (!valid.length) return false
      const scenarios: Scenario[] = valid.map((x) => ({
        ...sanitizeParams(x, base),
        id: newScenarioId(),
        siteId: x.siteId,
        startMs: x.startMs,
      }))
      const active = scenarios[Math.min(Math.max(0, activeIndex), scenarios.length - 1)]
      commit(scenarios, active.id)
      return true
    },
    applyPreset: (preset) => {
      const active = selectActiveScenario(get())
      const { scenarios, missionDays, scienceWeight, energyId } = preset.build({
        siteId: active.siteId,
        startMs: active.startMs,
      })
      // Preset-wide settings apply to every scenario it builds (each can still override them).
      const shared = {
        ...(missionDays ? { missionDays } : {}),
        ...(scienceWeight !== undefined ? { scienceWeight } : {}),
        ...(energyId ? { energyId } : {}),
      }
      if (!get().setScenarios(scenarios.map((x) => ({ ...shared, ...x })))) return
      set({ compareOpen: true, explainOpen: false })
    },
    removeScenario: (id) => {
      const { scenarios, activeId } = get()
      if (scenarios.length <= 1) return
      const rest = scenarios.filter((s) => s.id !== id)
      commit(rest, activeId === id ? rest[0].id : activeId)
    },
    setActive: (id) => {
      if (get().scenarios.some((s) => s.id === id)) commit(get().scenarios, id)
    },
    setOffset: (hours) =>
      set((s) => ({
        offsetH: Number.isFinite(hours) ? clamp(hours, 0, maxMissionDays(s) * 24) : 0,
      })),
    setMissionDays: (days) =>
      updateActive({ missionDays: Number.isFinite(days) ? days : MISSION_DAYS.default }),
    // The descent replays at a fixed mission time, from the lander's eye (not the aerial view).
    setView: (view) =>
      set(
        view === 'landing'
          ? { view, playing: false, aerial: false, pickMode: false, landerCam: 'eye' }
          : { view },
      ),
    setBottomPanel: (bottomPanel) => set({ bottomPanel }),
    setCompareOpen: (compareOpen) =>
      set(compareOpen ? { compareOpen, hardwareOpen: false } : { compareOpen }),
    setExplainOpen: (explainOpen) =>
      set(explainOpen ? { explainOpen, hardwareOpen: false } : { explainOpen }),
    togglePanels: () => set((s) => ({ panelsHidden: !s.panelsHidden })),
    togglePlay: () =>
      set((s) => {
        // Restart from the landing if playback is resumed at the end of the window.
        const atEnd = s.offsetH >= maxMissionDays(s) * 24
        return { playing: !s.playing, offsetH: !s.playing && atEnd ? 0 : s.offsetH }
      }),
    setSpeed: (speed) => {
      if ((PLAY_SPEEDS as readonly number[]).includes(speed)) set({ speed })
    },
    setShowMask: (showMask) => set({ showMask }),
    setShowPaths: (showPaths) => set({ showPaths }),
    lookAt: (az, el, fov) =>
      set((s) => ({
        look: {
          az,
          el,
          fov: clamp(fov ?? FOV.default, FOV.min, FOV.max),
          nonce: (s.look?.nonce ?? 0) + 1,
        },
      })),
    setLinkMargin: (deg) => {
      if (Number.isFinite(deg)) updateActive({ linkMarginDeg: deg })
    },
    setRequireDsn: (requireDsn) => updateActive({ requireDsn }),
    setShowSlope: (showSlope) => set({ showSlope }),
    setEllipseRadius: (m) => {
      if ((ELLIPSE_RADII as readonly number[]).includes(m)) set({ ellipseRadiusM: m })
    },
    setAerial: (aerial) => set({ aerial }),
    setPickMode: (pickMode) => set({ pickMode }),
    setEnergyPreset: (id) => {
      if (energyPreset(id)) updateActive({ energyId: id })
    },
    updateEnergy: (patch) => updateActive({ energy: { ...get().energy, ...cleanEnergy(patch) } }),
    setEnergy: (energy) => updateActive({ energy }),
    setApproachAz: (az) => {
      if (az === null) set({ approachAz: null })
      else if (Number.isFinite(az)) set({ approachAz: ((az % 360) + 360) % 360 })
    },
    setLanderCam: (landerCam) => set({ landerCam }),
    setHardwareLimits: (patch) =>
      updateActive({ hardwareLimits: sanitizeLimits(patch, get().hardwareLimits) }),
    setHardwareOpen: (hardwareOpen) =>
      set(
        hardwareOpen ? { hardwareOpen, compareOpen: false, explainOpen: false } : { hardwareOpen },
      ),
    setScienceWeight: (w) => {
      if (Number.isFinite(w)) updateActive({ scienceWeight: w })
    },
    setShowIllum: (showIllum) => set({ showIllum }),
    setShowNac: (showNac) => set({ showNac }),
    reset: () => set({ ...initialState(), sites: get().sites }),
  }
})

/** Selector helpers. */
export const selectActiveScenario = (s: MissionState) =>
  s.scenarios.find((sc) => sc.id === s.activeId) ?? s.scenarios[0]

export const scenarioIndex = (s: MissionState, id: string) =>
  Math.max(
    0,
    s.scenarios.findIndex((sc) => sc.id === id),
  )

export const findSite = (sites: readonly SiteInfo[], id: string) => sites.find((x) => x.id === id)
