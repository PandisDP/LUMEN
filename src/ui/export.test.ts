import { describe, expect, it } from 'vitest'
import { sphericalMask } from '../astro/horizon.ts'
import { VISIBLE_THRESHOLD } from '../astro/metrics.ts'
import { computeScenario } from '../astro/scenario.ts'
import {
  type ExportMeta,
  SERIES_COLUMNS,
  exportFileStem,
  horizonToCsv,
  scenarioToJsonObject,
  seriesToCsv,
} from './export.ts'

const mask = sphericalMask()
const startMs = Date.UTC(2026, 0, 1)
const { series, metrics } = computeScenario({
  site: { lat: -89.5, lon: 0, heightM: 0 },
  mask,
  startMs,
  missionDays: 3,
  stepMinutes: 60,
})
const meta: ExportMeta = {
  siteId: 'test-site',
  siteName: 'Test',
  lat: -89.5,
  lon: 0,
  heightM: 0,
  source: 'spherical',
  startMs,
  missionDays: 3,
  linkMarginDeg: 0,
}

describe('seriesToCsv', () => {
  const csv = seriesToCsv(series, mask, meta, { battery_soc_pct: new Float32Array(series.count) })
  const lines = csv.trim().split('\n')
  const header = lines.find((l) => !l.startsWith('#'))!
  const rows = lines.filter((l) => !l.startsWith('#')).slice(1)

  it('has a metadata header, the column header and one row per sample', () => {
    expect(lines[0]).toBe('# Killa Landing export')
    expect(csv).toContain('# dte_link_margin_deg: 0')
    expect(header).toBe([...SERIES_COLUMNS, 'battery_soc_pct'].join(','))
    expect(rows).toHaveLength(series.count)
    expect(rows[0].split(',')).toHaveLength(SERIES_COLUMNS.length + 1)
  })

  it('booleans agree with the visible fractions', () => {
    rows.forEach((row, i) => {
      const c = row.split(',')
      expect(c[9]).toBe(series.sunFrac[i] >= VISIBLE_THRESHOLD ? '1' : '0')
      expect(c[10]).toBe(series.earthFrac[i] >= VISIBLE_THRESHOLD ? '1' : '0')
      expect(c[11]).toBe(c[9] === '1' && c[10] === '1' ? '1' : '0')
    })
  })
})

describe('scenarioToJsonObject', () => {
  it('is columnar, aligned with the series, and round-trips through JSON', () => {
    const obj = JSON.parse(JSON.stringify(scenarioToJsonObject(series, mask, metrics, meta)))
    expect(obj.series.utc).toHaveLength(series.count)
    expect(obj.series.sunElDeg).toHaveLength(series.count)
    expect(obj.series.utc[0]).toBe(new Date(startMs).toISOString())
    expect(obj.metrics.dtePct).toBe(metrics.dtePct)
    expect(obj.metrics.sunWindows).toHaveLength(metrics.sunWindows.length)
  })
})

describe('horizonToCsv / exportFileStem', () => {
  it('writes one row per azimuth bin', () => {
    const rows = horizonToCsv(mask, meta)
      .trim()
      .split('\n')
      .filter((l) => !l.startsWith('#'))
    expect(rows[0]).toBe('az_deg,elev_deg')
    expect(rows).toHaveLength(mask.elevDeg.length + 1)
  })

  it('sanitises the site id', () => {
    expect(exportFileStem('custom:-89.1:20', startMs)).toBe('lumen3d_custom_-89.1_20_2026-01-01')
  })
})
