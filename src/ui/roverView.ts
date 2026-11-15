import { roverViolation } from '../astro/planner.ts'
import {
  type RoverId,
  SAMPLING_LIMITS,
  type TraverseLeg,
  type TraversePhase,
  type TraverseResult,
  type TraverseSummary,
} from '../astro/traverse.ts'
import { BAND_GLYPH, type BandState } from './bands.ts'
import type { Level } from './levels.ts'

/**
 * Reading of the rover's round trip for the HUD of the 3D view and the ice card: which state to
 * show at an instant, how the whole mission went and what would fix it. Pure (no React, no
 * stores): the components only turn these into text.
 */

/** How the whole mission ends: fine, fine but under the minimum battery, or why it fails. */
export type RoverOutcome =
  'ok' | 'low-battery' | 'no-route' | 'battery-out' | 'samples' | 'no-return' | 'late'

/**
 * Verdict of a simulated round trip. `success` in the summary does not look at the minimum
 * battery, so it is checked here against the planner's minimum (the same rule as the planner).
 */
export function roverOutcome(s: TraverseSummary, minSocPct: number): RoverOutcome {
  switch (roverViolation(s, minSocPct)) {
    case 'rover-unreachable':
      return s.reason === 'no-route' ? 'no-route' : 'battery-out'
    case 'rover-samples':
      return 'samples'
    case 'rover-no-return':
      return 'no-return'
    case 'rover-late':
      return 'late'
    case 'rover-battery':
      return 'low-battery'
    default:
      return 'ok'
  }
}

export const outcomeLevel = (o: RoverOutcome): Level =>
  o === 'ok' ? 'good' : o === 'low-battery' ? 'warn' : 'bad'

/** What the state chip of the HUD says. */
export type RoverStateKey =
  'out' | 'wait' | 'sample' | 'back' | 'done' | 'fail-battery' | 'fail-samples' | 'fail-late'

/**
 * State of the trip at an instant of the playback. While it runs it is the phase of the model;
 * once the clock is at its end it is how the trip ended: back at the lander, or the reason it
 * failed (a trip that died on the way or at the ice ends in 'wait' or 'sample', and one that
 * came back late ends in 'done', so the phase alone would not say it).
 */
export function roverStateKey(
  phase: TraversePhase,
  ended: boolean,
  summary: Pick<TraverseSummary, 'reason'>,
): RoverStateKey {
  if (ended || phase === 'done') {
    if (summary.reason === 'samples') return 'fail-samples'
    if (summary.reason === 'late') return 'fail-late'
    if (summary.reason) return 'fail-battery'
    return 'done'
  }
  return phase
}

/** Band of a state (the chip shows its glyph and colour; plain while under way). */
export const stateBand = (key: RoverStateKey): BandState | null =>
  key === 'done' ? 'ok' : key.startsWith('fail-') ? 'deficit' : null

export const stateGlyph = (key: RoverStateKey): string => {
  const band = stateBand(key)
  return band ? BAND_GLYPH[band] : ''
}

/**
 * Where the rover is along the OUTBOUND route, m from the lander: the odometer on the way out,
 * mirrored at the ice on the way back (2 · out − driven), so the cursor of the elevation
 * profile travels to the turn-around point and comes back.
 */
export function profileCursorM(distM: number, outLengthM: number): number {
  if (!Number.isFinite(distM) || !(outLengthM > 0)) return 0
  const along = distM <= outLengthM ? distM : 2 * outLengthM - distM
  return Math.min(outLengthM, Math.max(0, along))
}

/** Distance left of the leg under way: to the ice on the way out, to the lander on the way back. */
export function legRemaining(
  distM: number,
  outLengthM: number,
  leg: TraverseLeg,
): { to: 'ice' | 'lander'; m: number } {
  if (!Number.isFinite(distM) || !Number.isFinite(outLengthM)) return { to: 'ice', m: NaN }
  return leg === 'back'
    ? { to: 'lander', m: Math.max(0, 2 * outLengthM - distM) }
    : { to: 'ice', m: Math.max(0, outLengthM - distM) }
}

/** "●●○": one mark per sample asked for, filled as they are completed. */
export function sampleDots(done: number, total: number): string {
  const n = Math.max(0, Math.round(total))
  const d = Math.min(n, Math.max(0, Math.round(done)))
  return '●'.repeat(d) + '○'.repeat(n - d)
}

/**
 * Instants worth a tick on the progress slider, ms since departure: arrival at the ice and the
 * moment the rover leaves it (null when the trip never gets that far).
 */
export function tripMarks(r: Pick<TraverseResult, 't' | 'phase' | 'summary'>): {
  arrivalMs: number | null
  leaveMs: number | null
} {
  const t0 = r.t[0]
  const arrival = r.summary.arrivalMs
  const back = r.phase.indexOf('back')
  return {
    arrivalMs: arrival === null || t0 === undefined ? null : arrival - t0,
    leaveMs: back < 0 ? null : r.t[back] - t0,
  }
}

/** A change of the inputs that can turn a failed trip into a good one. */
export type RoverFix = 'fewerSamples' | 'shorterSamples' | 'utilityRover'

/**
 * Fixes offered for an outcome, most direct first: less work at the ice (fewer samples; once
 * there is one left, less time for it) and the rover with the bigger battery. Dying before the
 * ice has nothing to do with the sampling, and without a route no input of the rover helps.
 */
export function roverFixes(
  outcome: RoverOutcome,
  inputs: { roverId: RoverId; samples: number; sampleH: number },
): RoverFix[] {
  if (outcome === 'ok' || outcome === 'no-route') return []
  const fixes: RoverFix[] = []
  if (outcome !== 'battery-out') {
    if (inputs.samples > SAMPLING_LIMITS.samples.min) fixes.push('fewerSamples')
    else if (inputs.sampleH > SAMPLING_LIMITS.sampleH.min) fixes.push('shorterSamples')
  }
  if (inputs.roverId === 'rover') fixes.push('utilityRover')
  return fixes
}
