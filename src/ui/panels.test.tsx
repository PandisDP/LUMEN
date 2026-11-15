import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { SITE_SEEDS } from '../config/sites.ts'
import { useMissionStore } from '../store/useMissionStore.ts'
import { useUiStore } from '../store/useUiStore.ts'
import { BottomPanel } from './BottomPanel.tsx'
import { CompareView } from './CompareView.tsx'
import { ExplainPanel } from './ExplainPanel.tsx'
import { MetricsPanel } from './MetricsPanel.tsx'

// jsdom has no Worker and no site data: the astro client falls back to in-thread computation
// and the catalog to the ideal spherical horizon, so these tests run the real ephemeris.
beforeEach(() => {
  const s = useMissionStore.getState()
  s.reset()
  s.setSites(
    SITE_SEEDS.map((x) => ({ ...x, heightM: 0, accuracy: 'spherical', hasTerrain: false })),
  )
  s.selectSite('apollo-11')
  s.setStart(Date.UTC(2026, 10, 20))
  // These tests exercise the panel contents: start with every panel expanded.
  useUiStore.setState({ panels: { left: true, right: true, bottom: true }, tourStep: null })
})

describe('MetricsPanel', () => {
  it('shows the Sun and Earth state and the window summary', async () => {
    render(<MetricsPanel />)
    expect(screen.getByRole('heading', { name: 'Apolo 11' })).toBeInTheDocument()
    expect(await screen.findByText('DTE activo', {}, { timeout: 5000 })).toBeInTheDocument()
    expect(
      await screen.findByText('Tiempo con enlace DTE', {}, { timeout: 5000 }),
    ).toBeInTheDocument()
    // Near-side equatorial site: the Earth is always up.
    const row = screen.getByText('Tiempo con enlace DTE').parentElement!
    expect(within(row).getByText('100 %')).toBeInTheDocument()
  })
})

describe('BottomPanel', () => {
  it('switches tabs and computes alternative dates', async () => {
    render(<BottomPanel />)
    fireEvent.click(screen.getByRole('tab', { name: 'Fechas alternativas' }))
    expect(useMissionStore.getState().bottomPanel).toBe('dates')
    // The ranked list appears once the 12-month sweep is done.
    const items = await screen.findAllByRole('listitem', {}, { timeout: 10_000 })
    expect(items.length).toBeGreaterThan(0)
  })

  it('the scrubber moves the shared mission time', () => {
    render(<BottomPanel />)
    fireEvent.change(screen.getByLabelText('Tiempo desde el alunizaje'), {
      target: { value: '48' },
    })
    expect(useMissionStore.getState().offsetH).toBe(48)
  })
})

describe('overlays', () => {
  it('compare view lists every scenario', async () => {
    const s = useMissionStore.getState()
    s.addScenario()
    s.selectSite('change-4')
    s.setCompareOpen(true)
    render(<CompareView />)
    expect(screen.getByRole('heading', { name: 'Apolo 11' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: "Chang'e-4" })).toBeInTheDocument()
    // Far side: never a direct link.
    expect(await screen.findByText(/Sin enlace/, {}, { timeout: 5000 })).toBeInTheDocument()
  })

  it('explain cards jump to the illustrating site', () => {
    useMissionStore.getState().setExplainOpen(true)
    render(<ExplainPanel />)
    fireEvent.click(screen.getByRole('button', { name: "Ir a Chang'e-4" }))
    const st = useMissionStore.getState()
    expect(st.scenarios[0].siteId).toBe('change-4')
    expect(st.view).toBe('micro')
    expect(st.explainOpen).toBe(false)
  })
})

describe('glossary', () => {
  it('lists the terms inside the "Why?" panel', () => {
    useMissionStore.getState().setExplainOpen(true)
    render(<ExplainPanel />)
    expect(screen.getByRole('heading', { name: 'Glosario' })).toBeInTheDocument()
    expect(screen.getAllByRole('term')).toHaveLength(10)
    expect(screen.getByText('Zona de dispersión')).toBeInTheDocument()
  })
})
