import { create } from 'zustand'
import { type RoverId, SAMPLING_DEFAULTS, clampSampleH, clampSamples } from '../astro/traverse.ts'

/** Simulated seconds per real second while the traverse plays. */
export const ROVER_SPEEDS = [120, 600, 1800, 3600] as const
export type RoverCam = 'follow' | 'mast' | 'top'
/** 'egress': rolling down the lander's ramps (visual only, no mission time); then 'drive'. */
export type RoverPhase = 'egress' | 'drive'

/**
 * Playback of the rover's round trip to the ice (landing view, after touchdown) and the work
 * it is asked to do there. As in useDescentStore, the animation clock lives in a ref inside the
 * scene controller; `tMs` is a 10 Hz copy for the progress slider.
 *
 * `samples` and `sampleH` are shared by the planner and the 3D view and remembered between
 * visits. Their defaults and limits are SAMPLING_DEFAULTS / SAMPLING_LIMITS (astro/traverse.ts).
 */
export interface RoverState {
  /** The next landing skips or follows the descent and then deploys the rover by itself. */
  autoDeploy: 'no' | 'after-landing' | 'skip-descent'
  playing: boolean
  speed: number
  /** Elapsed traverse time, ms of mission time since departure (10 Hz copy). */
  tMs: number
  seek: { tMs: number; nonce: number } | null
  /** Bumped by restart() so the controller starts over. */
  run: number
  cam: RoverCam
  phase: RoverPhase
  /** Which rover drives: its energy profile and vehicle (config/energyProfiles.ts). */
  roverId: RoverId
  /** Samples to take at the ice: integer within SAMPLING_LIMITS.samples (1–10, default 3). */
  samples: number
  /** Hours of work per sample, within SAMPLING_LIMITS.sampleH (0.5–6, default 2). */
  sampleH: number
  setAutoDeploy: (mode: RoverState['autoDeploy']) => void
  restart: () => void
  setPlaying: (playing: boolean) => void
  setSpeed: (speed: number) => void
  seekTo: (tMs: number) => void
  publishT: (tMs: number) => void
  setCam: (cam: RoverCam) => void
  setPhase: (phase: RoverPhase) => void
  setRover: (id: RoverId) => void
  /** Both clamp to SAMPLING_LIMITS; a change starts the playback over (the trip is another). */
  setSamples: (samples: number) => void
  setSampleH: (hours: number) => void
}

export const ROVER_STORAGE_KEY = 'lumen3d.rover'
type Sampling = Pick<RoverState, 'samples' | 'sampleH'>

/** The sampling inputs of the last visit (defaults when there is none, or it is unreadable). */
export function loadRoverSampling(): Sampling {
  try {
    const raw = JSON.parse(localStorage.getItem(ROVER_STORAGE_KEY) ?? 'null') as unknown
    if (!raw || typeof raw !== 'object') return { ...SAMPLING_DEFAULTS }
    const { samples, sampleH } = raw as Record<string, unknown>
    return {
      samples: typeof samples === 'number' ? clampSamples(samples) : SAMPLING_DEFAULTS.samples,
      sampleH: typeof sampleH === 'number' ? clampSampleH(sampleH) : SAMPLING_DEFAULTS.sampleH,
    }
  } catch {
    return { ...SAMPLING_DEFAULTS }
  }
}

function saveSampling({ samples, sampleH }: Sampling) {
  try {
    localStorage.setItem(ROVER_STORAGE_KEY, JSON.stringify({ samples, sampleH }))
  } catch {
    // Storage blocked: the inputs still apply to this session.
  }
}

/** The playback back at the start (a new trip: another rover or another workload). */
const startOver = (s: RoverState) =>
  ({ playing: true, tMs: 0, seek: null, run: s.run + 1, phase: 'egress' }) as const

export const useRoverStore = create<RoverState>()((set) => ({
  autoDeploy: 'no',
  playing: true,
  speed: 600,
  tMs: 0,
  seek: null,
  run: 0,
  cam: 'follow',
  phase: 'egress',
  roverId: 'rover',
  ...loadRoverSampling(),
  setAutoDeploy: (autoDeploy) => set({ autoDeploy }),
  restart: () =>
    set((s) => ({ playing: true, tMs: 0, seek: null, run: s.run + 1, phase: 'egress' })),
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => {
    if ((ROVER_SPEEDS as readonly number[]).includes(speed)) set({ speed })
  },
  // Jumping along the traverse skips the ramp.
  seekTo: (tMs) =>
    set((s) => ({ seek: { tMs, nonce: (s.seek?.nonce ?? 0) + 1 }, tMs, phase: 'drive' })),
  publishT: (tMs) => set({ tMs }),
  setCam: (cam) => set({ cam }),
  setPhase: (phase) => set({ phase }),
  setRover: (roverId) => set((s) => ({ roverId, ...startOver(s) })),
  setSamples: (v) =>
    set((s) => {
      const samples = clampSamples(v)
      return samples === s.samples ? s : { samples, ...startOver(s) }
    }),
  setSampleH: (v) =>
    set((s) => {
      const sampleH = clampSampleH(v)
      return sampleH === s.sampleH ? s : { sampleH, ...startOver(s) }
    }),
}))

// Remember the sampling inputs between visits.
useRoverStore.subscribe((s, prev) => {
  if (s.samples !== prev.samples || s.sampleH !== prev.sampleH) saveSampling(s)
})
