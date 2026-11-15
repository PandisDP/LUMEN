import type { ReactNode } from 'react'
import { BAND_GLYPH } from '../bands.ts'
import { LevelTag } from '../LevelTag.tsx'
import type { Level } from '../levels.ts'

interface Props {
  label: string
  value: ReactNode
  unit?: string
  /** Reading of the figure: adds the level glyph (with its text for screen readers) and ink. */
  level?: Level
  /** Change against a reference; `better` says which direction is good (colours the arrow). */
  delta?: { value: number; unit?: string; better?: 'up' | 'down' }
}

/** A headline figure: small uppercase label, the number in the display face, optional delta. */
export function Stat({ label, value, unit, level, delta }: Props) {
  const d = delta && Math.abs(delta.value) >= 0.5 ? delta : undefined
  const up = !!d && d.value > 0
  return (
    <div className="kstat" data-level={level}>
      <span className="kstat__label">{label}</span>
      <span className="kstat__value">
        {value}
        {unit && <small>{unit}</small>}
        {level && <LevelTag level={level} />}
      </span>
      {d && (
        <span
          className="kstat__delta"
          data-good={d.better ? (d.better === 'up') === up : undefined}
        >
          <span aria-hidden>{up ? BAND_GLYPH.excess : BAND_GLYPH.deficit}</span> {up ? '+' : '−'}
          {Math.abs(Math.round(d.value))}
          {d.unit ?? ''}
        </span>
      )}
    </div>
  )
}
