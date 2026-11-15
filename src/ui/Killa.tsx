/**
 * **Killa** ("Moon" in Quechua), the LUMEN mascot and sister of Wayra: same geometry and pieces
 * (white helmet with a gold lamp, dark visor, chest screen); only the body colour (copper, two
 * tones) and the chest icon (a crescent moon) change.
 *
 * She appears where the app speaks or waits (assistant, start screen, loading, empty states),
 * never as decoration of a table or a chart.
 *
 * Five states, always distinguishable without motion (the face changes):
 * - `idle`     breathes (3 s).
 * - `thinking` the lamp blinks and she looks to one side.
 * - `ok`       happy eyes (arcs) and one hop on entering.
 * - `alert`    red lamp, half-closed eyelids and a straight mouth.
 * - `offline`  desaturated, lamp off, sad mouth.
 *
 * The body keeps the fixed colours of the asset (copper is brand, not state); only the lamp uses
 * state tokens. All motion lives in `styles/killa.css` under `prefers-reduced-motion:
 * no-preference`. `aria-hidden` unless a `title` is given: then it is a named image.
 */
export type KillaState = 'idle' | 'thinking' | 'ok' | 'alert' | 'offline'

const BODY = '#C8763E'
const SHADE = '#9A5527'
const INK = '#1B1B2C'
const EYES = '#7CF0F0'

export function Killa({
  state = 'idle',
  size = 48,
  title,
  className,
}: {
  state?: KillaState
  size?: number
  title?: string
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 240 240"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      data-state={state}
      data-testid="killa"
      className={`killa killa-${state}${className ? ` ${className}` : ''}`}
    >
      {title && <title>{title}</title>}
      <g className="killa-body">
        {/* feet and arms */}
        <rect x="88" y="192" width="26" height="20" rx="10" fill={SHADE} />
        <rect x="126" y="192" width="26" height="20" rx="10" fill={SHADE} />
        <rect x="54" y="124" width="28" height="56" rx="13" fill={SHADE} />
        <rect x="158" y="124" width="28" height="56" rx="13" fill={SHADE} />
        {/* antenna */}
        <line
          x1="170"
          y1="126"
          x2="180"
          y2="96"
          stroke={INK}
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <circle cx="181" cy="93" r="5" className="killa-tip" />
        {/* torso with the screen: a crescent moon */}
        <rect x="74" y="112" width="92" height="84" rx="26" fill={BODY} />
        <rect
          x="94"
          y="134"
          width="52"
          height="32"
          rx="8"
          fill="#FFFFFF"
          className="killa-screen"
        />
        <path d="M124.8 139.7 A11 11 0 1 0 131.3 153.8 A9 9 0 0 1 124.8 139.7 Z" fill={SHADE} />
        {/* neck and head */}
        <rect x="111" y="100" width="18" height="14" fill={INK} />
        <rect x="78" y="46" width="84" height="60" rx="24" fill={BODY} />
        <rect x="90" y="60" width="60" height="32" rx="13" fill={INK} />
        {/* face */}
        <g className="killa-eyes">
          {state === 'ok' ? (
            <>
              <path
                d="M100 76 Q107 68 114 76"
                fill="none"
                stroke={EYES}
                strokeWidth="3.5"
                strokeLinecap="round"
              />
              <path
                d="M126 76 Q133 68 140 76"
                fill="none"
                stroke={EYES}
                strokeWidth="3.5"
                strokeLinecap="round"
              />
            </>
          ) : (
            <>
              <circle cx="107" cy="74" r="6.5" fill={EYES} />
              <circle cx="133" cy="74" r="6.5" fill={EYES} />
              {state === 'alert' && <rect x="98" y="64" width="44" height="7" fill={INK} />}
            </>
          )}
        </g>
        {state === 'alert' ? (
          <line
            x1="112"
            y1="86"
            x2="128"
            y2="86"
            stroke={EYES}
            strokeWidth="3"
            strokeLinecap="round"
            className="killa-mouth"
          />
        ) : (
          <path
            d={state === 'offline' ? 'M111 88 Q120 83 129 88' : 'M111 84 Q120 90 129 84'}
            fill="none"
            stroke={EYES}
            strokeWidth="3"
            strokeLinecap="round"
            className="killa-mouth"
          />
        )}
        {/* helmet and lamp */}
        <path d="M80 48 Q80 18 120 18 Q160 18 160 48 Z" fill="#FFFFFF" />
        <rect x="68" y="42" width="104" height="10" rx="5" fill={SHADE} />
        <circle cx="120" cy="27" r="6.5" className="killa-lamp" />
      </g>
    </svg>
  )
}
