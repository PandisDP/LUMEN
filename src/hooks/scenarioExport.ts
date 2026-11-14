import { simulateBattery } from '../astro/energy.ts'
import { encodeProfile } from '../config/energyProfiles.ts'
import { loadSiteDetail } from '../data/catalog.ts'
import { type Scenario, findSite, useMissionStore } from '../store/useMissionStore.ts'
import type { ExportMeta, ExtraColumns } from '../ui/export.ts'
import { runScenario } from '../workers/astroClient.ts'

/**
 * Evaluates a scenario with its own mission settings, outside React, so exports always
 * match what the panels show (same inputs, same worker code) and Compare can export every
 * scenario at once.
 */
export async function evaluateForExport(sc: Scenario) {
  const s = useMissionStore.getState()
  const info = findSite(s.sites, sc.siteId)
  if (!info) throw new Error(`Unknown site ${sc.siteId}`)
  const detail = await loadSiteDetail(info)
  const result = await runScenario({
    site: detail.site,
    mask: detail.mask,
    startMs: sc.startMs,
    missionDays: sc.missionDays,
    linkMarginDeg: sc.linkMarginDeg,
  })
  const meta: ExportMeta = {
    siteId: info.id,
    siteName: info.name,
    lat: detail.site.lat,
    lon: detail.site.lon,
    heightM: detail.site.heightM,
    source: detail.source,
    startMs: sc.startMs,
    missionDays: sc.missionDays,
    linkMarginDeg: sc.linkMarginDeg,
    extra: {
      energy_profile: sc.energyId,
      energy_params_panel_az_peakW_batteryWh_activeW_hibernateW_thresholdPct_initialPct:
        encodeProfile(sc.energy),
    },
  }
  const battery = simulateBattery(result.series, sc.energy)
  const extra: ExtraColumns = {
    array_power_w: battery.powerW,
    battery_soc_pct: battery.socPct,
    operating: battery.active,
  }
  return { info, detail, result, meta, extra }
}
