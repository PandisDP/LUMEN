import type { PlanProblem } from '../astro/plannerTypes.ts'
import { usePlannerStore } from '../store/usePlannerStore.ts'

/**
 * Runs a plan in the worker, in batches of days, publishing partial results and progress to the
 * planner store. Placeholder until the engine lands: `run` reports an error.
 */
export function runPlan(problem: PlanProblem): void {
  void problem
  usePlannerStore.getState().setRun({ status: 'error', error: 'planner engine not built yet' })
}

/** Stops the running plan; what was computed so far stays on screen. */
export function cancelPlan(): void {
  const s = usePlannerStore.getState()
  if (s.status === 'running') s.setRun({ status: 'cancelled' })
}
