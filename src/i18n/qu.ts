import type { es } from './es.ts'
import { core } from './qu/core.ts'
import { flow } from './qu/flow.ts'
import { scene } from './qu/scene.ts'

/** A partial Quechua dictionary: only keys of the Spanish source; the rest falls back to Spanish. */
export type QuDict = Partial<Record<keyof typeof es, string>>

/**
 * Runasimi (Southern Quechua, Cusco-Collao; official three-vowel spelling). Main interface only,
 * written without a native reviewer.
 * The parts live in ./qu/ by area.
 */
export const qu: QuDict = { ...core, ...scene, ...flow }
