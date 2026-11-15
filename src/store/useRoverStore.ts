import { create } from 'zustand'
import type { RoverId } from '../astro/traverse.ts'

/** Simulated seconds per real second while the traverse plays. */
export const ROVER_SPEEDS = [120, 600, 1800, 3600] as const
export type RoverCam = 'follow' | 'mast' | 'top'

/**
 * Playback of the rover traverse to the ice (landing view, after touchdown). As in
 * useDescentStore, the animation clock lives in a ref inside the scene controller; `tMs` is a
 * 10 Hz copy for the progress slider.
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
  /** Which rover drives: its energy profile and vehicle (config/energyProfiles.ts). */
  roverId: RoverId
  setAutoDeploy: (mode: RoverState['autoDeploy']) => void
  restart: () => void
  setPlaying: (playing: boolean) => void
  setSpeed: (speed: number) => void
  seekTo: (tMs: number) => void
  publishT: (tMs: number) => void
  setCam: (cam: RoverCam) => void
  setRover: (id: RoverId) => void
}

export const useRoverStore = create<RoverState>()((set) => ({
  autoDeploy: 'no',
  playing: true,
  speed: 600,
  tMs: 0,
  seek: null,
  run: 0,
  cam: 'follow',
  roverId: 'rover',
  setAutoDeploy: (autoDeploy) => set({ autoDeploy }),
  restart: () => set((s) => ({ playing: true, tMs: 0, seek: null, run: s.run + 1 })),
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => {
    if ((ROVER_SPEEDS as readonly number[]).includes(speed)) set({ speed })
  },
  seekTo: (tMs) => set((s) => ({ seek: { tMs, nonce: (s.seek?.nonce ?? 0) + 1 }, tMs })),
  publishT: (tMs) => set({ tMs }),
  setCam: (cam) => set({ cam }),
  setRover: (roverId) =>
    set((s) => ({ roverId, playing: true, tMs: 0, seek: null, run: s.run + 1 })),
}))
