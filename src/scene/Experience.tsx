import { useMissionStore } from '../store/useMissionStore.ts'
import { MacroScene } from './macro/MacroScene.tsx'
import { MicroScene } from './micro/MicroScene.tsx'

/**
 * Root of the 3D scene graph: the orbital context, or the active site's surface, either from the
 * lander's eye ('micro') or flown into during the descent ('landing').
 */
export function Experience() {
  const view = useMissionStore((s) => s.view)
  return view === 'macro' ? <MacroScene /> : <MicroScene />
}
