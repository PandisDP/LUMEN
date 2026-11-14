import { useT } from '../i18n/index.ts'
import { cardinal } from './format.ts'

/** Degrees of azimuth visible across the tape. */
const SPAN = 120
const TICK = 5

const wrap180 = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180

/** Horizontal position (%) of an azimuth on the tape, or null when it is off the tape. */
const at = (az: number, center: number) => {
  const d = wrap180(az - center)
  return Math.abs(d) > SPAN / 2 ? null : 50 + (d / SPAN) * 100
}

/**
 * Heading tape like an aircraft HUD: ticks every 5°, cardinal points and degrees, plus the
 * Sun and Earth azimuths when they are in range (glyph + text, not colour alone). Below it, the
 * exact heading, elevation and field of view.
 */
export function CompassTape({
  az,
  el,
  fov,
  sunAz,
  earthAz,
}: {
  az: number
  el: number
  fov: number
  sunAz?: number
  earthAz?: number
}) {
  const t = useT()
  const ticks: { deg: number; x: number }[] = []
  const first = Math.ceil((az - SPAN / 2) / TICK) * TICK
  for (let d = first; d <= az + SPAN / 2; d += TICK) {
    const x = at(d, az)
    if (x !== null) ticks.push({ deg: ((d % 360) + 360) % 360, x })
  }
  const bodies = [
    ['sun', sunAz, '☀', t('scene.sun')],
    ['earth', earthAz, '⊕', t('scene.earth')],
  ] as const

  return (
    <div className="ctape" aria-label={t('hud.compass')} role="group">
      <div className="ctape__strip" aria-hidden>
        {ticks.map(({ deg, x }) => {
          const major = deg % 45 === 0
          const mid = !major && deg % 15 === 0
          return (
            <span
              key={deg}
              className={`ctape__tick${major ? ' ctape__tick--major' : mid ? ' ctape__tick--mid' : ''}`}
              style={{ left: `${x}%` }}
            >
              {major ? cardinal(deg) : mid ? deg : null}
            </span>
          )
        })}
        {bodies.map(([id, bodyAz, glyph, name]) => {
          const x = bodyAz === undefined ? null : at(bodyAz, az)
          return x === null ? null : (
            <span
              key={id}
              className={`ctape__body ctape__body--${id}`}
              style={{ left: `${x}%` }}
              title={name}
            >
              {glyph}
            </span>
          )
        })}
        <span className="ctape__needle" />
      </div>
      <p className="ctape__read">
        <strong>
          {Math.round(az)}° {cardinal(az)}
        </strong>
        <span>
          {t('hud.elev')} {el.toFixed(1)}°
        </span>
        <span>FOV {fov.toFixed(0)}°</span>
      </p>
    </div>
  )
}
