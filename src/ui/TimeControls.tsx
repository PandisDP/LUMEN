import { HOUR_MS } from '../astro/constants.ts'
import { ephemerisSource } from '../astro/ephemeris.ts'
import { installEphemerisTable } from '../data/loadEphem.ts'
import { useAsync } from '../hooks/useAsync.ts'
import { useInstant } from '../hooks/useScenario.ts'
import { useT } from '../i18n/index.ts'
import {
  LINK_MARGIN,
  MISSION_DAYS,
  PLAY_SPEEDS,
  selectActiveScenario,
  useMissionStore,
} from '../store/useMissionStore.ts'
import { formatDateTime, formatHours, fromInputValue, toInputValue } from './format.ts'

/** Landing date, mission length, scrubber and playback. Shared by all scenarios. */
export function TimeControls() {
  const scenario = useMissionStore(selectActiveScenario)
  const offsetH = useMissionStore((s) => s.offsetH)
  const missionDays = useMissionStore((s) => s.missionDays)
  const playing = useMissionStore((s) => s.playing)
  const speed = useMissionStore((s) => s.speed)
  const linkMarginDeg = useMissionStore((s) => s.linkMarginDeg)
  const { setStart, setOffset, setMissionDays, togglePlay, setSpeed, setLinkMargin } =
    useMissionStore.getState()
  const t = useT()
  const { instant, timeMs } = useInstant(scenario)
  // Re-renders once the DE441 table is installed on this thread.
  useAsync('ephem-table', installEphemerisTable)
  const source = ephemerisSource(timeMs)

  const jump = (target: number | null | undefined) => {
    if (target != null) setOffset((target - scenario.startMs) / HOUR_MS + 0.01)
  }

  return (
    <section className="time" aria-label={t('time.aria')} data-tour="time">
      <div className="time__row">
        <label className="field">
          <span>{t('time.landing')}</span>
          <input
            type="datetime-local"
            value={toInputValue(scenario.startMs)}
            onChange={(e) => setStart(fromInputValue(e.target.value))}
          />
        </label>
        <label className="field field--narrow">
          <span>{t('time.duration')}</span>
          <input
            type="number"
            min={MISSION_DAYS.min}
            max={MISSION_DAYS.max}
            value={missionDays}
            onChange={(e) => setMissionDays(Number(e.target.value))}
          />
        </label>
        <label className="field field--narrow" title={t('link.title')}>
          <span>{t('link.label')}</span>
          <input
            type="number"
            min={LINK_MARGIN.min}
            max={LINK_MARGIN.max}
            step={0.5}
            value={linkMarginDeg}
            onChange={(e) => setLinkMargin(Number(e.target.value))}
          />
        </label>
        <div className="time__buttons">
          <button
            type="button"
            className="btn btn--primary"
            onClick={togglePlay}
            aria-pressed={playing}
          >
            {playing ? t('time.pause') : t('time.play')}
          </button>
          <label className="field field--inline">
            <span className="sr-only">{t('time.speed')}</span>
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
              {PLAY_SPEEDS.map((s) => (
                <option key={s} value={s}>
                  {s} h/s
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn"
            disabled={instant?.sun.nextChangeMs == null}
            onClick={() => jump(instant?.sun.nextChangeMs)}
            title={t('time.jumpSunTitle')}
          >
            {instant?.sunUp ? t('time.sunset') : t('time.sunrise')}
          </button>
          <button
            type="button"
            className="btn"
            disabled={instant?.earth.nextChangeMs == null}
            onClick={() => jump(instant?.earth.nextChangeMs)}
            title={t('time.jumpEarthTitle')}
          >
            {instant?.earthUp ? t('time.earthset') : t('time.earthrise')}
          </button>
        </div>
      </div>
      <div className="time__row">
        <input
          className="time__scrub"
          type="range"
          min={0}
          max={missionDays * 24}
          step={0.25}
          value={offsetH}
          onChange={(e) => setOffset(Number(e.target.value))}
          aria-label={t('time.scrub')}
        />
        <output className="time__now">
          <strong>T+{formatHours(offsetH)}</strong>
          <span>{formatDateTime(timeMs)}</span>
          <span className={`time__ephem time__ephem--${source}`} title={t('time.ephemTitle')}>
            {t(source === 'horizons' ? 'time.ephemHorizons' : 'time.ephemIau')}
          </span>
        </output>
      </div>
    </section>
  )
}
