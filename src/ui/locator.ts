/** Projections for the MoonLocator mini map (pure functions, unit disc). */

/** Outer latitude of the polar map, deg. */
export const POLAR_EDGE_LAT = -80
const DEG = Math.PI / 180

/**
 * South polar stereographic position in a unit disc (0 = pole, 1 = `POLAR_EDGE_LAT`), 0° longitude
 * up (towards the near side and the Earth), east to the right.
 */
export function polarXY(lat: number, lon: number): [number, number] {
  const edge = Math.tan(((90 + POLAR_EDGE_LAT) * DEG) / 2)
  const r = Math.tan(((90 + lat) * DEG) / 2) / edge
  return [r * Math.sin(lon * DEG), -r * Math.cos(lon * DEG)]
}

/** Orthographic position on the near side (unit disc), for sites far from the pole. */
export function nearSideXY(lat: number, lon: number): [number, number] {
  return [Math.cos(lat * DEG) * Math.sin(lon * DEG), -Math.sin(lat * DEG)]
}

/** Inside the polar map (else the near-side disc is used). */
export const isPolar = (lat: number) => lat <= POLAR_EDGE_LAT
