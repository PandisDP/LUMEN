import { useT } from '../i18n/index.ts'
import type { Level } from './levels.ts'

const ICONS: Record<Level, string> = { good: '✓', warn: '!', bad: '✕' }

/**
 * Shape + text companion to the traffic-light colours, so a level never relies on colour
 * alone (colour-vision deficiencies, greyscale prints).
 */
export function LevelTag({ level }: { level: Level | undefined }) {
  const t = useT()
  if (!level) return null
  return (
    <span className="lvl" data-level={level} title={t(`level.${level}`)}>
      <span aria-hidden>{ICONS[level]}</span>
      <span className="sr-only">{t(`level.${level}`)}</span>
    </span>
  )
}
