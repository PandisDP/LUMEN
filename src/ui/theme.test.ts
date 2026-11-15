import { beforeEach, describe, expect, it } from 'vitest'
import { useThemeStore } from './theme.ts'

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear()
    useThemeStore.getState().setTheme('dark')
  })

  it('is dark by default and marks <html> with the .dark class', () => {
    expect(useThemeStore.getState().theme).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('toggles to light, drops the class and remembers the choice', () => {
    useThemeStore.getState().toggle()
    expect(useThemeStore.getState().theme).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(localStorage.getItem('lumen-theme')).toBe('light')
    useThemeStore.getState().toggle()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem('lumen-theme')).toBe('dark')
  })
})
