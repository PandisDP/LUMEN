/**
 * Physical constants used by the astro core.
 * Imports inside src/astro use explicit `.ts` extensions so the same files run in
 * Vite (browser), Vitest and plain Node (data scripts in scripts/data).
 */

/** LOLA reference sphere radius (m). All LOLA heights are relative to it. */
export const MOON_RADIUS_M = 1_737_400
export const MOON_RADIUS_KM = MOON_RADIUS_M / 1000

export const SUN_RADIUS_KM = 695_700
export const EARTH_RADIUS_KM = 6_378.137

export const AU_KM = 149_597_870.7

/** Height of the observer (lander camera / solar panel / antenna) above the terrain. */
export const OBSERVER_HEIGHT_M = 2

/** Moon's equator is tilted ~1.54° to the ecliptic: the reason the polar Sun never climbs high. */
export const MOON_AXIS_TILT_TO_ECLIPTIC_DEG = 1.54

/** Mean synodic month (one lunar day-night cycle), in days. */
export const SYNODIC_MONTH_DAYS = 29.530589

export const DEG = Math.PI / 180
export const RAD = 180 / Math.PI

export const HOUR_MS = 3_600_000
export const DAY_MS = 86_400_000
