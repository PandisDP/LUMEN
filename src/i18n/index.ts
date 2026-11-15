import { useCallback } from 'react'
import { create } from 'zustand'
import { en } from './en.ts'
import { es } from './es.ts'
import { qu } from './qu.ts'

/**
 * Minimal translation layer (no dependency). Spanish is the source dictionary; the English one is
 * typed against it, so a missing or extra key is a compile error. Quechua (Southern, Cusco-Collao)
 * covers the main interface only: it is a partial dictionary and anything it lacks falls back to
 * Spanish (see docs/QUECHUA.md).
 */
export type Lang = 'es' | 'en' | 'qu'
export type MsgKey = keyof typeof es
export type MsgParams = Record<string, string | number>

export const LANGS: readonly Lang[] = ['es', 'en', 'qu']
/** Name of each language in that language (tooltips of the switcher). */
export const LANG_NAMES: Record<Lang, string> = { es: 'Español', en: 'English', qu: 'Runasimi' }
const DICTS: Record<Lang, Partial<Record<MsgKey, string>>> = { es, en, qu }
const STORAGE_KEY = 'lumen3d.lang'

const isLang = (v: unknown): v is Lang => v === 'es' || v === 'en' || v === 'qu'

/** ?lang= → saved choice → browser language (Spanish → ES, Quechua → QU, everyone else EN). */
export function detectLang(
  search = typeof location !== 'undefined' ? location.search : '',
  navLang = typeof navigator !== 'undefined' ? navigator.language : 'es',
): Lang {
  const q = new URLSearchParams(search).get('lang')
  if (isLang(q)) return q
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (isLang(saved)) return saved
  } catch {
    // Storage blocked (private mode, sandbox): fall through to the browser language.
  }
  const nav = (navLang ?? '').toLowerCase()
  if (nav.startsWith('qu')) return 'qu'
  return nav.startsWith('es') ? 'es' : 'en'
}

interface LangState {
  lang: Lang
  setLang: (lang: Lang) => void
}

const syncDocument = (lang: Lang) => {
  if (typeof document !== 'undefined') document.documentElement.lang = lang
}

export const useLangStore = create<LangState>()((set) => {
  const lang = detectLang()
  syncDocument(lang)
  return {
    lang,
    setLang: (next) => {
      if (!isLang(next)) return
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // Not persisted; the choice still applies to this session.
      }
      syncDocument(next)
      set({ lang: next })
    },
  }
})

export const getLang = () => useLangStore.getState().lang

export function translate(lang: Lang, key: MsgKey, params?: MsgParams): string {
  const text = DICTS[lang][key] ?? DICTS.es[key] ?? key
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (m, name: string) =>
    name in params ? String(params[name]) : m,
  )
}

/** Non-reactive translation (canvas code, formatters). Components should prefer useT(). */
export const t = (key: MsgKey, params?: MsgParams) => translate(getLang(), key, params)

export const useLang = () => useLangStore((s) => s.lang)

/** Translation function bound to the current language; re-renders on language change. */
export function useT() {
  const lang = useLang()
  return useCallback((key: MsgKey, params?: MsgParams) => translate(lang, key, params), [lang])
}

export const hasKey = (key: string): key is MsgKey => key in es
