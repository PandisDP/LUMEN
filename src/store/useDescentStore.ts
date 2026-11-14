import { create } from 'zustand'

export const DESCENT_SPEEDS = [1, 2, 4] as const

/**
 * Playback of the descent animation. Not part of the shareable state (the URL carries only the
 * view and the approach azimuth). The animation clock lives in a ref inside DescentControls;
 * `t` is published here at ~10 Hz for the progress slider only.
 */
export interface DescentState {
  landed: boolean
  playing: boolean
  speed: number
  /** Elapsed animation time, s (10 Hz copy). */
  t: number
  /** Jump request from the slider; the nonce makes identical requests count. */
  seek: { t: number; nonce: number } | null
  /** Bumped by restart() so the controller starts over. */
  run: number
  restart: () => void
  land: () => void
  setPlaying: (playing: boolean) => void
  setSpeed: (speed: number) => void
  seekTo: (t: number) => void
  publishT: (t: number) => void
}

export const useDescentStore = create<DescentState>()((set) => ({
  landed: false,
  playing: true,
  speed: 1,
  t: 0,
  seek: null,
  run: 0,
  restart: () => set((s) => ({ landed: false, playing: true, t: 0, seek: null, run: s.run + 1 })),
  land: () => set({ landed: true, playing: false }),
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => {
    if ((DESCENT_SPEEDS as readonly number[]).includes(speed)) set({ speed })
  },
  seekTo: (t) => set((s) => ({ seek: { t, nonce: (s.seek?.nonce ?? 0) + 1 }, landed: false, t })),
  publishT: (t) => set({ t }),
}))
