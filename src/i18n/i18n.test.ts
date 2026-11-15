import { describe, expect, it } from 'vitest'
import { SITE_SEEDS } from '../config/sites.ts'
import { en } from './en.ts'
import { es } from './es.ts'
import { qu } from './qu.ts'
import { detectLang, translate, useLangStore } from './index.ts'
import { siteText } from './sites.ts'

const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('dictionaries', () => {
  it('have the same keys, no empty values and the same {params}', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort())
    for (const k of Object.keys(es) as (keyof typeof es)[]) {
      expect(es[k].trim(), k).not.toBe('')
      expect(en[k].trim(), k).not.toBe('')
      expect(params(en[k]), k).toEqual(params(es[k]))
    }
  })

  it('interpolates parameters and leaves unknown ones visible', () => {
    expect(translate('en', 'metrics.window', { days: 14 })).toBe('14-day window')
    expect(translate('es', 'metrics.window', { days: 14 })).toBe('Ventana de 14 días')
    expect(translate('es', 'metrics.window')).toBe('Ventana de {days} días')
  })
})

describe('Quechua dictionary (partial, falls back to Spanish)', () => {
  const keys = Object.keys(qu) as (keyof typeof es)[]

  it('only has keys of the Spanish source, no empty values and the same {params}', () => {
    for (const k of keys) {
      expect(k in es, k).toBe(true)
      expect(qu[k]!.trim(), k).not.toBe('')
      expect(params(qu[k]!), k).toEqual(params(es[k]))
    }
  })

  it('covers the main interface', () => {
    expect(keys.length).toBeGreaterThan(400)
    const areas = [
      'topbar.',
      'step.',
      'audience.',
      'panel.',
      'tour.',
      'time.',
      'metrics.',
      'rover.',
    ]
    for (const area of [...areas, 'challenge.', 'assistant.', 'killa.', 'kit.', 'plan.', 'top.']) {
      const all = Object.keys(es).filter((k) => k.startsWith(area))
      const done = keys.filter((k) => k.startsWith(area))
      expect(done.length / all.length, area).toBeGreaterThan(0.3)
    }
  })

  it('falls back to Spanish for what it does not translate', () => {
    const missing = (Object.keys(es) as (keyof typeof es)[]).find((k) => !(k in qu))!
    expect(translate('qu', missing)).toBe(es[missing])
    expect(translate('qu', keys[0])).toBe(qu[keys[0]])
  })
})

describe('detectLang', () => {
  it('prefers ?lang=, then the browser language', () => {
    expect(detectLang('?lang=en', 'es-MX')).toBe('en')
    expect(detectLang('?lang=xx', 'es-MX')).toBe('es')
    expect(detectLang('', 'es-AR')).toBe('es')
    expect(detectLang('', 'en-GB')).toBe('en')
    expect(detectLang('', 'fr-FR')).toBe('en')
    expect(detectLang('?lang=qu', 'en-GB')).toBe('qu')
    expect(detectLang('', 'quz-PE')).toBe('qu')
  })

  it('setLang persists and updates <html lang>', () => {
    useLangStore.getState().setLang('en')
    expect(document.documentElement.lang).toBe('en')
    expect(detectLang('', 'es-MX')).toBe('en') // saved choice wins over the browser
    useLangStore.getState().setLang('qu')
    expect(document.documentElement.lang).toBe('qu')
    useLangStore.getState().setLang('es')
    expect(detectLang('', 'en-US')).toBe('es')
  })
})

describe('site texts', () => {
  it('every curated site has an English name and description', () => {
    for (const seed of SITE_SEEDS) {
      const site = { ...seed, heightM: 0, accuracy: 'lola' as const, hasTerrain: true }
      const txt = siteText(site, 'en')
      expect(txt.description, seed.id).not.toBe(seed.description)
      expect(siteText(site, 'es').name).toBe(seed.name)
    }
  })
})
