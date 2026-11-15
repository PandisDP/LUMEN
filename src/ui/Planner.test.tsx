import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { SITE_SEEDS } from '../config/sites.ts'
import { selectActiveScenario, useMissionStore } from '../store/useMissionStore.ts'
import { PLAN_DEFAULTS } from '../astro/plannerTypes.ts'
import { usePlannerStore } from '../store/usePlannerStore.ts'
import { useRoverStore } from '../store/useRoverStore.ts'
import { useUiStore } from '../store/useUiStore.ts'
import { Planner } from './Planner.tsx'
import { FIXTURE_FROM, fixtureResult } from './plannerFixture.ts'

const ICE = {
  straightM: 1360,
  routeM: 1401,
  maxSlopeDeg: 15.7,
  reachable: true,
  insidePsr: false,
  roverMaxSlopeDeg: 20,
}

// jsdom has no canvas, no worker and no published tiles: the screen is driven by putting a
// synthetic result into the planner store, as the engine does.
beforeEach(() => {
  const s = useMissionStore.getState()
  s.reset()
  s.setSites(
    SITE_SEEDS.map((x) => ({
      ...x,
      heightM: 0,
      accuracy: x.category === 'south-pole' ? 'lola' : 'spherical',
      hasTerrain: x.category === 'south-pole',
      ice: x.id === 'shackleton-rim' ? ICE : undefined,
    })),
  )
  s.selectSite('shackleton-rim')
  useUiStore.setState({ audience: 'planner', stage: 'plan', tourStep: null })
  const p = usePlannerStore.getState()
  p.clearResult()
  p.setTarget(null, null)
  p.setRange(FIXTURE_FROM, 10)
  usePlannerStore.setState({ ...PLAN_DEFAULTS, picked: [] })
  p.setRange(FIXTURE_FROM, 10)
  useRoverStore.getState().setRover('rover')
})

/** Shows a result the way a finished run leaves it, with the inputs that produced it. */
function show(result = fixtureResult([40, 'night', 88, 61, 'short-light', 75, 70, 66, 52, 30])) {
  const p = usePlannerStore.getState()
  p.setTarget(result.problem.target, result.problem.tileSiteId)
  p.setRange(result.problem.fromMs, result.problem.days)
  p.setRun({ result, status: 'done', progress: 1, error: null })
  return result
}

const cells = () => screen.getByRole('group', { name: /Calendario/ }).querySelectorAll('button')
const bodyRows = () => screen.getByRole('table').querySelectorAll('tbody tr')

describe('Planner: inputs', () => {
  it('renders the three zones in order, each with its heading', () => {
    render(<Planner />)
    expect(screen.getByRole('heading', { level: 2, name: 'Planificar la misión' })).toBeVisible()
    const zones = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(zones).toEqual(['1 · Qué misión', '2 · Cuándo', '3 · Dónde'])
    expect(screen.getByRole('region', { name: /Qué misión/ })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Mapa del relieve/ })).toBeInTheDocument()
    // Before the first run: the range as pending days and what will happen.
    expect(cells()).toHaveLength(10)
    expect(screen.getByText(/pulsa «Planificar»/)).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('the Plan button is disabled, with the reason, until there is a target', () => {
    render(<Planner />)
    const go = screen.getByRole('button', { name: 'Planificar' })
    expect(go).toBeDisabled()
    expect(go).toHaveAccessibleDescription('Elige primero un objetivo con hielo.')
    fireEvent.change(screen.getByLabelText('Objetivos sugeridos'), {
      target: { value: 'near-site:shackleton-rim' },
    })
    expect(usePlannerStore.getState().tileSiteId).toBe('shackleton-rim')
    expect(usePlannerStore.getState().target).toEqual(
      expect.objectContaining({ lat: expect.any(Number), lon: expect.any(Number) }),
    )
    expect(screen.getByRole('option', { name: 'Hielo junto a Borde de Shackleton' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Planificar' })).toBeEnabled()
  })

  it('typed coordinates outside the 20 m terrain are refused inline', () => {
    render(<Planner />)
    fireEvent.change(screen.getByLabelText('Latitud (°)'), { target: { value: '-20' } })
    fireEvent.change(screen.getByLabelText('Longitud (°)'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Usar' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Fuera de la zona con relieve de 20 m.')
    expect(usePlannerStore.getState().target).toBeNull()
    // A point next to a curated polar site is planned on that site's tile.
    fireEvent.change(screen.getByLabelText('Latitud (°)'), { target: { value: '-89.45' } })
    fireEvent.change(screen.getByLabelText('Longitud (°)'), { target: { value: '-137' } })
    fireEvent.click(screen.getByRole('button', { name: 'Usar' }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(usePlannerStore.getState()).toMatchObject({
      target: { lat: -89.45, lon: -137 },
      tileSiteId: 'shackleton-rim',
    })
    expect(screen.getByRole('option', { name: 'Punto elegido a mano' })).toBeTruthy()
  })

  it('edits the range and the mission through the stores', () => {
    render(<Planner />)
    fireEvent.change(screen.getByLabelText('Días a analizar'), { target: { value: '400' } })
    expect(usePlannerStore.getState().days).toBe(90)
    fireEvent.change(screen.getByLabelText('Desde (UTC)'), { target: { value: '2027-03-01' } })
    expect(usePlannerStore.getState().fromMs).toBe(Date.UTC(2027, 2, 1))
    expect(screen.getByText(/Hasta el 29 may 2027/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Duración en superficie (días)'), {
      target: { value: '20' },
    })
    expect(useMissionStore.getState().missionDays).toBe(20)
    fireEvent.change(screen.getByLabelText('Luz continua mín. tras aterrizar (días)'), {
      target: { value: '9' },
    })
    expect(usePlannerStore.getState().minSunDays).toBe(9)
    // The lander limits are edited in place (the hardware filter belongs to the explore stage).
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar límites' }))
    fireEvent.change(screen.getByLabelText('Noche continua máx. (h)'), { target: { value: '60' } })
    expect(useMissionStore.getState().hardwareLimits.maxNightH).toBe(60)
    expect(screen.getByText('noche ≤ 60 h')).toBeInTheDocument()
  })
})

describe('Planner: results', () => {
  it('the calendar prints a score or a ✕ for every day and ranks the best five', () => {
    show()
    render(<Planner />)
    const all = [...cells()]
    expect(all).toHaveLength(10)
    expect(all.map((c) => c.querySelector('.pcal__score')!.textContent)).toEqual([
      '40',
      '✕',
      '88',
      '61',
      '✕',
      '75',
      '70',
      '66',
      '52',
      '30',
    ])
    expect(all.map((c) => c.querySelector('.pcal__rank')?.textContent ?? '')).toEqual([
      '',
      '',
      '1',
      '5',
      '',
      '2',
      '3',
      '4',
      '',
      '',
    ])
    expect(all[2]).toHaveAccessibleName('27 nov 2026: puntuación 88, n.º 1')
    expect(all[1]).toHaveAccessibleName('26 nov 2026: sin solución, noche más larga que el límite')
    expect(screen.getByText('8 de 10 días con solución')).toBeInTheDocument()
    expect(screen.getByText(/mejor día: 27 nov 2026 \(puntuación 88\)/)).toBeInTheDocument()
  })

  it('the table has a row per day, sorts by score and keeps unsolved days last', () => {
    show()
    render(<Planner />)
    expect(bodyRows()).toHaveLength(10)
    expect(within(bodyRows()[1] as HTMLElement).getByText(/Sin solución/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ordenar por puntuación' }))
    const first = bodyRows()[0] as HTMLElement
    expect(within(first).getByRole('rowheader')).toHaveTextContent('27 nov')
    expect(bodyRows()[9]).toHaveTextContent('Sin solución')
    const sorted = screen.getByRole('table').querySelector('th[aria-sort]')!
    expect(sorted).toHaveAttribute('aria-sort', 'descending')
    expect(sorted).toHaveTextContent('Punt.')
    fireEvent.click(screen.getByRole('button', { name: 'Puntuación' }))
    expect(within(bodyRows()[0] as HTMLElement).getByRole('rowheader')).toHaveTextContent('4 dic')
  })

  it('selecting a calendar day highlights its row, and the tooltip gives the figures', () => {
    show()
    render(<Planner />)
    fireEvent.mouseEnter(cells()[2])
    expect(screen.getByRole('tooltip')).toHaveTextContent('Puntuación 88')
    fireEvent.mouseEnter(cells()[4])
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Sin solución: luz continua insuficiente tras aterrizar',
    )
    fireEvent.click(cells()[2])
    expect(usePlannerStore.getState().selectedDayMs).toBe(Date.UTC(2026, 10, 27))
    expect(cells()[2]).toHaveAttribute('aria-pressed', 'true')
    const row = screen.getByRole('table').querySelector('tr[data-selected="true"]')!
    expect(row).toHaveTextContent('27 nov')
    expect(row).toHaveAttribute('aria-current', 'true')
    // Arrow keys move through the days.
    fireEvent.keyDown(cells()[2], { key: 'ArrowRight' })
    expect(document.activeElement).toBe(cells()[3])
    fireEvent.keyDown(cells()[3], { key: 'ArrowDown' })
    expect(document.activeElement).toBe(cells()[9])
  })

  it('the top cards come in rank order and two picks enable "Send to Compare"', () => {
    show()
    render(<Planner />)
    const cards = [...document.querySelectorAll('.ptop__card')] as HTMLElement[]
    expect(cards.map((c) => c.querySelector('.ptop__score strong')!.textContent)).toEqual([
      '88',
      '75',
      '70',
      '66',
      '61',
    ])
    expect(within(cards[0]).getByText('27 nov 2026')).toBeInTheDocument()
    const send = screen.getByRole('button', { name: /Enviar a Comparar/ })
    expect(send).toBeDisabled()
    fireEvent.click(within(cards[0]).getByRole('checkbox'))
    fireEvent.click(within(cards[1]).getByRole('checkbox'))
    expect(usePlannerStore.getState().picked).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Enviar a Comparar (2)' })).toBeEnabled()
    // The same pick is ticked in the table.
    expect(within(bodyRows()[2] as HTMLElement).getByRole('checkbox')).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Enviar a Comparar (2)' }))
    const m = useMissionStore.getState()
    expect(m.compareOpen).toBe(true)
    expect(m.scenarios.map((x) => x.startMs)).toEqual([
      Date.UTC(2026, 10, 27),
      Date.UTC(2026, 10, 30),
    ])
    expect(useUiStore.getState().stage).toBe('explore')
  })

  it('"Open in Orbit" loads the pick as the active scenario and leaves the planner', () => {
    const result = show()
    render(<Planner />)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir el 27 nov 2026 en Órbita' }))
    expect(useUiStore.getState().stage).toBe('explore')
    const m = useMissionStore.getState()
    const active = selectActiveScenario(m)
    expect(active.startMs).toBe(Date.UTC(2026, 10, 27))
    expect(active.iceTarget).toEqual(result.problem.target)
    expect(active.siteId).toMatch(/^custom:/)
    expect(m.view).toBe('macro')
  })

  it('changing an input keeps the results and marks them as out of date', () => {
    show()
    render(<Planner />)
    expect(screen.queryByText('Calculados con otros datos')).toBeNull()
    expect(screen.getByRole('button', { name: 'Volver a planificar' })).toBeEnabled()
    fireEvent.change(screen.getByLabelText('Batería mín. del rover (%)'), {
      target: { value: '40' },
    })
    expect(screen.getAllByText('Calculados con otros datos').length).toBeGreaterThan(0)
    expect(bodyRows()).toHaveLength(10)
  })
})

describe('Planner: edge states', () => {
  it('with no solution it names the constraint that rejects most and what to change', () => {
    show(fixtureResult(['short-light', 'short-light', 'night', 'short-light']))
    render(<Planner />)
    expect(screen.getByText('0 de 4 días con solución')).toBeInTheDocument()
    const box = screen.getByRole('heading', {
      name: 'Ningún día cumple todas las restricciones',
    }).parentElement!
    expect(box).toHaveAttribute('aria-live', 'polite')
    expect(box).toHaveTextContent(
      /La que más descarta: luz continua insuficiente tras aterrizar \(\d+ % de los puntos/,
    )
    expect(box).toHaveTextContent('Reduce la luz continua mínima o amplía el rango de fechas.')
    expect(box.querySelectorAll('.ptop__bars > li')).toHaveLength(3)
    expect(document.querySelectorAll('.ptop__card')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: /Enviar a Comparar/ })).toBeNull()
  })

  it('the no-solution notice brings the fixes as buttons that only change the inputs', () => {
    const result = fixtureResult(['short-light', 'short-light', 'night', 'short-light'])
    show(result)
    render(<Planner />)
    const before = usePlannerStore.getState()
    const lower = screen.getByRole('button', {
      name: `Bajar la luz mínima a ${before.minSunDays - 5} días`,
    })
    const widen = screen.getByRole('button', { name: /^Ampliar el rango a \d+ días$/ })
    fireEvent.click(lower)
    fireEvent.click(widen)
    const after = usePlannerStore.getState()
    expect(after.minSunDays).toBe(before.minSunDays - 5)
    expect(after.days).toBe(Math.min(90, before.days + 30))
    // Nothing was launched: the same result is still on screen, now marked as out of date.
    expect(after.status).toBe(before.status)
    expect(after.result).toBe(result)
    expect(screen.getAllByText('Calculados con otros datos').length).toBeGreaterThan(0)
  })

  it('while running it shows the progress, Cancel and the days that already arrived', () => {
    const partial = fixtureResult([40, 'night', 88], {}, 10)
    show(partial)
    usePlannerStore.getState().setRun({ status: 'running', progress: 0.3 })
    render(<Planner />)
    expect(screen.getByRole('progressbar', { name: 'Progreso del plan' })).toHaveValue(0.3)
    expect(screen.getByText('Día 3 de 10')).toHaveAttribute('aria-live', 'polite')
    expect(screen.queryByRole('button', { name: /planificar/i })).toBeNull()
    expect(screen.getByLabelText('Días a analizar')).toBeDisabled()
    // Seven days are still pending in the calendar; the cards fill in as days arrive.
    const pending = [...cells()].filter((c) => c.getAttribute('data-state') === 'pending')
    expect(pending).toHaveLength(7)
    expect(document.querySelectorAll('.ptop__card')).toHaveLength(2)
    expect(screen.getByText(/la lista se actualiza/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(usePlannerStore.getState().status).not.toBe('running')
    expect(usePlannerStore.getState().result).toBe(partial)
  })

  it('a cancelled run keeps the partial results; fewer than five solutions are explained', () => {
    show(fixtureResult([40, 'night', 88], {}, 10))
    usePlannerStore.getState().setRun({ status: 'cancelled' })
    render(<Planner />)
    expect(screen.getByText('Cálculo cancelado: se analizaron 3 de 10 días.')).toBeInTheDocument()
    expect(screen.getByText('Solo 2 días cumplen todas las restricciones.')).toBeInTheDocument()
    expect(bodyRows()).toHaveLength(3)
  })

  it('an error shows the message and a retry', () => {
    usePlannerStore.getState().setTarget({ lat: -89.44, lon: -137.39 }, 'shackleton-rim')
    usePlannerStore.getState().setRun({ status: 'error', error: 'sin datos de relieve' })
    render(<Planner />)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'No se pudo completar el plan: sin datos de relieve',
    )
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeEnabled()
  })
})
