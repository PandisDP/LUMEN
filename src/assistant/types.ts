import type { IceSummary } from '../astro/iceAccess.ts'
import type { Lang } from '../i18n/index.ts'
import type { ScenarioPatch } from '../store/useMissionStore.ts'

/**
 * Contract between the floating assistant and whatever answers it: the local mock today, an LLM
 * backend later (POST {VITE_ASSISTANT_URL}/suggest and /ask, JSON in and out, same shapes).
 */

/** One evaluated catalogue site, as the front end already computes it (see useCatalogViability). */
export interface AssistantCandidate {
  siteId: string
  name: string
  lat: number
  lon: number
  /** Engineering score 0–100 for the current date and mission. */
  score: number
  energyPct: number
  sunlitPct: number
  dtePct: number
  longestDarkH: number
  verdict: 'good' | 'warn' | 'bad'
  ice?: Pick<IceSummary, 'routeM' | 'maxSlopeDeg' | 'reachable'>
}

export interface AssistantContext {
  lang: Lang
  /** Landing date being studied (UTC ms) and mission length (days). */
  startMs: number
  missionDays: number
  activeSiteId: string
  roverMaxSlopeDeg: number
  candidates: AssistantCandidate[]
}

export type SuggestionKind = 'balanced' | 'earth' | 'ice'

export interface Suggestion {
  id: string
  kind: SuggestionKind
  title: string
  /** One short sentence (≤ 140 characters): why this option. */
  why: string
  siteId: string
  /** Scenario to create or apply (site, date and any mission setting). */
  scenario: ScenarioPatch & { siteId: string; startMs: number }
}

export interface AssistantClient {
  /** Exactly three ready-made scenarios, best first. */
  suggest: (ctx: AssistantContext) => Promise<Suggestion[]>
  /** A short plain-language answer (2–3 sentences). */
  ask: (question: string, ctx: AssistantContext) => Promise<string>
}
