import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { SITE_SEEDS } from '../config/sites.ts'
import { selectActiveScenario, useMissionStore } from '../store/useMissionStore.ts'
import { useUiStore } from '../store/useUiStore.ts'
import { SitePicker } from './SitePicker.tsx'

beforeEach(() => {
  useMissionStore.getState().reset()
  useMissionStore
    .getState()
    .setSites(SITE_SEEDS.map((s) => ({ ...s, heightM: 0, accuracy: 'lola', hasTerrain: true })))
  useUiStore.setState({ showAllSites: false })
})

const openAll = () => fireEvent.click(screen.getByRole('button', { name: /Ver más sitios/ }))

describe('SitePicker', () => {
  it('shows the Top 3 first and hides the full catalogue', () => {
    render(<SitePicker />)
    expect(screen.getByRole('list', { name: 'Top 3 para tu misión' }).children).toHaveLength(3)
    expect(screen.queryByText('Apolo 11')).not.toBeInTheDocument()
  })

  it('"see more" lists the curated sites grouped by region', () => {
    render(<SitePicker />)
    openAll()
    expect(screen.getByText('Polo Sur')).toBeInTheDocument()
    expect(screen.getAllByText('Macizo Malapert').length).toBeGreaterThan(0)
    expect(screen.getByText('Apolo 11')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ver solo el Top 3' }))
    expect(screen.queryByText('Apolo 11')).not.toBeInTheDocument()
  })

  it('selecting a site updates the active scenario', () => {
    render(<SitePicker />)
    openAll()
    fireEvent.click(screen.getByLabelText(/Macizo Malapert/))
    expect(selectActiveScenario(useMissionStore.getState()).siteId).toBe('malapert-massif')
  })

  it('picking a Top 3 card selects that site', () => {
    render(<SitePicker />)
    const cards = screen.getAllByRole('button').filter((b) => b.className === 'top__card')
    fireEvent.click(cards[1])
    const id = selectActiveScenario(useMissionStore.getState()).siteId
    expect(cards[1]).toHaveAttribute('data-active', 'true')
    expect(id).toBeTruthy()
  })

  it('shows where on the Moon the active site is', () => {
    render(<SitePicker />)
    expect(screen.getAllByRole('img', { name: 'Polo sur lunar' }).length).toBeGreaterThan(0)
  })

  it('adds custom coordinates', () => {
    render(<SitePicker />)
    openAll()
    fireEvent.change(screen.getByLabelText('Latitud (°)'), { target: { value: '-88.25' } })
    fireEvent.change(screen.getByLabelText('Longitud (°E)'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Usar' }))
    expect(selectActiveScenario(useMissionStore.getState()).siteId).toBe('custom:-88.2500:10.0000')
    expect(screen.getByText('Personalizados')).toBeInTheDocument()
  })

  it('rejects out-of-range coordinates', () => {
    render(<SitePicker />)
    openAll()
    fireEvent.change(screen.getByLabelText('Latitud (°)'), { target: { value: '-95' } })
    expect(screen.getByRole('button', { name: 'Usar' })).toBeDisabled()
  })
})
