import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { HOUR_MS } from '../astro/constants.ts'
import type { SiteSeries } from '../astro/series.ts'
import { thermalSeries } from '../astro/thermal.ts'
import { SITE_SEEDS } from '../config/sites.ts'
import { useMissionStore } from '../store/useMissionStore.ts'
import { useUiStore } from '../store/useUiStore.ts'
import { HardwareFilter } from './HardwareFilter.tsx'
import { MetricsPanel } from './MetricsPanel.tsx'
import { ThermalCard } from './ThermalCard.tsx'

// Same set-up as panels.test: no Worker and no site data, so the real ephemeris runs in-thread
// against ideal spherical horizons.
beforeEach(() => {
  const s = useMissionStore.getState()
  s.reset()
  s.setSites(
    SITE_SEEDS.map((x) => ({
      ...x,
      heightM: 0,
      accuracy: 'spherical' as const,
      hasTerrain: false,
      slopeP90Deg: x.id === 'haworth' ? 40 : 3,
    })),
  )
  s.selectSite('apollo-11')
  s.setStart(Date.UTC(2026, 10, 20))
  useUiStore.setState({ panels: { left: true, right: true, bottom: true }, tourStep: null })
})

describe('DSN link in the metrics panel', () => {
  it('lists the three complexes with the range and path loss', async () => {
    render(<MetricsPanel />)
    const list = await screen.findByRole('list', { name: 'Estaciones de la Deep Space Network' })
    for (const name of ['Goldstone', 'Madrid', 'Canberra']) {
      expect(within(list).getByText(new RegExp(name))).toBeInTheDocument()
    }
    expect(screen.getByText(/pérdida en espacio libre 22\d\.\d dB/)).toBeInTheDocument()
  })
})

describe('ThermalCard', () => {
  it('shows the permanent-shadow floor for a site that never sees the Sun', () => {
    const n = 48
    const series: SiteSeries = {
      startMs: 0,
      stepMs: HOUR_MS,
      count: n,
      sunAz: new Float32Array(n),
      sunEl: new Float32Array(n).fill(-3),
      sunFrac: new Float32Array(n),
      earthAz: new Float32Array(n),
      earthEl: new Float32Array(n),
      earthFrac: new Float32Array(n),
    }
    render(<ThermalCard thermal={thermalSeries(series)} startMs={0} stepMs={HOUR_MS} timeMs={0} />)
    expect(screen.getByText('-233 °C · 40 K')).toBeInTheDocument()
    expect(screen.getByText(/Congelamiento crítico/)).toBeInTheDocument()
  })
})

describe('HardwareFilter', () => {
  it('rules out a site that breaks a limit and sends the viable ones to Compare', async () => {
    useMissionStore.getState().setHardwareOpen(true)
    render(<HardwareFilter />)
    const table = await screen.findByRole('table', {}, { timeout: 20_000 })
    const haworth = within(table)
      .getByText(/Interior de Haworth/)
      .closest('tr')!
    expect(haworth).toHaveAttribute('data-level', 'bad')
    expect(within(haworth).getByText('pendiente')).toBeInTheDocument()

    // Tightening the night limit live re-classifies without recomputing.
    fireEvent.change(screen.getByLabelText('Noche continua máx. (h)'), { target: { value: '1' } })
    const apollo = within(table)
      .getByText(/Apolo 11/)
      .closest('tr')!
    expect(apollo).toHaveAttribute('data-level', 'bad')
    fireEvent.change(screen.getByLabelText('Noche continua máx. (h)'), {
      target: { value: '720' },
    })

    fireEvent.click(screen.getByRole('button', { name: /Enviar \d viables a Comparar/ }))
    const st = useMissionStore.getState()
    expect(st.compareOpen).toBe(true)
    expect(st.hardwareOpen).toBe(false)
    expect(st.scenarios.length).toBeGreaterThan(0)
    expect(st.scenarios.length).toBeLessThanOrEqual(4)
    expect(st.scenarios.some((x) => x.siteId === 'haworth')).toBe(false)
  }, 30_000)
})
