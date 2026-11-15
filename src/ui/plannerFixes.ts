import {
  PLAN_MAX_DAYS,
  PLAN_RADII_M,
  type PlanResult,
  type PlanViolation,
} from '../astro/plannerTypes.ts'
import { useT } from '../i18n/index.ts'
import { type PlannerState, usePlannerStore } from '../store/usePlannerStore.ts'
import type { KitAction } from './bands.ts'
import { formatDistance } from './format.ts'
import { effectiveFromMs } from './plannerInputs.ts'
import { violationHistogram } from './plannerView.ts'

/**
 * The fixes offered next to "no day has a solution": one-click changes to the planner's own
 * inputs, ordered by the constraint that rejects most. They only change the inputs; the user
 * still presses "Plan" (the results on screen are marked as computed with other data).
 */
export type PlanFixId = 'widenRange' | 'lowerSun' | 'widenRadius' | 'narrowRadius' | 'lowerSoc'

export interface PlanFix {
  id: PlanFixId
  /** The value the input would take. */
  value: number
}

export type PlanFixInputs = Pick<PlannerState, 'days' | 'minSunDays' | 'minRoverSocPct' | 'radiusM'>

export const FIX_RANGE_STEP_DAYS = 30
export const FIX_SUN_STEP_DAYS = 5
export const FIX_SOC_STEP_PCT = 10
/** At most this many buttons: a choice, not a form. */
export const FIX_MAX = 3

/** What helps against each constraint, most direct first. */
const FIXES_FOR: Record<PlanViolation, readonly PlanFixId[]> = {
  'no-route': ['widenRadius'],
  'no-sun-at-landing': ['widenRange'],
  'short-light': ['lowerSun', 'widenRange'],
  night: ['widenRange'],
  dte: ['widenRange'],
  slope: ['widenRadius'],
  'rover-unreachable': ['narrowRadius'],
  'rover-battery': ['lowerSoc', 'narrowRadius'],
}
/** With nothing to go by: the three that open the search most. */
const DEFAULT_FIXES: readonly PlanFixId[] = ['widenRange', 'lowerSun', 'widenRadius']

/** The value a fix would set, or null when the input is already at its limit. */
function fixValue(id: PlanFixId, p: PlanFixInputs): number | null {
  const radii = PLAN_RADII_M as readonly number[]
  switch (id) {
    case 'widenRange':
      return p.days < PLAN_MAX_DAYS ? Math.min(PLAN_MAX_DAYS, p.days + FIX_RANGE_STEP_DAYS) : null
    case 'lowerSun':
      return p.minSunDays > 0 ? Math.max(0, p.minSunDays - FIX_SUN_STEP_DAYS) : null
    case 'lowerSoc':
      return p.minRoverSocPct > 0 ? Math.max(0, p.minRoverSocPct - FIX_SOC_STEP_PCT) : null
    case 'widenRadius':
      return radii.find((r) => r > p.radiusM) ?? null
    case 'narrowRadius':
      return [...radii].reverse().find((r) => r < p.radiusM) ?? null
  }
}

/**
 * Fixes for the violations given (dominant first), without repeats, skipping those whose input
 * is already at its limit and never offering to widen and to narrow the radius at once.
 */
export function planFixes(violations: readonly PlanViolation[], inputs: PlanFixInputs): PlanFix[] {
  const ids = violations.length ? violations.flatMap((v) => FIXES_FOR[v]) : DEFAULT_FIXES
  const out: PlanFix[] = []
  for (const id of ids) {
    if (out.length >= FIX_MAX) break
    if (out.some((f) => f.id === id)) continue
    const opposite =
      id === 'widenRadius' ? 'narrowRadius' : id === 'narrowRadius' ? 'widenRadius' : null
    if (opposite && out.some((f) => f.id === opposite)) continue
    const value = fixValue(id, inputs)
    if (value !== null) out.push({ id, value })
  }
  return out
}

/** Applies a fix to the planner inputs (nothing is launched). */
export function applyPlanFix(fix: PlanFix): void {
  const s = usePlannerStore.getState()
  switch (fix.id) {
    case 'widenRange':
      return s.setRange(effectiveFromMs(s.fromMs, fix.value), fix.value)
    case 'lowerSun':
      return s.setMinSunDays(fix.value)
    case 'lowerSoc':
      return s.setMinRoverSoc(fix.value)
    case 'widenRadius':
    case 'narrowRadius':
      return s.setRadius(fix.value)
  }
}

/** The fix buttons for a result, against the inputs as they stand now. */
export function usePlanFixActions(result: PlanResult | null): KitAction[] {
  const t = useT()
  const days = usePlannerStore((s) => s.days)
  const minSunDays = usePlannerStore((s) => s.minSunDays)
  const minRoverSocPct = usePlannerStore((s) => s.minRoverSocPct)
  const radiusM = usePlannerStore((s) => s.radiusM)
  const running = usePlannerStore((s) => s.status === 'running')
  if (!result) return []
  const violations = violationHistogram(result.days).map((b) => b.violation)
  return planFixes(violations, { days, minSunDays, minRoverSocPct, radiusM }).map((fix) => ({
    label:
      fix.id === 'widenRadius' || fix.id === 'narrowRadius'
        ? t(`plan.fixbtn.${fix.id}`, { r: formatDistance(fix.value) })
        : t(`plan.fixbtn.${fix.id}`, { n: fix.value }),
    disabled: running,
    onClick: () => applyPlanFix(fix),
  }))
}
