import { DAY_MS } from './constants.ts'
import type { DateCandidate } from './metrics.ts'

/** Landing-date slips shown, in days (0 = the current date). */
export const SHIFT_DAYS = [-7, -3, -1, 0, 1, 3, 7] as const
/** Days swept on each side of the current date. */
export const SHIFT_SPAN_DAYS = 7

export interface ShiftScore {
  days: number
  startMs: number
  score: number
}

/** Picks the candidates at the listed offsets from a daily sweep that starts 7 days early. */
export function shiftScores(candidates: readonly DateCandidate[], startMs: number): ShiftScore[] {
  return SHIFT_DAYS.flatMap((days) => {
    const c = candidates.find((x) => Math.abs(x.startMs - (startMs + days * DAY_MS)) < 1000)
    return c ? [{ days, startMs: c.startMs, score: c.score }] : []
  })
}
