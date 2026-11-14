/**
 * Hardware-driven viability: the user states what the lander tolerates and every site is
 * marked go / marginal / no-go against it. Answers "the new lander only takes 8° and 50 h of
 * night: which sites are still on the table?" after a hardware change.
 */
export interface HardwareLimits {
  /** Steepest landing slope the lander tolerates (deg), compared with the site's p90. */
  maxSlopeDeg: number
  /** Longest continuous night the craft survives before freezing / running dry (h). */
  maxNightH: number
  /** Minimum share of time with a direct-to-Earth link (%). */
  minDtePct: number
  /** Steepest slope a rover can drive on the way to the ice (deg). */
  roverMaxSlopeDeg: number
}

export const DEFAULT_LIMITS: HardwareLimits = {
  maxSlopeDeg: 15,
  maxNightH: 120,
  minDtePct: 30,
  roverMaxSlopeDeg: 20,
}

export const LIMIT_RANGES: Record<keyof HardwareLimits, { min: number; max: number }> = {
  maxSlopeDeg: { min: 1, max: 30 },
  maxNightH: { min: 1, max: 720 },
  minDtePct: { min: 0, max: 100 },
  roverMaxSlopeDeg: { min: 5, max: 35 },
}

export interface SiteFigures {
  slopeP90Deg?: number
  longestDarkH: number
  dtePct: number
}

export type Constraint = 'slope' | 'night' | 'dte'
export type Verdict = 'good' | 'warn' | 'bad'

export interface Viability {
  verdict: Verdict
  /** Limits exceeded (any → 'bad'). */
  failed: Constraint[]
  /** Limits met with less than `MARGIN` to spare (→ 'warn' when nothing failed). */
  tight: Constraint[]
}

/** Relative headroom under which a satisfied limit is flagged as tight. */
export const MARGIN = 0.2

export function classifySite(limits: HardwareLimits, f: SiteFigures): Viability {
  const failed: Constraint[] = []
  const tight: Constraint[] = []
  const upper = (k: Constraint, value: number | undefined, max: number) => {
    if (value === undefined || !Number.isFinite(value)) return
    if (value > max) failed.push(k)
    else if (value > max * (1 - MARGIN)) tight.push(k)
  }
  upper('slope', f.slopeP90Deg, limits.maxSlopeDeg)
  upper('night', f.longestDarkH, limits.maxNightH)
  if (f.dtePct < limits.minDtePct) failed.push('dte')
  else if (f.dtePct < Math.min(100, limits.minDtePct * (1 + MARGIN))) tight.push('dte')
  return { verdict: failed.length ? 'bad' : tight.length ? 'warn' : 'good', failed, tight }
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** Validated, clamped copy (unknown or non-numeric fields keep their previous value). */
export function sanitizeLimits(
  patch: Partial<Record<keyof HardwareLimits, unknown>>,
  base: HardwareLimits = DEFAULT_LIMITS,
): HardwareLimits {
  const out = { ...base }
  for (const k of Object.keys(LIMIT_RANGES) as (keyof HardwareLimits)[]) {
    const v = Number(patch[k])
    if (patch[k] !== undefined && patch[k] !== '' && Number.isFinite(v)) {
      out[k] = clamp(v, LIMIT_RANGES[k].min, LIMIT_RANGES[k].max)
    }
  }
  return out
}

/** URL form: "slope,night,dte,rover". */
export const encodeLimits = (l: HardwareLimits) =>
  [l.maxSlopeDeg, l.maxNightH, l.minDtePct, l.roverMaxSlopeDeg].join(',')

export function decodeLimits(s: string): HardwareLimits | null {
  const [maxSlopeDeg, maxNightH, minDtePct, roverMaxSlopeDeg] = s.split(',')
  if (minDtePct === undefined) return null
  return sanitizeLimits({ maxSlopeDeg, maxNightH, minDtePct, roverMaxSlopeDeg })
}
