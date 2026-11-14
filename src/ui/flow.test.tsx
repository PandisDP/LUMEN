import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { SITE_SEEDS } from '../config/sites.ts'
import { useMissionStore } from '../store/useMissionStore.ts'
import { useUiStore } from '../store/useUiStore.ts'
import { isPolar, nearSideXY, polarXY } from './locator.ts'
import { StepBar, StepHint } from './StepBar.tsx'
import { DECIDE_STEP, goToStep, stepIndex } from './steps.ts'
import { ChooseSite, Welcome } from './Welcome.tsx'

beforeEach(() => {
  useMissionStore.getState().reset()
  useMissionStore
    .getState()
    .setSites(SITE_SEEDS.map((s) => ({ ...s, heightM: 0, accuracy: 'lola', hasTerrain: true })))
  useUiStore.setState({ stage: 'welcome', tourStep: null })
})

describe('MoonLocator projection', () => {
  it('puts the pole in the centre and 0° longitude straight up', () => {
    const [px, py] = polarXY(-90, 123)
    expect(Math.hypot(px, py)).toBeCloseTo(0)
    const [x, y] = polarXY(-85, 0)
    expect(x).toBeCloseTo(0)
    expect(y).toBeLessThan(0)
    const [xe] = polarXY(-85, 90)
    expect(xe).toBeGreaterThan(0)
  })

  it('reaches the disc edge at 80°S', () => {
    const [x, y] = polarXY(-80, 45)
    expect(Math.hypot(x, y)).toBeCloseTo(1)
  })

  it('uses the near-side disc away from the pole', () => {
    expect(isPolar(-89)).toBe(true)
    expect(isPolar(0.67)).toBe(false)
    const [x, y] = nearSideXY(0, 0)
    expect(x).toBeCloseTo(0)
    expect(y).toBeCloseTo(0)
  })
})

describe('steps', () => {
  it('maps views and Compare to the four steps', () => {
    expect(stepIndex('macro', false)).toBe(0)
    expect(stepIndex('micro', false)).toBe(1)
    expect(stepIndex('landing', false)).toBe(2)
    expect(stepIndex('micro', true)).toBe(DECIDE_STEP)
  })

  it('goToStep switches view and opens/closes Decide', () => {
    goToStep(1)
    expect(useMissionStore.getState().view).toBe('micro')
    goToStep(DECIDE_STEP)
    expect(useMissionStore.getState().compareOpen).toBe(true)
    goToStep(0)
    expect(useMissionStore.getState().compareOpen).toBe(false)
    expect(useMissionStore.getState().view).toBe('macro')
  })

  it('StepBar ticks done steps and StepHint moves on', () => {
    render(
      <>
        <StepBar />
        <StepHint />
      </>,
    )
    expect(screen.getByText('Paso 1 de 4')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Ir a Superficie/ }))
    expect(useMissionStore.getState().view).toBe('micro')
    expect(screen.getByText('✓')).toBeInTheDocument()
    expect(screen.getByRole('button', { current: 'step' })).toHaveTextContent('Superficie')
  })
})

describe('welcome and site choice', () => {
  it('states the goal and leads to the site choice', () => {
    render(<Welcome />)
    expect(screen.getByText('Toma la mejor decisión de alunizaje')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Empezar/ }))
    expect(useUiStore.getState().stage).toBe('choose')
  })

  it('picking a Top 3 site starts exploring with the site panel open', () => {
    useUiStore.setState({ stage: 'choose' })
    useUiStore.getState().setPanel('left', false)
    render(<ChooseSite />)
    const cards = screen.getAllByRole('button').filter((b) => b.className === 'top__card')
    expect(cards).toHaveLength(3)
    fireEvent.click(cards[0])
    expect(useUiStore.getState().stage).toBe('explore')
    expect(useUiStore.getState().panels.left).toBe(true)
    expect(useMissionStore.getState().view).toBe('macro')
  })

  it('"see more" opens the full catalogue', () => {
    useUiStore.setState({ stage: 'choose', showAllSites: false })
    render(<ChooseSite />)
    fireEvent.click(screen.getByRole('button', { name: /Ver más sitios/ }))
    expect(useUiStore.getState().showAllSites).toBe(true)
    expect(useUiStore.getState().stage).toBe('explore')
  })
})
