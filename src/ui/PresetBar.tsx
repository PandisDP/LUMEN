import { PRESETS } from '../config/presets.ts'
import { useT } from '../i18n/index.ts'
import { useMissionStore } from '../store/useMissionStore.ts'

/** One-click "what if?" comparisons (Compare header and the Explain overlay). */
export function PresetBar({ variant = 'chips' }: { variant?: 'chips' | 'cards' }) {
  const t = useT()
  const applyPreset = useMissionStore((s) => s.applyPreset)

  if (variant === 'cards') {
    return (
      <section className="presets presets--cards" aria-label={t('presets.title')}>
        <h3 className="panel__label">{t('presets.title')}</h3>
        <div className="explain__grid">
          {PRESETS.map((p) => (
            <article key={p.id} className="explain__card">
              <h3>{t(p.titleKey)}</h3>
              <p>{t(p.descKey)}</p>
              <button type="button" className="btn" onClick={() => applyPreset(p)}>
                {t('presets.apply')}
              </button>
            </article>
          ))}
        </div>
      </section>
    )
  }

  return (
    <div className="presets" role="group" aria-label={t('presets.title')}>
      <span className="panel__label">{t('presets.title')}</span>
      {PRESETS.map((p) => (
        <button
          key={p.id}
          type="button"
          className="btn presets__chip"
          title={t(p.descKey)}
          onClick={() => applyPreset(p)}
        >
          {t(p.titleKey)}
        </button>
      ))}
    </div>
  )
}
