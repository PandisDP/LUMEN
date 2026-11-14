import { MOON_RADIUS_M, OBSERVER_HEIGHT_M, RAD } from './constants.ts'
import { type DemGrid, sampleDemStack } from './dem.ts'
import { destination } from './frames.ts'
import { type HorizonMask, sphericalHorizonDip } from './horizon.ts'

export interface HorizonOptions {
  azStepDeg?: number
  /** How far to look for obstructions. Beyond ~250 km the lunar curvature hides everything. */
  maxDistM?: number
  observerHeightM?: number
  /** Relative step growth with distance (step = max(minStep, d * growth)). */
  growth?: number
}

export interface ComputedHorizon extends HorizonMask {
  elevDeg: Float32Array
  /** Terrain height at the site (m above the 1737.4 km sphere). */
  terrainHeightM: number
  /** Distance (m) to the terrain point that defines the horizon at each azimuth. */
  obstructionDistM: Float32Array
}

/**
 * Elevation angle (deg) of a terrain point of height `targetH` at ground distance `d`,
 * seen by an observer whose eye is at `eyeH` (both relative to the reference sphere).
 * Uses exact spherical geometry, so lunar curvature is included.
 */
export function elevationAngle(eyeH: number, targetH: number, d: number): number {
  const theta = d / MOON_RADIUS_M
  const rP = MOON_RADIUS_M + targetH
  const rO = MOON_RADIUS_M + eyeH
  return Math.atan2(rP * Math.cos(theta) - rO, rP * Math.sin(theta)) * RAD
}

/**
 * Ray-marches the DEM stack (finest grid first) along great circles from the site to
 * build the horizon mask. Runs both in the data scripts (20 m + 240 m LOLA) and in the
 * browser worker for custom coordinates (480 m LOLA).
 */
export function computeHorizonMask(
  grids: readonly DemGrid[],
  lat: number,
  lon: number,
  options: HorizonOptions = {},
): ComputedHorizon {
  const azStepDeg = options.azStepDeg ?? 0.5
  const maxDistM = options.maxDistM ?? 300_000
  const growth = options.growth ?? 0.004
  const observerHeightM = options.observerHeightM ?? OBSERVER_HEIGHT_M

  const terrainHeightM = sampleDemStack(grids, lat, lon)
  if (Number.isNaN(terrainHeightM)) {
    throw new Error(`No DEM coverage at ${lat.toFixed(3)}, ${lon.toFixed(3)}`)
  }
  const eyeH = terrainHeightM + observerHeightM
  const minStep = Math.min(...grids.map((g) => g.scaleM)) * 0.75

  const bins = Math.round(360 / azStepDeg)
  const elevDeg = new Float32Array(bins)
  const obstructionDistM = new Float32Array(bins)
  const dip = sphericalHorizonDip(observerHeightM)

  for (let k = 0; k < bins; k++) {
    const az = k * azStepDeg
    // Start far below 0°: from a peak the true horizon dips well under the ideal one
    // (≈2.7° for a 2 km high summit), which is why ridges see the Sun almost all the time.
    let best = -90
    let bestD = 0
    for (let d = minStep; d <= maxDistM; d += Math.max(minStep, d * growth)) {
      const p = destination(lat, lon, az, d)
      const h = sampleDemStack(grids, p.lat, p.lon)
      if (Number.isNaN(h)) break
      const el = elevationAngle(eyeH, h, d)
      if (el > best) {
        best = el
        bestD = d
      }
    }
    // No samples at all (edge of the DEM): fall back to the ideal spherical horizon.
    elevDeg[k] = bestD === 0 ? dip : best
    obstructionDistM[k] = bestD
  }
  return { azStepDeg, elevDeg, terrainHeightM, obstructionDistM }
}
