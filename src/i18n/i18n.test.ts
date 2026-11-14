import { describe, expect, it } from 'vitest'
import { SITE_SEEDS } from '../config/sites.ts'
import { en } from './en.ts'
import { es } from './es.ts'
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

describe('detectLang', () => {
  it('prefers ?lang=, then the browser language', () => {
    expect(detectLang('?lang=en', 'es-MX')).toBe('en')
    expect(detectLang('?lang=xx', 'es-MX')).toBe('es')
    expect(detectLang('', 'es-AR')).toBe('es')
    expect(detectLang('', 'en-GB')).toBe('en')
    expect(detectLang('', 'fr-FR')).toBe('en')
  })

  it('setLang persists and updates <html lang>', () => {
    useLangStore.getState().setLang('en')
    expect(document.documentElement.lang).toBe('en')
    expect(detectLang('', 'es-MX')).toBe('en') // saved choice wins over the browser
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
