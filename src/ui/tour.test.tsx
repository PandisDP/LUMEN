import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_PANELS, loadPanels, useUiStore } from '../store/useUiStore.ts'
import { useMissionStore } from '../store/useMissionStore.ts'
import { CollapsiblePanel } from './CollapsiblePanel.tsx'
import { Tour, TourInvite } from './Tour.tsx'
import { TOUR_STEPS, placeBubble, stepIndex } from './tourSteps.ts'

beforeEach(() => {
  localStorage.clear()
  useUiStore.setState({
    panels: { ...DEFAULT_PANELS },
    tourStep: null,
    panelsBeforeTour: null,
    tourSeen: false,
    help: null,
  })
  useMissionStore.getState().reset()
})

describe('CollapsiblePanel', () => {
  const panel = () =>
    render(
      <CollapsiblePanel id="left" title="Sitios" icon="•" help="sites" summary="Apolo 11">
        <p>contenido</p>
      </CollapsiblePanel>,
    )

  it('starts minimised: header and summary visible, body not mounted', () => {
    panel()
    const toggle = screen.getByRole('button', { name: 'Expandir Sitios' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Apolo 11')).toBeInTheDocument()
    expect(screen.queryByText('contenido')).not.toBeInTheDocument()
  })

  it('expands on click and remembers the choice', () => {
    panel()
    fireEvent.click(screen.getByRole('button', { name: 'Expandir Sitios' }))
    expect(screen.getByText('contenido')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Minimizar Sitios' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(loadPanels()).toEqual({ left: true, right: false, bottom: false })
  })

  it('opens its contextual help', () => {
    panel()
    fireEvent.click(screen.getByRole('button', { name: /Ayuda/ }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Elige dónde alunizar')
  })
})

describe('Tour', () => {
  it('invites first-time visitors and walks through every step', () => {
    render(
      <>
        <TourInvite />
        <Tour />
      </>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Empezar recorrido' }))
    expect(screen.queryByText(/Primera vez/)).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Recorrido guiado' })).toHaveTextContent(
      'Bienvenido a Killa Landing',
    )
    for (let i = 1; i < TOUR_STEPS.length; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    }
    expect(
      screen.getByText(`Paso ${TOUR_STEPS.length} de ${TOUR_STEPS.length}`),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Terminar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(useUiStore.getState().tourSeen).toBe(true)
  })

  it('opens the panel a step explains and restores the layout afterwards', () => {
    render(<Tour />)
    act(() => useUiStore.getState().startTour(stepIndex('metrics')))
    expect(useUiStore.getState().panels.right).toBe(true)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useUiStore.getState().tourStep).toBeNull()
    expect(useUiStore.getState().panels).toEqual(DEFAULT_PANELS)
  })

  it('arrow keys move between steps', () => {
    render(<Tour />)
    act(() => useUiStore.getState().startTour(0))
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(useUiStore.getState().tourStep).toBe(1)
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(useUiStore.getState().tourStep).toBe(0)
  })
})

describe('placeBubble', () => {
  const size = { width: 300, height: 180 }

  it('centres the card when there is no target', () => {
    expect(placeBubble(null, size, 1000, 800)).toEqual({ top: 310, left: 350 })
  })

  it('goes beside a tall side panel', () => {
    const p = placeBubble({ top: 70, left: 12, width: 310, height: 600 }, size, 1400, 900)
    expect(p.left).toBeGreaterThan(322)
  })

  it('stays inside the viewport', () => {
    const p = placeBubble({ top: 850, left: 1350, width: 40, height: 30 }, size, 1400, 900)
    expect(p.left + size.width).toBeLessThanOrEqual(1400 - 12)
    expect(p.top + size.height).toBeLessThanOrEqual(900 - 12)
  })
})
