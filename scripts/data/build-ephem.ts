/**
 * Publishes the JPL Horizons (DE441) Sun/Earth table used by the app and the pipeline.
 *
 *   npm run data:ephem
 *
 * Output: public/data/ephem/de441.bin (Float32, sun xyz + earth xyz per sample, km, Moon
 * body-fixed frame) and de441.json (time grid). Outside its span the app falls back to the
 * IAU model (src/astro/ephemeris.ts). Prints the difference between both models.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { RAD } from '../../src/astro/constants.ts'
import { iauEphemeris } from '../../src/astro/ephemeris.ts'
import { dot, norm } from '../../src/astro/frames.ts'
import { EPHEM_DIR, EPHEM_NAME, fetchBodyFixedTable } from './horizons.ts'

const START = '2025-12-31'
const STOP = '2031-01-02'
const STEP_HOURS = 2

const angleDeg = (a: readonly number[], b: readonly number[]) =>
  Math.acos(Math.min(1, dot(a as never, b as never) / (norm(a as never) * norm(b as never)))) * RAD

async function main() {
  const table = await fetchBodyFixedTable(START, STOP, STEP_HOURS)
  let worstSun = 0
  let worstEarth = 0
  for (let i = 0; i < table.count; i += 7) {
    const iau = iauEphemeris(new Date(table.startMs + i * table.stepMs))
    const d = table.data
    worstSun = Math.max(worstSun, angleDeg(iau.sun, Array.from(d.subarray(i * 6, i * 6 + 3))))
    worstEarth = Math.max(
      worstEarth,
      angleDeg(iau.earth, Array.from(d.subarray(i * 6 + 3, i * 6 + 6))),
    )
  }
  await mkdir(EPHEM_DIR, { recursive: true })
  const { data, ...meta } = table
  await writeFile(join(EPHEM_DIR, `${EPHEM_NAME}.bin`), new Uint8Array(data.buffer))
  await writeFile(join(EPHEM_DIR, `${EPHEM_NAME}.json`), JSON.stringify(meta, null, 1) + '\n')
  console.log(
    `${table.count} samples ${START} → ${STOP} every ${STEP_HOURS} h, ${(data.byteLength / 1024).toFixed(0)} KB`,
  )
  console.log(
    `IAU model vs DE441 (direction from the Moon centre): Sun ≤ ${worstSun.toFixed(4)}°, Earth ≤ ${worstEarth.toFixed(4)}°`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
