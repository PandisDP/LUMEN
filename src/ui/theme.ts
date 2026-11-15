import { create } from 'zustand'

export type Theme = 'dark' | 'light'

const KEY = 'lumen-theme'

function stored(): Theme {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

/** Puts the theme on <html> (`.dark` class) and remembers it. */
function apply(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // Private mode: the theme still applies for this visit.
  }
}

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggle: () => void
}

/** Dark ("glass and neon") by default; light is the alternative. Canvas charts subscribe to redraw. */
export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: stored(),
  setTheme: (theme) => {
    apply(theme)
    set({ theme })
  },
  toggle: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
}))

apply(useThemeStore.getState().theme)
