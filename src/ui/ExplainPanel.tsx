import { CSA_MOON_URL, HORIZONS_URL, MOON_TREK_URL, QUICKMAP_URL } from '../config/externalLinks.ts'
import { PRESETS } from '../config/presets.ts'
import { type MsgKey, useT } from '../i18n/index.ts'
import { useMissionStore } from '../store/useMissionStore.ts'
import { PresetBar } from './PresetBar.tsx'

/**
 * Each card's title/body/cta live in the dictionaries as explain.<id>.{title,body,cta}. The cta
 * opens `siteId` in the surface view, or applies the quick scenario `presetId`; `href` adds a
 * link to the source.
 */
const CARDS: { id: string; siteId?: string; presetId?: string; href?: string }[] = [
  { id: 'c1', siteId: 'shackleton-rim' },
  { id: 'c2', siteId: 'shackleton-floor' },
  { id: 'c3', siteId: 'malapert-massif' },
  { id: 'c4', siteId: 'connecting-ridge' },
  { id: 'c5', siteId: 'change-4' },
  { id: 'c6', siteId: 'apollo-11' },
  { id: 'c7', siteId: 'shackleton-floor' },
  { id: 'c8', presetId: 'csa-rover', href: CSA_MOON_URL },
]

/** The four resources of the challenge and what each one feeds in the app. */
const SOURCES: { id: string; name: string; href: string }[] = [
  { id: 'horizons', name: 'JPL Horizons', href: HORIZONS_URL },
  { id: 'quickmap', name: 'LROC QuickMap', href: QUICKMAP_URL },
  { id: 'trek', name: 'Moon Trek', href: MOON_TREK_URL },
  { id: 'csa', name: 'CSA · Moon exploration', href: CSA_MOON_URL },
]

export function ExplainPanel() {
  const t = useT()
  const open = useMissionStore((s) => s.explainOpen)
  const { setExplainOpen, selectSite, setView, applyPreset } = useMissionStore.getState()
  if (!open) return null
  const k = (id: string, part: 'title' | 'body' | 'cta') => `explain.${id}.${part}` as MsgKey

  const act = (c: (typeof CARDS)[number]) => {
    const preset = c.presetId && PRESETS.find((p) => p.id === c.presetId)
    if (preset) {
      applyPreset(preset)
      return
    }
    if (c.siteId) selectSite(c.siteId)
    setView('micro')
    setExplainOpen(false)
  }

  return (
    <section className="overlay explain" aria-label={t('explain.aria')}>
      <header className="overlay__head">
        <h2>{t('explain.title')}</h2>
        <button type="button" className="btn" onClick={() => setExplainOpen(false)}>
          {t('common.close')}
        </button>
      </header>
      <PresetBar variant="cards" />
      <div className="explain__grid">
        {CARDS.map((c) => (
          <article key={c.id} className="explain__card">
            <h3>{t(k(c.id, 'title'))}</h3>
            <p>{t(k(c.id, 'body'))}</p>
            <div className="explain__actions">
              <button type="button" className="btn" onClick={() => act(c)}>
                {t(k(c.id, 'cta'))}
              </button>
              {c.href && (
                <a className="btn" href={c.href} target="_blank" rel="noopener noreferrer">
                  {t('explain.source')} ↗
                </a>
              )}
            </div>
          </article>
        ))}
      </div>
      <section className="explain__sources" aria-labelledby="explain-sources">
        <h3 id="explain-sources">{t('explain.sources.title')}</h3>
        <ul>
          {SOURCES.map((s) => (
            <li key={s.id}>
              <a href={s.href} target="_blank" rel="noopener noreferrer">
                {s.name} ↗
              </a>
              <span>{t(`explain.sources.${s.id}` as MsgKey)}</span>
            </li>
          ))}
        </ul>
      </section>
      <p className="hint">{t('explain.data')}</p>
    </section>
  )
}
