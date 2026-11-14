import { type HorizonMask, maskAt } from '../astro/horizon.ts'
import { type ScenarioMetrics, VISIBLE_THRESHOLD } from '../astro/metrics.ts'
import { type SiteSeries, sampleTime } from '../astro/series.ts'
import type { Interval } from '../astro/windows.ts'

/**
 * Engineering exports: the active scenario's time series and horizon, as plain CSV (one row
 * per sample, `#` metadata header) or JSON (columnar, ready for pandas / MATLAB / Excel).
 */
export interface ExportMeta {
  siteId: string
  siteName: string
  lat: number
  lon: number
  heightM: number
  source: string
  startMs: number
  missionDays: number
  linkMarginDeg: number
  /** Free-form extra settings (e.g. the energy profile), written to the header as-is. */
  extra?: Record<string, string | number>
}

/** Additional per-sample columns (e.g. battery state of charge), same length as the series. */
export type ExtraColumns = Record<string, ArrayLike<number>>

const iso = (ms: number) => new Date(ms).toISOString()
const num = (v: number, digits = 4) => (Number.isFinite(v) ? Number(v.toFixed(digits)) : null)
/** Integer typed arrays (flags, counts) are written without decimals. */
const extraDigits = (a: ArrayLike<number>) =>
  a instanceof Uint8Array || a instanceof Int32Array || a instanceof Uint32Array ? 0 : 2
const csvCell = (v: number, digits = 4) => (Number.isFinite(v) ? v.toFixed(digits) : '')

function metaLines(meta: ExportMeta, series: SiteSeries): string[] {
  const lines = [
    'LUMEN 3D export',
    `site: ${meta.siteName} (${meta.siteId})`,
    `lat_deg: ${meta.lat}`,
    `lon_deg: ${meta.lon}`,
    `terrain_height_m: ${meta.heightM}`,
    `horizon_source: ${meta.source}`,
    `landing_utc: ${iso(meta.startMs)}`,
    `mission_days: ${meta.missionDays}`,
    `step_minutes: ${series.stepMs / 60_000}`,
    `visible_threshold_disc_fraction: ${VISIBLE_THRESHOLD}`,
    `dte_link_margin_deg: ${meta.linkMarginDeg}`,
  ]
  for (const [k, v] of Object.entries(meta.extra ?? {})) lines.push(`${k}: ${v}`)
  return lines
}

/** Per-sample derived values shared by the CSV and JSON exports. */
function sampleRow(series: SiteSeries, mask: HorizonMask, i: number) {
  const sunlit = series.sunFrac[i] >= VISIBLE_THRESHOLD
  const dte = series.earthFrac[i] >= VISIBLE_THRESHOLD
  return {
    sunHorizon: maskAt(mask, series.sunAz[i]),
    earthHorizon: maskAt(mask, series.earthAz[i]),
    sunlit,
    dte,
    both: sunlit && dte,
  }
}

export const SERIES_COLUMNS = [
  'utc_iso',
  'sun_az_deg',
  'sun_el_deg',
  'sun_horizon_el_deg',
  'sun_frac',
  'earth_az_deg',
  'earth_el_deg',
  'earth_horizon_el_deg',
  'earth_frac',
  'sunlit',
  'dte',
  'both',
] as const

export function seriesToCsv(
  series: SiteSeries,
  mask: HorizonMask,
  meta: ExportMeta,
  extra: ExtraColumns = {},
): string {
  const extraNames = Object.keys(extra)
  const out = metaLines(meta, series).map((l) => `# ${l}`)
  out.push([...SERIES_COLUMNS, ...extraNames].join(','))
  for (let i = 0; i < series.count; i++) {
    const r = sampleRow(series, mask, i)
    const cells = [
      iso(sampleTime(series, i)),
      csvCell(series.sunAz[i], 3),
      csvCell(series.sunEl[i]),
      csvCell(r.sunHorizon),
      csvCell(series.sunFrac[i]),
      csvCell(series.earthAz[i], 3),
      csvCell(series.earthEl[i]),
      csvCell(r.earthHorizon),
      csvCell(series.earthFrac[i]),
      r.sunlit ? '1' : '0',
      r.dte ? '1' : '0',
      r.both ? '1' : '0',
      ...extraNames.map((n) => csvCell(extra[n][i], extraDigits(extra[n]))),
    ]
    out.push(cells.join(','))
  }
  return out.join('\n') + '\n'
}

const windowsJson = (w: readonly Interval[]) =>
  w.map((x) => ({
    start: iso(x.startMs),
    end: iso(x.endMs),
    hours: num((x.endMs - x.startMs) / 3_600_000, 2),
    openStart: x.openStart,
    openEnd: x.openEnd,
  }))

/** Plain object (not yet stringified) so several scenarios can be bundled in one file. */
export function scenarioToJsonObject(
  series: SiteSeries,
  mask: HorizonMask,
  metrics: ScenarioMetrics,
  meta: ExportMeta,
  extra: ExtraColumns = {},
) {
  const rows = Array.from({ length: series.count }, (_, i) => sampleRow(series, mask, i))
  const col = (a: ArrayLike<number>, digits = 4) => Array.from(a, (v) => num(v, digits))
  const { sunWindows, dteWindows, ...summary } = metrics
  return {
    meta: {
      ...meta,
      landingUtc: iso(meta.startMs),
      stepMinutes: series.stepMs / 60_000,
      visibleThreshold: VISIBLE_THRESHOLD,
    },
    metrics: {
      ...summary,
      from: iso(metrics.fromMs),
      to: iso(metrics.toMs),
      sunWindows: windowsJson(sunWindows),
      dteWindows: windowsJson(dteWindows),
    },
    series: {
      utc: Array.from({ length: series.count }, (_, i) => iso(sampleTime(series, i))),
      sunAzDeg: col(series.sunAz, 3),
      sunElDeg: col(series.sunEl),
      sunHorizonElDeg: rows.map((r) => num(r.sunHorizon)),
      sunFrac: col(series.sunFrac),
      earthAzDeg: col(series.earthAz, 3),
      earthElDeg: col(series.earthEl),
      earthHorizonElDeg: rows.map((r) => num(r.earthHorizon)),
      earthFrac: col(series.earthFrac),
      sunlit: rows.map((r) => r.sunlit),
      dte: rows.map((r) => r.dte),
      both: rows.map((r) => r.both),
      ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, col(v, extraDigits(v))])),
    },
  }
}

export function horizonToCsv(
  mask: HorizonMask,
  meta: ExportMeta,
  obstructionKm?: number[],
): string {
  const out = [
    '# LUMEN 3D horizon profile',
    `# site: ${meta.siteName} (${meta.siteId})`,
    `# lat_deg: ${meta.lat}`,
    `# lon_deg: ${meta.lon}`,
    `# horizon_source: ${meta.source}`,
    `# azimuth: degrees clockwise from north; elevation includes lunar curvature`,
    obstructionKm?.length ? 'az_deg,elev_deg,obstruction_km' : 'az_deg,elev_deg',
  ]
  const n = mask.elevDeg.length
  for (let k = 0; k < n; k++) {
    const cells = [(k * mask.azStepDeg).toFixed(2), csvCell(mask.elevDeg[k])]
    if (obstructionKm?.length) cells.push(csvCell(obstructionKm[k] ?? NaN, 2))
    out.push(cells.join(','))
  }
  return out.join('\n') + '\n'
}

/** Safe file-name stem, e.g. lumen3d_shackleton-rim_2027-03-01. */
export function exportFileStem(siteId: string, startMs: number) {
  const id = siteId.replace(/[^a-z0-9.-]+/gi, '_')
  return `lumen3d_${id}_${iso(startMs).slice(0, 10)}`
}

/** Hands the browser a text file to save. */
export function downloadText(fileName: string, mime: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
