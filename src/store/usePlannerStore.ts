import { create } from 'zustand'
import {
  PLAN_DEFAULTS,
  PLAN_MAX_DAYS,
  PLAN_RADII_M,
  type PlanResult,
  type PlanStatus,
} from '../astro/plannerTypes.ts'

/**
 * Inputs and state of the planner step (planner audience). The mission settings it shares with
 * the rest of the app (mission length, hardware limits, link margin, DSN, science weight, rover)
 * are read from the mission and rover stores when a plan is launched; what is specific to the
 * planner lives here.
 */
export interface PlannerState {
  /** The ice the mission is after, and the curated site whose tile covers it. */
  target: { lat: number; lon: number } | null
  tileSiteId: string | null
  /** First landing date considered (00:00 UTC, ms) and length of the range, days. */
  fromMs: number | null
  days: number
  minSunDays: number
  minRoverSocPct: number
  radiusM: number
  result: PlanResult | null
  status: PlanStatus
  /** 0..1 while running. */
  progress: number
  error: string | null
  /** Day highlighted in the calendar, the table and the map (ms), if any. */
  selectedDayMs: number | null
  /** Days ticked to be sent to Compare (ms). */
  picked: number[]
  setTarget: (target: { lat: number; lon: number } | null, tileSiteId: string | null) => void
  setRange: (fromMs: number, days: number) => void
  setMinSunDays: (days: number) => void
  setMinRoverSoc: (pct: number) => void
  setRadius: (m: number) => void
  setRun: (patch: Partial<Pick<PlannerState, 'result' | 'status' | 'progress' | 'error'>>) => void
  selectDay: (dayMs: number | null) => void
  togglePicked: (dayMs: number) => void
  clearResult: () => void
}

const STORAGE_KEY = 'lumen3d.planner'
type Inputs = Pick<
  PlannerState,
  'target' | 'tileSiteId' | 'fromMs' | 'days' | 'minSunDays' | 'minRoverSocPct' | 'radiusM'
>
const DEFAULT_INPUTS: Inputs = {
  target: null,
  tileSiteId: null,
  fromMs: null,
  days: PLAN_DEFAULTS.days,
  minSunDays: PLAN_DEFAULTS.minSunDays,
  minRoverSocPct: PLAN_DEFAULTS.minRoverSocPct,
  radiusM: PLAN_DEFAULTS.radiusM,
}

const num = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback

/** The planner inputs of the last visit (results are recomputed, never stored). */
export function loadPlannerInputs(): Inputs {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Inputs> | null
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_INPUTS }
    const t = raw.target
    const target =
      t && Number.isFinite(t.lat) && Number.isFinite(t.lon) && Math.abs(t.lat) <= 90
        ? { lat: t.lat, lon: t.lon }
        : null
    return {
      target,
      tileSiteId: target && typeof raw.tileSiteId === 'string' ? raw.tileSiteId : null,
      fromMs: typeof raw.fromMs === 'number' && Number.isFinite(raw.fromMs) ? raw.fromMs : null,
      days: Math.round(num(raw.days, 1, PLAN_MAX_DAYS, DEFAULT_INPUTS.days)),
      minSunDays: num(raw.minSunDays, 0, 60, DEFAULT_INPUTS.minSunDays),
      minRoverSocPct: num(raw.minRoverSocPct, 0, 90, DEFAULT_INPUTS.minRoverSocPct),
      radiusM: (PLAN_RADII_M as readonly number[]).includes(raw.radiusM as number)
        ? (raw.radiusM as number)
        : DEFAULT_INPUTS.radiusM,
    }
  } catch {
    return { ...DEFAULT_INPUTS }
  }
}

function saveInputs(s: Inputs) {
  try {
    const { target, tileSiteId, fromMs, days, minSunDays, minRoverSocPct, radiusM } = s
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ target, tileSiteId, fromMs, days, minSunDays, minRoverSocPct, radiusM }),
    )
  } catch {
    // Storage blocked: the inputs still apply to this session.
  }
}

export const usePlannerStore = create<PlannerState>()((set) => ({
  ...loadPlannerInputs(),
  result: null,
  status: 'idle',
  progress: 0,
  error: null,
  selectedDayMs: null,
  picked: [],
  setTarget: (target, tileSiteId) => set({ target, tileSiteId }),
  setRange: (fromMs, days) =>
    set({ fromMs, days: Math.round(Math.min(PLAN_MAX_DAYS, Math.max(1, days || 1))) }),
  setMinSunDays: (minSunDays) => set({ minSunDays }),
  setMinRoverSoc: (minRoverSocPct) => set({ minRoverSocPct }),
  setRadius: (radiusM) => set({ radiusM }),
  setRun: (patch) => set(patch),
  selectDay: (selectedDayMs) => set({ selectedDayMs }),
  togglePicked: (dayMs) =>
    set((s) => ({
      picked: s.picked.includes(dayMs)
        ? s.picked.filter((d) => d !== dayMs)
        : [...s.picked, dayMs].slice(-4),
    })),
  clearResult: () =>
    set({
      result: null,
      status: 'idle',
      progress: 0,
      error: null,
      selectedDayMs: null,
      picked: [],
    }),
}))

// Remember the inputs between visits.
usePlannerStore.subscribe((s, prev) => {
  if (
    s.target !== prev.target ||
    s.tileSiteId !== prev.tileSiteId ||
    s.fromMs !== prev.fromMs ||
    s.days !== prev.days ||
    s.minSunDays !== prev.minSunDays ||
    s.minRoverSocPct !== prev.minRoverSocPct ||
    s.radiusM !== prev.radiusM
  )
    saveInputs(s)
})
