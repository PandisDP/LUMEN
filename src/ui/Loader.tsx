import { useProgress } from '@react-three/drei'
import { useSyncExternalStore } from 'react'
import { useT } from '../i18n/index.ts'
import { Killa } from './Killa.tsx'

function subscribeOnline(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

const isOnline = () => navigator.onLine !== false

/** Full-screen overlay shown while three.js loaders are active (works outside <Canvas>). */
export function Loader() {
  const t = useT()
  const { active, progress } = useProgress()
  const online = useSyncExternalStore(subscribeOnline, isOnline, () => true)
  if (!active) return null

  return (
    <div className={`loader${online ? '' : ' loader--offline'}`} role="status" aria-live="polite">
      <Killa state={online ? 'thinking' : 'offline'} size={online ? 40 : 56} />
      <div className="loader__bar">
        <div className="loader__fill" style={{ width: `${progress}%` }} />
      </div>
      <p>{t('loader.textures', { pct: Math.round(progress) })}</p>
      {!online && <p className="loader__offline">{t('killa.offline')}</p>}
    </div>
  )
}
