import { siteScore } from '../hooks/useScience.ts'
import { type MsgKey, translate } from '../i18n/index.ts'
import type {
  AssistantCandidate,
  AssistantClient,
  AssistantContext,
  Suggestion,
  SuggestionKind,
} from './types.ts'

const ORDER = { good: 0, warn: 1, bad: 2 } as const

/** Viable first, then by `key` descending. */
const by =
  (key: (c: AssistantCandidate) => number) => (a: AssistantCandidate, b: AssistantCandidate) =>
    ORDER[a.verdict] - ORDER[b.verdict] || key(b) - key(a)

const iceBlend = (c: AssistantCandidate, ctx: AssistantContext) =>
  siteScore(c.score, c.ice, 0.3, ctx.roverMaxSlopeDeg)

/**
 * Picks three different sites: the best overall, the best Earth link, and the best light + ice
 * balance. Falls back to the next best site when two criteria agree, so the three always differ.
 */
export function pickSuggestions(ctx: AssistantContext): Suggestion[] {
  const pool = ctx.candidates
  if (!pool.length) return []
  const used = new Set<string>()
  const take = (sorted: AssistantCandidate[]) => {
    const c = sorted.find((x) => !used.has(x.siteId)) ?? sorted[0]
    used.add(c.siteId)
    return c
  }
  const tr = (key: MsgKey, p?: Record<string, string | number>) => translate(ctx.lang, key, p)
  const make = (kind: SuggestionKind, c: AssistantCandidate, scienceWeight = 0): Suggestion => ({
    id: `${kind}:${c.siteId}`,
    kind,
    siteId: c.siteId,
    title: tr(`assistant.kind.${kind}` as MsgKey, { name: c.name }),
    why: tr(`assistant.why.${kind}` as MsgKey, {
      name: c.name,
      sun: Math.round(c.sunlitPct),
      dte: Math.round(c.dtePct),
      score: kind === 'ice' ? iceBlend(c, ctx) : c.score,
      night: Math.round(c.longestDarkH),
    }).slice(0, 140),
    scenario: {
      siteId: c.siteId,
      startMs: ctx.startMs,
      missionDays: ctx.missionDays,
      ...(scienceWeight ? { scienceWeight } : {}),
    },
  })

  const balanced = take([...pool].sort(by((c) => c.score)))
  const earth = take([...pool].sort(by((c) => c.dtePct)))
  const withIce = pool.filter((c) => c.ice)
  const ice = take([...(withIce.length ? withIce : pool)].sort(by((c) => iceBlend(c, ctx))))
  return [make('balanced', balanced), make('earth', earth), make('ice', ice, 0.3)]
}

const TOPICS: [RegExp, MsgKey][] = [
  [/\b(sol|luz|sun|light|energ|power|bater|battery)/i, 'assistant.answer.light'],
  [/\b(tierra|earth|dte|comunic|link|enlace|radio)/i, 'assistant.answer.earth'],
  [/\b(pendiente|slope|terreno|terrain|seguro|safe|roca|rock)/i, 'assistant.answer.slope'],
  [/\b(hielo|ice|agua|water|psr|sombra|shadow|crater|cráter)/i, 'assistant.answer.ice'],
  [/\b(noche|night|fr[ií]o|cold|temperatura|temperature)/i, 'assistant.answer.night'],
  [/\b(mejor|best|recom|elegir|choose|cu[aá]l|which)/i, 'assistant.answer.best'],
]

/** Local stand-in for the LLM backend: deterministic, instant, and offline. */
export const mockClient: AssistantClient = {
  async suggest(ctx) {
    return pickSuggestions(ctx)
  },
  async ask(question, ctx) {
    const best = [...ctx.candidates].sort(by((c) => c.score))[0]
    const key = TOPICS.find(([re]) => re.test(question))?.[1] ?? 'assistant.answer.default'
    return translate(ctx.lang, key, {
      name: best?.name ?? '—',
      score: best?.score ?? 0,
      sun: Math.round(best?.sunlitPct ?? 0),
      dte: Math.round(best?.dtePct ?? 0),
    })
  },
}
