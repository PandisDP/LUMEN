import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TraverseSummary } from '../astro/traverse.ts'
import type { SiteDetail } from '../data/catalog.ts'
import { useLangStore } from '../i18n/index.ts'
import { usePlannerStore } from '../store/usePlannerStore.ts'
import { useRoverStore } from '../store/useRoverStore.ts'
import { IceCard } from './IceCard.tsx'

// The card only reads the results of the two worker jobs: ice within reach, and the round trip.
const trip = vi.hoisted(() => ({ summary: null as unknown }))
vi.mock('../hooks/useScience.ts', () => ({
  useIceAccess: () => ({
    available: true,
    loading: false,
    error: null,
    retry: () => {},
    rover: 20,
    data: {
      straightM: 1200,
      routeM: 1390,
      maxSlopeDeg: 15.7,
      reachable: true,
      insidePsr: false,
      target: null,
      path: [],
      radiusM: 2000,
    },
  }),
}))
vi.mock('../hooks/useRover.ts', () => ({
  useRoverTraverse: () => ({ data: { summary: trip.summary }, loading: false, error: null }),
}))

const summary = (patch: Partial<TraverseSummary> = {}): TraverseSummary => ({
  reaches: true,
  arrivalMs: 0,
  samples: 3,
  samplesDone: 3,
  returns: true,
  returnMs: 0,
  onTime: true,
  marginH: 322.9,
  success: true,
  lengthM: 2780,
  outLengthM: 1390,
  driveH: 7,
  outDriveH: 3.5,
  returnDriveH: 3.5,
  waitH: 0,
  outWaitH: 0,
  workH: 6,
  totalH: 13,
  minSocPct: 47.1,
  endSocPct: 54.7,
  energyWh: 4000,
  hoursInShadow: 6.5,
  dtePct: 0,
  psrEntryM: 1300,
  ...patch,
})
const show = (s: TraverseSummary) => {
  trip.summary = s
  return render(<IceCard detail={{} as SiteDetail} />)
}
const level = (c: HTMLElement) =>
  [...c.querySelectorAll('.card__sub .lvl')].at(-1)?.getAttribute('data-level')

beforeEach(() => {
  useLangStore.setState({ lang: 'es' })
  useRoverStore.setState({ roverId: 'csa-rover', samples: 3, sampleH: 2 })
  usePlannerStore.setState({ minRoverSocPct: 20 })
})

describe('IceCard: verdict of the rover for the whole mission', () => {
  it('says it goes, samples and comes back, with the lowest battery', () => {
    const { container } = show(summary())
    expect(
      screen.getByText(
        /Rover \(utilitario CSA \(350 kg\)\): va, recoge 3 muestras y vuelve en 13 h 0 min · batería mín\. 47 %/,
      ),
    ).toBeTruthy()
    expect(level(container)).toBe('good')
    expect(screen.getByRole('button', { name: 'Ver el recorrido' })).toBeTruthy()
  })

  it('warns when it makes it but under the minimum battery of the planner', () => {
    const { container } = show(summary({ minSocPct: 15.2 }))
    expect(screen.getByText(/pero la batería baja al 15 % \(mínimo 20 %\)/)).toBeTruthy()
    expect(level(container)).toBe('warn')
  })

  it('gives the reason when the samples are not completed', () => {
    useRoverStore.setState({ roverId: 'rover' })
    const { container } = show(
      summary({
        samplesDone: 1,
        returns: false,
        onTime: false,
        success: false,
        marginH: null,
        reason: 'samples',
        minSocPct: 19.7,
      }),
    )
    expect(
      screen.getByText(/Rover \(micro-rover \(40 kg\)\): solo recoge 1 de 3 muestras/),
    ).toBeTruthy()
    expect(level(container)).toBe('bad')
  })

  it('tells apart dying on the way out, not returning and returning late', () => {
    const dead = { returns: false, onTime: false, success: false, marginH: null }
    let r = show(summary({ ...dead, reaches: false, samplesDone: 0, reason: 'battery' }))
    expect(screen.getByText(/no llega al hielo: se queda sin batería/)).toBeTruthy()
    expect(level(r.container)).toBe('bad')
    r.unmount()
    r = show(summary({ ...dead, reason: 'battery' }))
    expect(screen.getByText(/recoge las muestras pero no vuelve/)).toBeTruthy()
    r.unmount()
    r = show(summary({ onTime: false, success: false, marginH: -5.5, reason: 'late' }))
    expect(screen.getByText(/vuelve tarde: 5 h 30 min después del fin de la misión/)).toBeTruthy()
    expect(level(r.container)).toBe('bad')
  })

  it('reads in English too', () => {
    useLangStore.setState({ lang: 'en' })
    show(summary())
    expect(
      screen.getByText(
        /drives out, collects 3 samples and is back in 13 h 0 min · lowest battery 47 %/,
      ),
    ).toBeTruthy()
  })
})
