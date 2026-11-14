import { useBattery, useInstant } from '../hooks/useScenario.ts'
import { type MsgKey, useT } from '../i18n/index.ts'
import {
  type BottomPanel as Tab,
  selectActiveScenario,
  useMissionStore,
} from '../store/useMissionStore.ts'
import { CollapsiblePanel } from './CollapsiblePanel.tsx'
import { DateSweep } from './DateSweep.tsx'
import { formatDateTime, formatHours } from './format.ts'
import { HorizonChart } from './HorizonChart.tsx'
import { IconClock } from './icons.tsx'
import { TimeControls } from './TimeControls.tsx'
import { Timeline } from './Timeline.tsx'

const TABS: [Tab, MsgKey][] = [
  ['timeline', 'bottom.timeline'],
  ['horizon', 'bottom.horizon'],
  ['dates', 'bottom.dates'],
]

export function BottomPanel() {
  const tab = useMissionStore((s) => s.bottomPanel)
  const setTab = useMissionStore((s) => s.setBottomPanel)
  const offsetH = useMissionStore((s) => s.offsetH)
  const setOffset = useMissionStore((s) => s.setOffset)
  const showPaths = useMissionStore((s) => s.showPaths)
  const scenario = useMissionStore(selectActiveScenario)
  const { detail, result, instant, timeMs } = useInstant(scenario)
  const playing = useMissionStore((s) => s.playing)
  const togglePlay = useMissionStore((s) => s.togglePlay)
  const battery = useBattery(result?.series)
  const hibernateBelowPct = useMissionStore((s) => s.energy.hibernateBelowPct)
  const t = useT()

  return (
    <CollapsiblePanel
      id="bottom"
      title={t('panel.bottom')}
      label={t('bottom.aria')}
      icon={<IconClock />}
      help="charts"
      summary={
        <>
          <button
            type="button"
            className="btn btn--primary btn--small"
            onClick={togglePlay}
            aria-pressed={playing}
          >
            {playing ? t('time.pause') : t('time.play')}
          </button>
          <span className="panel__time">
            <strong>T+{formatHours(offsetH)}</strong> <span>{formatDateTime(timeMs)}</span>
          </span>
        </>
      }
    >
      <TimeControls />
      <div className="subtabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            {t(label)}
          </button>
        ))}
      </div>
      <div className="panel--bottom__body">
        {tab === 'timeline' &&
          (result && detail ? (
            <Timeline
              series={result.series}
              mask={detail.mask}
              offsetH={offsetH}
              onSeek={setOffset}
              battery={battery}
              hibernateBelowPct={hibernateBelowPct}
            />
          ) : (
            <p className="hint">{t('bottom.computing')}</p>
          ))}
        {tab === 'horizon' &&
          (detail ? (
            <HorizonChart
              mask={detail.mask}
              series={result?.series}
              instant={instant}
              showPaths={showPaths}
            />
          ) : (
            <p className="hint">{t('bottom.loadingHorizon')}</p>
          ))}
        {tab === 'dates' && <DateSweep />}
      </div>
    </CollapsiblePanel>
  )
}
