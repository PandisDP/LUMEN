/// <reference lib="webworker" />
import { handleRequest } from './handlers.ts'
import type { WorkerEnvelope, WorkerReply } from './protocol.ts'

/** Off-main-thread ephemeris sweeps and horizon ray-marching. */
self.onmessage = async (event: MessageEvent<WorkerEnvelope>) => {
  const { id, request } = event.data
  let reply: WorkerReply
  try {
    reply = { id, ok: true, result: await handleRequest(request) }
  } catch (err) {
    reply = { id, ok: false, error: err instanceof Error ? err.message : String(err) }
  }
  self.postMessage(reply)
}
