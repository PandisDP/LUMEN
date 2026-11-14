import type { AssistantClient, AssistantContext, Suggestion } from './types.ts'

async function post<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) throw new Error(`Assistant ${res.status}`)
  return (await res.json()) as T
}

/**
 * Client for the LLM backend (not part of this repo yet):
 *   POST {base}/suggest  { context }            → { suggestions: Suggestion[3] }
 *   POST {base}/ask      { question, context }  → { answer: string }
 * Any failure falls back to `fallback` (the local mock), so the widget always answers.
 */
export function httpClient(
  base: string,
  fallback: AssistantClient,
  timeoutMs = 8000,
): AssistantClient {
  const root = base.replace(/\/+$/, '')
  const withTimeout = <T>(fn: (signal: AbortSignal) => Promise<T>) => {
    const ctrl = new AbortController()
    const id = setTimeout(() => ctrl.abort(), timeoutMs)
    return fn(ctrl.signal).finally(() => clearTimeout(id))
  }
  return {
    async suggest(context: AssistantContext) {
      try {
        const r = await withTimeout((signal) =>
          post<{ suggestions: Suggestion[] }>(`${root}/suggest`, { context }, signal),
        )
        if (Array.isArray(r.suggestions) && r.suggestions.length) return r.suggestions.slice(0, 3)
      } catch {
        // Backend down or slow: answer locally.
      }
      return fallback.suggest(context)
    },
    async ask(question: string, context: AssistantContext) {
      try {
        const r = await withTimeout((signal) =>
          post<{ answer: string }>(`${root}/ask`, { question, context }, signal),
        )
        if (typeof r.answer === 'string' && r.answer) return r.answer
      } catch {
        // Same fallback as above.
      }
      return fallback.ask(question, context)
    },
  }
}
