import { useEffect } from 'react'
import { useBattery, useInstant } from '../hooks/useScenario.ts'
import { type MsgKey, useT } from '../i18n/index.ts'
import { useShow } from './audience.ts'
import {
  type BottomPanel as Tab,
  selectActiveScenario,
  useMissionStore,
} from '../store/useMissionStore.ts'
import { CollapsiblePanel } from './CollapsiblePanel.tsx'
import { DateSweep } from './DateSweep.tsx'
import { formatDateTime, formatHours } from './format.ts'
import { HorizonChart } from './HorizonChart.tsx'
import { PolarMap } from './PolarMap.tsx'
import { SeasonChart } from './SeasonChart.tsx'
import { IconClock } from './icons.tsx'
import { Busy } from './kit/Busy.tsx'
import { TimeControls } from './TimeControls.tsx'
import { Timeline } from './Timeline.tsx'

const TABS: [Tab, MsgKey][] = [
  ['timeline', 'bottom.timeline'],
  ['horizon', 'bottom.horizon'],
  ['dates', 'bottom.dates'],
  ['seasons', 'bottom.seasons'],
  ['map', 'bottom.map'],
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
  const showHorizon = useShow('horizonTab')
  const showDates = useShow('datesTab')
  const showSeasons = useShow('seasonsTab')
  const hidden: Partial<Record<Tab, boolean>> = {
    horizon: !showHorizon,
    dates: !showDates,
    seasons: !showSeasons,
  }
  const tabs = TABS.filter(([id]) => !hidden[id])
  // Switching to an audience that hides the open tab falls back to the timeline.
  const tabHidden = !tabs.some(([id]) => id === tab)
  useEffect(() => {
    if (tabHidden) setTab('timeline')
  }, [tabHidden, setTab])

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
        {tabs.map(([id, label]) => (
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
            <Busy>{t('bottom.computing')}</Busy>
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
            <Busy>{t('bottom.loadingHorizon')}</Busy>
          ))}
        {tab === 'dates' && <DateSweep />}
        {tab === 'seasons' && <SeasonChart />}
        {tab === 'map' && <PolarMap />}
      </div>
    </CollapsiblePanel>
  )
}
