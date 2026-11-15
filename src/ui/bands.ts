import type { Level } from './levels.ts'

/**
 * Band states of the design system. A state never travels in colour alone: glyph + colour +
 * a label in text. `Level` (good / warn / bad) is the app's three-step reading of a figure and
 * maps onto the bands: good → in band, warn ("at the limit") → excess, bad → deficit.
 */
export type BandState = 'ok' | 'deficit' | 'excess' | 'stopped' | 'idle' | 'none'

export const BAND_GLYPH: Record<BandState, string> = {
  ok: '✓',
  deficit: '▼',
  excess: '▲',
  stopped: '■',
  idle: '○',
  none: '·',
}

export const LEVEL_BAND: Record<Level, BandState> = { good: 'ok', warn: 'excess', bad: 'deficit' }

export const LEVEL_GLYPH: Record<Level, string> = {
  good: BAND_GLYPH.ok,
  warn: BAND_GLYPH.excess,
  bad: BAND_GLYPH.deficit,
}

export type NoticeTone = 'warning' | 'note' | 'success' | 'error'

/** The glyph that says the tone without its colour. */
export const NOTICE_GLYPH: Record<NoticeTone, string> = {
  warning: BAND_GLYPH.excess,
  note: 'ℹ',
  success: BAND_GLYPH.ok,
  error: BAND_GLYPH.deficit,
}

/** A button offered by a notice or an empty state: when it reports a problem, this is the fix. */
export interface KitAction {
  label: string
  onClick: () => void
  disabled?: boolean
}

export const kitActions = (action: KitAction | readonly KitAction[] | undefined): KitAction[] =>
  !action
    ? []
    : Array.isArray(action)
      ? [...(action as readonly KitAction[])]
      : [action as KitAction]
