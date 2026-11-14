import { Html } from '@react-three/drei'
import type { Vector3 } from 'three'
import { useT } from '../../i18n/index.ts'
import { SunGlare } from '../SunGlare.tsx'

/** The Sun in the orbital view: glare sprites (see SunGlare) plus its label. */
export function Sun({ position, radius }: { position: Vector3; radius: number }) {
  const t = useT()
  return (
    <group position={position}>
      <SunGlare radius={radius} />
      <Html
        center
        distanceFactor={40}
        position={[0, -radius * 2.6, 0]}
        className="label label--sun"
      >
        {t('scene.sun')}
      </Html>
    </group>
  )
}
