import type { DateCandidate } from '../astro/metrics.ts'
import type { ScenarioInput, ScenarioResult, SweepInput } from '../astro/scenario.ts'
import type { DispersionInput, DispersionResult } from '../astro/dispersion.ts'
import type { IceAccess } from '../astro/iceAccess.ts'
import type { OptimizeInput, OptimizeResult } from '../astro/optimize.ts'
import type { PlanDay, PlanProblem } from '../astro/plannerTypes.ts'
import type { TraverseJobInput, TraverseResult } from '../astro/traverse.ts'
import type {
  AstroRequest,
  AstroResponse,
  CustomHorizonResult,
  DemRef,
  IceInput,
  IllumRef,
  PlanFinishResult,
  PlanPrepareResult,
  WorkerReply,
} from './protocol.ts'

type Pending = { resolve: (v: AstroResponse) => void; reject: (e: Error) => void }

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, Pending>()

function getWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null
  if (!worker) {
    worker = new Worker(new URL('./astro.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<WorkerReply>) => {
      const p = pending.get(e.data.id)
      if (!p) return
      pending.delete(e.data.id)
      if (e.data.ok) p.resolve(e.data.result)
      else p.reject(new Error(e.data.error))
    }
  }
  return worker
}

/** Runs a request in the worker, or in-thread where workers are unavailable (tests, SSR). */
async function call(request: AstroRequest): Promise<AstroResponse> {
  const w = getWorker()
  if (!w) {
    const { handleRequest } = await import('./handlers.ts')
    return handleRequest(request)
  }
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    w.postMessage({ id, request })
  })
}

export const runScenario = (input: ScenarioInput) =>
  call({ kind: 'scenario', input }) as Promise<ScenarioResult>

export const runDateSweep = (input: SweepInput) =>
  call({ kind: 'sweep', input }) as Promise<DateCandidate[]>

export const runCustomHorizon = (lat: number, lon: number, dems: DemRef[], azStepDeg?: number) =>
  call({ kind: 'customHorizon', lat, lon, dems, azStepDeg }) as Promise<CustomHorizonResult>

export const runDispersion = (input: DispersionInput, dems: DemRef[]) =>
  call({ kind: 'dispersion', input, dems }) as Promise<DispersionResult>

export const runOptimize = (input: OptimizeInput, dems: DemRef[], illum?: IllumRef) =>
  call({ kind: 'optimize', input, dems, illum }) as Promise<OptimizeResult>

export const runIceAccess = (input: IceInput, dem: DemRef, illum: IllumRef) =>
  call({ kind: 'iceAccess', input, dem, illum }) as Promise<IceAccess>

/** Rover traverse along an ice-access route: plan, per-anchor horizons and battery (worker). */
export const runTraverse = (input: TraverseJobInput, dems: DemRef[], illum?: IllumRef) =>
  call({ kind: 'traverse', input, dems, illum }) as Promise<TraverseResult>

/** Planner: candidates of a plan (kept in the worker under the returned `planId`). */
export const runPlanPrepare = (problem: PlanProblem, dems: DemRef[], illum: IllumRef) =>
  call({ kind: 'planPrepare', problem, dems, illum }) as Promise<PlanPrepareResult>

/** Planner: days `from` … `from + count − 1` of a prepared plan. */
export const runPlanDays = (planId: string, from: number, count: number) =>
  call({ kind: 'planDays', planId, from, count }) as Promise<PlanDay[]>

/** Planner: the picks of the shortlisted days (indices), recomputed as the views do. */
export const runPlanFinish = (planId: string, top: number[]) =>
  call({ kind: 'planFinish', planId, top }) as Promise<PlanFinishResult>
