import { create } from 'zustand'
import { FOV } from './useMissionStore.ts'

/** Orbit-view framing: free camera, or the Moon's south pole with the Sun / the Earth behind it. */
export type MacroFrame = 'free' | 'sun' | 'earth'

/** Where the surface camera is looking. Written by LookControls, read by the compass HUD. */
export interface ViewState {
  az: number
  el: number
  fov: number
  macroFrame: MacroFrame
  /** Changes on every framing request so the camera re-frames even when re-clicked. */
  frameNonce: number
  set: (v: Partial<Pick<ViewState, 'az' | 'el' | 'fov'>>) => void
  setMacroFrame: (frame: MacroFrame) => void
}

export const useViewStore = create<ViewState>()((set) => ({
  az: 180,
  el: 2,
  fov: FOV.default,
  macroFrame: 'free',
  frameNonce: 0,
  set: (v) => set(v),
  setMacroFrame: (macroFrame) => set((s) => ({ macroFrame, frameNonce: s.frameNonce + 1 })),
}))
