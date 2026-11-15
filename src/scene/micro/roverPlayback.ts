import type { TraverseResult } from '../../astro/traverse.ts'

/**
 * Where the rover is DRAWN during the playback of its round trip. The model's route starts and
 * ends on the axis of the lander; the scene cannot put the rover there, so its pose is held
 * where the ramps touch the ground at the start and a little short of them at the end.
 */

/** Clear ground left between the foot of the ramps and the parked rover, m. */
export const PARK_GAP_M = 1.5

/**
 * Time since departure (ms) at which the odometer first reaches `distM`, interpolated between
 * the samples of the result (the rover moves linearly between them). The whole duration if the
 * trip never gets that far.
 */
export function timeAtDistanceMs(r: Pick<TraverseResult, 't' | 'distM'>, distM: number): number {
  const n = r.t.length
  if (!n) return 0
  let lo = 0
  let hi = n
  // First sample at or beyond distM (the odometer never decreases).
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (r.distM[mid] < distM) lo = mid + 1
    else hi = mid
  }
  if (lo === 0) return 0
  if (lo === n) return r.t[n - 1] - r.t[0]
  const d0 = r.distM[lo - 1]
  const f = (distM - d0) / (r.distM[lo] - d0)
  return r.t[lo - 1] + (r.t[lo] - r.t[lo - 1]) * f - r.t[0]
}

/**
 * Span of the clock in which the rover is drawn where the model has it. Before `fromMs` it is
 * held `startM` from the lander (the foot of the ramps); after `toMs`, on the way back, `parkM`
 * from it, so it parks in front of the ramps instead of driving into the lander. One way (or a
 * trip that never gets back that far) there is nothing to hold at the end.
 */
export function poseWindowMs(
  r: Pick<TraverseResult, 't' | 'distM' | 'plan'>,
  startM: number,
  parkM: number,
): { fromMs: number; toMs: number } {
  const { lengthM, outLengthM } = r.plan
  const fromMs = timeAtDistanceMs(r, Math.min(startM, outLengthM))
  const duration = r.t.length ? r.t[r.t.length - 1] - r.t[0] : 0
  const roundTrip = lengthM > outLengthM
  const toMs = roundTrip
    ? timeAtDistanceMs(r, Math.max(outLengthM, lengthM - Math.max(0, parkM)))
    : duration
  return { fromMs, toMs: Math.max(fromMs, toMs) }
}
