import { useEffect } from 'react'
import { PANEL_KEYS, type PanelId, useUiStore } from '../store/useUiStore.ts'

const KEYS = Object.fromEntries(
  Object.entries(PANEL_KEYS).map(([id, key]) => [key, id as PanelId]),
) as Record<string, PanelId | undefined>

/** Keys 1 / 2 / 3 expand or minimise the left, right and bottom panels. */
export function usePanelShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return
      const id = KEYS[e.key]
      if (!id) return
      const el = e.target as HTMLElement | null
      // Don't steal digits typed into a field.
      if (el?.closest('input, select, textarea, [contenteditable="true"]')) return
      if (useUiStore.getState().tourStep !== null) return
      useUiStore.getState().togglePanel(id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
