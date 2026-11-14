import { useEffect } from 'react'
import { DEFAULT_LIMITS, decodeLimits, encodeLimits } from '../astro/hardware.ts'
import { customSiteInfo } from '../data/catalog.ts'
import { decodeProfile, encodeProfile } from '../config/energyProfiles.ts'
import type { PresetScenario } from '../config/presets.ts'
import { getLang, useLangStore } from '../i18n/index.ts'
import {
  type Scenario,
  type ScenarioParams,
  scenarioIndex,
  selectActiveScenario,
  useMissionStore,
} from '../store/useMissionStore.ts'
import { isAudience, useUiStore } from '../store/useUiStore.ts'

const urlDate = (ms: number) => new Date(ms).toISOString().slice(0, 16) + 'Z'

/** Mission settings as URL values (shared by the top-level keys and the per-scenario overrides). */
const encodeEnergy = (x: ScenarioParams) =>
  x.energyId === 'custom' ? `custom:${encodeProfile(x.energy)}` : x.energyId

function decodeEnergy(en: string): Partial<ScenarioParams> {
  if (en.startsWith('custom:')) {
    const energy = decodeProfile(en.slice(7))
    return energy ? { energy, energyId: 'custom' } : {}
  }
  return en ? { energyId: en } : {}
}

/**
 * Per-scenario overrides inside `s=`, only for settings that differ from the active scenario
 * (whose settings travel as the top-level keys): `~d30~l3~sci0.3~enrover~hw15_120_30_20`.
 * Commas separate scenarios, so the lists inside use `_`.
 */
function encodeOverrides(sc: ScenarioParams, base: ScenarioParams): string {
  let out = ''
  if (sc.missionDays !== base.missionDays) out += `~d${sc.missionDays}`
  if (sc.linkMarginDeg !== base.linkMarginDeg) out += `~l${sc.linkMarginDeg}`
  if (sc.scienceWeight !== base.scienceWeight) out += `~sci${sc.scienceWeight}`
  if (encodeEnergy(sc) !== encodeEnergy(base)) out += `~en${encodeEnergy(sc).replaceAll(',', '_')}`
  const hw = encodeLimits(sc.hardwareLimits)
  if (hw !== encodeLimits(base.hardwareLimits)) out += `~hw${hw.replaceAll(',', '_')}`
  return out
}

function decodeOverrides(parts: string[]): Partial<ScenarioParams> {
  const out: Partial<ScenarioParams> = {}
  for (const part of parts) {
    if (part.startsWith('sci')) out.scienceWeight = Number(part.slice(3))
    else if (part.startsWith('en'))
      Object.assign(out, decodeEnergy(part.slice(2).replaceAll('_', ',')))
    else if (part.startsWith('hw')) {
      const hw = decodeLimits(part.slice(2).replaceAll('_', ','))
      if (hw) out.hardwareLimits = hw
    } else if (part.startsWith('d')) out.missionDays = Number(part.slice(1))
    else if (part.startsWith('l')) out.linkMarginDeg = Number(part.slice(1))
  }
  return out
}

/**
 * `site@date[~overrides]` list for Compare; custom sites travel as their `custom:lat:lon` id.
 */
export function parseScenarioList(value: string): PresetScenario[] {
  return value
    .split(',')
    .map((item) => {
      const [head, ...over] = item.split('~')
      const at = head.lastIndexOf('@')
      return {
        ...decodeOverrides(over),
        siteId: head.slice(0, at),
        startMs: Date.parse(head.slice(at + 1)),
      }
    })
    .filter((x) => x.siteId && Number.isFinite(x.startMs))
}

/** Registers custom-coordinate sites referenced by a scenario list so the store accepts them. */
function registerCustomSites(list: readonly PresetScenario[]) {
  const s = useMissionStore.getState()
  const extra = list
    .filter((x) => x.siteId.startsWith('custom:') && !s.sites.some((site) => site.id === x.siteId))
    .map((x) => {
      const [, lat, lon] = x.siteId.split(':').map(Number)
      return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? customSiteInfo(lat, lon) : null
    })
    .filter((x) => x !== null)
  if (extra.length) s.setSites([...s.sites, ...extra])
}

/** Top-level mission settings (they describe the active scenario, and every scenario by default). */
function topLevelParams(p: URLSearchParams): Partial<ScenarioParams> {
  const out: Partial<ScenarioParams> = {}
  const days = Number(p.get('days'))
  if (days) out.missionDays = days
  if (p.has('link')) out.linkMarginDeg = Number(p.get('link'))
  const hw = decodeLimits(p.get('hw') ?? '')
  if (hw) out.hardwareLimits = hw
  if (p.has('sci')) out.scienceWeight = Number(p.get('sci'))
  Object.assign(out, decodeEnergy(p.get('en') ?? ''))
  return out
}

/**
 * Keeps the active site, landing date and view in the URL so a scenario can be shared:
 *   ?site=shackleton-rim&date=2027-03-01T00:00Z&view=micro&days=14
 *   &view=landing&ap=90 (descent view; ap = approach azimuth, deg, omitted = Sun behind)
 *   ?lat=-89.1&lon=-60 (custom coordinates)
 *   &s=shackleton-rim@2027-03-01T00:00Z,shackleton-floor@2027-03-01T00:00Z~d30&a=0&cmp=1 (Compare;
 *     `~…` = settings of that scenario that differ from the top-level ones)
 *   &link=3 (DTE link margin, deg)
 *   &lang=en (UI language) &mode=public (audience: planner | educator | public)
 *   &hw=15,120,30,20 (hardware limits: slope, night h, DTE %, rover slope) &sci=0.3 (science weight)
 *   &en=lander | en=custom:vertical-box,0,150,1500,150,45,25,100 (energy profile)
 */
export function applyUrl(search: string) {
  const p = new URLSearchParams(search)
  const s = useMissionStore.getState()
  const shared = topLevelParams(p)
  const list = parseScenarioList(p.get('s') ?? '')
  const linked = list.length > 1 || p.has('site') || p.has('lat')
  if (list.length > 1) {
    registerCustomSites(list)
    s.setScenarios(
      list.map((x) => ({ ...shared, ...x })),
      Number(p.get('a')) || 0,
    )
  } else {
    applySingle(p)
    s.updateScenario(useMissionStore.getState().activeId, shared)
  }
  const view = p.get('view')
  if (view === 'micro' || view === 'macro' || view === 'landing') s.setView(view)
  const ap = p.get('ap')
  if (ap !== null && ap !== '') s.setApproachAz(Number(ap))
  if (p.get('cmp') === '1') s.setCompareOpen(true)
  const mode = p.get('mode')
  if (isAudience(mode)) useUiStore.getState().setAudience(mode)
  // A shared link already says what to look at: skip the welcome and site choice.
  if (linked) useUiStore.getState().setStage('explore')
}

function applySingle(p: URLSearchParams) {
  const s = useMissionStore.getState()
  const lat = Number(p.get('lat'))
  const lon = Number(p.get('lon'))
  if (p.has('lat') && p.has('lon') && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
    s.addCustomSite(customSiteInfo(lat, lon))
  } else if (p.get('site')) {
    s.selectSite(p.get('site')!)
  }
  const date = Date.parse(p.get('date') ?? '')
  if (Number.isFinite(date)) s.setStart(date)
}

const scenarioItem = (x: Scenario, base: ScenarioParams) =>
  `${x.siteId}@${urlDate(x.startMs)}${encodeOverrides(x, base)}`

export function stateToSearch(): string {
  const s = useMissionStore.getState()
  const sc = selectActiveScenario(s)
  const site = s.sites.find((x) => x.id === sc.siteId)
  const p = new URLSearchParams()
  if (site?.custom) {
    p.set('lat', String(site.lat))
    p.set('lon', String(site.lon))
  } else {
    p.set('site', sc.siteId)
  }
  p.set('date', urlDate(sc.startMs))
  p.set('days', String(sc.missionDays))
  p.set('view', s.view)
  if (s.approachAz !== null) p.set('ap', String(Math.round(s.approachAz)))
  p.set('link', String(sc.linkMarginDeg))
  if (s.scenarios.length > 1) {
    p.set('s', s.scenarios.map((x) => scenarioItem(x, sc)).join(','))
    p.set('a', String(scenarioIndex(s, s.activeId)))
  }
  if (s.compareOpen) p.set('cmp', '1')
  const hw = encodeLimits(sc.hardwareLimits)
  if (hw !== encodeLimits(DEFAULT_LIMITS)) p.set('hw', hw)
  if (sc.scienceWeight > 0) p.set('sci', String(sc.scienceWeight))
  p.set('en', encodeEnergy(sc))
  p.set('lang', getLang())
  p.set('mode', useUiStore.getState().audience)
  return `?${p}`
}

export function useUrlSync(ready: boolean) {
  useEffect(() => {
    if (!ready) return
    applyUrl(window.location.search)
    // ?lang= is read at start-up by the language store (detectLang).
    const write = () => {
      // Until a site is chosen there is nothing worth sharing (and a reload keeps the welcome).
      if (useUiStore.getState().stage !== 'explore') return
      const next = stateToSearch()
      if (next !== window.location.search) window.history.replaceState(null, '', next)
    }
    const offMission = useMissionStore.subscribe(write)
    const offLang = useLangStore.subscribe(write)
    const offUi = useUiStore.subscribe(
      (s, prev) => (s.stage !== prev.stage || s.audience !== prev.audience) && write(),
    )
    return () => {
      offMission()
      offLang()
      offUi()
    }
  }, [ready])
}
