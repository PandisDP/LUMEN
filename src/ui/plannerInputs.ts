import { useMemo } from 'react'
import type { HardwareLimits } from '../astro/hardware.ts'
import type { PlanProblem } from '../astro/plannerTypes.ts'
import type { RoverId } from '../astro/traverse.ts'
import type { IceTargetOption } from '../config/iceTargets.ts'
import { type TileRef, polarTiles } from '../data/catalog.ts'
import { useAsync } from '../hooks/useAsync.ts'
import { buildProblem, runPlan } from '../hooks/usePlanner.ts'
import { useMissionStore } from '../store/useMissionStore.ts'
import { type PlannerState, usePlannerStore } from '../store/usePlannerStore.ts'
import { useRoverStore } from '../store/useRoverStore.ts'
import { clampDays, clampFrom, utcMidnight } from './plannerView.ts'

/**
 * What the planner screen reads from the stores: the published 20 m tiles (for the map) and the
 * problem as it stands on screen (null while incomplete).
 */

export const KINDS: readonly IceTargetOption['kind'][] = ['near-site', 'psr-floor']

export const sameTarget = (
  a: { lat: number; lon: number } | null,
  b: { lat: number; lon: number },
) => !!a && Math.abs(a.lat - b.lat) < 1e-6 && Math.abs(a.lon - b.lon) < 1e-6

/** Tiles fine enough to plan on: the 20 m LOLA polar tiles (not the 60 m reference ones). */
const PLAN_TILE_MAX_SCALE_M = 20

export function usePlanTiles(): TileRef[] | undefined {
  const { data } = useAsync('plan-tiles', polarTiles)
  return useMemo(() => data?.filter((t) => t.meta.scaleM <= PLAN_TILE_MAX_SCALE_M), [data])
}

/** First day of the range: the stored one, or today (UTC) until the user chooses. */
export const effectiveFromMs = (fromMs: number | null, days: number, nowMs = Date.now()) =>
  clampFrom(fromMs ?? utcMidnight(nowMs), days)

interface MissionInputs {
  missionDays: number
  hardwareLimits: HardwareLimits
  linkMarginDeg: number
  requireDsn: boolean
  scienceWeight: number
}

type PlannerInputs = Pick<
  PlannerState,
  'target' | 'tileSiteId' | 'fromMs' | 'days' | 'minSunDays' | 'minRoverSocPct' | 'radiusM'
>

export function assembleProblem(
  p: PlannerInputs,
  m: MissionInputs,
  roverId: RoverId,
  nowMs = Date.now(),
): PlanProblem | null {
  if (!p.target || !p.tileSiteId) return null
  const days = clampDays(p.days)
  return {
    target: p.target,
    tileSiteId: p.tileSiteId,
    fromMs: effectiveFromMs(p.fromMs, days, nowMs),
    days,
    missionDays: m.missionDays,
    minSunDays: p.minSunDays,
    roverId,
    minRoverSocPct: p.minRoverSocPct,
    radiusM: p.radiusM,
    hardware: { ...m.hardwareLimits },
    linkMarginDeg: m.linkMarginDeg,
    requireDsn: m.requireDsn,
    scienceWeight: m.scienceWeight,
  }
}

/** The problem on screen, live (for "disabled because…" and the stale badge). */
export function usePlanProblem(): PlanProblem | null {
  const target = usePlannerStore((s) => s.target)
  const tileSiteId = usePlannerStore((s) => s.tileSiteId)
  const fromMs = usePlannerStore((s) => s.fromMs)
  const days = usePlannerStore((s) => s.days)
  const minSunDays = usePlannerStore((s) => s.minSunDays)
  const minRoverSocPct = usePlannerStore((s) => s.minRoverSocPct)
  const radiusM = usePlannerStore((s) => s.radiusM)
  const missionDays = useMissionStore((s) => s.missionDays)
  const hardwareLimits = useMissionStore((s) => s.hardwareLimits)
  const linkMarginDeg = useMissionStore((s) => s.linkMarginDeg)
  const requireDsn = useMissionStore((s) => s.requireDsn)
  const scienceWeight = useMissionStore((s) => s.scienceWeight)
  const roverId = useRoverStore((s) => s.roverId)
  return useMemo(
    () =>
      assembleProblem(
        { target, tileSiteId, fromMs, days, minSunDays, minRoverSocPct, radiusM },
        { missionDays, hardwareLimits, linkMarginDeg, requireDsn, scienceWeight },
        roverId,
      ),
    [
      target,
      tileSiteId,
      fromMs,
      days,
      minSunDays,
      minRoverSocPct,
      radiusM,
      missionDays,
      hardwareLimits,
      linkMarginDeg,
      requireDsn,
      scienceWeight,
      roverId,
    ],
  )
}

/** Launches (or re-launches) the plan with what is on screen. */
export function launchPlan(): boolean {
  const s = usePlannerStore.getState()
  // Fix the default start date, so the inputs and the results keep agreeing tomorrow.
  const days = clampDays(s.days)
  const fromMs = effectiveFromMs(s.fromMs, days)
  if (s.fromMs !== fromMs || s.days !== days) s.setRange(fromMs, days)
  const built = buildProblem()
  if (!built.ok) return false
  s.selectDay(null)
  void runPlan(built.problem)
  return true
}
