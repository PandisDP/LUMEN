import type { DemMeta } from '../astro/dem.ts'
import type { DispersionInput, DispersionResult } from '../astro/dispersion.ts'
import type { HorizonMask } from '../astro/horizon.ts'
import type { IceAccess } from '../astro/iceAccess.ts'
import type { IllumMeta } from '../astro/illumination.ts'
import type { OptimizeInput, OptimizeResult } from '../astro/optimize.ts'
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
}

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

export interface WorkerEnvelope {
  id: number
  request: AstroRequest
}

export type WorkerReply =
  { id: number; ok: true; result: AstroResponse } | { id: number; ok: false; error: string }
