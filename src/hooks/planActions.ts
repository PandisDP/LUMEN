import type { PlanResult } from '../astro/plannerTypes.ts'
import { customSiteInfo } from '../data/catalog.ts'
import { useMissionStore } from '../store/useMissionStore.ts'
import { useRoverStore } from '../store/useRoverStore.ts'
import { useUiStore } from '../store/useUiStore.ts'

const pickOf = (result: PlanResult, dayMs: number) =>
  result.days.find((d) => d.dayMs === dayMs && d.best)

/**
 * Opens the planner's pick for a day as the active scenario (landing point as a custom site on
 * the 20 m tile, landing date, mission length, rover and ice target) and moves on to the Orbit
 * step. From there the usual flow leads to Surface and Landing.
 */
export function openPlanDay(result: PlanResult, dayMs: number): boolean {
  const day = pickOf(result, dayMs)
  if (!day?.best) return false
  const { problem } = result
  const s = useMissionStore.getState()
  const site = customSiteInfo(day.best.lat, day.best.lon)
  s.addCustomSite(site)
  s.updateScenario(useMissionStore.getState().activeId, {
    siteId: site.id,
    startMs: day.dayMs,
    missionDays: problem.missionDays,
    iceTarget: problem.target,
  })
  useRoverStore.getState().setRover(problem.roverId)
  s.setCompareOpen(false)
  s.setView('macro')
  useUiStore.getState().setStage('explore')
  return true
}

/** Loads up to four of the planner's picks into Compare (the Decide step). */
export function comparePlanDays(result: PlanResult, daysMs: readonly number[]): boolean {
  const { problem } = result
  const picks = daysMs.flatMap((ms) => {
    const day = pickOf(result, ms)
    return day?.best ? [{ day, site: customSiteInfo(day.best.lat, day.best.lon) }] : []
  })
  if (!picks.length) return false
  const s = useMissionStore.getState()
  const known = new Set(s.sites.map((x) => x.id))
  const extra = picks.map((p) => p.site).filter((x) => !known.has(x.id))
  if (extra.length)
    s.setSites([...s.sites, ...extra.filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i)])
  const ok = useMissionStore.getState().setScenarios(
    picks.slice(0, 4).map((p) => ({
      siteId: p.site.id,
      startMs: p.day.dayMs,
      missionDays: problem.missionDays,
      iceTarget: problem.target,
    })),
    0,
  )
  if (!ok) return false
  useRoverStore.getState().setRover(problem.roverId)
  useMissionStore.getState().setCompareOpen(true)
  useUiStore.getState().setStage('explore')
  return true
}
