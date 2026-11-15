import { type Page, expect, test } from '@playwright/test'

const SCENARIO = 'site=shackleton-rim&date=2027-03-01T00:00Z&days=14&lang=es'

/** Opens the app past the welcome, the tour invitation and the automatic "Why?" overlay. */
async function open(page: Page, query: string, panels = { left: true, right: true, bottom: true }) {
  await page.addInitScript((p) => {
    localStorage.setItem('lumen3d.panels', JSON.stringify(p))
    localStorage.setItem('lumen3d.tourSeen', '1')
    sessionStorage.setItem('lumen3d.explained', '1')
  }, panels)
  await page.goto(`/?${query}`)
}

let errors: string[]
test.beforeEach(({ page }) => {
  errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
})
test.afterEach(() => {
  expect(errors, 'no errors in the browser console').toEqual([])
})

test('loads a shared scenario and shows the state of the site', async ({ page }) => {
  await open(page, `${SCENARIO}&view=micro&mode=planner`)
  await expect(page.getByRole('heading', { name: 'Borde de Shackleton' })).toBeVisible()
  await expect(page.getByText('Veredicto')).toBeVisible()
  await expect(page.getByText('Tiempo con enlace DTE')).toBeVisible()
  await expect(page.locator('.viewhud__countdowns')).toContainText(/ocaso|salida del Sol|sin/i)
  await expect(page.getByRole('link', { name: /Horizons ☀/ })).toHaveAttribute(
    'href',
    /ssd\.jpl\.nasa\.gov\/api\/horizons/,
  )
})

test('each audience sees its own level of detail', async ({ page }) => {
  await open(page, `${SCENARIO}&view=micro&mode=planner`)
  const tabs = page.getByRole('tab')
  await expect(tabs).toHaveCount(5)
  await expect(page.getByText(/Goldstone|Madrid|Canberra/).first()).toBeVisible()
  await page.getByRole('button', { name: 'Público', exact: true }).click()
  await expect(tabs).toHaveCount(2)
  await expect(page.getByText(/Goldstone|Madrid|Canberra/)).toHaveCount(0)
  await expect(page.getByText('Veredicto')).toBeVisible()
  await expect(page).toHaveURL(/mode=public/)
})

test('the seasons chart and the polar map render', async ({ page }) => {
  await open(page, `${SCENARIO}&view=macro&mode=planner`)
  await page.getByRole('tab', { name: 'Mapa polar' }).click()
  await expect(page.locator('.polar-map canvas')).toBeVisible()
  await expect(page.getByText('Sombra permanente (PSR)')).toBeVisible()
  await page.getByRole('tab', { name: 'Estaciones' }).click()
  await expect(page.getByText(/Mejor mes/)).toBeVisible({ timeout: 60_000 })
})

test('the physical descent lands with propellant to spare', async ({ page }) => {
  await open(page, `${SCENARIO}&view=landing&mode=planner`, {
    left: false,
    right: false,
    bottom: false,
  })
  await expect(page.locator('.dhud')).toBeVisible()
  await expect(page.getByText('Propelente')).toBeVisible()
  // Jump to the last second of the descent instead of waiting two minutes.
  const progress = page.getByRole('slider', { name: 'Progreso del descenso' })
  await expect(progress).toHaveAttribute('max', /^1\d\d(\.\d+)?$/)
  const max = Number(await progress.getAttribute('max'))
  await progress.fill(String(Math.floor(max - 1)))
  const summary = page.getByText(/Contacto a .* m\/s/)
  await expect(summary).toBeVisible({ timeout: 30_000 })
  await expect(summary).toContainText(/Propelente restante: \d+ kg/)
  await expect(page.getByRole('button', { name: /Desplegar rover/ })).toBeEnabled()
})

test('the rover drives to the ice, takes its samples and returns to the lander', async ({
  page,
}) => {
  // The default trip: the utility rover with 3 samples of 2 h each.
  await page.addInitScript(() => localStorage.removeItem('lumen3d.rover'))
  await open(page, `${SCENARIO}&view=landing&rover=1&mode=planner`, {
    left: false,
    right: false,
    bottom: false,
  })
  const hud = page.locator('.rhud')
  await expect(hud).toBeVisible({ timeout: 60_000 })
  const state = hud.locator('.rhud__state')
  const chips = hud.locator('.rhud__chips')
  // Outbound: it leaves the lander in sunlight.
  await expect(state).toContainText('Yendo al hielo')
  await expect(chips).toContainText('al Sol')
  await expect(hud).toContainText('Falta al hielo')
  // Half-way through the whole trip it is working at the ice (or already driving back).
  const progress = page.getByRole('slider', { name: 'Progreso del recorrido' })
  const max = Number(await progress.getAttribute('max'))
  expect(max).toBeGreaterThan(0)
  await progress.fill(String(Math.round(max / 2)))
  await expect(state).toContainText(/Muestra \d de 3|Regresando/)
  await expect(chips).toContainText(/\d\/3 muestras/)
  // The end of the trip is back at the lander, with every sample.
  await progress.fill(String(max))
  await expect(state).toContainText('De vuelta en el módulo')
  await expect(chips).toContainText('3/3 muestras')
  await expect(hud.locator('.rhud__summary')).toContainText(
    /3 muestras · vuelve en .* · margen .* · batería mín\. \d+ %/,
  )
  await expect(page).toHaveURL(/rover=1/)
})

test('the layout holds on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await open(page, `${SCENARIO}&view=micro&mode=public`, {
    left: false,
    right: true,
    bottom: false,
  })
  await expect(page.getByText('Veredicto')).toBeVisible()
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(1)
  await page.getByRole('button', { name: 'Controles', exact: true }).click()
  await expect(page.getByRole('button', { name: /Mirar al Sol/ })).toBeVisible()
})

test('the planner finds the best landing per day and opens a pick in Orbit', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('lumen3d.tourSeen', '1')
    sessionStorage.setItem('lumen3d.explained', '1')
    localStorage.setItem('lumen3d.audience', 'planner')
    localStorage.setItem('lumen3d.stage', 'plan')
    // The round trip asked of the rover: the defaults (3 samples of 2 h each).
    localStorage.setItem('lumen3d.rover', JSON.stringify({ samples: 3, sampleH: 2 }))
    localStorage.setItem(
      'lumen3d.planner',
      JSON.stringify({ fromMs: Date.UTC(2027, 2, 1), days: 14, minSunDays: 5 }),
    )
  })
  await page.goto('/?lang=es')
  await expect(page.getByRole('heading', { name: 'Planificar la misión' })).toBeVisible()
  await expect(page.locator('button[aria-current="step"]')).toHaveText(/Planificar/)
  // The first suggested ice target (next to the Shackleton rim) is selected from the list.
  await page.getByLabel('Objetivos sugeridos').selectOption({ index: 1 })
  // The utility rover is the default; the micro-rover cannot do this much work at the ice.
  const planner = page.locator('.planner')
  await expect(planner.getByRole('combobox', { name: 'Rover', exact: true })).toHaveValue(
    'csa-rover',
  )
  await expect(planner.getByLabel('Muestras a recoger')).toHaveValue('3')
  await expect(planner.getByLabel('Horas por muestra')).toHaveValue('2')
  await planner.getByRole('button', { name: 'Planificar', exact: true }).click()
  const open = page.getByRole('button', { name: /Abrir el .* en Órbita/ }).first()
  await expect(open).toBeVisible({ timeout: 90_000 })
  await expect(page.getByText(/días con solución/)).toBeVisible()
  // A day is only viable when the rover takes every sample and is back before the mission ends.
  await expect(
    page.getByText(/Rover: 3 muestras · vuelve en .+ · margen .+ · batería mín\. \d+ %/).first(),
  ).toBeVisible()
  await open.click()
  await expect(page.locator('button[aria-current="step"]')).toHaveText(/Órbita/)
  await expect(page).toHaveURL(/ice=-\d+\.\d+(,|%2C)-?\d+\.\d+/)
  await expect(page).toHaveURL(/lat=-8\d\.\d+/)
})
