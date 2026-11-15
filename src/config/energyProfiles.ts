import type { EnergyProfile, PanelKind } from '../astro/energy.ts'
import type { MsgKey } from '../i18n/index.ts'

/**
 * Illustrative power budgets (orders of magnitude for small polar landers/rovers, not the
 * specs of any real vehicle). Everything is editable in the UI ("custom"). The two rovers also
 * carry `sampleW`, the assumed draw of their sampling instrument while working at the ice.
 */
export interface EnergyPreset {
  id: string
  labelKey: MsgKey
  profile: EnergyProfile
}

export const ENERGY_PRESETS: readonly EnergyPreset[] = [
  {
    id: 'lander',
    labelKey: 'energy.preset.lander',
    profile: {
      panel: 'vertical-box',
      panelAzDeg: 0,
      peakW: 150,
      batteryWh: 1500,
      activeW: 150,
      hibernateW: 45,
      hibernateBelowPct: 25,
      initialSocPct: 100,
    },
  },
  {
    id: 'rover',
    labelKey: 'energy.preset.rover',
    profile: {
      panel: 'tracking',
      panelAzDeg: 0,
      peakW: 120,
      batteryWh: 600,
      activeW: 70,
      hibernateW: 18,
      hibernateBelowPct: 20,
      initialSocPct: 100,
      // Assumption: a small drill and an analysis instrument (order of magnitude).
      sampleW: 30,
    },
  },
  {
    // Concept from the Canadian Space Agency portal: a utility rover meant to survive the
    // ~2-week lunar night at about −200 °C. Numbers are only an illustrative budget.
    id: 'csa-rover',
    labelKey: 'energy.preset.csaRover',
    profile: {
      panel: 'tracking',
      panelAzDeg: 0,
      peakW: 400,
      batteryWh: 5000,
      activeW: 200,
      hibernateW: 10,
      hibernateBelowPct: 30,
      initialSocPct: 100,
      // Assumption: a metre-class drill and its analysis suite (order of magnitude).
      sampleW: 150,
    },
  },
  {
    id: 'fixed',
    labelKey: 'energy.preset.fixed',
    profile: {
      panel: 'vertical-fixed',
      panelAzDeg: 0,
      peakW: 300,
      batteryWh: 1000,
      activeW: 120,
      hibernateW: 30,
      hibernateBelowPct: 20,
      initialSocPct: 100,
    },
  },
]

export const DEFAULT_ENERGY_ID = 'lander'
export const PANEL_KINDS: readonly PanelKind[] = [
  'tracking',
  'vertical-box',
  'vertical-fixed',
  'horizontal',
]

export const energyPreset = (id: string) => ENERGY_PRESETS.find((p) => p.id === id)

/** Compact URL form: panel,az,peak,battery,active,hibernate,threshold,initial. */
export function encodeProfile(p: EnergyProfile): string {
  return [
    p.panel,
    p.panelAzDeg,
    p.peakW,
    p.batteryWh,
    p.activeW,
    p.hibernateW,
    p.hibernateBelowPct,
    p.initialSocPct,
  ].join(',')
}

export function decodeProfile(s: string): EnergyProfile | null {
  const [panel, ...rest] = s.split(',')
  const v = rest.map(Number)
  if (!(PANEL_KINDS as readonly string[]).includes(panel) || v.length !== 7) return null
  if (v.some((x) => !Number.isFinite(x) || x < 0)) return null
  const [panelAzDeg, peakW, batteryWh, activeW, hibernateW, hibernateBelowPct, initialSocPct] = v
  return {
    panel: panel as PanelKind,
    panelAzDeg,
    peakW,
    batteryWh,
    activeW,
    hibernateW,
    hibernateBelowPct: Math.min(100, hibernateBelowPct),
    initialSocPct: Math.min(100, initialSocPct),
  }
}
