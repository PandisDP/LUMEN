import { selectActiveScenario, useMissionStore } from '../store/useMissionStore.ts'
import { useRoverStore } from '../store/useRoverStore.ts'
import { useTraverse } from './useScience.ts'

/**
 * The traverse to the ice of the active scenario with the selected rover, departing at
 * touchdown. Shared by the 3D rover, its HUD and the ice card: the worker job runs once.
 */
export function useRoverTraverse(enabled = true) {
  const scenario = useMissionStore(selectActiveScenario)
  const roverId = useRoverStore((s) => s.roverId)
  return useTraverse(scenario, enabled, roverId, scenario.startMs)
}
