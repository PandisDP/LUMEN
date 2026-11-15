import { create } from 'zustand'
import { PLAN_DEFAULTS, type PlanResult, type PlanStatus } from '../astro/plannerTypes.ts'

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

export const usePlannerStore = create<PlannerState>()((set) => ({
  target: null,
  tileSiteId: null,
  fromMs: null,
  days: PLAN_DEFAULTS.days,
  minSunDays: PLAN_DEFAULTS.minSunDays,
  minRoverSocPct: PLAN_DEFAULTS.minRoverSocPct,
  radiusM: PLAN_DEFAULTS.radiusM,
  result: null,
  status: 'idle',
  progress: 0,
  error: null,
  selectedDayMs: null,
  picked: [],
  setTarget: (target, tileSiteId) => set({ target, tileSiteId }),
  setRange: (fromMs, days) => set({ fromMs, days }),
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
