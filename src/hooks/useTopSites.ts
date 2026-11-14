import { type CatalogRow, useCatalogViability } from './useCatalogViability.ts'

export const TOP_N = 3

/** Best south-pole sites first (already sorted by viability, then blended score). */
export const topPolarRows = (rows: readonly CatalogRow[] | undefined, n = TOP_N) =>
  rows?.filter((r) => r.info.category === 'south-pole').slice(0, n)

/** The Top 3 south-pole sites for the active date, mission and lander, ranked live. */
export function useTopSites(n = TOP_N) {
  const { rows, loading, error } = useCatalogViability(true)
  return { top: topPolarRows(rows, n), all: rows, loading, error }
}
