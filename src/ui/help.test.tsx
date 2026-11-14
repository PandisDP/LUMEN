import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PANELS, useUiStore } from '../store/useUiStore.ts'
import { ExportMenu } from './ExportMenu.tsx'
import { HelpButton } from './HelpButton.tsx'
import { SPLASH_FADE_MS, SPLASH_MIN_MS, Splash } from './Splash.tsx'
import { placePopover } from './tourSteps.ts'

beforeEach(() => {
  useUiStore.setState({
    panels: { ...DEFAULT_PANELS },
    tourStep: null,
    panelsBeforeTour: null,
    tourSeen: true,
    help: null,
  })
})

describe('placePopover', () => {
  const pop = { width: 320, height: 200 }

  it('opens below the button, aligned to its end edge', () => {
    const p = placePopover({ top: 100, left: 900, right: 930, bottom: 130 }, pop, 1400, 900, 'end')
    expect(p).toEqual({ top: 138, left: 610 })
  })

  it('flips above when there is no room below (bottom bar)', () => {
    const p = placePopover(
      { top: 840, left: 600, right: 630, bottom: 870 },
      pop,
      1400,
      900,
      'start',
    )
    expect(p.top + pop.height).toBeLessThanOrEqual(840)
  })

  it('never leaves the viewport horizontally', () => {
    const right = placePopover(
      { top: 80, left: 1380, right: 1395, bottom: 95 },
      pop,
      1400,
      900,
      'start',
    )
    expect(right.left + pop.width).toBeLessThanOrEqual(1400 - 8)
    const left = placePopover({ top: 80, left: 4, right: 20, bottom: 95 }, pop, 1400, 900, 'end')
    expect(left.left).toBeGreaterThanOrEqual(8)
  })
})

describe('HelpButton', () => {
  it('renders its popover outside clipping containers and closes with Escape', () => {
    const { container } = render(
      <div style={{ overflow: 'hidden' }}>
        <HelpButton topic="sites" />
      </div>,
    )
    fireEvent.click(screen.getByRole('button', { name: /Ayuda/ }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Elige dónde alunizar')
    // Portalled to <body>: not a descendant of the overflow:hidden wrapper.
    expect(container.contains(dialog)).toBe(false)
    expect(dialog.parentElement).toBe(document.body)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes on a click outside but not on a click inside', () => {
    render(<HelpButton topic="metrics" />)
    fireEvent.click(screen.getByRole('button', { name: /Ayuda/ }))
    fireEvent.pointerDown(screen.getByRole('dialog'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('Splash', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('stays until the sites are loaded and the minimum time has passed', () => {
    const onDone = vi.fn()
    const { rerender } = render(<Splash ready={false} onDone={onDone} />)
    expect(screen.getByTestId('splash')).toBeInTheDocument()
    act(() => void vi.advanceTimersByTime(SPLASH_MIN_MS + SPLASH_FADE_MS))
    expect(onDone).not.toHaveBeenCalled()
    rerender(<Splash ready onDone={onDone} />)
    expect(screen.getByTestId('splash')).toHaveClass('splash--out')
    act(() => void vi.advanceTimersByTime(SPLASH_FADE_MS))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('can be skipped with a click', () => {
    const onDone = vi.fn()
    render(<Splash ready={false} onDone={onDone} />)
    fireEvent.click(screen.getByTestId('splash'))
    act(() => void vi.advanceTimersByTime(SPLASH_FADE_MS))
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})

describe('ExportMenu', () => {
  it('offers downloads only (no copy-link button)', () => {
    render(<ExportMenu />)
    expect(screen.getByText(/Exportar/)).toBeInTheDocument()
    expect(screen.queryByText(/enlace/i)).not.toBeInTheDocument()
  })
})
