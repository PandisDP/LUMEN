import { type FormEvent, useEffect, useMemo, useState } from 'react'
import {
  type AssistantContext,
  type Suggestion,
  assistant,
  assistantIsMock,
} from '../assistant/index.ts'
import { useLang, useT } from '../i18n/index.ts'
import { useSiteText } from '../i18n/sites.ts'
import { findSite, selectActiveScenario, useMissionStore } from '../store/useMissionStore.ts'
import { useUiStore } from '../store/useUiStore.ts'
import { MoonLocator } from './MoonLocator.tsx'
import { DECIDE_STEP, goToStep } from './steps.ts'
import { useTopSites } from '../hooks/useTopSites.ts'

const KIND_ICON = { balanced: '★', earth: '⊕', ice: '❄' } as const

/** Builds the assistant's context from the live catalogue ranking (undefined while computing). */
function useAssistantContext(): AssistantContext | undefined {
  const lang = useLang()
  const siteText = useSiteText()
  const { all } = useTopSites()
  const active = useMissionStore(selectActiveScenario)
  return useMemo(
    () =>
      all && {
        lang,
        startMs: active.startMs,
        missionDays: active.missionDays,
        activeSiteId: active.siteId,
        roverMaxSlopeDeg: active.hardwareLimits.roverMaxSlopeDeg,
        candidates: all
          .filter((r) => r.info.category === 'south-pole')
          .map((r) => ({
            siteId: r.info.id,
            name: siteText(r.info)?.name ?? r.info.id,
            lat: r.info.lat,
            lon: r.info.lon,
            score: r.metrics.score,
            energyPct: r.metrics.energyPct,
            sunlitPct: r.metrics.sunlitPct,
            dtePct: r.metrics.dtePct,
            longestDarkH: r.metrics.longestDarkH,
            verdict: r.viability.verdict,
            ice: r.info.ice,
          })),
      },
    [all, lang, siteText, active.startMs, active.missionDays, active.siteId, active.hardwareLimits],
  )
}

interface Message {
  from: 'user' | 'bot'
  text: string
}

/**
 * Floating "Help me choose?" button. Three ready-made scenarios are preloaded in the background
 * (best overall, best Earth link, light + ice); one click applies one, or compares all three.
 * Free questions get a short answer. Today the answers are local (mock); with VITE_ASSISTANT_URL
 * the same widget talks to the LLM backend.
 */
export function AssistantFab() {
  const t = useT()
  const siteText = useSiteText()
  const open = useUiStore((s) => s.assistantOpen)
  const setOpen = useUiStore((s) => s.setAssistantOpen)
  const compareOpen = useMissionStore((s) => s.compareOpen)
  const sites = useMissionStore((s) => s.sites)
  const ctx = useAssistantContext()
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [question, setQuestion] = useState('')
  const [thinking, setThinking] = useState(false)

  // Preload as soon as the ranking is ready, so opening the widget is instant.
  useEffect(() => {
    if (!ctx) return
    let cancelled = false
    assistant.suggest(ctx).then((s) => !cancelled && setSuggestions(s))
    return () => {
      cancelled = true
    }
  }, [ctx])

  const apply = (s: Suggestion) => {
    const m = useMissionStore.getState()
    m.updateScenario(m.activeId, s.scenario)
    setOpen(false)
  }

  const compareAll = () => {
    if (!suggestions?.length) return
    useMissionStore.getState().setScenarios(suggestions.map((s) => s.scenario))
    goToStep(DECIDE_STEP)
    setOpen(false)
  }

  const ask = async (e: FormEvent) => {
    e.preventDefault()
    const q = question.trim()
    if (!q || !ctx) return
    setQuestion('')
    setMessages((m) => [...m, { from: 'user', text: q }])
    setThinking(true)
    try {
      const answer = await assistant.ask(q, ctx)
      setMessages((m) => [...m, { from: 'bot', text: answer }])
    } finally {
      setThinking(false)
    }
  }

  // In Decide the comparison owns the screen (and its editor sheet): no floating button there.
  if (!open && compareOpen) return null
  if (!open) {
    return (
      <button
        type="button"
        className="fab"
        onClick={() => setOpen(true)}
        data-tour="assistant"
        aria-label={t('assistant.open')}
      >
        <span className="fab__icon" aria-hidden>
          ✦
        </span>
        <span className="fab__label">{t('assistant.cta')}</span>
        {suggestions && <span className="fab__dot" aria-hidden />}
      </button>
    )
  }

  return (
    <section className="assistant" aria-label={t('assistant.title')} data-tour="assistant">
      <header className="assistant__head">
        <span className="fab__icon" aria-hidden>
          ✦
        </span>
        <div>
          <h2>{t('assistant.title')}</h2>
          <p className="hint">{t('assistant.sub')}</p>
        </div>
        <button
          type="button"
          className="btn btn--ghost btn--small"
          onClick={() => setOpen(false)}
          aria-label={t('common.close')}
        >
          ✕
        </button>
      </header>

      <ol className="assistant__list" aria-busy={!suggestions}>
        {suggestions
          ? suggestions.map((s) => {
              const site = findSite(sites, s.siteId)
              return (
                <li key={s.id} className="assistant__card">
                  {site && <MoonLocator points={[{ lat: site.lat, lon: site.lon }]} size={44} />}
                  <div>
                    <p className="assistant__title">
                      <span aria-hidden>{KIND_ICON[s.kind]}</span> {s.title}
                    </p>
                    <p className="assistant__why">{s.why}</p>
                    <p className="hint">{siteText(site)?.name}</p>
                  </div>
                  <button type="button" className="btn btn--small" onClick={() => apply(s)}>
                    {t('assistant.apply')}
                  </button>
                </li>
              )
            })
          : [0, 1, 2].map((i) => (
              <li key={i} className="assistant__card assistant__card--loading">
                {t('assistant.loading')}
              </li>
            ))}
      </ol>
      <button
        type="button"
        className="btn btn--accent assistant__compare"
        disabled={!suggestions?.length}
        onClick={compareAll}
      >
        {t('assistant.compareAll')}
      </button>

      {messages.length > 0 && (
        <div className="assistant__chat" aria-live="polite">
          {messages.map((m, i) => (
            <p key={i} className={`bubble bubble--${m.from}`}>
              {m.text}
            </p>
          ))}
          {thinking && <p className="bubble bubble--bot">…</p>}
        </div>
      )}
      <form className="assistant__ask" onSubmit={ask}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t('assistant.placeholder')}
          aria-label={t('assistant.placeholder')}
        />
        <button type="submit" className="btn btn--small" disabled={!question.trim() || !ctx}>
          {t('assistant.send')}
        </button>
      </form>
      {assistantIsMock && <p className="hint assistant__note">{t('assistant.mockNote')}</p>}
    </section>
  )
}
