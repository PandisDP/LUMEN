import { DEG, HOUR_MS } from './constants.ts'
import { VISIBLE_THRESHOLD } from './metrics.ts'
import { type SiteSeries, sampleTime } from './series.ts'

/**
 * First-order power budget: solar array → battery → loads. Good enough to answer the
 * mission-planning question "does the craft make it to the next sunrise?", not a substitute
 * for a thermal/electrical model (no temperature, ageing or conversion losses).
 */
export type PanelKind =
  /** Two-axis tracking array (the geometric best case). */
  | 'tracking'
  /** One vertical panel facing a fixed azimuth. */
  | 'vertical-fixed'
  /** Four vertical faces 90° apart (a box-shaped lander body). */
  | 'vertical-box'
  /** Flat on the deck: almost useless with the Sun 1–2° high at the pole. */
  | 'horizontal'

export interface EnergyProfile {
  panel: PanelKind
  /** Azimuth the vertical panel (or the box's first face) points to, deg from north. */
  panelAzDeg: number
  /** Output of one panel/face at normal incidence, full Sun (W). */
  peakW: number
  batteryWh: number
  /** Load while operating (W). */
  activeW: number
  /** Survival load (heaters, receiver), used at night or with a low battery (W). */
  hibernateW: number
  /** Below this state of charge the craft drops to survival mode (%). */
  hibernateBelowPct: number
  initialSocPct: number
}

/** Cosine factor of the array for a Sun at (az, el), before the visible-disc fraction. */
export function incidenceFactor(
  p: Pick<EnergyProfile, 'panel' | 'panelAzDeg'>,
  az: number,
  el: number,
) {
  const cosEl = Math.cos(el * DEG)
  const face = (a: number) => Math.max(0, Math.cos((az - a) * DEG)) * cosEl
  switch (p.panel) {
    case 'tracking':
      return 1
    case 'vertical-fixed':
      return face(p.panelAzDeg)
    case 'vertical-box':
      return [0, 90, 180, 270].reduce((sum, k) => sum + face(p.panelAzDeg + k), 0)
    case 'horizontal':
      return Math.max(0, Math.sin(el * DEG))
  }
}

export interface BatteryResult {
  /** State of charge per sample (%), aligned with the series. */
  socPct: Float32Array
  /** Array output per sample (W). */
  powerW: Float32Array
  /** 1 while operating, 0 in survival mode, per sample. */
  active: Uint8Array
  minSocPct: number
  /** First time the battery hit zero with the load not covered, or null. */
  depletedAtMs: number | null
  /** Total time spent at 0 % with an uncovered load (h). */
  hoursAtZero: number
  /** Share of the window spent operating (%). */
  activePct: number
  energyInWh: number
  energyOutWh: number
}

/**
 * Integrates the battery over the series (explicit Euler on the series step). The craft
 * operates while the Sun is up and the battery is above the survival threshold; otherwise it
 * hibernates. SoC is clamped to [0, capacity]: surplus is curtailed, deficit is "dead time".
 */
export function simulateBattery(series: SiteSeries, p: EnergyProfile): BatteryResult {
  const n = series.count
  const socPct = new Float32Array(n)
  const powerW = new Float32Array(n)
  const active = new Uint8Array(n)
  const capWh = Math.max(1e-9, p.batteryWh)
  const dtH = series.stepMs / HOUR_MS
  let e = (capWh * Math.min(100, Math.max(0, p.initialSocPct))) / 100
  let minSoc = Infinity
  let depletedAtMs: number | null = null
  let hoursAtZero = 0
  let activeCount = 0
  let energyIn = 0
  let energyOut = 0

  for (let i = 0; i < n; i++) {
    const frac = series.sunFrac[i]
    const pw = p.peakW * frac * incidenceFactor(p, series.sunAz[i], series.sunEl[i])
    const soc = (100 * e) / capWh
    const operating = frac >= VISIBLE_THRESHOLD && soc > p.hibernateBelowPct
    const load = operating ? p.activeW : p.hibernateW
    powerW[i] = pw
    socPct[i] = soc
    active[i] = operating ? 1 : 0
    if (operating) activeCount++
    minSoc = Math.min(minSoc, soc)
    if (i === n - 1) break
    const next = e + (pw - load) * dtH
    energyIn += pw * dtH
    energyOut += load * dtH
    if (next <= 0 && pw < load) {
      if (depletedAtMs === null) {
        // Interpolate the crossing inside the step.
        const f = e / Math.max(1e-9, (load - pw) * dtH)
        depletedAtMs = sampleTime(series, i) + f * series.stepMs
      }
      hoursAtZero += e > 0 ? dtH * (1 - e / ((load - pw) * dtH)) : dtH
    }
    e = Math.min(capWh, Math.max(0, next))
  }
  return {
    socPct,
    powerW,
    active,
    minSocPct: Number.isFinite(minSoc) ? minSoc : 0,
    depletedAtMs,
    hoursAtZero,
    activePct: n ? (100 * activeCount) / n : 0,
    energyInWh: energyIn,
    energyOutWh: energyOut,
  }
}
