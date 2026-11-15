import type { DemMeta } from '../astro/dem.ts'
import type { DispersionInput, DispersionResult } from '../astro/dispersion.ts'
import type { HorizonMask } from '../astro/horizon.ts'
import type { IceAccess } from '../astro/iceAccess.ts'
import type { IllumMeta } from '../astro/illumination.ts'
import type { OptimizeInput, OptimizeResult } from '../astro/optimize.ts'
import type { PlanCandidate, PlanDay, PlanPick, PlanProblem } from '../astro/plannerTypes.ts'
import type { DateCandidate } from '../astro/metrics.ts'
import type { ScenarioInput, ScenarioResult, SweepInput } from '../astro/scenario.ts'
import type { TraverseJobInput, TraverseResult } from '../astro/traverse.ts'

/** Messages exchanged with the astro worker. Each request carries an id echoed in the reply. */
export type AstroRequest =
  | { kind: 'scenario'; input: ScenarioInput }
  | { kind: 'sweep'; input: SweepInput }
  | { kind: 'customHorizon'; lat: number; lon: number; dems: DemRef[]; azStepDeg?: number }
  | { kind: 'dispersion'; input: DispersionInput; dems: DemRef[] }
  | { kind: 'optimize'; input: OptimizeInput; dems: DemRef[]; illum?: IllumRef }
  | { kind: 'iceAccess'; input: IceInput; dem: DemRef; illum: IllumRef }
  | { kind: 'traverse'; input: TraverseJobInput; dems: DemRef[]; illum?: IllumRef }
  | { kind: 'planPrepare'; problem: PlanProblem; dems: DemRef[]; illum: IllumRef }
  | { kind: 'planDays'; planId: string; from: number; count: number }
  | { kind: 'planFinish'; planId: string; top: number[] }

/** A DEM the worker loads itself (binary URL + metadata URL or object), finest first. */
export interface DemRef {
  bin: string
  meta: string | DemMeta
}

/** Illumination map the worker loads itself (Uint8 binary + metadata). */
export interface IllumRef {
  bin: string
  meta: IllumMeta
}

export interface IceInput {
  lat: number
  lon: number
  radiusM: number
  roverMaxSlopeDeg: number
  /** Route to the shadowed cell nearest to this point instead of the nearest to the start. */
  target?: { lat: number; lon: number }
}

/**
 * Planner jobs. `planPrepare` builds the candidates of a plan (horizons, routes and the sweep of
 * the whole range) and keeps them in the worker under `planId`; `planDays` evaluates a batch of
 * days of that plan and `planFinish` refines the picks of the shortlisted days. The worker keeps
 * the last PLAN_KEEP plans: an older `planId` is rejected with PLAN_EXPIRED.
 */
export interface PlanPrepareResult {
  planId: string
  ice: { lat: number; lon: number }
  candidates: PlanCandidate[]
}

/** One refined pick per requested day, in the order asked (null: the day has no pick). */
export type PlanFinishResult = (PlanPick | null)[]

export const PLAN_KEEP = 2
export const PLAN_EXPIRED = 'plan-expired'

export interface CustomHorizonResult {
  mask: HorizonMask
  heightM: number
}

export type AstroResponse =
  | ScenarioResult
  | DateCandidate[]
  | CustomHorizonResult
  | DispersionResult
  | OptimizeResult
  | IceAccess
  | TraverseResult
  | PlanPrepareResult
  | PlanDay[]
  | PlanFinishResult

export interface WorkerEnvelope {
  id: number
  request: AstroRequest
}

export type WorkerReply =
  { id: number; ok: true; result: AstroResponse } | { id: number; ok: false; error: string }
