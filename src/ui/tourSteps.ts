import type { MsgKey } from '../i18n/index.ts'
import type { View } from '../store/useMissionStore.ts'
import type { PanelId } from '../store/useUiStore.ts'

/**
 * Guided tour script. `target` is the `data-tour` attribute of the element to spotlight (null =
 * centred card). `panel` is expanded for the step; `view` is switched to before measuring.
 */
export interface TourStep {
  id: string
  target: string | null
  panel?: PanelId
  view?: View
}

export const TOUR_STEPS: readonly TourStep[] = [
  { id: 'welcome', target: null },
  { id: 'steps', target: 'steps' },
  { id: 'scene', target: null, view: 'macro' },
  { id: 'sites', target: 'panel-left', panel: 'left' },
  { id: 'metrics', target: 'panel-right', panel: 'right' },
  { id: 'time', target: 'time', panel: 'bottom' },
  { id: 'charts', target: 'panel-bottom', panel: 'bottom' },
  { id: 'hud', target: 'viewhud' },
  { id: 'compare', target: 'compare' },
  { id: 'assistant', target: 'assistant' },
  { id: 'more', target: 'more' },
  { id: 'done', target: 'guide' },
]

export const tourText = (id: string, part: 'title' | 'body') => `tour.${id}.${part}` as MsgKey

/** Contextual help topics and the tour step that shows the same part. */
export const HELP_TOPICS = {
  sites: { body: 'help.sites', title: 'panel.left', step: 'sites' },
  metrics: { body: 'help.metrics', title: 'panel.right', step: 'metrics' },
  charts: { body: 'help.charts', title: 'panel.bottom', step: 'charts' },
  hud: { body: 'help.hud', title: 'tour.hud.title', step: 'hud' },
} as const satisfies Record<string, { body: MsgKey; title: MsgKey; step: string }>

export type HelpTopic = keyof typeof HELP_TOPICS

export const stepIndex = (id: string) =>
  Math.max(
    0,
    TOUR_STEPS.findIndex((s) => s.id === id),
  )

const MARGIN = 12
const GAP = 14

interface Box {
  top: number
  left: number
  width: number
  height: number
}

/**
 * Places the bubble next to the target: beside tall targets (side panels), otherwise below or
 * above, always clamped inside the viewport.
 */
export function placeBubble(
  target: Box | null,
  bubble: { width: number; height: number },
  vw: number,
  vh: number,
): { top: number; left: number } {
  const clamp = (v: number, min: number, max: number) =>
    Math.min(Math.max(v, min), Math.max(min, max))
  if (!target) return { top: (vh - bubble.height) / 2, left: (vw - bubble.width) / 2 }
  const right = target.left + target.width
  const bottom = target.top + target.height
  const tall = target.height > vh * 0.45
  let top: number
  let left: number
  if (tall && vw - right >= bubble.width + GAP + MARGIN) {
    left = right + GAP
    top = target.top + 24
  } else if (tall && target.left >= bubble.width + GAP + MARGIN) {
    left = target.left - GAP - bubble.width
    top = target.top + 24
  } else if (vh - bottom >= bubble.height + GAP + MARGIN) {
    top = bottom + GAP
    left = target.left + target.width / 2 - bubble.width / 2
  } else if (target.top >= bubble.height + GAP + MARGIN) {
    top = target.top - GAP - bubble.height
    left = target.left + target.width / 2 - bubble.width / 2
  } else {
    // Huge target (e.g. the bottom panel on a short screen): sit over its top edge.
    top = target.top + MARGIN
    left = target.left + target.width / 2 - bubble.width / 2
  }
  return {
    top: clamp(top, MARGIN, vh - bubble.height - MARGIN),
    left: clamp(left, MARGIN, vw - bubble.width - MARGIN),
  }
}

const POP_MARGIN = 8
const POP_GAP = 8

/**
 * Where to put a help popover (fixed coordinates): below its "?" button when it fits, otherwise
 * above; aligned to the button's start or end edge, then clamped inside the viewport.
 */
export function placePopover(
  anchor: { top: number; left: number; right: number; bottom: number },
  pop: { width: number; height: number },
  vw: number,
  vh: number,
  align: 'start' | 'end',
): { top: number; left: number } {
  const clamp = (v: number, min: number, max: number) =>
    Math.min(Math.max(v, min), Math.max(min, max))
  const below = anchor.bottom + POP_GAP
  const above = anchor.top - POP_GAP - pop.height
  const top =
    below + pop.height <= vh - POP_MARGIN || above < POP_MARGIN
      ? clamp(below, POP_MARGIN, vh - pop.height - POP_MARGIN)
      : above
  const left = align === 'end' ? anchor.right - pop.width : anchor.left
  return { top, left: clamp(left, POP_MARGIN, vw - pop.width - POP_MARGIN) }
}
