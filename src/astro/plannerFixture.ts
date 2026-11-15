import { DEG } from './constants.ts'
import { type DemGrid, lolaProductMeta, pixelToMap } from './dem.ts'
import { mapToSouthPolar } from './frames.ts'
import { DEFAULT_LIMITS } from './hardware.ts'
import { type IllumGrid, encodeIllum } from './illumination.ts'
import type { PlanProblem } from './plannerTypes.ts'

/**
 * Synthetic terrain for the planner tests (no published data needed): a gentle dome centred on
 * the pole, ±2.4 km at 20 m/px, with a ridge to the west that hides the low Sun and the Earth
 * from the ground behind it for part of each lunar day, a steep step to the south that no rover
 * climbs, and a patch of permanent shadow to the east on a 100 m illumination map.
 */
const SIZE = 241
const meta = lolaProductMeta(SIZE, 20)

export function fixtureDem(): DemGrid {
  const data = new Int16Array(SIZE * SIZE)
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) {
      const { x, y } = pixelToMap(meta, c, r)
      const dome = 300 - 0.04 * Math.hypot(x, y)
      const ridge = 120 * Math.exp(-(((x + 700) / 120) ** 2))
      const step = y < -1500 ? (-1500 - y) * Math.tan(35 * DEG) : 0
      data[r * SIZE + c] = Math.round((dome + ridge + step) / meta.heightScale)
    }
  return { ...meta, data }
}

const ILLUM_SIZE = 48
const illumMeta = {
  ...meta,
  originX: -2350,
  originY: 2350,
  scaleM: 100,
  width: ILLUM_SIZE,
  height: ILLUM_SIZE,
}

/** Permanent shadow for 900 < x < 1300 m, |y| < 250 m; brighter towards the dome's top. */
export function fixtureIllum(): IllumGrid {
  const data = new Uint8Array(ILLUM_SIZE * ILLUM_SIZE)
  for (let r = 0; r < ILLUM_SIZE; r++)
    for (let c = 0; c < ILLUM_SIZE; c++) {
      const { x, y } = pixelToMap(illumMeta, c, r)
      const psr = x > 900 && x < 1300 && Math.abs(y) < 250
      data[r * ILLUM_SIZE + c] = psr ? 0 : encodeIllum(80 - Math.hypot(x, y) / 60, 1)
    }
  return { ...illumMeta, data }
}

/** A point of the fixture by its map coordinates (m). */
export const fixturePoint = (x: number, y: number) => mapToSouthPolar(x, y)

/** Target on the shadowed patch; in these dates the Sun is up at the pole and sets behind the step half-way through. */
export function fixtureProblem(patch: Partial<PlanProblem> = {}): PlanProblem {
  return {
    target: fixturePoint(1000, 0),
    tileSiteId: 'fixture',
    fromMs: Date.UTC(2027, 11, 11),
    days: 6,
    missionDays: 3,
    minSunDays: 1,
    roverId: 'rover',
    minRoverSocPct: 20,
    radiusM: 1000,
    hardware: { ...DEFAULT_LIMITS, minDtePct: 0 },
    linkMarginDeg: 0,
    requireDsn: false,
    scienceWeight: 0,
    ...patch,
  }
}
