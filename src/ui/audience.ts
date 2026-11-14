import { type Audience, useUiStore } from '../store/useUiStore.ts'

/**
 * What each audience sees. Everything is still computed; this only decides which cards, tabs
 * and controls are rendered, so the public gets the essentials and planners the full detail.
 */
export type Feature =
  | 'dsn' // Earth–Moon range, path loss and DSN station row
  | 'thermal' // temperature estimate card
  | 'scienceWeight' // Engineering ↔ Science slider
  | 'windowDetail' // all 7 window rows (otherwise energy, sunlit and DTE only)
  | 'ice' // ice access card
  | 'terrain' // slope card
  | 'dispersion' // landing-ellipse card and "suggest a better point"
  | 'hardware' // hardware filter
  | 'export' // CSV / JSON export
  | 'horizonTab' // 360° horizon chart tab
  | 'datesTab' // alternative dates tab
  | 'linkMargin' // DTE link margin control
  | 'customCoords' // custom coordinates form
  | 'explainAuto' // open "Why?" automatically on entering the exploration

export const FEATURES: readonly Feature[] = [
  'dsn',
  'thermal',
  'scienceWeight',
  'windowDetail',
  'ice',
  'terrain',
  'dispersion',
  'hardware',
  'export',
  'horizonTab',
  'datesTab',
  'linkMargin',
  'customCoords',
  'explainAuto',
]

const all = (on: boolean) =>
  Object.fromEntries(FEATURES.map((f) => [f, on])) as Record<Feature, boolean>

export const VISIBLE: Record<Audience, Record<Feature, boolean>> = {
  planner: { ...all(true), explainAuto: false },
  educator: {
    ...all(true),
    dsn: false,
    dispersion: false,
    hardware: false,
    export: false,
    linkMargin: false,
  },
  public: { ...all(false), explainAuto: true },
}

export const isVisible = (audience: Audience, f: Feature) => VISIBLE[audience][f]

/** Reactive: whether the current audience sees a feature. */
export const useShow = (f: Feature) => useUiStore((s) => VISIBLE[s.audience][f])
