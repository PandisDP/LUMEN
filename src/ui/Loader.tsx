import { useProgress } from '@react-three/drei'
import { useT } from '../i18n/index.ts'

/** Full-screen overlay shown while three.js loaders are active (works outside <Canvas>). */
export function Loader() {
  const t = useT()
  const { active, progress } = useProgress()
  if (!active) return null

  return (
    <div className="loader" role="status" aria-live="polite">
      <div className="loader__bar">
        <div className="loader__fill" style={{ width: `${progress}%` }} />
      </div>
      <p>{t('loader.textures', { pct: Math.round(progress) })}</p>
    </div>
  )
}
