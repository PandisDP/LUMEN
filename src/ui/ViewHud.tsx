import { useState } from 'react'
import { maskAt } from '../astro/horizon.ts'
import { SLOPE_CAUTION_DEG, SLOPE_SAFE_DEG } from '../astro/slope.ts'
import { CUSTOM_DEM_MAX_LAT } from '../data/catalog.ts'
import { terrainTileId, useImageryIndex } from '../data/loadImagery.ts'
import { useInstant } from '../hooks/useScenario.ts'
import { type MsgKey, useT } from '../i18n/index.ts'
import { SLOPE_COLORS } from '../scene/micro/slopeColors.ts'
import { ILLUM_COLORS } from '../scene/micro/illumColors.ts'
import { ELLIPSE_RADII, selectActiveScenario, useMissionStore } from '../store/useMissionStore.ts'
import { useDescentStore } from '../store/useDescentStore.ts'
import { type MacroFrame, useViewStore } from '../store/useViewStore.ts'
import { DescentHud } from './DescentHud.tsx'
import { HelpButton } from './HelpButton.tsx'
import { CompassTape } from './CompassTape.tsx'
import { formatDistance, formatLatLon } from './format.ts'
import { isPolar } from './locator.ts'
import { Countdown } from './MetricsPanel.tsx'
import { MoonLocator } from './MoonLocator.tsx'
import {
  IconEarth,
  IconEye,
  IconLander,
  IconOrbit,
  IconSatellite,
  IconSun,
  IconTarget,
  IconWide,
} from './icons.tsx'

function SlopeLegend() {
  const t = useT()
  const items = [
    ['safe', SLOPE_COLORS.safe, t('slope.legend.safe', { deg: SLOPE_SAFE_DEG })],
    [
      'caution',
      SLOPE_COLORS.caution,
      t('slope.legend.caution', { a: SLOPE_SAFE_DEG, b: SLOPE_CAUTION_DEG }),
    ],
    ['steep', SLOPE_COLORS.steep, t('slope.legend.steep', { deg: SLOPE_CAUTION_DEG })],
  ] as const
  return (
    <ul className="legend" aria-label={t('slope.legend.title')}>
      {items.map(([k, color, label]) => (
        <li key={k}>
          <span className="legend__swatch" style={{ background: color }} aria-hidden />
          {label}
        </li>
      ))}
    </ul>
  )
}

function IllumLegend() {
  const t = useT()
  const stripes = `repeating-linear-gradient(45deg, ${ILLUM_COLORS.psr} 0 3px, #1c4080 3px 6px)`
  const items = [
    ['psr', stripes, t('illum.legend.psr')],
    ['dim', ILLUM_COLORS.dim, t('illum.legend.dim')],
    ['bright', ILLUM_COLORS.bright, t('illum.legend.bright')],
    ['route', '#7fd4ff', t('illum.legend.route')],
  ] as const
  return (
    <ul className="legend" aria-label={t('illum.legend.title')}>
      {items.map(([k, bg, label]) => (
        <li key={k}>
          <span className="legend__swatch" style={{ background: bg }} aria-hidden />
          {label}
        </li>
      ))}
    </ul>
  )
}

const FRAMES = [
  ['sun', 'frame.sun', IconSun],
  ['earth', 'frame.earth', IconEarth],
  ['free', 'frame.free', IconOrbit],
] as const satisfies readonly (readonly [MacroFrame, MsgKey, () => React.JSX.Element])[]

/** "Lunar south pole · 89.4°S": where on the Moon the view is, with a mini map. */
function PoleBadge({ lat, lon }: { lat?: number; lon?: number }) {
  const t = useT()
  if (lat === undefined || lon === undefined) return null
  return (
    <div className="polebadge">
      <MoonLocator points={[{ lat, lon }]} size={40} />
      <span>
        <strong>{isPolar(lat) ? t('scene.southPole') : t('locator.nearSide')}</strong>
        <span className="hint"> · {formatLatLon(lat, lon)}</span>
      </span>
    </div>
  )
}

/** Compass and camera shortcuts for the surface view; framing buttons for the orbital view. */
export function ViewHud() {
  // Small screens only (see .viewhud__more): whether the folded control rows are shown.
  const [more, setMore] = useState(false)

  const t = useT()
  const view = useMissionStore((s) => s.view)
  const showMask = useMissionStore((s) => s.showMask)
  const showPaths = useMissionStore((s) => s.showPaths)
  const showSlope = useMissionStore((s) => s.showSlope)
  const aerial = useMissionStore((s) => s.aerial)
  const pickMode = useMissionStore((s) => s.pickMode)
  const ellipseRadiusM = useMissionStore((s) => s.ellipseRadiusM)
  const showIllum = useMissionStore((s) => s.showIllum)
  const showNac = useMissionStore((s) => s.showNac)
  const scenario = useMissionStore(selectActiveScenario)
  const {
    lookAt,
    setShowMask,
    setShowPaths,
    setShowSlope,
    setShowIllum,
    setShowNac,
    setAerial,
    setPickMode,
    setEllipseRadius,
    setView,
  } = useMissionStore.getState()
  const landerCam = useMissionStore((s) => s.landerCam)
  const landed = useDescentStore((s) => s.landed)
  const { az, el, fov, macroFrame, setMacroFrame } = useViewStore()
  const { instant, detail } = useInstant(scenario)
  const hasTerrain = Boolean(detail && detail.site.lat <= CUSTOM_DEM_MAX_LAT)
  const hasIllum = Boolean(detail?.illum)
  const nacRef = useImageryIndex()?.sites[terrainTileId(detail?.terrain?.file) ?? '']

  if (view === 'macro') {
    return (
      <div className="viewhud" data-tour="viewhud">
        <PoleBadge lat={detail?.site.lat} lon={detail?.site.lon} />
        <div className="viewhud__buttons" role="group" aria-label={t('frame.aria')}>
          <span className="hint">{t('frame.label')}</span>
          {FRAMES.map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              className="btn"
              aria-pressed={macroFrame === id}
              onClick={() => setMacroFrame(id)}
            >
              <Icon /> {t(label)}
            </button>
          ))}
        </div>
        <div className="viewhud__row">
          <p className="hint">{t('hud.macroHint')}</p>
          <HelpButton topic="hud" />
        </div>
      </div>
    )
  }

  const compass = (
    <CompassTape
      az={az}
      el={el}
      fov={fov}
      sunAz={instant?.sky.sun.az}
      earthAz={instant?.sky.earth.az}
    />
  )

  if (view === 'landing') {
    return (
      <div className="viewhud" data-tour="viewhud">
        {/* The compass follows the lander's eye; meaningless while orbiting the craft. */}
        {!(landed && landerCam === 'orbit') && compass}
        <DescentHud />
      </div>
    )
  }

  // Aim slightly above whichever is higher (the body or the ridge) so the context is visible.
  const aim = (bodyAz: number, bodyEl: number) => {
    if (aerial) setAerial(false)
    lookAt(bodyAz, Math.max(bodyEl, detail ? maskAt(detail.mask, bodyAz) : bodyEl) + 0.4, 8)
  }

  const toggleAerial = () => {
    const next = !aerial
    setAerial(next)
    if (next) lookAt(az, -89, 60)
    else if (instant) aim(instant.sky.sun.az, instant.sky.sun.el)
  }

  return (
    <div className={`viewhud${more ? ' viewhud--more' : ''}`} data-tour="viewhud">
      <PoleBadge lat={detail?.site.lat} lon={detail?.site.lon} />
      <div className="viewhud__row">
        {compass}
        <HelpButton topic="hud" />
        {/* Small screens: the control rows fold away so the scene stays visible. */}
        <button
          type="button"
          className="btn viewhud__more"
          aria-expanded={more}
          onClick={() => setMore(!more)}
        >
          {more ? t('hud.less') : t('hud.more')}
        </button>
      </div>
      {instant && (
        <div className="viewhud__countdowns">
          <span data-on={instant.sunUp}>
            ☀{' '}
            <Countdown
              on={instant.sunUp}
              nextMs={instant.sun.nextChangeMs}
              now={instant.timeMs}
              onKey="ev.sunset"
              offKey="ev.sunrise"
            />
          </span>
          <span data-on={instant.earthUp}>
            ⊕{' '}
            <Countdown
              on={instant.earthUp}
              nextMs={instant.earth.nextChangeMs}
              now={instant.timeMs}
              onKey="ev.earthset"
              offKey="ev.earthrise"
            />
          </span>
        </div>
      )}
      <div className="viewhud__buttons">
        <button
          type="button"
          className="btn"
          disabled={!instant}
          onClick={() => instant && aim(instant.sky.sun.az, instant.sky.sun.el)}
        >
          <IconSun /> {t('hud.lookSun')}
        </button>
        <button
          type="button"
          className="btn"
          disabled={!instant}
          onClick={() => instant && aim(instant.sky.earth.az, instant.sky.earth.el)}
        >
          <IconEarth /> {t('hud.lookEarth')}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            if (aerial) setAerial(false)
            lookAt(az, 5, 75)
          }}
        >
          <IconWide /> {t('hud.wide')}
        </button>
        <button
          type="button"
          className="btn"
          disabled={!instant}
          onClick={() => setView('landing')}
        >
          <IconLander /> {t('hud.simulateDescent')}
        </button>
        <label className="toggle">
          <input
            type="checkbox"
            checked={showMask}
            onChange={(e) => setShowMask(e.target.checked)}
          />
          {t('hud.horizonLine')}
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={showPaths}
            onChange={(e) => setShowPaths(e.target.checked)}
          />
          {t('hud.paths')}
        </label>
      </div>
      {hasTerrain && (
        <div className="viewhud__buttons" role="group" aria-label={t('hud.landingTools')}>
          <button type="button" className="btn" aria-pressed={aerial} onClick={toggleAerial}>
            {aerial ? <IconEye /> : <IconSatellite />}
            {aerial ? t('hud.landerView') : t('hud.aerialView')}
          </button>
          <label className="toggle">
            <input
              type="checkbox"
              checked={showSlope}
              onChange={(e) => {
                setShowSlope(e.target.checked)
                if (e.target.checked) {
                  setShowIllum(false)
                  setShowNac(false)
                }
              }}
            />
            {t('hud.slope')}
          </label>
          {hasIllum && (
            <label className="toggle" title={t('hud.illumTitle')}>
              <input
                type="checkbox"
                checked={showIllum}
                onChange={(e) => {
                  setShowIllum(e.target.checked)
                  if (e.target.checked) {
                    setShowSlope(false)
                    setShowNac(false)
                  }
                }}
              />
              {t('hud.illum')}
            </label>
          )}
          {nacRef && (
            <label className="toggle" title={t('hud.nacTitle')}>
              <input
                type="checkbox"
                checked={showNac}
                onChange={(e) => {
                  setShowNac(e.target.checked)
                  if (e.target.checked) {
                    setShowSlope(false)
                    setShowIllum(false)
                  }
                }}
              />
              {t('hud.nac')}
            </label>
          )}
          <label className="toggle">
            {t('hud.ellipse')}
            <select
              value={ellipseRadiusM}
              onChange={(e) => setEllipseRadius(Number(e.target.value))}
            >
              {ELLIPSE_RADII.map((r) => (
                <option key={r} value={r}>
                  {r ? `r = ${formatDistance(r)}` : t('hud.ellipseOff')}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn"
            aria-pressed={pickMode}
            onClick={() => setPickMode(!pickMode)}
            title={t('hud.pickTitle')}
          >
            <IconTarget /> {pickMode ? t('hud.pickActive') : t('hud.pick')}
          </button>
        </div>
      )}
      {showSlope && hasTerrain && <SlopeLegend />}
      {showIllum && hasIllum && <IllumLegend />}
      {showNac && nacRef && (
        <p className="hint viewhud__credit">{t('hud.nacCredit', { source: nacRef.source })}</p>
      )}
      <p className="hint">{aerial ? t('hud.aerialHint') : t('hud.microHint')}</p>
    </div>
  )
}
