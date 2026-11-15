import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { DescentSummary } from '../astro/descentPhysics.ts'
import { SITE_SEEDS } from '../config/sites.ts'
import { useDescentStore } from '../store/useDescentStore.ts'
import { useMissionStore } from '../store/useMissionStore.ts'
import { loadChallengeDone, useUiStore } from '../store/useUiStore.ts'
import { Challenges } from './Challenges.tsx'
import { ExplainPanel } from './ExplainPanel.tsx'
import { MoreMenu } from './MoreMenu.tsx'
import { Welcome } from './Welcome.tsx'

const flight = (propMarginPct: number) => ({
  flown: 'physics' as const,
  durationS: 300,
  summary: { ok: true, propMarginPct, dvMs: 1900 } as DescentSummary,
  hazard: null,
  noSafeGround: false,
})

// As in panels.test.tsx: no Worker and no site data, so horizons are spherical. Slopes are
// seeded by hand (they come from the site index in the app).
beforeEach(() => {
  localStorage.clear()
  const s = useMissionStore.getState()
  s.reset()
  s.setSites(
    SITE_SEEDS.map((x) => ({
      ...x,
      heightM: 0,
      accuracy: 'spherical',
      hasTerrain: false,
      slopeP90Deg: x.id === 'nobile-rim' ? 16.6 : 5,
    })),
  )
  s.selectSite('apollo-11')
  s.setStart(Date.UTC(2026, 10, 20))
  useUiStore.setState({
    stage: 'explore',
    audience: 'public',
    challengesOpen: true,
    challengeId: null,
    challengeHints: [],
    challengeResult: null,
    challengeDone: {},
  })
  useDescentStore.setState({ landed: false, vehicleId: 'clps', mode: 'physics' })
  useDescentStore.getState().publishFlight({ ...flight(25.4), flown: 'kinematic', summary: null })
})

const start = (title: string) =>
  fireEvent.click(screen.getByRole('button', { name: `Empezar: ${title}` }))

/** Solves "Aterriza con margen" the way the app would: safe site, lighter lander, touchdown. */
function land() {
  act(() => {
    useMissionStore.getState().selectSite('mons-mouton')
    useMissionStore.getState().setView('landing')
    useDescentStore.getState().setVehicle('clps')
    useDescentStore.getState().publishFlight(flight(25.4))
    useDescentStore.getState().land()
  })
}

describe('challenge list', () => {
  it('is hidden until opened and lists the five challenges', () => {
    useUiStore.setState({ challengesOpen: false })
    const { container } = render(<Challenges />)
    expect(container).toBeEmptyDOMElement()
    act(() => useUiStore.getState().setChallengesOpen(true))
    expect(screen.getByRole('heading', { name: 'Retos' })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    for (const title of [
      'Encuentra la luz',
      'No pierdas a la Tierra',
      'Sobrevive a la noche',
      'Aterriza con margen',
      'Llega al hielo',
    ])
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
    expect(screen.getByText('Puntuación: 0 / 500')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(useUiStore.getState().challengesOpen).toBe(false)
  })

  it('shows the best score of the challenges already solved', () => {
    useUiStore.setState({ challengeDone: { light: 85 } })
    render(<Challenges />)
    expect(screen.getByText('Mejor puntuación: 85')).toBeInTheDocument()
    expect(screen.getByText('Puntuación: 85 / 500')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Repetir: Encuentra la luz' })).toBeInTheDocument()
  })
})

describe('playing a challenge', () => {
  it('starting one applies its setup and shows the checklist', () => {
    render(<Challenges />)
    start('Encuentra la luz')
    const m = useMissionStore.getState()
    expect(useUiStore.getState().challengeId).toBe('light')
    expect(m.scenarios).toHaveLength(1)
    expect(m.scenarios[0].siteId).toBe('shackleton-floor')
    expect(m.scenarios[0].startMs).toBe(Date.UTC(2027, 2, 1))
    expect(m.missionDays).toBe(14)
    expect(m.view).toBe('macro')
    expect(screen.getByRole('heading', { name: /Reto 1.*Encuentra la luz/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Objetivos/ })).toHaveTextContent('0/1')
    expect(
      screen.getByText(/Sol ≥ 80 % del tiempo/, { selector: '.challenges__goal' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('0 de 1 objetivos cumplidos')
    expect(screen.queryByRole('heading', { name: /Reto superado/ })).toBeNull()
  })

  it('the landing challenge starts unsolved with the heavy lander on steep ground', () => {
    render(<Challenges />)
    start('Aterriza con margen')
    expect(useMissionStore.getState().scenarios[0].siteId).toBe('nobile-rim')
    expect(useDescentStore.getState().vehicleId).toBe('heavy')
    expect(screen.getAllByText('pendiente')).toHaveLength(3)
    expect(screen.getByText('(ahora: 16.6°)')).toBeInTheDocument()
  })

  it('ticks the goals off live and shows the success card with the lesson', () => {
    render(<Challenges />)
    start('Aterriza con margen')
    // A safe site alone meets one goal of three.
    act(() => useMissionStore.getState().selectSite('mons-mouton'))
    expect(screen.getByRole('status')).toHaveTextContent('1 de 3 objetivos cumplidos')
    // The heavy lander lands, but with 18 % of propellant.
    act(() => {
      useMissionStore.getState().setView('landing')
      useDescentStore.getState().publishFlight(flight(18))
      useDescentStore.getState().land()
    })
    expect(screen.getByRole('status')).toHaveTextContent('2 de 3 objetivos cumplidos')
    expect(useUiStore.getState().challengeResult).toBeNull()
    land()
    expect(screen.getByRole('heading', { name: /¡Reto superado!/ })).toBeInTheDocument()
    expect(screen.getByText('Qué has aprendido')).toBeInTheDocument()
    expect(screen.getByText(/cerca de 2 km\/s de Δv/)).toBeInTheDocument()
    expect(screen.getByText('Puntuación: 100 / 100')).toBeInTheDocument()
    expect(useUiStore.getState().challengeResult).toBe(100)
    expect(JSON.parse(localStorage.getItem('lumen3d.challenges')!)).toEqual({ landing: 100 })
    expect(loadChallengeDone()).toEqual({ landing: 100 })
  })

  it('each hint revealed costs 15 points and the best score is kept', () => {
    useUiStore.setState({ challengeDone: { landing: 100 } })
    render(<Challenges />)
    fireEvent.click(screen.getByRole('button', { name: 'Repetir: Aterriza con margen' }))
    fireEvent.click(
      screen.getByRole('button', { name: /Pista \(−15 puntos\): Sitio con pendiente segura/ }),
    )
    expect(screen.getByText(/Mons Mouton o el macizo Malapert/)).toBeInTheDocument()
    expect(useUiStore.getState().challengeHints).toEqual(['slope'])
    land()
    expect(screen.getByText('Puntuación: 85 / 100')).toBeInTheDocument()
    expect(useUiStore.getState().challengeDone).toEqual({ landing: 100 })
    // Solved runs offer no more hints.
    expect(screen.queryByRole('button', { name: /Pista/ })).toBeNull()
  })

  it('a solved run stays solved, and "next" starts the following challenge', () => {
    render(<Challenges />)
    start('Aterriza con margen')
    land()
    act(() => useMissionStore.getState().setView('macro'))
    expect(screen.getByRole('heading', { name: /¡Reto superado!/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Siguiente reto/ }))
    expect(useUiStore.getState().challengeId).toBe('ice')
    expect(useUiStore.getState().challengeResult).toBeNull()
    expect(useMissionStore.getState().scenarios[0].siteId).toBe('change-7')
    expect(screen.getByRole('heading', { name: /Reto 5.*Llega al hielo/ })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Reto superado/ })).toBeNull()
  })

  it('"all challenges" leaves the one in progress', () => {
    render(<Challenges />)
    start('No pierdas a la Tierra')
    expect(useMissionStore.getState().scenarios[0].siteId).toBe('shackleton-rim')
    fireEvent.click(screen.getByRole('button', { name: 'Todos los retos' }))
    expect(useUiStore.getState().challengeId).toBeNull()
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
  })
})

describe('floating bar', () => {
  it('stays on screen with the progress while the overlay is closed', () => {
    render(<Challenges />)
    start('Aterriza con margen')
    fireEvent.click(screen.getByRole('button', { name: 'Ir al simulador' }))
    expect(useUiStore.getState().challengesOpen).toBe(false)
    const bar = screen.getByRole('complementary', { name: 'Reto en curso' })
    expect(within(bar).getByText('Aterriza con margen')).toBeInTheDocument()
    expect(within(bar).getByText('0/3')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Objetivos/ })).toBeNull()
    // Solving it with the overlay closed is announced in the bar.
    land()
    expect(within(bar).getByRole('status')).toHaveTextContent('¡Reto superado!')
    expect(useUiStore.getState().challengeDone).toEqual({ landing: 100 })
    useMissionStore.getState().setExplainOpen(true)
    fireEvent.click(within(bar).getByRole('button', { name: 'Ver resultado' }))
    expect(useUiStore.getState().challengesOpen).toBe(true)
    expect(useMissionStore.getState().explainOpen).toBe(false)
    expect(screen.getByRole('heading', { name: /¡Reto superado!/ })).toBeInTheDocument()
  })
})

describe('entry points', () => {
  it('the More menu opens the challenges for every audience', () => {
    useUiStore.setState({ challengesOpen: false })
    render(<MoreMenu />)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Retos' }))
    expect(useUiStore.getState().challengesOpen).toBe(true)
  })

  it('the welcome screen can go straight to the challenges', () => {
    useUiStore.setState({ challengesOpen: false, stage: 'welcome' })
    render(<Welcome />)
    fireEvent.click(screen.getByRole('button', { name: 'Jugar los retos' }))
    expect(useUiStore.getState().stage).toBe('explore')
    expect(useUiStore.getState().challengesOpen).toBe(true)
  })

  it('the "Why?" panel links to the challenges and gives way to them', () => {
    useUiStore.setState({ challengesOpen: false })
    useMissionStore.getState().setExplainOpen(true)
    render(<ExplainPanel />)
    fireEvent.click(screen.getByRole('button', { name: /Prueba los 5 retos/ }))
    expect(useUiStore.getState().challengesOpen).toBe(true)
    expect(useMissionStore.getState().explainOpen).toBe(false)
  })
})
