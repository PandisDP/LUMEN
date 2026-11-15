import { useT } from '../i18n/index.ts'
import { DARK_CHART_THEME as MAP, alpha } from './chartTheme.ts'
import { isPolar, nearSideXY, polarXY } from './locator.ts'

/** The Moon disc is imagery, dark in both themes: marks on it use the dark ink. */
const GRATICULE = alpha(MAP.ink, 0.18)

export interface LocatorPoint {
  lat: number
  lon: number
  color?: string
  /** Short tag drawn next to the dot (scenario letter). */
  label?: string
}

/**
 * "Where on the Moon is this?": a tiny map of the lunar south pole (rings every 2°, the pole in
 * the centre) with the site(s) as dots. Sites outside the polar cap are drawn on a near-side disc.
 */
export function MoonLocator({
  points,
  size = 72,
  showCaption = false,
}: {
  points: readonly LocatorPoint[]
  size?: number
  showCaption?: boolean
}) {
  const t = useT()
  const polar = points.length === 0 || points.every((p) => isPolar(p.lat))
  const R = 44
  const xy = (p: LocatorPoint) => {
    const [x, y] = polar ? polarXY(p.lat, p.lon) : nearSideXY(p.lat, p.lon)
    return [50 + x * R, 50 + y * R] as const
  }
  const caption = polar ? t('locator.pole') : t('locator.nearSide')

  return (
    <figure className="locator" style={{ width: size }}>
      <svg viewBox="0 0 100 100" role="img" aria-label={caption}>
        <defs>
          <radialGradient id="locator-moon" cx="45%" cy="40%" r="65%">
            <stop offset="0" stopColor="#8f9097" />
            <stop offset="1" stopColor="#3b3d45" />
          </radialGradient>
        </defs>
        <circle cx="50" cy="50" r={R} fill="url(#locator-moon)" stroke="hsl(var(--border))" />
        {polar ? (
          <>
            {[-82, -84, -86, -88].map((lat) => (
              <circle
                key={lat}
                cx="50"
                cy="50"
                r={polarXY(lat, 0)[1] * -R}
                fill="none"
                stroke={GRATICULE}
                strokeWidth=".6"
              />
            ))}
            <line x1="50" y1="6" x2="50" y2="94" stroke={alpha(MAP.ink, 0.12)} strokeWidth=".5" />
            <line x1="6" y1="50" x2="94" y2="50" stroke={alpha(MAP.ink, 0.12)} strokeWidth=".5" />
            <text x="50" y="13" className="locator__tick">
              ⊕ 0°
            </text>
            <path d="M47 47 L53 53 M53 47 L47 53" stroke={MAP.ink} strokeWidth="1" opacity=".7" />
          </>
        ) : (
          <ellipse
            cx="50"
            cy="50"
            rx={R}
            ry={R * 0.08}
            fill="none"
            stroke={GRATICULE}
            strokeWidth=".6"
          />
        )}
        {points.map((p, i) => {
          const [x, y] = xy(p)
          // `style`, not the attribute: the colour may be a CSS variable (scenario colours).
          const fill = p.color ?? 'var(--series-1)'
          return (
            <g key={i}>
              <circle cx={x} cy={y} r="5.5" style={{ fill }} opacity=".25" />
              <circle cx={x} cy={y} r="3" style={{ fill }} stroke={MAP.ink} strokeWidth=".6" />
              {p.label && (
                <text x={x + 5} y={y - 4} className="locator__label" fill={MAP.ink}>
                  {p.label}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      {showCaption && <figcaption>{caption}</figcaption>}
    </figure>
  )
}
