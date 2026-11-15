import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TraversePhase, TraverseSummary } from '../astro/traverse.ts'
import { useLangStore } from '../i18n/index.ts'
import { roverTelemetry } from '../scene/micro/roverTelemetry.ts'
import { usePlannerStore } from '../store/usePlannerStore.ts'
import { useRoverStore } from '../store/useRoverStore.ts'
import { RoverHud } from './RoverHud.tsx'

const H = 3_600_000
const trip = vi.hoisted(() => ({ data: null as unknown }))
vi.mock('../hooks/useRover.ts', () => ({
  useRoverTraverse: () => ({ data: trip.data, loading: false, error: null }),
}))

const summary = (patch: Partial<TraverseSummary> = {}): TraverseSummary => ({
  reaches: true,
  arrivalMs: 3 * H,
  samples: 3,
  samplesDone: 3,
  returns: true,
  returnMs: 13 * H,
  onTime: true,
  marginH: 323,
  success: true,
  lengthM: 2000,
  outLengthM: 1000,
  driveH: 7,
  outDriveH: 3,
  returnDriveH: 4,
  waitH: 0,
  outWaitH: 0,
  workH: 6,
  totalH: 13,
  minSocPct: 47,
  endSocPct: 55,
  energyWh: 4000,
  hoursInShadow: 6.5,
  dtePct: 40,
  psrEntryM: 900,
  ...patch,
})

/** A straight kilometre downhill to the ice and back, as the result of the worker gives it. */
function result(s: TraverseSummary, phase: TraversePhase[], t: number[]) {
  const out = [0, 500, 1000].map((distM) => ({ distM, heightM: 100 - distM / 10, leg: 'out' }))
  const back = [1000, 1500, 2000].map((distM) => ({
    distM,
    heightM: 100 - (2000 - distM) / 10,
    leg: 'back',
  }))
  return {
    plan: {
      points: [...out, ...back],
      turnIndex: 2,
      lengthM: 2000,
      outLengthM: 1000,
      maxSlopeDeg: 6,
      psrEntryM: 900,
      roundTrip: true,
    },
    t,
    phase,
    summary: s,
  }
}
const good = () =>
  result(summary(), ['out', 'out', 'sample', 'back', 'done'], [0, 2 * H, 3 * H, 9 * H, 13 * H])
const failed = () =>
  result(
    summary({
      samplesDone: 1,
      returns: false,
      returnMs: null,
      onTime: false,
      marginH: null,
      success: false,
      reason: 'samples',
      minSocPct: 19.7,
    }),
    ['out', 'out', 'sample', 'sample'],
    [0, 2 * H, 7 * H, 10 * H],
  )

/** What the scene would have written for an instant of the trip. */
const at = (patch: Partial<typeof roverTelemetry>) =>
  Object.assign(roverTelemetry, {
    active: true,
    distM: 0,
    lengthM: 2000,
    outLengthM: 1000,
    poseDistM: 0,
    phase: 'out',
    leg: 'out',
    sampleIndex: 0,
    samplesDone: 0,
    done: false,
    ...patch,
  })
const chips = () => document.querySelector('.rhud__chips')!
const state = () => document.querySelector('.rhud__state') as HTMLElement

beforeEach(() => {
  localStorage.clear()
  useLangStore.setState({ lang: 'es' })
  useRoverStore.setState({ roverId: 'csa-rover', samples: 3, sampleH: 2, tMs: 0 })
  usePlannerStore.setState({ minRoverSocPct: 20 })
  trip.data = good()
})
afterEach(() => {
  roverTelemetry.active = false
})

describe('RoverHud: state of the round trip', () => {
  it('heads to the ice, counting down the outbound leg', () => {
    at({ distM: 400 })
    render(<RoverHud />)
    expect(state().textContent).toBe('Yendo al hielo')
    expect(state().dataset.state).toBe('out')
    expect(chips().textContent).toContain('○○○ 0/3 muestras')
    expect(screen.getByText('Falta al hielo').nextElementSibling?.textContent).toBe('600 m')
  })

  it('names the sample in progress and fills the counter as they are completed', () => {
    at({ distM: 1000, phase: 'sample', sampleIndex: 2, samplesDone: 1 })
    render(<RoverHud />)
    expect(state().textContent).toBe('Muestra 2 de 3')
    expect(chips().textContent).toContain('●○○ 1/3 muestras')
  })

  it('says when it is recharging', () => {
    at({ distM: 700, phase: 'wait' })
    render(<RoverHud />)
    expect(state().textContent).toBe('Recargando')
  })

  it('heads back, counting down to the lander, with the cursor coming back', () => {
    at({ distM: 1250, phase: 'back', leg: 'back', samplesDone: 3 })
    render(<RoverHud />)
    expect(state().textContent).toBe('Regresando')
    expect(screen.getByText('Falta al módulo').nextElementSibling?.textContent).toBe('750 m')
    // 250 m into the way back is 750 m along the outbound profile (320 units wide).
    const cursor = document.querySelector('.rhud__cursor')!.parentElement!
    expect(cursor.getAttribute('transform')).toBe('translate(240.0 0)')
    expect(document.querySelector('.rhud__arrow')!.getAttribute('transform')).toBe('scale(-1 1)')
  })

  it('ends back at the lander with the summary of the mission', () => {
    at({ distM: 2000, phase: 'done', leg: 'back', samplesDone: 3, done: true })
    render(<RoverHud />)
    expect(state().textContent).toBe('✓ De vuelta en el módulo')
    expect(state().dataset.band).toBe('ok')
    expect(screen.getByRole('status').textContent).toContain(
      '3 muestras · vuelve en 13 h 0 min · margen 13 d 11 h · batería mín. 47 %',
    )
    expect(document.querySelector('.notice')).toBeNull()
  })

  it('spans the whole trip on the slider, with ticks at the ice arrival and departure', () => {
    at({})
    render(<RoverHud />)
    const slider = screen.getByRole('slider', { name: 'Progreso del recorrido' })
    expect(slider.getAttribute('max')).toBe(String(13 * H))
    const ticks = [...document.querySelectorAll<HTMLElement>('.rhud__tick')]
    expect(ticks.map((el) => Number(el.style.getPropertyValue('--at')))).toEqual([3 / 13, 9 / 13])
    // The last step of the slider is the end of the trip.
    fireEvent.change(slider, { target: { value: String(13 * H - 30_000) } })
    expect(useRoverStore.getState().seek?.tMs).toBe(13 * H)
  })

  it('warns when the trip is fine but the battery goes under the planner minimum', () => {
    trip.data = result(summary({ minSocPct: 15 }), ['out', 'done'], [0, 13 * H])
    at({})
    render(<RoverHud />)
    const notice = document.querySelector('.notice') as HTMLElement
    expect(notice.dataset.tone).toBe('warning')
    expect(notice.textContent).toContain('▲')
    expect(notice.textContent).toContain('la batería baja al 15 %, por debajo del mínimo de 20 %')
  })
})

describe('RoverHud: a trip that fails', () => {
  beforeEach(() => {
    trip.data = failed()
    useRoverStore.setState({ roverId: 'rover' })
  })

  it('ends with the reason, in text and glyph, and a notice', () => {
    at({ distM: 1000, phase: 'sample', sampleIndex: 2, samplesDone: 1, done: true })
    render(<RoverHud />)
    expect(state().textContent).toBe('▼ No completó las muestras')
    expect(state().dataset.band).toBe('deficit')
    const notice = document.querySelector('.notice') as HTMLElement
    expect(notice.dataset.tone).toBe('error')
    expect(notice.textContent).toContain('No completó las muestras: recoge 1 de 3')
  })

  it('does not give the ending away in the state chip while the trip is under way', () => {
    at({ distM: 300 })
    render(<RoverHud />)
    expect(state().textContent).toBe('Yendo al hielo')
  })

  it('offers fewer samples and the utility rover, and each changes its input', () => {
    at({ distM: 1000, phase: 'sample', done: true })
    render(<RoverHud />)
    fireEvent.click(screen.getByRole('button', { name: 'Recoger menos muestras' }))
    expect(useRoverStore.getState().samples).toBe(2)
    fireEvent.click(screen.getByRole('button', { name: 'Usar el rover utilitario' }))
    expect(useRoverStore.getState().roverId).toBe('csa-rover')
    // With the utility rover selected there is no other rover left to offer.
    expect(screen.queryByRole('button', { name: 'Usar el rover utilitario' })).toBeNull()
  })

  it('reads its states in English too', () => {
    useLangStore.setState({ lang: 'en' })
    at({ distM: 1000, phase: 'sample', sampleIndex: 2, samplesDone: 1, done: true })
    render(<RoverHud />)
    expect(state().textContent).toBe('▼ Did not finish the samples')
    expect(screen.getByRole('button', { name: 'Collect fewer samples' })).toBeTruthy()
  })
})
