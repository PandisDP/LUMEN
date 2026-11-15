import { useMemo } from 'react'
import { HOUR_MS } from '../astro/constants.ts'
import { type EnergyProfile, simulateBattery } from '../astro/energy.ts'
import type { SiteSeries } from '../astro/series.ts'
import { instantState } from '../astro/instant.ts'
import { thermalSeries } from '../astro/thermal.ts'
import { loadSiteDetail } from '../data/catalog.ts'
import {
  type Scenario,
  findSite,
  selectActiveScenario,
  useMissionStore,
} from '../store/useMissionStore.ts'
import { runScenario } from '../workers/astroClient.ts'
import { useAsync } from './useAsync.ts'

/** Site info + horizon + evaluated time series for one scenario. */
export function useScenarioData(scenario: Scenario) {
  const sites = useMissionStore((s) => s.sites)
  const { missionDays, linkMarginDeg, requireDsn } = scenario
  const info = findSite(sites, scenario.siteId)

  const detail = useAsync(info ? `detail:${info.id}` : null, () => loadSiteDetail(info!))
  const ready = detail.data && !detail.loading
  const resultKey =
    ready && info
      ? `${info.id}|${scenario.startMs}|${missionDays}|${linkMarginDeg}|${requireDsn}`
      : null
  const result = useAsync(resultKey, () =>
    runScenario({
      site: detail.data!.site,
      mask: detail.data!.mask,
      startMs: scenario.startMs,
      missionDays,
      linkMarginDeg,
      requireDsn,
    }),
  )

  return {
    info,
    detail: ready ? detail.data : undefined,
    result: result.data,
    loading: detail.loading || result.loading,
    error: detail.error ?? result.error,
    /** Tries again whatever failed: the site's files, or the evaluation. */
    retry: detail.error ? detail.retry : result.retry,
  }
}

/**
 * Battery state of charge over a series (cheap: main thread). `energy` defaults to the active
 * scenario's profile; Compare passes each scenario's own.
 */
export function useBattery(series: SiteSeries | undefined, energy?: EnergyProfile) {
  const active = useMissionStore((s) => s.energy)
  const profile = energy ?? active
  return useMemo(() => (series ? simulateBattery(series, profile) : undefined), [series, profile])
}

export function useActiveScenario() {
  return useMissionStore(selectActiveScenario)
}

/** Exact Sun/Earth state at the shared mission time for a scenario. */
export function useInstant(scenario: Scenario) {
  const data = useScenarioData(scenario)
  const offsetH = useMissionStore((s) => s.offsetH)
  const { linkMarginDeg } = scenario
  const timeMs = scenario.startMs + offsetH * HOUR_MS
  const { detail, result } = data
  const instant = useMemo(
    () =>
      detail
        ? instantState(
            detail.site,
            detail.mask,
            timeMs,
            result?.metrics.sunWindows,
            result?.metrics.dteWindows,
            linkMarginDeg,
          )
        : undefined,
    [detail, result, timeMs, linkMarginDeg],
  )
  return { ...data, instant, timeMs }
}

/** Radiative temperature estimate along the scenario series (cheap: main thread). */
export function useThermal(series: SiteSeries | undefined, freezeK?: number) {
  return useMemo(
    () => (series ? thermalSeries(series, freezeK ? { freezeK } : undefined) : undefined),
    [series, freezeK],
  )
}
