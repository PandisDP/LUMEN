/**
 * Turns a sampled visibility signal (0..1) into time windows where it is "on".
 * Edges are refined by linear interpolation between samples, so a 10 min grid gives
 * sunrise/sunset times good to about a minute.
 */
export interface Interval {
  startMs: number
  endMs: number
  /** The window was already open when the series starts (true start unknown). */
  openStart: boolean
  /** The window is still open when the series ends (true end unknown). */
  openEnd: boolean
}

export interface Signal {
  startMs: number
  stepMs: number
  values: ArrayLike<number>
}

export function findWindows(signal: Signal, threshold = 0.5, i0 = 0, i1 = signal.values.length) {
  const { startMs, stepMs, values } = signal
  const out: Interval[] = []
  if (i1 <= i0) return out
  const t = (i: number) => startMs + i * stepMs
  const cross = (i: number) => {
    // Crossing between sample i-1 and i.
    const a = values[i - 1] - threshold
    const b = values[i] - threshold
    const f = a === b ? 0.5 : a / (a - b)
    return t(i - 1) + f * stepMs
  }
  let on = values[i0] >= threshold
  let start = t(i0)
  let openStart = on
  for (let i = i0 + 1; i < i1; i++) {
    const now = values[i] >= threshold
    if (now === on) continue
    const edge = cross(i)
    if (now) {
      start = edge
      openStart = false
    } else {
      out.push({ startMs: start, endMs: edge, openStart, openEnd: false })
    }
    on = now
  }
  if (on) out.push({ startMs: start, endMs: t(i1 - 1), openStart, openEnd: true })
  return out
}

/** Gaps between windows inside [fromMs, toMs]: the complement of `windows`. */
export function complement(windows: readonly Interval[], fromMs: number, toMs: number): Interval[] {
  const out: Interval[] = []
  let cursor = fromMs
  let cursorOpen = true
  for (const w of windows) {
    if (w.startMs > cursor) {
      out.push({ startMs: cursor, endMs: w.startMs, openStart: cursorOpen, openEnd: false })
    }
    cursor = w.endMs
    cursorOpen = false
    if (w.openEnd) return out
  }
  if (cursor < toMs)
    out.push({ startMs: cursor, endMs: toMs, openStart: cursorOpen, openEnd: true })
  return out
}

export interface StateAt {
  on: boolean
  /** Time of the next change of state, or null if it does not happen inside the series. */
  nextChangeMs: number | null
}

export function stateAt(windows: readonly Interval[], tMs: number): StateAt {
  for (const w of windows) {
    if (tMs < w.startMs) return { on: false, nextChangeMs: w.startMs }
    if (tMs < w.endMs || (w.openEnd && tMs <= w.endMs)) {
      return { on: true, nextChangeMs: w.openEnd ? null : w.endMs }
    }
  }
  return { on: false, nextChangeMs: null }
}

export const durationMs = (w: Interval) => w.endMs - w.startMs

export function longest(windows: readonly Interval[]): Interval | null {
  let best: Interval | null = null
  for (const w of windows) if (!best || durationMs(w) > durationMs(best)) best = w
  return best
}
