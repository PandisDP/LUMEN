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

test('the rover drives to the ice and reports its battery', async ({ page }) => {
  await open(page, `${SCENARIO}&view=landing&rover=1&mode=planner`, {
    left: false,
    right: false,
    bottom: false,
  })
  const hud = page.locator('.rhud')
  await expect(hud).toBeVisible({ timeout: 60_000 })
  await expect(hud.getByText(/Llega en/)).toBeVisible()
  await expect(hud.locator('.rhud__chips')).toContainText('al Sol')
  const progress = page.getByRole('slider', { name: 'Progreso del recorrido' })
  await progress.fill(await progress.getAttribute('max').then((v) => v ?? '0'))
  await expect(hud.locator('.rhud__chips')).toContainText('en el hielo')
  await expect(hud.locator('.rhud__chips')).toContainText('sombra permanente')
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
