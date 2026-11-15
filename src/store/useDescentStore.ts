import { create } from 'zustand'
import { DESCENT_DURATION_S } from '../astro/descent.ts'
import type { HazardAdvice } from '../astro/descentPlan.ts'
import type { DescentSummary } from '../astro/descentPhysics.ts'
import { DEFAULT_LANDER_ID, LANDERS } from '../config/landers.ts'

/** 'physics': flown by the guidance model; 'kinematic': the quick illustrative fly-down. */
export type DescentMode = 'physics' | 'kinematic'

/** What the controller reports about the descent being shown. */
export interface DescentRun {
  /** Model actually flown (physics falls back to kinematic when the guidance cannot close). */
  flown: DescentMode
  durationS: number
  /** Result of the physical model (also when it failed and the fallback is shown). */
  summary: DescentSummary | null
  hazard: (HazardAdvice & { lat: number; lon: number }) | null
  noSafeGround: boolean
}

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
  mode: DescentMode
  vehicleId: string
  /** Published by DescentControls whenever the trajectory is rebuilt. */
  flight: DescentRun
  restart: () => void
  land: () => void
  setPlaying: (playing: boolean) => void
  setSpeed: (speed: number) => void
  seekTo: (t: number) => void
  publishT: (t: number) => void
  setMode: (mode: DescentMode) => void
  setVehicle: (id: string) => void
  publishFlight: (flight: DescentRun) => void
}

const NO_FLIGHT: DescentRun = {
  flown: 'kinematic',
  durationS: DESCENT_DURATION_S,
  summary: null,
  hazard: null,
  noSafeGround: false,
}

export const useDescentStore = create<DescentState>()((set) => ({
  landed: false,
  playing: true,
  speed: 1,
  t: 0,
  seek: null,
  run: 0,
  mode: 'physics',
  vehicleId: DEFAULT_LANDER_ID,
  flight: NO_FLIGHT,
  restart: () => set((s) => ({ landed: false, playing: true, t: 0, seek: null, run: s.run + 1 })),
  land: () => set({ landed: true, playing: false }),
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => {
    if ((DESCENT_SPEEDS as readonly number[]).includes(speed)) set({ speed })
  },
  seekTo: (t) => set((s) => ({ seek: { t, nonce: (s.seek?.nonce ?? 0) + 1 }, landed: false, t })),
  publishT: (t) => set({ t }),
  setMode: (mode) =>
    set((s) => ({ mode, landed: false, playing: true, t: 0, seek: null, run: s.run + 1 })),
  setVehicle: (id) => {
    if (LANDERS.some((v) => v.id === id))
      set((s) => ({
        vehicleId: id,
        landed: false,
        playing: true,
        t: 0,
        seek: null,
        run: s.run + 1,
      }))
  },
  publishFlight: (flight) => set({ flight }),
}))
