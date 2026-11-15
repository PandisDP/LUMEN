import { useMemo } from 'react'
import type { Level } from './levels.ts'
import { type Theme, useThemeStore } from './theme.ts'

/**
 * Colours and fonts for everything drawn from TypeScript (canvas charts, SVG, inline styles).
 * The values are the design tokens of styles/tokens.css, resolved to strings a canvas accepts;
 * no chart defines a colour of its own. The colour follows the entity everywhere: Sun = series-4,
 * Earth / direct link = series-6, both at once = series-1, battery = series-5, route / ice =
 * series-2, scenarios A–D = series 1, 2, 3, 7; states use the `band-*` tokens.
 */
export interface ChartTheme {
  /** series-1 … series-7, in the fixed order of the system. */
  series: readonly string[]
  sun: string
  earth: string
  both: string
  battery: string
  route: string
  /** Text: always an ink token, never a series colour. */
  ink: string
  inkMuted: string
  /** Grid and axes (border token); use with `alpha` to keep them recessive. */
  grid: string
  card: string
  background: string
  primary: string
  bandOk: string
  bandDeficit: string
  bandExcess: string
  bandStopped: string
  fillOk: string
  fillDeficit: string
  fillExcess: string
  fillStopped: string
  tooltip: string
  tooltipFg: string
  fontSans: string
  fontMono: string
}

/** Token name → [light, dark] literal, copied from styles/tokens.css. HSL triplets or hex. */
const TOKENS = {
  '--foreground': ['240 24% 14%', '255 30% 94%'],
  '--muted-foreground': ['243 9% 46%', '250 12% 68%'],
  '--border': ['220 13% 91%', '245 16% 22%'],
  '--card': ['0 0% 100%', '245 22% 12%'],
  '--background': ['260 100% 97%', '240 30% 6%'],
  '--primary': ['258 83% 55%', '258 88% 70%'],
  '--band-ok': ['152 70% 27%', '152 70% 66%'],
  '--band-deficit': ['0 85% 40%', '0 85% 74%'],
  '--band-excess': ['215 90% 38%', '215 90% 74%'],
  '--band-stopped': ['243 9% 46%', '250 12% 68%'],
  '--band-ok-fill': ['152 75% 35%', '152 68% 40%'],
  '--band-deficit-fill': ['0 82% 52%', '0 78% 52%'],
  '--band-excess-fill': ['215 92% 52%', '215 90% 62%'],
  '--band-stopped-fill': ['243 10% 55%', '250 12% 60%'],
  '--tooltip': ['240 24% 14%', '255 25% 92%'],
  '--tooltip-foreground': ['0 0% 100%', '250 25% 10%'],
  '--series-1': ['#6d3bf0', '#9b6dff'],
  '--series-2': ['#0f7fa0', '#0fa3c2'],
  '--series-3': ['#d6276e', '#ec4899'],
  '--series-4': ['#a9600a', '#c7761a'],
  '--series-5': ['#128a5f', '#19a97b'],
  '--series-6': ['#2d63d6', '#3f7ff0'],
  '--series-7': ['#b01f8c', '#b83fd1'],
} as const

type Token = keyof typeof TOKENS

export const FONT_SANS = 'Inter, system-ui, sans-serif'
export const FONT_MONO = "'DM Mono', ui-monospace, monospace"

/** Scenarios A–D → series number (1-based). The colour belongs to the scenario, not its slot. */
export const SCENARIO_SERIES = [1, 2, 3, 7] as const

/** A token value as a CSS colour: hex stays, an HSL triplet is wrapped. */
const css = (value: string) => (value.startsWith('#') ? value : `hsl(${value})`)

export interface ChartThemeOptions {
  /** Theme used when the tokens cannot be read (jsdom, no DOM). Default: dark. */
  theme?: Theme
  /** Dark palette whatever the UI theme: for charts with their own dark picture (sky, maps). */
  forceDark?: boolean
}

/**
 * Reads the palette from the computed tokens of `el` (default: <html>). Where custom properties
 * do not resolve (jsdom returns ''), the literal of the theme is used, so no colour is ever ''.
 */
export function readChartTheme(el?: Element | null, options: ChartThemeOptions = {}): ChartTheme {
  const fallback = options.forceDark || options.theme !== 'light' ? 1 : 0
  let style: CSSStyleDeclaration | null = null
  if (
    !options.forceDark &&
    typeof document !== 'undefined' &&
    typeof getComputedStyle === 'function'
  ) {
    try {
      style = getComputedStyle(el ?? document.documentElement)
    } catch {
      style = null
    }
  }
  const get = (token: Token) =>
    css(style?.getPropertyValue(token).trim() || TOKENS[token][fallback])
  const series = [1, 2, 3, 4, 5, 6, 7].map((k) => get(`--series-${k}` as Token))
  return {
    series,
    sun: series[3],
    earth: series[5],
    both: series[0],
    battery: series[4],
    route: series[1],
    ink: get('--foreground'),
    inkMuted: get('--muted-foreground'),
    grid: get('--border'),
    card: get('--card'),
    background: get('--background'),
    primary: get('--primary'),
    bandOk: get('--band-ok'),
    bandDeficit: get('--band-deficit'),
    bandExcess: get('--band-excess'),
    bandStopped: get('--band-stopped'),
    fillOk: get('--band-ok-fill'),
    fillDeficit: get('--band-deficit-fill'),
    fillExcess: get('--band-excess-fill'),
    fillStopped: get('--band-stopped-fill'),
    tooltip: get('--tooltip'),
    tooltipFg: get('--tooltip-foreground'),
    fontSans: FONT_SANS,
    fontMono: FONT_MONO,
  }
}

/** The dark palette as literals: imagery (lunar sky, terrain maps) is dark in both themes. */
export const DARK_CHART_THEME: ChartTheme = readChartTheme(null, { forceDark: true })

/**
 * Palette for a canvas chart, recomputed when the theme changes (put it in the draw effect's
 * deps). `forceDark` for charts that keep a dark picture background in both themes.
 */
export function useChartTheme(options: { forceDark?: boolean } = {}): ChartTheme {
  const theme = useThemeStore((s) => s.theme)
  const forceDark = options.forceDark ?? false
  return useMemo(
    () => (forceDark ? DARK_CHART_THEME : readChartTheme(null, { theme })),
    [theme, forceDark],
  )
}

/** The same colour with an alpha: works on hex and on `hsl(…)` / `rgb(…)` strings. */
export function alpha(color: string, a: number): string {
  const c = color.trim()
  if (c.startsWith('#')) {
    const hex = c.length === 4 ? [...c.slice(1)].map((ch) => ch + ch).join('') : c.slice(1, 7)
    const n = parseInt(hex, 16)
    return `rgb(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255} / ${a})`
  }
  const m = /^(hsl|rgb)a?\(([^/)]+)(?:\/[^)]*)?\)$/.exec(c)
  return m ? `${m[1]}(${m[2].trim()} / ${a})` : c
}

/** Colour of scenario A–D (index 0–3). */
export const scenarioColor = (theme: ChartTheme, index: number) =>
  theme.series[(SCENARIO_SERIES[index] ?? SCENARIO_SERIES[0]) - 1]

/** State → band tokens. "warn" is the blue excess band: the system has no amber warning. */
export const levelFill = (theme: ChartTheme, level: Level) =>
  level === 'good' ? theme.fillOk : level === 'warn' ? theme.fillExcess : theme.fillDeficit
export const levelInk = (theme: ChartTheme, level: Level) =>
  level === 'good' ? theme.bandOk : level === 'warn' ? theme.bandExcess : theme.bandDeficit

/** The same mapping as CSS expressions, for inline styles that follow the theme by themselves. */
export const LEVEL_FILL_VAR: Record<Level, string> = {
  good: 'hsl(var(--band-ok-fill))',
  warn: 'hsl(var(--band-excess-fill))',
  bad: 'hsl(var(--band-deficit-fill))',
}
export const LEVEL_INK_VAR: Record<Level, string> = {
  good: 'hsl(var(--band-ok))',
  warn: 'hsl(var(--band-excess))',
  bad: 'hsl(var(--band-deficit))',
}

/** Canvas font shorthand: Inter for labels, DM Mono for numbers. */
export const chartFont = (px: number, kind: 'sans' | 'mono' = 'sans', weight = 400) =>
  `${weight} ${px}px ${kind === 'mono' ? FONT_MONO : FONT_SANS}`

/** "hsl triplet" → #rrggbb (three.js and image data need plain RGB). */
export function hslToHex(triplet: string): string {
  const [h, s, l] = triplet.split(/\s+/).map((v) => parseFloat(v))
  const sat = s / 100
  const lig = l / 100
  const a = sat * Math.min(lig, 1 - lig)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const v = lig - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(v * 255)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

/** Dark-theme literal of a token as hex (checked against scene/sceneColors.ts in the tests). */
export const darkTokenHex = (token: Token) => {
  const v = TOKENS[token][1]
  return v.startsWith('#') ? v : hslToHex(v)
}
