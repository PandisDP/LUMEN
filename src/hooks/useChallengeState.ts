import { useMemo } from 'react'
import { classifySite } from '../astro/hardware.ts'
import { type Challenge, type ChallengeState, CHALLENGES } from '../config/challenges.ts'
import { useDescentStore } from '../store/useDescentStore.ts'
import { selectActiveScenario, useMissionStore } from '../store/useMissionStore.ts'
import { useRoverStore } from '../store/useRoverStore.ts'
import { useUiStore } from '../store/useUiStore.ts'
import { useRoverTraverse } from './useRover.ts'
import { useScenarioData } from './useScenario.ts'

/**
 * Snapshot the challenge goals are checked against, read from what the panels already compute
 * (no extra astronomy). Figures that are still loading are left undefined rather than stale, so
 * a goal is never met by the numbers of the previous site or date.
 */
export function useChallengeState(needsRover = false): ChallengeState {
  const scenario = useMissionStore(selectActiveScenario)
  const view = useMissionStore((s) => s.view)
  const scenarios = useMissionStore((s) => s.scenarios.length)
  const compareOpen = useMissionStore((s) => s.compareOpen)
  const { info, result, loading } = useScenarioData(scenario)
  const traverse = useRoverTraverse(needsRover)
  const landed = useDescentStore((s) => s.landed)
  const flight = useDescentStore((s) => s.flight)
  const vehicleId = useDescentStore((s) => s.vehicleId)

  const m = loading ? undefined : result?.metrics
  const limits = scenario.hardwareLimits
  const slopeP90Deg = info?.slopeP90Deg
  const iceData = traverse.ice.loading ? undefined : traverse.ice.data
  const ice = iceData ?? (traverse.ice.available ? undefined : info?.ice)
  const rover = traverse.data?.summary
  const sum = flight.summary

  return useMemo<ChallengeState>(
    () => ({
      siteId: scenario.siteId,
      lat: info?.lat,
      lon: info?.lon,
      startMs: scenario.startMs,
      missionDays: scenario.missionDays,
      view,
      scenarios,
      compareOpen,
      metrics: m && {
        sunlitPct: m.sunlitPct,
        energyPct: m.energyPct,
        dtePct: m.dtePct,
        longestDarkH: m.longestDarkH,
        longestLightH: m.longestLightH,
        score: m.score,
      },
      verdict:
        m &&
        classifySite(limits, { slopeP90Deg, longestDarkH: m.longestDarkH, dtePct: m.dtePct })
          .verdict,
      slopeP90Deg,
      ice: ice && { reachable: ice.reachable, routeM: ice.routeM, insidePsr: ice.insidePsr },
      rover: rover && { reaches: rover.reaches, minSocPct: rover.minSocPct },
      descent: {
        landed,
        physics: flight.flown === 'physics',
        ok: sum?.ok ?? false,
        propMarginPct: sum?.propMarginPct,
        dvMs: sum?.dvMs,
        vehicleId,
      },
    }),
    [
      scenario.siteId,
      scenario.startMs,
      scenario.missionDays,
      info,
      view,
      scenarios,
      compareOpen,
      m,
      limits,
      slopeP90Deg,
      ice,
      rover,
      landed,
      flight.flown,
      sum,
      vehicleId,
    ],
  )
}

/** Opens the "Retos" overlay on top of the app (the other overlays close). */
export function openChallenges() {
  const m = useMissionStore.getState()
  m.setExplainOpen(false)
  m.setCompareOpen(false)
  m.setHardwareOpen(false)
  useUiStore.getState().setChallengesOpen(true)
}

/** Puts the app in the challenge's starting state and makes it the one in progress. */
export function startChallenge(c: Challenge) {
  c.setup({
    mission: useMissionStore.getState(),
    descent: useDescentStore.getState(),
    rover: useRoverStore.getState(),
  })
  useUiStore.getState().setChallenge(c.id)
}

/** Number of challenges with a stored best score. */
export const useChallengesDone = () =>
  useUiStore((s) => CHALLENGES.filter((c) => s.challengeDone[c.id] !== undefined).length)
