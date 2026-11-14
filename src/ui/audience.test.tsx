import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { SITE_SEEDS } from '../config/sites.ts'
import { useMissionStore } from '../store/useMissionStore.ts'
import { AUDIENCES, loadAudience, useUiStore } from '../store/useUiStore.ts'
import { FEATURES, VISIBLE, isVisible } from './audience.ts'
import { BottomPanel } from './BottomPanel.tsx'
import { MetricsPanel } from './MetricsPanel.tsx'
import { MoreMenu } from './MoreMenu.tsx'
import { AudienceToggle } from './TopBar.tsx'
import { Welcome } from './Welcome.tsx'

beforeEach(() => {
  const s = useMissionStore.getState()
  s.reset()
  s.setSites(
    SITE_SEEDS.map((x) => ({ ...x, heightM: 0, accuracy: 'spherical', hasTerrain: false })),
  )
  s.selectSite('apollo-11')
  s.setStart(Date.UTC(2026, 10, 20))
  useUiStore.setState({
    panels: { left: true, right: true, bottom: true },
    tourStep: null,
    audience: 'planner',
  })
})

describe('visibility matrix', () => {
  it('defines every feature for every audience', () => {
    for (const a of AUDIENCES) {
      for (const f of FEATURES) expect(typeof VISIBLE[a][f]).toBe('boolean')
    }
  })

  it('planners see everything except the automatic explanation; the public the opposite', () => {
    for (const f of FEATURES) {
      expect(isVisible('planner', f)).toBe(f !== 'explainAuto')
      expect(isVisible('public', f)).toBe(f === 'explainAuto')
    }
    // Educators keep the physics and lose the engineering tools.
    expect(isVisible('educator', 'thermal')).toBe(true)
    expect(isVisible('educator', 'ice')).toBe(true)
    expect(isVisible('educator', 'hardware')).toBe(false)
    expect(isVisible('educator', 'export')).toBe(false)
  })
})

describe('store', () => {
  it('ignores unknown audiences and persists valid ones', () => {
    const { setAudience } = useUiStore.getState()
    setAudience('public')
    expect(useUiStore.getState().audience).toBe('public')
    expect(loadAudience()).toBe('public')
    setAudience('nope' as never)
    expect(useUiStore.getState().audience).toBe('public')
    localStorage.setItem('lumen3d.audience', 'garbage')
    expect(loadAudience()).toBe('planner')
  })
})

describe('panels follow the audience', () => {
  it('the public sees Sun and Earth but not the DSN row nor the landing ellipse', async () => {
    useUiStore.setState({ audience: 'public' })
    useMissionStore.getState().setEllipseRadius(500)
    render(<MetricsPanel />)
    expect(await screen.findByText('DTE activo', {}, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.queryByText(/Goldstone|Madrid|Canberra/)).toBeNull()
    expect(screen.queryByText('Temperatura estimada')).toBeNull()
    // The compact window summary keeps the three essentials and drops the detail rows.
    expect(
      await screen.findByText('Tiempo con enlace DTE', {}, { timeout: 5000 }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Noche más larga')).toBeNull()
  })

  it('planners get the full window summary', async () => {
    render(<MetricsPanel />)
    expect(await screen.findByText('Noche más larga', {}, { timeout: 5000 })).toBeInTheDocument()
  })

  it('the public only has the timeline tab, and an open hidden tab falls back to it', () => {
    useMissionStore.getState().setBottomPanel('dates')
    useUiStore.setState({ audience: 'public' })
    render(<BottomPanel />)
    expect(screen.getAllByRole('tab')).toHaveLength(1)
    expect(screen.getByRole('tab', { name: 'Línea temporal' })).toBeInTheDocument()
    expect(useMissionStore.getState().bottomPanel).toBe('timeline')
  })

  it('educators keep the horizon and dates tabs', () => {
    useUiStore.setState({ audience: 'educator' })
    render(<BottomPanel />)
    expect(screen.getAllByRole('tab')).toHaveLength(3)
  })

  it('hides the hardware filter from the public menu', () => {
    useUiStore.setState({ audience: 'public' })
    render(<MoreMenu />)
    expect(screen.queryByRole('menuitem', { name: /Hardware/ })).toBeNull()
  })
})

describe('choosing the audience', () => {
  it('the top bar toggle switches the mode', () => {
    render(<AudienceToggle />)
    fireEvent.click(screen.getByRole('button', { name: 'Educador' }))
    expect(useUiStore.getState().audience).toBe('educator')
    expect(screen.getByRole('button', { name: 'Educador' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('the welcome screen offers the three audiences', () => {
    useUiStore.setState({ stage: 'welcome' })
    render(<Welcome />)
    expect(screen.getByText('¿Quién eres?')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText(/Público/))
    expect(useUiStore.getState().audience).toBe('public')
  })
})
