import { customSiteInfo } from '../../data/catalog.ts'
import { useMissionStore } from '../../store/useMissionStore.ts'

/** Moves the active scenario to a user-picked point (custom site, 20 m tile when covered). */
export function relocateTo(lat: number, lon: number) {
  const s = useMissionStore.getState()
  const round = (v: number) => Math.round(v * 1e5) / 1e5
  s.addCustomSite(customSiteInfo(round(lat), round(lon)))
  s.setPickMode(false)
}
