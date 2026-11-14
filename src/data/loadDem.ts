import type { DemGrid, DemMeta } from '../astro/dem.ts'
import type { IllumGrid, IllumMeta } from '../astro/illumination.ts'

const demCache = new Map<string, Promise<DemGrid>>()

/**
 * Loads an Int16 DEM published by scripts/data/build-data.ts. `meta` is either the URL of its
 * JSON metadata or the metadata itself. Results are cached per binary URL.
 */
export function loadDem(binUrl: string, meta: string | DemMeta): Promise<DemGrid> {
  let p = demCache.get(binUrl)
  if (!p) {
    p = Promise.all([
      typeof meta === 'string' ? fetch(meta).then((r) => r.json() as Promise<DemMeta>) : meta,
      fetch(binUrl).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} loading ${binUrl}`)
        return r.arrayBuffer()
      }),
    ]).then(([m, buf]) => ({ ...m, data: new Int16Array(buf) }))
    p.catch(() => demCache.delete(binUrl))
    demCache.set(binUrl, p)
  }
  return p
}

const illumCache = new Map<string, Promise<IllumGrid>>()

/** Loads a Uint8 illumination map published by scripts/data/build-derived.ts (cached). */
export function loadIllum(binUrl: string, meta: IllumMeta): Promise<IllumGrid> {
  let p = illumCache.get(binUrl)
  if (!p) {
    p = fetch(binUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} loading ${binUrl}`)
        return r.arrayBuffer()
      })
      .then((buf) => ({ ...meta, data: new Uint8Array(buf) }))
    p.catch(() => illumCache.delete(binUrl))
    illumCache.set(binUrl, p)
  }
  return p
}
