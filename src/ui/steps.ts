import type { MsgKey } from '../i18n/index.ts'
import { type View, useMissionStore } from '../store/useMissionStore.ts'

/**
 * The four steps of the decision, in order. The first three are the 3D views; "decide" is the
 * comparison (where the export lives).
 */
export interface Step {
  id: 'orbit' | 'surface' | 'landing' | 'decide'
  view: View | null
  title: MsgKey
  hint: MsgKey
}

export const STEPS: readonly Step[] = [
  { id: 'orbit', view: 'macro', title: 'step.orbit', hint: 'step.orbit.hint' },
  { id: 'surface', view: 'micro', title: 'step.surface', hint: 'step.surface.hint' },
  { id: 'landing', view: 'landing', title: 'step.landing', hint: 'step.landing.hint' },
  { id: 'decide', view: null, title: 'step.decide', hint: 'step.decide.hint' },
]

export const DECIDE_STEP = STEPS.length - 1

/** Index of the step on screen. */
export const stepIndex = (view: View, compareOpen: boolean) =>
  compareOpen
    ? DECIDE_STEP
    : Math.max(
        0,
        STEPS.findIndex((s) => s.view === view),
      )

export function useStepIndex() {
  const view = useMissionStore((s) => s.view)
  const compareOpen = useMissionStore((s) => s.compareOpen)
  return stepIndex(view, compareOpen)
}

export function goToStep(i: number) {
  const step = STEPS[Math.min(Math.max(0, i), DECIDE_STEP)]
  const s = useMissionStore.getState()
  if (step.view) {
    s.setCompareOpen(false)
    s.setView(step.view)
  } else {
    s.setExplainOpen(false)
    s.setCompareOpen(true)
  }
}
