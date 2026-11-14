import { create } from 'zustand'

/**
 * Interface-only state (not part of a mission scenario, not in the URL, untouched by reset()):
 * which panels are expanded, the guided tour and the contextual help popover.
 */
export type PanelId = 'left' | 'right' | 'bottom'
export type PanelsOpen = Record<PanelId, boolean>

/** Keyboard shortcut that toggles each panel (see usePanelShortcuts). */
export const PANEL_KEYS: Record<PanelId, string> = { left: '1', right: '2', bottom: '3' }

const PANELS_KEY = 'lumen3d.panels'
const TOUR_KEY = 'lumen3d.tourSeen'
const STAGE_KEY = 'lumen3d.stage'

/**
 * Where the user is in the guided flow: the welcome card, choosing a site (Top 3), or exploring
 * it through the four steps (Orbit, Surface, Landing, Decide).
 */
export type Stage = 'welcome' | 'choose' | 'explore'
const STAGES: readonly Stage[] = ['welcome', 'choose', 'explore']

/** First visit: every panel minimised so the 3D view is visible. */
export const DEFAULT_PANELS: PanelsOpen = { left: false, right: false, bottom: false }

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage blocked (private mode, sandbox): the choice still applies to this session.
  }
}

export function loadPanels(): PanelsOpen {
  try {
    const raw = JSON.parse(read(PANELS_KEY) ?? 'null') as Partial<PanelsOpen> | null
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_PANELS }
    return {
      left: raw.left === true,
      right: raw.right === true,
      bottom: raw.bottom === true,
    }
  } catch {
    return { ...DEFAULT_PANELS }
  }
}

export function loadStage(): Stage {
  const v = read(STAGE_KEY) as Stage | null
  // Coming back after the welcome: straight to the site choice (or where the user was).
  return v && STAGES.includes(v) ? v : 'welcome'
}

export interface UiState {
  panels: PanelsOpen
  /** Current tour step, or null when the tour is closed. */
  tourStep: number | null
  /** Panel layout before the tour opened panels for its steps; restored when it ends. */
  panelsBeforeTour: PanelsOpen | null
  tourSeen: boolean
  /** Contextual help popover currently open (its help key), if any. */
  help: string | null
  stage: Stage
  /** Site panel: full catalogue instead of the Top 3. */
  showAllSites: boolean
  /** Floating assistant expanded. */
  assistantOpen: boolean

  setPanel: (id: PanelId, open: boolean) => void
  togglePanel: (id: PanelId) => void
  startTour: (step?: number) => void
  setTourStep: (step: number) => void
  endTour: () => void
  dismissTourInvite: () => void
  setHelp: (help: string | null) => void
  /** Entering 'explore' opens the site panel so the Top 3 is in view. */
  setStage: (stage: Stage) => void
  setShowAllSites: (show: boolean) => void
  setAssistantOpen: (open: boolean) => void
}

export const useUiStore = create<UiState>()((set, get) => ({
  panels: loadPanels(),
  tourStep: null,
  panelsBeforeTour: null,
  tourSeen: read(TOUR_KEY) === '1',
  help: null,
  stage: loadStage(),
  showAllSites: false,
  assistantOpen: false,

  setPanel: (id, open) => {
    const panels = { ...get().panels, [id]: open }
    set({ panels })
    // During the tour the layout is temporary: don't persist it.
    if (get().tourStep === null) write(PANELS_KEY, JSON.stringify(panels))
  },
  togglePanel: (id) => get().setPanel(id, !get().panels[id]),
  startTour: (step = 0) => {
    const s = get()
    set({
      tourStep: step,
      help: null,
      panelsBeforeTour: s.tourStep === null ? s.panels : s.panelsBeforeTour,
    })
  },
  setTourStep: (tourStep) => set({ tourStep }),
  endTour: () => {
    const before = get().panelsBeforeTour
    write(TOUR_KEY, '1')
    set({ tourStep: null, tourSeen: true, panelsBeforeTour: null, panels: before ?? get().panels })
  },
  dismissTourInvite: () => {
    write(TOUR_KEY, '1')
    set({ tourSeen: true })
  },
  setHelp: (help) => set({ help }),
  setStage: (stage) => {
    if (!STAGES.includes(stage)) return
    const prev = get().stage
    write(STAGE_KEY, stage)
    set({ stage })
    if (stage === 'explore' && prev !== 'explore') get().setPanel('left', true)
  },
  setShowAllSites: (showAllSites) => set({ showAllSites }),
  setAssistantOpen: (assistantOpen) => set({ assistantOpen }),
}))
