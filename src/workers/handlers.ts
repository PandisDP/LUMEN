import { computeDispersion } from '../astro/dispersion.ts'
import { computeHorizonMask } from '../astro/horizonFromDem.ts'
import { computeIceAccess } from '../astro/iceAccess.ts'
import { computeOptimize } from '../astro/optimize.ts'
import {
  type PlanPrepared,
  type PlanTables,
  evaluateRange,
  planDay,
  prepareCandidates,
  refinePick,
} from '../astro/planner.ts'
import type { PlanDay, PlanProblem } from '../astro/plannerTypes.ts'
import { loadDem, loadIllum } from '../data/loadDem.ts'
import { installEphemerisTable } from '../data/loadEphem.ts'
import { computeDateSweep, computeScenario } from '../astro/scenario.ts'
import { computeTraverse } from '../astro/traverse.ts'
import {
  type AstroRequest,
  type AstroResponse,
  type DemRef,
  PLAN_EXPIRED,
  PLAN_KEEP,
} from './protocol.ts'

const loadAll = (dems: readonly DemRef[]) => Promise.all(dems.map((d) => loadDem(d.bin, d.meta)))

/**
 * Plans in progress, newest last (this thread only: the worker, or the main thread where there
 * are no workers). The days are kept too, so `planFinish` refines exactly what `planDays` gave.
 */
interface PlanState {
  problem: PlanProblem
  prepared: PlanPrepared
  tables: PlanTables
  days: Map<number, PlanDay>
}
const plans = new Map<string, PlanState>()
let planSeq = 0

function planOf(id: string): PlanState {
  const p = plans.get(id)
  if (!p) throw new Error(PLAN_EXPIRED)
  return p
}

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
    case 'traverse': {
      const [grids, illum] = await Promise.all([
        loadAll(req.dems),
        req.illum ? loadIllum(req.illum.bin, req.illum.meta) : undefined,
      ])
      return computeTraverse(grids, req.input, illum)
    }
    case 'planPrepare': {
      const [grids, illum] = await Promise.all([
        loadAll(req.dems),
        loadIllum(req.illum.bin, req.illum.meta),
      ])
      const prepared = prepareCandidates(grids, illum, req.problem)
      const tables = evaluateRange(prepared, req.problem)
      const planId = `plan-${++planSeq}`
      plans.set(planId, { problem: req.problem, prepared, tables, days: new Map() })
      while (plans.size > PLAN_KEEP) plans.delete(plans.keys().next().value!)
      return { planId, ice: prepared.ice, candidates: prepared.candidates }
    }
    case 'planDays': {
      const p = planOf(req.planId)
      const out: PlanDay[] = []
      const end = Math.min(p.problem.days, req.from + req.count)
      for (let d = Math.max(0, req.from); d < end; d++) {
        const day = planDay(p.prepared, p.tables, p.problem, d)
        p.days.set(d, day)
        out.push(day)
      }
      return out
    }
    case 'planFinish': {
      const p = planOf(req.planId)
      return req.top.map((d) => {
        const day = p.days.get(d)
        return day ? refinePick(p.prepared, p.problem, day) : null
      })
    }
  }
}
