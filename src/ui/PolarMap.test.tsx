import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { SITE_SEEDS } from '../config/sites.ts'
import { useMissionStore } from '../store/useMissionStore.ts'
import { PolarMap } from './PolarMap.tsx'

beforeEach(() => {
  const s = useMissionStore.getState()
  s.reset()
  s.setSites(
    SITE_SEEDS.map((x) => ({ ...x, heightM: 0, accuracy: 'spherical', hasTerrain: false })),
  )
  s.selectSite('shackleton-rim')
})

describe('PolarMap', () => {
  // jsdom has no canvas 2D context and no site data: the map must still render its controls.
  it('renders the legend and the illumination toggle without data', () => {
    render(<PolarMap />)
    expect(screen.getByRole('img', { name: 'Mapa del polo sur lunar' })).toBeInTheDocument()
    const toggle = screen.getByLabelText('Iluminación anual') as HTMLInputElement
    expect(toggle.checked).toBe(true)
    fireEvent.click(toggle)
    expect(toggle.checked).toBe(false)
    expect(screen.getByText('Sombra permanente (PSR)')).toBeInTheDocument()
  })
})
