import { describe, expect, it } from 'vitest'
import { mockClient, pickSuggestions } from './mockClient.ts'
import type { AssistantCandidate, AssistantContext } from './types.ts'

const cand = (siteId: string, over: Partial<AssistantCandidate> = {}): AssistantCandidate => ({
  siteId,
  name: siteId,
  lat: -89,
  lon: 0,
  score: 50,
  energyPct: 50,
  sunlitPct: 50,
  dtePct: 50,
  longestDarkH: 60,
  verdict: 'good',
  ...over,
})

const ctx = (candidates: AssistantCandidate[]): AssistantContext => ({
  lang: 'es',
  startMs: Date.UTC(2027, 0, 1),
  missionDays: 14,
  activeSiteId: 'a',
  roverMaxSlopeDeg: 20,
  candidates,
})

describe('assistant mock', () => {
  it('suggests three different sites: best overall, best Earth link, light + ice', () => {
    const s = pickSuggestions(
      ctx([
        cand('best', { score: 90 }),
        cand('earth', { score: 60, dtePct: 95 }),
        cand('ice', { score: 55, ice: { routeM: 300, maxSlopeDeg: 8, reachable: true } }),
        cand('meh', { score: 20 }),
      ]),
    )
    expect(s.map((x) => x.kind)).toEqual(['balanced', 'earth', 'ice'])
    expect(s.map((x) => x.siteId)).toEqual(['best', 'earth', 'ice'])
    expect(new Set(s.map((x) => x.siteId)).size).toBe(3)
    expect(s[2].scenario.scienceWeight).toBe(0.3)
    for (const x of s) {
      expect(x.why.length).toBeLessThanOrEqual(140)
      expect(x.scenario.startMs).toBe(Date.UTC(2027, 0, 1))
      expect(x.scenario.missionDays).toBe(14)
    }
  })

  it('prefers viable sites over a higher score that fails the hardware', () => {
    const s = pickSuggestions(
      ctx([cand('nogo', { score: 99, verdict: 'bad' }), cand('ok', { score: 40 })]),
    )
    expect(s[0].siteId).toBe('ok')
  })

  it('returns nothing without candidates', () => {
    expect(pickSuggestions(ctx([]))).toEqual([])
  })

  it('answers questions by topic, always briefly', async () => {
    const c = ctx([cand('Cresta', { score: 80, sunlitPct: 88 })])
    expect(await mockClient.ask('¿Cuál tiene más luz?', c)).toMatch(/88 %/)
    expect(await mockClient.ask('hielo?', c)).toMatch(/sombra/)
    expect(await mockClient.ask('hola', c)).toMatch(/Cresta/)
  })
})
