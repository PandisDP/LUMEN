import { computeDispersion } from '../astro/dispersion.ts'
import { computeHorizonMask } from '../astro/horizonFromDem.ts'
import { computeIceAccess } from '../astro/iceAccess.ts'
import { computeOptimize } from '../astro/optimize.ts'
import { loadDem, loadIllum } from '../data/loadDem.ts'
import { installEphemerisTable } from '../data/loadEphem.ts'
import { computeDateSweep, computeScenario } from '../astro/scenario.ts'
import type { AstroRequest, AstroResponse, DemRef } from './protocol.ts'

const loadAll = (dems: readonly DemRef[]) => Promise.all(dems.map((d) => loadDem(d.bin, d.meta)))

/** Shared by the worker and by the in-thread fallback, so both behave identically. */
export async function handleRequest(req: AstroRequest): Promise<AstroResponse> {
  // Every result is computed with the DE441 table when available (fetched once per thread).
  await installEphemerisTable()
  switch (req.kind) {
    case 'scenario':
      return computeScenario(req.input)
    case 'sweep':
      return computeDateSweep(req.input)
    case 'customHorizon': {
      const grids = await loadAll(req.dems)
      const h = computeHorizonMask(grids, req.lat, req.lon, {
        azStepDeg: req.azStepDeg ?? 1,
        growth: 0.006,
      })
      return {
        mask: { azStepDeg: h.azStepDeg, elevDeg: Array.from(h.elevDeg) },
        heightM: h.terrainHeightM,
      }
    }
    case 'dispersion':
      return computeDispersion(await loadAll(req.dems), req.input)
    case 'optimize': {
      const [grids, illum] = await Promise.all([
        loadAll(req.dems),
        req.illum ? loadIllum(req.illum.bin, req.illum.meta) : undefined,
      ])
      return computeOptimize(grids, req.input, illum)
    }
    case 'iceAccess': {
      const [tile, illum] = await Promise.all([
        loadDem(req.dem.bin, req.dem.meta),
        loadIllum(req.illum.bin, req.illum.meta),
      ])
      return computeIceAccess(tile, illum, req.input.lat, req.input.lon, req.input)
    }
  }
}
