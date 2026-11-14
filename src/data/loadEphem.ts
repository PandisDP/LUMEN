import type { EphemTableMeta } from '../astro/ephemTable.ts'
import { setEphemerisTable } from '../astro/ephemeris.ts'

const BASE = `${import.meta.env.BASE_URL}data/ephem/de441`

let pending: Promise<boolean> | null = null

/**
 * Fetches the JPL Horizons (DE441) table published by `npm run data:ephem` and installs it
 * for this thread (the main thread and the astro worker each call it once). Resolves to
 * false if it is missing; the IAU model is then used everywhere, so the app still works.
 */
export function installEphemerisTable(): Promise<boolean> {
  pending ??= (async () => {
    try {
      const [meta, buf] = await Promise.all([
        fetch(`${BASE}.json`).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return r.json() as Promise<EphemTableMeta>
        }),
        fetch(`${BASE}.bin`).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return r.arrayBuffer()
        }),
      ])
      const data = new Float32Array(buf)
      if (data.length !== meta.count * 6) throw new Error('size mismatch')
      setEphemerisTable({ ...meta, data })
      return true
    } catch {
      return false
    }
  })()
  return pending
}
