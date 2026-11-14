import { useRef, useState } from 'react'
import { evaluateForExport } from '../hooks/scenarioExport.ts'
import { useT } from '../i18n/index.ts'
import { SCENARIO_LABELS, selectActiveScenario, useMissionStore } from '../store/useMissionStore.ts'
import {
  downloadText,
  exportFileStem,
  horizonToCsv,
  scenarioToJsonObject,
  seriesToCsv,
} from './export.ts'

type Kind = 'csv' | 'json' | 'horizon' | 'all'

/**
 * "Export ▾" dropdown: CSV / JSON / horizon / all scenarios. `final` = the closing call to action
 * of the Decide step (bigger, opens upwards).
 */
export function ExportMenu({ final = false }: { final?: boolean }) {
  const t = useT()
  const menu = useRef<HTMLDetailsElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const multi = useMissionStore((s) => s.scenarios.length > 1)

  const run = async (kind: Kind) => {
    if (menu.current) menu.current.open = false
    setBusy(true)
    setError(null)
    try {
      const state = useMissionStore.getState()
      if (kind === 'all') {
        const items = await Promise.all(state.scenarios.map(evaluateForExport))
        const bundle = {
          generator: 'LUMEN 3D',
          scenarios: items.map((x, k) => ({
            label: SCENARIO_LABELS[k],
            ...scenarioToJsonObject(
              x.result.series,
              x.detail.mask,
              x.result.metrics,
              x.meta,
              x.extra,
            ),
          })),
        }
        downloadText('lumen3d_compare.json', 'application/json', JSON.stringify(bundle))
        return
      }
      const x = await evaluateForExport(selectActiveScenario(state))
      const stem = exportFileStem(x.meta.siteId, x.meta.startMs)
      if (kind === 'csv') {
        downloadText(
          `${stem}.csv`,
          'text/csv',
          seriesToCsv(x.result.series, x.detail.mask, x.meta, x.extra),
        )
      } else if (kind === 'json') {
        const obj = scenarioToJsonObject(
          x.result.series,
          x.detail.mask,
          x.result.metrics,
          x.meta,
          x.extra,
        )
        downloadText(`${stem}.json`, 'application/json', JSON.stringify(obj))
      } else {
        downloadText(
          `${stem}_horizon.csv`,
          'text/csv',
          horizonToCsv(x.detail.mask, x.meta, x.detail.obstructionKm),
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="export" data-tour="export">
      <details className={final ? 'menu menu--up' : 'menu'} ref={menu}>
        <summary className={final ? 'btn btn--accent btn--big' : 'btn'} aria-busy={busy}>
          {busy ? '…' : '⤓'} {t(final ? 'export.final' : 'export.menu')}
        </summary>
        <div className="menu__list" role="menu">
          <button type="button" role="menuitem" onClick={() => run('csv')}>
            {t('export.csv')}
          </button>
          <button type="button" role="menuitem" onClick={() => run('json')}>
            {t('export.json')}
          </button>
          <button type="button" role="menuitem" onClick={() => run('horizon')}>
            {t('export.horizon')}
          </button>
          {multi && (
            <button type="button" role="menuitem" onClick={() => run('all')}>
              {t('export.compareJson')}
            </button>
          )}
        </div>
      </details>
      {error && (
        <p className="error export__error" role="alert" onClick={() => setError(null)}>
          {error}
        </p>
      )}
    </div>
  )
}
