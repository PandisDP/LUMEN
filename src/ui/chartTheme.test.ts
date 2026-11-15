import { describe, expect, it } from 'vitest'
import { SCENE_COLORS } from '../scene/sceneColors.ts'
import { SCENARIO_COLORS } from '../store/useMissionStore.ts'
import {
  DARK_CHART_THEME,
  LEVEL_FILL_VAR,
  SCENARIO_SERIES,
  alpha,
  chartFont,
  darkTokenHex,
  hslToHex,
  levelFill,
  levelInk,
  readChartTheme,
  scenarioColor,
} from './chartTheme.ts'

describe('chart palette', () => {
  it('never returns an empty colour where the tokens do not resolve (jsdom)', () => {
    for (const theme of [readChartTheme(), readChartTheme(null, { theme: 'light' })]) {
      expect(theme.series).toHaveLength(7)
      for (const v of Object.values(theme).flat()) expect(v).not.toBe('')
    }
    // Dark is the fallback; light is only used on request.
    expect(readChartTheme()).toEqual(DARK_CHART_THEME)
    expect(readChartTheme(null, { theme: 'light' }).ink).toBe('hsl(240 24% 14%)')
    expect(readChartTheme(null, { theme: 'light', forceDark: true })).toEqual(DARK_CHART_THEME)
  })

  it('maps each entity to its fixed series', () => {
    const p = DARK_CHART_THEME
    expect([p.both, p.route, p.sun, p.battery, p.earth]).toEqual([
      '#9b6dff',
      '#0fa3c2',
      '#c7761a',
      '#19a97b',
      '#3f7ff0',
    ])
    expect(p.ink).toBe('hsl(255 30% 94%)')
    expect(p.fontMono).toContain('DM Mono')
    expect(chartFont(10, 'mono')).toBe(`400 10px ${p.fontMono}`)
  })

  it('gives scenarios A–D the series 1, 2, 3 and 7', () => {
    expect(SCENARIO_SERIES).toEqual([1, 2, 3, 7])
    const p = DARK_CHART_THEME
    expect([0, 1, 2, 3].map((i) => scenarioColor(p, i))).toEqual([
      p.series[0],
      p.series[1],
      p.series[2],
      p.series[6],
    ])
    expect(scenarioColor(p, 9)).toBe(p.series[0])
    expect(SCENARIO_COLORS).toEqual(SCENARIO_SERIES.map((k) => `var(--series-${k})`))
  })

  it('maps the three levels to the band tokens (warn is the blue excess band)', () => {
    const p = DARK_CHART_THEME
    expect((['good', 'warn', 'bad'] as const).map((l) => levelFill(p, l))).toEqual([
      p.fillOk,
      p.fillExcess,
      p.fillDeficit,
    ])
    expect(levelInk(p, 'warn')).toBe(p.bandExcess)
    expect(LEVEL_FILL_VAR.warn).toBe('hsl(var(--band-excess-fill))')
  })

  it('adds an alpha to hex and to hsl colours', () => {
    expect(alpha('#3f7ff0', 0.5)).toBe('rgb(63 127 240 / 0.5)')
    expect(alpha('#fff', 0.2)).toBe('rgb(255 255 255 / 0.2)')
    expect(alpha('hsl(255 30% 94%)', 0.25)).toBe('hsl(255 30% 94% / 0.25)')
    expect(alpha('hsl(255 30% 94% / 0.9)', 0.1)).toBe('hsl(255 30% 94% / 0.1)')
  })

  it('keeps the scene constants equal to the dark tokens', () => {
    expect(hslToHex('0 0% 100%')).toBe('#ffffff')
    expect(SCENE_COLORS).toEqual({
      sun: darkTokenHex('--series-4'),
      earth: darkTokenHex('--series-6'),
      route: darkTokenHex('--series-2'),
      accent: darkTokenHex('--series-1'),
      battery: darkTokenHex('--series-5'),
      ok: darkTokenHex('--band-ok-fill'),
      warn: darkTokenHex('--band-excess-fill'),
      bad: darkTokenHex('--band-deficit-fill'),
      stopped: darkTokenHex('--band-stopped-fill'),
      ink: darkTokenHex('--foreground'),
      inkMuted: darkTokenHex('--muted-foreground'),
    })
  })
})
