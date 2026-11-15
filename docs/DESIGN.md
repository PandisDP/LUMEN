# Killa Landing design reference

Killa Landing is a Vite + React + TypeScript web app styled with plain CSS. Its look follows the
**Genius Mining AI** visual system: the design tokens of that system are copied verbatim into
`src/styles/tokens.css` and every stylesheet, canvas chart and 3D mark reads its colours from
them. There is no Tailwind and no CSS-in-JS.

This document describes what the code implements. Related reading: [README](../README.md),
[architecture](../ARCHITECTURE.md), [user guide](GUIDE.md) and [mission background](MISSION.md).

## Contents

1. [Principles](#1-principles)
2. [File map](#2-file-map)
3. [Theming](#3-theming)
4. [Token reference](#4-token-reference)
5. [Colour roles](#5-colour-roles)
6. [Series mapping](#6-series-mapping)
7. [State system](#7-state-system)
8. [Typography](#8-typography)
9. [Components](#9-components)
10. [Kit components](#10-kit-components)
11. [Charts](#11-charts)
12. [3D scene colours](#12-3d-scene-colours)
13. [Motion](#13-motion)
14. [Logo](#14-logo)
15. [Killa, the mascot](#15-killa-the-mascot)
16. [Icons](#16-icons)
17. [Accessibility](#17-accessibility)
18. [Responsive behaviour](#18-responsive-behaviour)
19. [Contributor checklist](#19-contributor-checklist)

## 1. Principles

- **Tokens only.** Components take colour, radius, shadow, type size, duration and easing from
  the custom properties of `src/styles/tokens.css`. A component does not define a colour of its
  own.
- **Values are verbatim.** The token values are those of the Genius Mining AI system and are
  never adjusted in this repository. The class names are the app's own plain CSS.
- **Two notations.** Theme-dependent colours are HSL triplets, written `hsl(var(--primary))` or,
  with transparency, `hsl(var(--primary) / 0.3)`. Series colours are hex values, written
  `var(--series-1)`.
- **The colour follows the entity.** The Sun, the Earth, the battery, the rover route and each
  scenario keep the same series colour in every chart, legend, HUD label and 3D mark.
- **A state never travels in colour alone.** Every state carries a glyph and a text label.
- **One primary action per view.** A single `.btn--accent` (the cyan-to-blue action gradient) is
  visible at a time.
- **Imagery is not interface.** Pictures (the lunar disc of the logo and the maps, the terrain,
  the mascot's body, the black fade and vignette of the scene) keep fixed colours of their own;
  the tokens govern the interface drawn around and over them.

## 2. File map

| File                       | Content                                                                                                                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/styles/tokens.css`    | All design tokens: light on `:root`, dark on `.dark`; the dark page halos; heading and `code` fonts; the global focus ring; the global reduced-motion rule                              |
| `src/styles/index.css`     | Layout variables, the stage and its HUDs, top bar, buttons, segmented controls, panels, cards, fields, tables, menus, overlays, tour, toast, range sliders, the "Deploy rover" action   |
| `src/styles/flow.css`      | Welcome and site choice (`.intro`), `.btn--big`, step bar (`.steps`), step hint (`.stephint`), Moon locator, Top 3, comparison, scenario editor, assistant layout, the in-app exercises |
| `src/styles/planner.css`   | The planner step: page, three zones, form, calendar, day table, map, shortlist                                                                                                          |
| `src/styles/charts.css`    | Line-sample legend keys of the canvas charts (`.chart-key-line`)                                                                                                                        |
| `src/styles/kit.css`       | `Notice`, `Empty`, `Busy`, `Stat` and the placement of the level glyph next to figures                                                                                                  |
| `src/styles/killa.css`     | The mascot's states and animations, the assistant button and panel, the loader, the start screen                                                                                        |
| `src/ui/theme.ts`          | Theme store (`useThemeStore`): dark or light, the `.dark` class on `<html>`, persistence                                                                                                |
| `src/ui/chartTheme.ts`     | Palette for everything drawn from TypeScript (`useChartTheme`, `readChartTheme`, `DARK_CHART_THEME`, `alpha`, `chartFont`, `scenarioColor`, `levelFill`, `levelInk`)                    |
| `src/scene/sceneColors.ts` | `SCENE_COLORS`: the dark token values as hex for three.js                                                                                                                               |
| `src/ui/levels.ts`         | The `Level` type (`good`, `warn`, `bad`) and the thresholds that produce it                                                                                                             |
| `src/ui/bands.ts`          | Band states, glyphs, notice tones, the `KitAction` type                                                                                                                                 |
| `src/ui/LevelTag.tsx`      | The glyph-plus-text mark of a level (`.lvl`)                                                                                                                                            |
| `src/ui/kit/`              | `Notice.tsx`, `Empty.tsx`, `Stat.tsx`, `Busy.tsx`                                                                                                                                       |
| `src/ui/Killa.tsx`         | The mascot as an inline SVG component with five states                                                                                                                                  |
| `src/ui/icons.tsx`         | The stroke icon set                                                                                                                                                                     |
| `src/ui/TopBar.tsx`        | Brand, step bar, guide button, audience switch, theme toggle, language switch                                                                                                           |
| `public/favicon.svg`       | The logo: a full Moon with craters                                                                                                                                                      |
| `public/pets/killa.svg`    | The mascot as a static image, referenced by `index.html` as the browser-tab icon                                                                                                        |
| `index.html`               | Font loading, the pre-paint theme script, the icon link                                                                                                                                 |

`src/main.tsx` imports the stylesheets in this order, which is also the cascade order:
`tokens.css`, `index.css`, `flow.css`, `planner.css`, `charts.css`, `kit.css`, `killa.css`.

## 3. Theming

- **Dark is the default** ("glass and neon"); light is the alternative.
- The theme is the presence of the class `dark` on `<html>`. `:root` holds the light values and
  `.dark` overrides the theme-dependent ones. `color-scheme` is `light` on `:root` and `dark` on
  `.dark`.
- `src/ui/theme.ts` owns the state: `useThemeStore` exposes `theme`, `setTheme` and `toggle`.
  Applying a theme toggles the class on `document.documentElement` and stores the choice in
  `localStorage` under the key `lumen-theme`. Any stored value other than `light` (including a
  missing value or blocked storage) means dark.
- **Pre-paint script.** An inline script in the `<head>` of `index.html` reads `lumen-theme` and
  adds `dark` to `<html>` before the first paint unless the value is `light`, so the page does
  not flash the wrong theme while the bundle loads.
- **Toggle.** `ThemeToggle` in `src/ui/TopBar.tsx` is an `.icon-btn` showing `IconSun` in dark and
  `IconMoon` in light; its `aria-label` and `title` name the theme it switches to.
- **Dark page halos.** In dark, `body` carries two fixed radial gradients behind the glass: violet
  at the top left and magenta at the bottom right. The start screen (`.splash`) and the planner
  page (`.planner`) paint the same two halos.
- **Glass.** Panels read three variables: `--glass-alpha`, `--glass-edge` and `--glass-shine`. In
  light they resolve to an opaque card with a plain border and no shine; in dark to a 72 %
  translucent card with a faint white edge and an inner top highlight, over
  `backdrop-filter: blur(18px)`.

### The 3D scene is always dark

The scene shows space, so it and everything floating on it keep the dark palette in both themes.
The mechanism is a nested theme scope: the stage container is rendered as
`<div class="stage dark">` in `src/App.tsx`. Because the dark values are declared on the class
`.dark` (not on `html.dark`), any element carrying that class re-declares the tokens for its
subtree. The `.dark` rule also sets `color: hsl(var(--foreground))`, which restores light ink
inside the nested scope when the page around it is light.

Inside that scope live the WebGL canvas, the 3D labels (`.label`), and the view HUD
(`.viewhud`) with the compass tape, the descent HUD, the rover HUD, legends and countdowns.
Outside it, and therefore following the chosen theme: the top bar, the step hint, the side and
bottom panels, overlays, the toast, the tour, the assistant, the planner page, the welcome card,
the loader and the start screen.

Marks drawn by three.js cannot read CSS variables, so they take the dark values as hex from
`SCENE_COLORS` (section 12). Charts that draw a picture of the sky or of the terrain use
`DARK_CHART_THEME` for that picture (section 11).

### Stored keys

`localStorage` keys use the prefix `lumen3d.` for app state (`lumen3d.lang`, `lumen3d.stage`,
`lumen3d.audience`, `lumen3d.panels`, `lumen3d.tourSeen`, `lumen3d.explained`,
`lumen3d.challenges`, `lumen3d.planner`, `lumen3d.rover`) and the key `lumen-theme` for the theme.

### Languages

The language switch in the top bar (`LangToggle`, a `.segmented.segmented--small`) offers
Spanish, English and partial Quechua with Spanish fallback. Each option carries its own `lang`
attribute.

## 4. Token reference

All values below are those of `src/styles/tokens.css`. "Light" is the value on `:root`, "Dark"
the value on `.dark`; "same" means `.dark` does not override the token.

### Surfaces

| Token            | Light           | Dark          |
| ---------------- | --------------- | ------------- |
| `--background`   | `260 100% 97%`  | `240 30% 6%`  |
| `--card`         | `0 0% 100%`     | `245 22% 12%` |
| `--popover`      | `0 0% 100%`     | `245 22% 13%` |
| `--muted`        | `255 40% 96%`   | `245 18% 17%` |
| `--secondary`    | `255 40% 96%`   | `250 16% 18%` |
| `--accent`       | `261 100% 95%`  | `258 40% 22%` |
| `--rail`         | `260 60% 98.5%` | `242 26% 8%`  |
| `--scene-top`    | `220 30% 92%`   | `230 22% 16%` |
| `--scene-bottom` | `225 22% 80%`   | `240 25% 7%`  |

### Ink

| Token                    | Light         | Dark          |
| ------------------------ | ------------- | ------------- |
| `--foreground`           | `240 24% 14%` | `255 30% 94%` |
| `--card-foreground`      | `240 24% 14%` | `255 30% 94%` |
| `--popover-foreground`   | `240 24% 14%` | `255 30% 94%` |
| `--muted-foreground`     | `243 9% 46%`  | `250 12% 68%` |
| `--secondary-foreground` | `240 24% 14%` | `255 30% 94%` |
| `--accent-foreground`    | `258 78% 48%` | `258 92% 82%` |

### Borders and focus

| Token      | Light         | Dark          |
| ---------- | ------------- | ------------- |
| `--border` | `220 13% 91%` | `245 16% 22%` |
| `--input`  | `220 13% 86%` | `245 16% 27%` |
| `--ring`   | `258 83% 55%` | `258 90% 72%` |

### Primary (violet)

| Token                  | Light         | Dark          |
| ---------------------- | ------------- | ------------- |
| `--primary`            | `258 83% 55%` | `258 88% 70%` |
| `--primary-glow`       | `258 90% 68%` | `258 95% 78%` |
| `--primary-strong`     | `258 78% 48%` | `258 92% 80%` |
| `--primary-foreground` | `0 0% 100%`   | `250 25% 10%` |

### Action, neon and lamp

| Token                 | Light         | Dark |
| --------------------- | ------------- | ---- |
| `--action-from`       | `212 74% 49%` | same |
| `--action-to`         | `236 73% 55%` | same |
| `--action-foreground` | `0 0% 100%`   | same |
| `--neon-from`         | `258 83% 55%` | same |
| `--neon-to`           | `296 72% 45%` | same |
| `--lamp`              | `51 100% 50%` | same |

The two gradients of the system are built from these stops:

| Token         | Value                                                                     |
| ------------- | ------------------------------------------------------------------------- |
| `--bg-action` | `linear-gradient(135deg, hsl(var(--action-from)), hsl(var(--action-to)))` |
| `--bg-neon`   | `linear-gradient(135deg, hsl(var(--neon-from)), hsl(var(--neon-to)))`     |

### Destructive, success and direction

| Token                      | Light         | Dark          |
| -------------------------- | ------------- | ------------- |
| `--destructive`            | `0 75% 55%`   | `0 80% 66%`   |
| `--destructive-foreground` | `0 0% 100%`   | `250 25% 10%` |
| `--success`                | `152 60% 42%` | `152 55% 45%` |
| `--success-strong`         | `152 60% 30%` | `152 65% 62%` |
| `--up`                     | `152 70% 27%` | `152 70% 66%` |
| `--down`                   | `0 85% 40%`   | `0 85% 74%`   |

### Bands (states)

Each band has an ink value (text, glyphs, thin borders) and a fill value (areas, bars, badges).

| Token                 | Light         | Dark          |
| --------------------- | ------------- | ------------- |
| `--band-ok`           | `152 70% 27%` | `152 70% 66%` |
| `--band-deficit`      | `0 85% 40%`   | `0 85% 74%`   |
| `--band-excess`       | `215 90% 38%` | `215 90% 74%` |
| `--band-stopped`      | `243 9% 46%`  | `250 12% 68%` |
| `--band-ok-fill`      | `152 75% 35%` | `152 68% 40%` |
| `--band-deficit-fill` | `0 82% 52%`   | `0 78% 52%`   |
| `--band-excess-fill`  | `215 92% 52%` | `215 90% 62%` |
| `--band-stopped-fill` | `243 10% 55%` | `250 12% 60%` |

### Series

| Token            | Light         | Dark          | Hue     |
| ---------------- | ------------- | ------------- | ------- |
| `--series-1`     | `#6d3bf0`     | `#9b6dff`     | violet  |
| `--series-2`     | `#0f7fa0`     | `#0fa3c2`     | cyan    |
| `--series-3`     | `#d6276e`     | `#ec4899`     | pink    |
| `--series-4`     | `#a9600a`     | `#c7761a`     | amber   |
| `--series-5`     | `#128a5f`     | `#19a97b`     | green   |
| `--series-6`     | `#2d63d6`     | `#3f7ff0`     | blue    |
| `--series-7`     | `#b01f8c`     | `#b83fd1`     | magenta |
| `--series-ghost` | `255 22% 88%` | `245 14% 26%` | neutral |

`--series-ghost` is an HSL triplet (`hsl(var(--series-ghost))`); the seven series are hex.

### Tooltip

| Token                  | Light         | Dark          |
| ---------------------- | ------------- | ------------- |
| `--tooltip`            | `240 24% 14%` | `255 25% 92%` |
| `--tooltip-foreground` | `0 0% 100%`   | `250 25% 10%` |
| `--tooltip-muted`      | `250 15% 72%` | `250 12% 38%` |

The tooltip inverts the surface: dark on a light page, light on a dark one.

### Elevations

| Token           | Light                                                                     | Dark                                                               |
| --------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `--elevation-1` | `0 1px 2px hsl(258 40% 40% / 0.05), 0 2px 6px hsl(258 40% 40% / 0.05)`    | `0 1px 2px hsl(0 0% 0% / 0.4), 0 2px 6px hsl(0 0% 0% / 0.3)`       |
| `--elevation-2` | `0 2px 6px hsl(258 40% 40% / 0.07), 0 8px 20px hsl(258 40% 40% / 0.08)`   | `0 2px 6px hsl(0 0% 0% / 0.45), 0 8px 20px hsl(0 0% 0% / 0.4)`     |
| `--elevation-3` | `0 6px 14px hsl(258 50% 42% / 0.1), 0 18px 42px hsl(258 50% 42% / 0.13)`  | `0 6px 14px hsl(0 0% 0% / 0.5), 0 18px 42px hsl(0 0% 0% / 0.45)`   |
| `--elevation-4` | `0 12px 28px hsl(258 55% 40% / 0.16), 0 32px 72px hsl(258 55% 40% / 0.2)` | `0 12px 28px hsl(0 0% 0% / 0.55), 0 32px 72px hsl(0 0% 0% / 0.55)` |
| `--pill`        | `0 1px 3px hsl(258 60% 45% / 0.16)`                                       | `0 1px 3px hsl(0 0% 0% / 0.5)`                                     |

`--pill` is the small shadow of pill-shaped controls (buttons, the active segment).

### Glows

| Token           | Light                              | Dark                               |
| --------------- | ---------------------------------- | ---------------------------------- |
| `--glow-violet` | `0 0 24px hsl(258 90% 68% / 0.55)` | `0 0 24px hsl(258 95% 72% / 0.45)` |
| `--glow-action` | `0 0 22px hsl(224 80% 60% / 0.5)`  | `0 0 26px hsl(224 85% 62% / 0.55)` |
| `--glow-neon`   | `0 0 24px hsl(290 80% 60% / 0.45)` | `0 0 28px hsl(290 85% 62% / 0.5)`  |

### Glass

| Token           | Light                     | Dark                                  |
| --------------- | ------------------------- | ------------------------------------- |
| `--glass-alpha` | `1`                       | `0.72`                                |
| `--glass-edge`  | `hsl(var(--border))`      | `hsl(0 0% 100% / 0.1)`                |
| `--glass-shine` | `inset 0 0 0 transparent` | `inset 0 1px 0 hsl(0 0% 100% / 0.06)` |

### Radii

| Token           | Value  |
| --------------- | ------ |
| `--radius-sm`   | `8px`  |
| `--radius-md`   | `11px` |
| `--radius-lg`   | `14px` |
| `--radius-xl`   | `14px` |
| `--radius-2xl`  | `22px` |
| `--radius-card` | `22px` |

Pills use a literal `999px` radius and round marks `50%`.

### Type scale

| Token            | Value       | At a 16 px root |
| ---------------- | ----------- | --------------- |
| `--text-micro`   | `0.75rem`   | 12 px           |
| `--text-body`    | `0.875rem`  | 14 px           |
| `--text-eyebrow` | `0.9375rem` | 15 px           |
| `--text-lead`    | `1rem`      | 16 px           |
| `--text-title`   | `1.5rem`    | 24 px           |
| `--text-display` | `1.875rem`  | 30 px           |
| `--text-hero`    | `3rem`      | 48 px           |

### Fonts

| Token            | Value                                           |
| ---------------- | ----------------------------------------------- |
| `--font-sans`    | `'Inter', system-ui, -apple-system, sans-serif` |
| `--font-display` | `'DM Sans', 'Inter', sans-serif`                |
| `--font-mono`    | `'DM Mono', ui-monospace, monospace`            |

### Control sizes, durations and easing

| Token                 | Value                           |
| --------------------- | ------------------------------- |
| `--control-h`         | `36px`                          |
| `--control-h-compact` | `30px`                          |
| `--topbar-h`          | `3.5rem`                        |
| `--duration-fast`     | `120ms`                         |
| `--duration-base`     | `200ms`                         |
| `--ease-out`          | `cubic-bezier(0.16, 1, 0.3, 1)` |

### Layout variables

These belong to the app, not to the visual system, and are declared on `:root` in
`src/styles/index.css`.

| Variable         | Default             | At 1200 px wide or less | Purpose                                                            |
| ---------------- | ------------------- | ----------------------- | ------------------------------------------------------------------ |
| `--left-w`       | `310px`             | `260px`                 | Width of the left panel                                            |
| `--right-w`      | `340px`             | `290px`                 | Width of the right panel                                           |
| `--bottom-h`     | `320px`             | `300px`                 | Height of the open bottom panel (`min(480px, 58vh)` when tall)     |
| `--bottom-bar`   | `52px`              | unchanged               | Height of the minimised bottom bar                                 |
| `--bottom-space` | `var(--bottom-bar)` | unchanged               | Space the side panels leave at the bottom (`--bottom-h` when open) |
| `--gap`          | `12px`              | unchanged               | Gap between panels and screen edges                                |

### Tokens defined and not referenced by a stylesheet

`--primary-glow`, `--success-strong`, `--up`, `--down`, `--band-stopped`, `--rail`, `--scene-top`,
`--scene-bottom`, `--radius-xl`, `--radius-2xl` and `--text-hero` are part of the copied token set
and have no `var()` reference in the app's stylesheets. `--series-5` and `--band-stopped` are read
from TypeScript by `src/ui/chartTheme.ts`.

## 5. Colour roles

| Role                                    | Tokens                                                                | Where it appears in Killa Landing                                                                                                                                                                                                                                          |
| --------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data, links, focus, selection           | violet: `--primary`, `--primary-strong`, `--accent`, `--ring`         | Focus ring; selected site (`.site[data-active='true']`), selected card or table row; pressed buttons; `.linklike`; slider fill and thumb; progress and loader bars; the compass needle; the word "LANDING" of the logotype; `.btn--primary` for secondary confirmations    |
| The single primary action of the view   | cyan-to-blue gradient `--bg-action`, `--glow-action` (`.btn--accent`) | The start button of the welcome card (with `.btn--big`); the next-step button of the step hint; the run button of the planner form (`.pform__go`); "Deploy rover" (`.dhud__deploy`); the final export button (with `.btn--big`); the confirm button of the scenario editor |
| Brand and the active or top-ranked item | violet-to-magenta gradient `--bg-neon`, `--glow-neon`                 | The current step of the step bar; the current descent phase (`.dhud__steps`); the rank 1 medal (`.top__medal[data-rank='1']`); the best-scenario chip (`.chip--best`); the 40 x 4 px rule under section titles (`.cfg-rule`, overlay and planner zone heads); `.text-neon` |
| State                                   | bands `--band-*` and `--band-*-fill`, always with glyph and text      | Levels on figures, cards, badges, calendar cells, table cells, HUD chips, notices                                                                                                                                                                                          |
| Mascot lamp                             | gold `--lamp`                                                         | The lamp and antenna tip of Killa only                                                                                                                                                                                                                                     |
| Destructive and error                   | red `--destructive`                                                   | `.btn--destructive`; the border of an invalid field and of the export error; the tint of an error notice                                                                                                                                                                   |
| Entities in data                        | `--series-1` to `--series-7`                                          | Charts, legends, HUD labels, 3D marks (section 6)                                                                                                                                                                                                                          |

Text is always an ink token (`--foreground`, `--muted-foreground`), never a series colour, with
two exceptions that are labels of an entity: the Sun and Earth markers (`.label--sun`,
`.label--earth`, `.label--ice`, `.ctape__body--sun`, `.ctape__body--earth`).

## 6. Series mapping

The mapping is implemented once in `readChartTheme` (`src/ui/chartTheme.ts`) and mirrored as hex
in `SCENE_COLORS` (`src/scene/sceneColors.ts`).

| Entity                         | Token        | `ChartTheme` field | `SCENE_COLORS` key |
| ------------------------------ | ------------ | ------------------ | ------------------ |
| Sun, solar energy              | `--series-4` | `sun`              | `sun`              |
| Earth, direct-to-Earth link    | `--series-6` | `earth`            | `earth`            |
| Sun and Earth at the same time | `--series-1` | `both`             | `accent`           |
| Battery                        | `--series-5` | `battery`          | `battery`          |
| Rover route, ice               | `--series-2` | `route`            | `route`            |
| Scenario A                     | `--series-1` | `series[0]`        |                    |
| Scenario B                     | `--series-2` | `series[1]`        |                    |
| Scenario C                     | `--series-3` | `series[2]`        |                    |
| Scenario D                     | `--series-7` | `series[6]`        |                    |

- Scenario colours come from `SCENARIO_SERIES = [1, 2, 3, 7]` through
  `scenarioColor(theme, index)`. The colour belongs to the scenario, not to its position on
  screen. CSS receives it as the custom property `--c` (`.tabs__tab`, `.compare__col`,
  `.compare__badge`, `.editor__sheet`).
- In the 3D scene `SCENE_COLORS.accent` (series 1) is also the generic data accent: rings, orbits
  and selection.
- In CSS the same mapping appears as `var(--series-4)` for Sun marks (`.label--sun`,
  `.ctape__body--sun`, `.card__icon`, `.meter__fill`, the bright end of `.polar-map__ramp`),
  `var(--series-6)` for Earth marks (`.label--earth`, `.ctape__body--earth`,
  `.card__icon--earth`, `.pmap__k--psr`), `var(--series-2)` for ice (`.label--ice`,
  `.pmap__k--ice`) and `var(--series-1)` for the active dot of the polar map
  (`.polar-map__dot--active`).

## 7. State system

### Levels

`src/ui/levels.ts` reduces a figure to a `Level`: `good`, `warn` or `bad`. `src/ui/bands.ts`
maps each level onto a band of the visual system and onto a glyph.

| Level  | Meaning      | Band      | Ink token        | Fill token            | Glyph |
| ------ | ------------ | --------- | ---------------- | --------------------- | ----- |
| `good` | in band      | `ok`      | `--band-ok`      | `--band-ok-fill`      | ✓     |
| `warn` | at the limit | `excess`  | `--band-excess`  | `--band-excess-fill`  | ▲     |
| `bad`  | out of band  | `deficit` | `--band-deficit` | `--band-deficit-fill` | ▼     |

The visual system has no amber warning: "at the limit" is the blue excess band. Amber
(`--series-4`) means the Sun and nothing else.

The full set of band states and glyphs (`BAND_GLYPH`):

| Band state | Glyph | Use                                                       |
| ---------- | ----- | --------------------------------------------------------- |
| `ok`       | ✓     | Good level, success notice, completed step                |
| `deficit`  | ▼     | Bad level, error notice, a negative delta                 |
| `excess`   | ▲     | Warning level, warning notice, a positive delta           |
| `stopped`  | ■     | Stopped                                                   |
| `idle`     | ○     | Idle; the neutral mark of an empty state (`.empty__mark`) |
| `none`     | ·     | No state                                                  |

Notice tones use `NOTICE_GLYPH`: `warning` ▲, `note` ℹ, `success` ✓, `error` ▼.

### Never colour alone

- `LevelTag` (`src/ui/LevelTag.tsx`) renders `<span class="lvl" data-level="...">` with the glyph
  (`aria-hidden`), the level name in a `.sr-only` span and the same name as `title`. `.lvl` is a
  round outlined mark that inherits the ink of the figure it accompanies.
- Elements expose the level as `data-level` and CSS colours them with the band ink: `.stats`,
  `.fact`, `.top__score`, `.big3`, `.shift__cell`, `.verdict`, `.sweep-score`, `.kstat`,
  `.ptop__score`, `.ptable` cells, `.dhud__slope`, `.dmark`.
- Shape reinforces colour where a glyph does not fit: a dashed border for a rejected chip
  (`.chip[data-level='bad']`) and for a steep landing mark (`.dmark[data-steep='true']`);
  diagonal hatching for a calendar day without a solution (`.pcal__cell[data-state='none']`); a
  dashed border for a day not yet computed (`.pcal__cell[data-state='pending']`); stripes for
  permanently shadowed ground in the illumination layer; a 2 px border and bold weight for the
  glare warning (`.dhud__sun[data-alert='true']`).
- The rover trip state (`.rhud__state`) is written as glyph plus text, with `data-band` adding
  the band ink.

### Thresholds

All thresholds live in `src/ui/levels.ts`.

| Function       | Input                      | `good`     | `warn`             | `bad`                 |
| -------------- | -------------------------- | ---------- | ------------------ | --------------------- |
| `scoreLevel`   | Site score, 0 to 100       | 60 or more | 35 to under 60     | under 35              |
| `scienceLevel` | Ice-access score, 0 to 100 | 60 or more | 20 to under 60     | under 20              |
| `energyLevel`  | Percentage                 | 70 or more | 40 to under 70     | under 40              |
| `dteLevel`     | Direct-to-Earth percentage | 70 or more | 30 to under 70     | under 30              |
| `nightLevel`   | Longest night, hours       | 48 or less | over 48 to 120     | over 120              |
| `slopeLevel`   | Slope, degrees             | under 10   | 10 to under 15     | 15 or more            |
| `thermalLevel` | Longest freeze, hours      | 24 or less | over 24 to 120     | over 120, or a PSR    |
| `batteryLevel` | Battery simulation         | otherwise  | minimum under 40 % | depleted at any point |

**The score ramp** is the three steps of `scoreLevel` (60 and 35). It colours the planner
calendar cells and the date-sweep bars with the band fills (`scoreColor` and `scoreStroke` in
`src/ui/plannerView.ts`, `levelFill` in `src/ui/chartTheme.ts`). As documented in
`src/ui/plannerView.ts`, the fills are mid-tones that hold white text, which is why the score is
printed in white on the calendar cells.

## 8. Typography

Fonts load from Google Fonts in `index.html`, with `preconnect` to both font hosts and
`display=swap`:

| Family  | Weights loaded     | Token            | Role                                                                                |
| ------- | ------------------ | ---------------- | ----------------------------------------------------------------------------------- |
| Inter   | 400, 500, 600, 700 | `--font-sans`    | Body text and controls; set on `:root` with `font-feature-settings: 'cv11', 'ss01'` |
| DM Sans | 600, 700           | `--font-display` | `h1` to `h3`, panel and section titles, the logotype, headline figures              |
| DM Mono | 400, 500           | `--font-mono`    | Numbers in tables and telemetry, coordinates, `code`                                |

- Base: `body` is `--text-body` (14 px) with `line-height: 1.55` and antialiased rendering.
- Headings: `h1`, `h2`, `h3` use the display face, `letter-spacing: -0.02em` (`-0.03em` on `h1`)
  and `line-height: 1.2`.
- Section headings are small caps: `.cfg-heading` (display face, `--text-eyebrow`, weight 700,
  uppercase, `0.05em` tracking) followed by `.cfg-rule`. `.panel__heading` uses the same look and
  `.panel__label` is the same at `--text-micro`.
- Numbers: `.num` applies the mono face with `tabular-nums`. Tables, telemetry, the compass tape,
  scores, countdowns and fields set `font-variant-numeric: tabular-nums` so digits do not jump.
- Headline figures use the display face: `.card__big`, `.score__value`, `.kstat__value`,
  `.big3 dd`, `.ptop__score strong`.
- Canvas text uses `chartFont(px, kind, weight)` from `src/ui/chartTheme.ts`: Inter for labels,
  DM Mono for numbers.

## 9. Components

Class names below are defined in `src/styles/index.css` unless another file is named.

### Buttons

All buttons are pills (`border-radius: 999px`).

| Class               | Look                                                                   | Use                                               |
| ------------------- | ---------------------------------------------------------------------- | ------------------------------------------------- |
| `.btn`              | Outline: card background, `--input` border, `--pill` shadow            | Default and secondary actions                     |
| `.btn--primary`     | Solid violet; `--glow-violet` on hover                                 | Confirmations that are not the action of the view |
| `.btn--accent`      | Action gradient `--bg-action`; brighter with `--glow-action` on hover  | The single primary action of the view             |
| `.btn--ghost`       | No background, border or shadow; muted ink                             | Dismiss, cancel, tertiary actions                 |
| `.btn--destructive` | Solid `--destructive`                                                  | Destructive actions                               |
| `.icon-btn`         | Round, 30 px, transparent; accent background on hover or when expanded | Icon-only actions (theme toggle, close, help)     |
| `.linklike`         | Underlined text in `--primary-strong`                                  | Inline actions inside text                        |

Sizes:

| Class         | Height                        | Padding  | Text           |
| ------------- | ----------------------------- | -------- | -------------- |
| `.btn--small` | `--control-h-compact` (30 px) | `0 12px` | `--text-micro` |
| `.btn`        | `--control-h` (36 px)         | `0 16px` | `--text-body`  |
| `.btn--big`   | 44 px (`src/styles/flow.css`) | `0 32px` | `--text-lead`  |

States: hover lifts the button 2 px and tints it with `--accent`; `:active` returns it to rest;
`:disabled` is 50 % opaque and ignores the pointer; `aria-pressed='true'` gives the accent
background with a violet border. `.btn__label` wraps text that collapses to an icon on narrow
screens.

**Rule: one `.btn--accent` per view.** Where two would meet, CSS demotes one. While "Deploy
rover" is offered, `.app:has(.dhud__deploy) .stephint .btn--accent` repaints the step hint's
next button in solid violet with the violet glow on hover, so the landed view has a single
action-gradient button.

**"Deploy rover"** (`.viewhud .btn.dhud__deploy`, rendered by `src/ui/DescentHud.tsx` when a rover
trip is available) is the action of the landed view: 44 px high, `0 26px` padding, `--text-lead`
at weight 700, a 22 px icon, the `--glow-action` shadow and the `deploy-pulse` animation
(section 13). While it is disabled or `aria-busy='true'` it neither pulses nor glows.

### Segmented controls and subtabs

- `.segmented`: a muted pill track with 28 px options; the pressed option
  (`aria-pressed='true'`) is a raised card pill with the `--pill` shadow. `.segmented--small` has
  24 px options at `--text-micro`. In use for the audience and language switches.
- `.subtabs`: the same look for a `role="tablist"` with 26 px tabs; the active tab is
  `aria-selected='true'`. In use for the tabs of the bottom panel.
- `.tabs`, `.tabs__tab`, `.tabs__close`, `.tabs__add`: the scenario tabs, square-cornered
  (`--radius-sm`) and outlined in the scenario colour `--c`; the selected tab is filled with it.

### Panels and glass

- `.panel`: the glass surface. `hsl(var(--card) / var(--glass-alpha))` background,
  `--glass-edge` border, `--radius-card` (22 px), `--elevation-2` plus `--glass-shine`, and
  `backdrop-filter: blur(18px)`.
- Positions: `.panel--left`, `.panel--right`, `.panel--bottom`. States: `.is-open` and
  `.is-collapsed` (header only; a collapsed panel shows a violet border on hover).
- Parts: `.panel__head`, `.panel__toggle`, `.panel__icon` (round accent mark),
  `.panel__heading`, `.panel__chevron`, `.panel__summary`, `.panel__body` (scrolls, enters with
  `fade-in-up`), `.panel__label`, `.panel__title`.
- `.panel[aria-busy='true']` dims `.score` and `.stats` to 45 % so stale figures do not pass as
  fresh ones.
- Other glass surfaces with the same recipe: `.topbar`, `.overlay`, `.stephint`,
  `.intro__card` (`src/styles/flow.css`) and `.planner__zone` (`src/styles/planner.css`).
- App modifiers on `.app`: `.app--intro`, `.app--focus` (hides the panels and widens the HUD),
  `.app--left-open`, `.app--bottom-open`, `.app--bottom-tall`.

### Cards

Inner boxes use `--radius-lg` (14 px), a `--border` outline and a `hsl(var(--muted) / 0.5)`
background.

- `.card` with `.card__head`, `.card__icon`, `.card__title`, `.card__big`, `.card__sub`: a metric
  card with a 3 px left border in the band fill of its `data-level`.
- `.top__card` (Top 3), `.ptop__card` (planner shortlist), `.explain__card`, `.compare__col`,
  `.intro__audience-card`: selectable or informative cards. Hover raises the border to violet
  (and lifts `.top__card` and `.explain__card` 2 px); the selected card has a `--primary` border
  on an `--accent` background.
- `.score`, `.score__value`, `.stats`, `.meter` with `.meter__fill`, `.big3`, `.verdict`,
  `.shift` with `.shift__cell`: figure blocks inside panels and cards.

### Fields

- `.field`: a label (`span`, micro, muted) above an `input` or `select` of `--control-h` (36 px)
  with `--radius-md` (11 px), an `--input` border that turns violet on hover and
  `--destructive` when `aria-invalid='true'`.
- Variants: `.field--narrow` (128 px), `.field--inline`, `.field--check` (an inline checkbox with
  `accent-color: hsl(var(--primary))`).

### Tables

`.dispersion__table`, `.hwfilter__table` and `.ptable` (`src/styles/planner.css`) share one
recipe: collapsed borders, `tabular-nums`, uppercase muted column headers, hairline row
separators at half-opacity `--border`, a muted row hover, and mono numerals in numeric cells. In
`.ptable` a selected row has the `--accent` background with a 3 px violet inset bar,
`.ptable__sort` is the sortable header button and `aria-sort` marks the sorted column.

### Chips, badges and tags

| Class                                                                                                    | Look and use                                                                             |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `.chip`                                                                                                  | Muted pill for a short fact; `data-level='good'` tints the border, `'bad'` dashes it     |
| `.chip--best`                                                                                            | Neon-gradient pill for the best scenario (`src/styles/flow.css`)                         |
| `.badge`                                                                                                 | Micro pill at the end of a card head, tinted by the card's `data-level`                  |
| `.tag`                                                                                                   | Outlined micro pill                                                                      |
| `.pbadge`, `.pbadge--rank`, `.pbadge--stale`                                                             | Planner pills: rank of a shortlisted day, results out of date (`src/styles/planner.css`) |
| `.label`, `.label--active`, `.label--sun`, `.label--earth`, `.label--ice`, `.label--sky`, `.label--pole` | Labels attached to bodies and points in the 3D scene                                     |
| `.dmark`                                                                                                 | Score marker on the terrain, filled with the band ink of its level                       |
| `.toggle`                                                                                                | Pill-shaped label wrapping a checkbox or a select                                        |

### Tooltips

Tooltips use the inverted tooltip tokens: `--tooltip` background, `--tooltip-foreground` text,
`--tooltip-muted` secondary text, `--radius-sm`, `--elevation-3`, micro size. Classes:
`.polar-map__tip`, `.pcal__tip` and `.pmap__tip` (the last two in `src/styles/planner.css`).

### Menus and popovers

- `.menu` wraps a `<details>`; `.menu__list` is the dropdown (`--popover` background,
  `--radius-lg`, `--elevation-3`, `pop-in` animation) holding `role="menuitem"` buttons.
  `.menu--up` opens it upwards (`src/styles/flow.css`).
- `.help__pop`: the contextual help popover, rendered in a portal with fixed coordinates, with
  `.help__title`.
- `.export__error`: an error popover with a `--destructive` border.

### Toast

`.toast` is a single card centred above the bottom panel (`--radius-lg`, `--elevation-3`,
`toast-in` animation) with `.toast__icon`. On phones it is fixed to the bottom edge.

### Sliders and switches

- `input[type='range']`: a 6 px muted track with a violet fill and a round violet thumb, styled
  for both WebKit and Gecko; 50 % opaque when disabled. `.science__slider` and `.rhud__slider`
  (with `.rhud__tick` marks) lay sliders out.
- Inside the view HUD, checkboxes in a `.toggle` render as 28 x 16 px switches: muted when off,
  violet when on, with their own focus ring.

### Overlays

- `.overlay`: a full-stage glass sheet below the top bar (`--radius-card`, `--elevation-3`, a
  scrim made of a `100vmax` shadow), with `.overlay__head` whose `h2` carries the neon rule.
- `.intro` and `.intro__card` (`src/styles/flow.css`): the welcome and site-choice screens over
  the scene.
- `.editor`, `.editor__backdrop`, `.editor__sheet` (`src/styles/flow.css`): the scenario editor,
  a sheet sliding in from the right with a 3 px edge in the scenario colour.
- `.tour`, `.tour__spot`, `.tour__bubble`, `.tour__progress`: the guided tour. The spotlight is a
  box with a ring, the violet glow and a `200vmax` shadow that dims everything else.
- `.splash` and `.loader` (`src/styles/index.css` and `src/styles/killa.css`): the start screen
  and the loading screen.

### Step bar and step hint

Both are defined in `src/styles/flow.css` and rendered by `src/ui/StepBar.tsx`.

- `.steps`: an ordered list on a muted pill track in the top bar. Each `li` has a `data-state`:
  `current` (neon gradient with `--glow-neon`, white text, `aria-current="step"`), `done` (the
  number becomes ✓ on an ok-tinted `.steps__num`) or `todo`. Steps are separated by a `›` and
  every step stays clickable. `.steps__label` holds the step name.
- `.stephint`: a glass pill under the top bar with `role="status"`: the position
  (`.stephint__n`), a one-line hint (`.stephint__text`) and the next-step button
  (`.btn.btn--accent.btn--small`).

### HUD over the scene

`.viewhud` is a centred column between the side panels. `.viewhud__buttons` is one glass toolbar
per row of controls; buttons and toggles inside it sit flat and compact (30 px). Other pieces:
`.ctape` (compass tape), `.dhud` (descent: `.dhud__steps`, `.dhud__telemetry`, `.dhud__altbar`,
`.dhud__line`, `.dhud__progress`), `.rhud__dock` with `.rhud__chips` and `.rhud__profile` (rover),
`.legend` with `.legend__swatch`, `.viewhud__countdowns`, `.polebadge`, `.hint`.

### Utilities

`.sr-only` (visually hidden text), `.num`, `.text-neon` (neon gradient text), `.stagger-in`,
`.hint` (micro muted text), `.warn` (excess ink), `.alert` and `.error` (deficit ink).

## 10. Kit components

Four components in `src/ui/kit/`, styled by `src/styles/kit.css`. `KitAction` is
`{ label: string; onClick: () => void; disabled?: boolean }` (`src/ui/bands.ts`); every prop that
takes an action accepts one `KitAction` or an array, and each renders as a `.btn.btn--small`.

### `Notice`

A message about the state of things: glyph, tint and text.

| Prop           | Type                                          | Notes                                                          |
| -------------- | --------------------------------------------- | -------------------------------------------------------------- |
| `tone`         | `'warning' \| 'note' \| 'success' \| 'error'` | Required. Sets `data-tone`, the glyph and the tint             |
| `title`        | `string`                                      | Bold text by default                                           |
| `headingLevel` | `2 \| 3 \| 4 \| 5`                            | Renders the title as a heading of that level                   |
| `children`     | `ReactNode`                                   | Body                                                           |
| `action`       | `KitAction \| readonly KitAction[]`           | The button or buttons that fix what the notice reports         |
| `role`         | `'alert' \| 'status'`                         | Default: `alert` for `error` and `warning`, `status` otherwise |
| `className`    | `string`                                      | Added after `notice`                                           |

Classes: `.notice`, `.notice__glyph`, `.notice__title`, `.notice__body`, `.notice__actions`.
Tints: `warning` uses the excess band, `success` the ok band, `error` the deficit ink on a
`--destructive` tint, `note` stays neutral. A `status` notice sets `aria-live="polite"`.

**Rule: a notice that reports a problem brings the action that fixes it.** Error notices in the
app carry a retry action; the planner's "no solution" and "few solutions" notices carry the
changes that relax the constraints.

### `Empty`

The empty state: what is missing and the button that solves it.

| Prop        | Type                                | Notes                                                |
| ----------- | ----------------------------------- | ---------------------------------------------------- |
| `title`     | `string`                            | Required                                             |
| `children`  | `ReactNode`                         | What is missing, in one or two lines                 |
| `action`    | `KitAction \| readonly KitAction[]` | The button or buttons that fill the gap              |
| `mascot`    | `ReactNode`                         | Slot for Killa; without it a neutral ○ mark is drawn |
| `className` | `string`                            | Added after `empty`                                  |

Classes: `.empty` (dashed `--input` border), `.empty__mark`, `.empty__title`, `.empty__hint`,
`.empty__actions`.

### `Stat`

A headline figure: small uppercase label, the number in the display face, optional delta.

| Prop    | Type                                                        | Notes                                                                                             |
| ------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `label` | `string`                                                    | Required                                                                                          |
| `value` | `ReactNode`                                                 | Required                                                                                          |
| `unit`  | `string`                                                    | Rendered small and muted after the value                                                          |
| `level` | `Level`                                                     | Adds `data-level`, the band ink and a `LevelTag`                                                  |
| `delta` | `{ value: number; unit?: string; better?: 'up' \| 'down' }` | Shown when the absolute value is 0.5 or more; ▲ or ▼ with sign; `better` colours it ok or deficit |

Classes: `.kstat`, `.kstat__label`, `.kstat__value`, `.kstat__delta`.

### `Busy`

A quiet inline "computing" row with three dots.

| Prop        | Type        | Notes              |
| ----------- | ----------- | ------------------ |
| `children`  | `ReactNode` | Required: the text |
| `className` | `string`    | Added after `busy` |

Classes: `.busy`, `.busy__dots`. It has `role="status"`; the dots are `aria-hidden` and stand
still under reduced motion.

## 11. Charts

Canvas cannot read CSS variables, so `src/ui/chartTheme.ts` resolves the tokens to strings.

- `useChartTheme()` returns a `ChartTheme` and recomputes it when the theme store changes. A
  chart puts the returned object in the dependencies of its draw effect, so it redraws on a
  theme switch.
- `readChartTheme(el?, options)` reads the computed custom properties of `<html>` (or of `el`).
  Where they do not resolve (for example in jsdom), it falls back to a table of literals copied
  from `tokens.css`, so no colour is ever an empty string. A unit test (`src/ui/chartTheme.test.ts`) checks
  `SCENE_COLORS` against the dark literals of that table.
- `ChartTheme` fields: `series` (1 to 7), `sun`, `earth`, `both`, `battery`, `route`, `ink`,
  `inkMuted`, `grid`, `card`, `background`, `primary`, `bandOk`, `bandDeficit`, `bandExcess`,
  `bandStopped`, `fillOk`, `fillDeficit`, `fillExcess`, `fillStopped`, `tooltip`, `tooltipFg`,
  `fontSans`, `fontMono`.
- Helpers: `alpha(color, a)` for transparency on hex and `hsl()` strings; `chartFont` for the
  canvas font shorthand; `scenarioColor`; `levelFill` and `levelInk` for states;
  `LEVEL_FILL_VAR` and `LEVEL_INK_VAR` for inline styles that follow the theme by themselves;
  `hslToHex` and `darkTokenHex` for three.js and image data.

### Which charts follow the theme

| Chart                              | Component                 | Palette                                                                              |
| ---------------------------------- | ------------------------- | ------------------------------------------------------------------------------------ |
| Timeline of Sun, Earth and battery | `src/ui/Timeline.tsx`     | `useChartTheme()`: follows the theme                                                 |
| Seasons, month by month            | `src/ui/SeasonChart.tsx`  | `useChartTheme()`: follows the theme                                                 |
| Date sweep                         | `src/ui/DateSweep.tsx`    | `useChartTheme()`: follows the theme; bars use `levelFill`                           |
| Horizon and sky                    | `src/ui/HorizonChart.tsx` | The sky picture uses `DARK_CHART_THEME`; the chrome around it uses `useChartTheme()` |
| Polar map                          | `src/ui/PolarMap.tsx`     | The map picture uses `DARK_CHART_THEME`; the chrome around it uses `useChartTheme()` |
| Planner map                        | `src/ui/PlannerMap.tsx`   | `DARK_CHART_THEME`                                                                   |
| Moon locator (SVG)                 | `src/ui/MoonLocator.tsx`  | `DARK_CHART_THEME`                                                                   |

`DARK_CHART_THEME` is the dark palette as literals. Pictures of the lunar sky and of the terrain
are dark in both themes, so the marks drawn on them use it regardless of the interface theme.
`useChartTheme({ forceDark: true })` returns the same object.

### Chart rules

1. No chart defines a colour of its own: every stroke and fill comes from a `ChartTheme` field.
2. The colour follows the entity (section 6); states use `levelFill` and `levelInk`.
3. Text is `ink` or `inkMuted`, never a series colour.
4. Grid and axes use `grid` (the border token) through `alpha`, so they stay recessive.
5. Labels use Inter and numbers DM Mono, through `chartFont`.
6. Legends next to a canvas use a line sample for line series: `.chart-key-line` and
   `.chart-key-line--thin` inside `.season__legend` (`src/styles/charts.css`); square swatches
   stand for areas.
7. Tooltips use the tooltip tokens.
8. The grey of the lunar disc in the maps is picture colour, like the logo, not a token.

## 12. 3D scene colours

`src/scene/sceneColors.ts` exports `SCENE_COLORS`, the dark token values as plain hex, which is
what three.js materials and image data take.

| Key        | Hex       | Token                 | Use                                           |
| ---------- | --------- | --------------------- | --------------------------------------------- |
| `sun`      | `#c7761a` | `--series-4`          | The Sun and solar energy                      |
| `earth`    | `#3f7ff0` | `--series-6`          | The Earth and the direct-to-Earth link        |
| `route`    | `#0fa3c2` | `--series-2`          | Rover route and ice                           |
| `accent`   | `#9b6dff` | `--series-1`          | Generic data accent: rings, orbits, selection |
| `battery`  | `#19a97b` | `--series-5`          | Battery                                       |
| `ok`       | `#21ab6b` | `--band-ok-fill`      | Good                                          |
| `warn`     | `#4790f5` | `--band-excess-fill`  | Warning                                       |
| `bad`      | `#e42525` | `--band-deficit-fill` | Bad                                           |
| `stopped`  | `#918da5` | `--band-stopped-fill` | Inactive                                      |
| `ink`      | `#edebf4` | `--foreground`        | Ink over the scene                            |
| `inkMuted` | `#a7a4b7` | `--muted-foreground`  | Secondary ink over the scene                  |

Terrain layers derive from it:

- **Slope layer** (`src/scene/micro/slopeColors.ts`): `safe` is `ok`, `caution` is `warn`,
  `steep` is `bad`, with the 10 and 15 degree limits of `slopeLevel`. The legend labels name the
  classes.
- **Illumination layer** (`src/scene/micro/illumColors.ts`): permanently shadowed ground is
  `earth` blue with diagonal stripes; lit ground runs from a neutral dark grey (`#3a3a3a`,
  picture colour) to the `sun` amber.

Lights, materials, the Sun disc and terrain shading are physical and are not tokens. The
`.stage__fade` and `.stage__vignette` layers are pure black.

## 13. Motion

| Token             | Value                           | Use                                                     |
| ----------------- | ------------------------------- | ------------------------------------------------------- |
| `--duration-fast` | `120ms`                         | Colour, border and transform changes on hover and press |
| `--duration-base` | `200ms`                         | Shadows, card borders, bars, menus and popovers         |
| `--ease-out`      | `cubic-bezier(0.16, 1, 0.3, 1)` | The easing of every interface transition and entrance   |

Transitions list their properties explicitly; nothing uses `transition: all`.

| Animation                                   | Where                                                     | Shape                                                  |
| ------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------ |
| `fade-in-up`                                | Panel bodies, overlays, the welcome card, staggered lists | 8 px rise with fade, 0.3 to 0.45 s                     |
| `fade-in`                                   | `.intro`, `.planner`, `.editor__backdrop`                 | Opacity only                                           |
| `fade-out`                                  | `.stage__fade` when the view changes                      | Black to clear, 0.7 s                                  |
| `pop-in`                                    | `.menu__list`, `.help__pop`                               | 4 px drop with a 0.98 scale, `--duration-base`         |
| `toast-in`                                  | `.toast`                                                  | 12 px rise, 0.4 s                                      |
| `sheet-in`                                  | `.editor__sheet`                                          | 30 px slide from the right, 0.3 s                      |
| `fab-in`                                    | `.fab`, `.assistant`                                      | 12 px rise with a 0.95 scale                           |
| `splash-in`, `splash-glow`                  | Start screen                                              | Entrance of mark and wordmark; a slow alternating glow |
| `pulse`                                     | `.top__facts--loading`, `.assistant__card--loading`       | Opacity to 0.45 and back, 1.4 s loop                   |
| `busy-dot`                                  | `.busy__dots`                                             | Three dots, 1.2 s loop, 0.15 s apart                   |
| `deploy-pulse`                              | `.dhud__deploy`                                           | 2 s `ease-in-out` loop                                 |
| `killa-breathe`, `killa-blink`, `killa-hop` | The mascot                                                | See section 15                                         |

**Stagger.** Children of `.stagger-in` enter with `fade-in-up` (0.4 s) 55 ms apart: 0, 55, 110,
165, 220, 275 ms, and 330 ms from the seventh child on. The same 55 ms step is applied to the
Top 3 cards (`.top > li`), the audience cards, the planner zones and the shortlist cards.

**The pulse of "Deploy rover".** `deploy-pulse` has a single keyframe at 50 %: the box shadow
grows from `--glow-action` to `--glow-action` plus a 7 px ring of
`hsl(var(--action-from) / 0.22)`, then returns. It runs for as long as the button is enabled and
idle, and stops when the button is disabled or busy.

**Hover lift.** Buttons rise 2 px; `.top__card` and `.explain__card` rise 2 px; the assistant
button (`.fab`) rises 1 px.

**Reduced motion.** `tokens.css` and `index.css` both declare a global rule under
`prefers-reduced-motion: reduce` that sets `animation-duration` and `transition-duration` to
`0.01ms` on every element and pseudo-element; the rule in `tokens.css` also sets
`animation-iteration-count: 1` and `scroll-behavior: auto`. In addition:

- `.busy__dots` stop and stay at 70 % opacity.
- `.intro`, `.fab`, `.assistant`, `.editor__sheet`, `.planner`, `.splash__wait` and the two
  loading pulses have `animation: none`.
- The mascot's animations are declared only under `prefers-reduced-motion: no-preference`.
- The start screen checks the same media query from TypeScript (`src/ui/Splash.tsx`).

## 14. Logo

The mark is a **full Moon with craters**: `public/favicon.svg`, a 64 x 64 drawing.

- A disc of radius 28 with a radial gradient lit from the upper left (`#f6f5f1` to `#cfcec9` to
  `#8a8985`).
- Three soft maria (`#7f7e7b` at 42 % opacity).
- Ten craters, each drawn as a dark floor (`#8b8a86`), an offset lighter floor (`#b4b3ae`) and a
  thin pale rim (`#f3f2ee`).
- A terminator gradient (`#0b0b14`, up to 62 % opacity) that darkens the lower right limb.

These greys are picture colour, like the lunar disc of the maps; they are not interface tokens
and are the same in both themes.

Where it appears:

- **Top bar**: `.topbar__mark`, 30 x 30 px, with a soft `--foreground` drop shadow, next to the
  logotype `.topbar__logo`: "KILLA LANDING" in DM Sans 700, `--text-lead`, `0.16em` tracking, the
  word "LANDING" in `--primary`. A muted tagline (`.topbar__tag`) sits under it on wide screens.
- **Start screen**: the same drawing inline (`LogoMark` in `src/ui/Splash.tsx`, class
  `.splash__mark`), sized `clamp(96px, 18vmin, 148px)` with a slow glow, above the wordmark
  `.splash__word` (`0.32em` tracking).

The browser-tab icon is the mascot, not the Moon: `index.html` links `/pets/killa.svg`.

## 15. Killa, the mascot

**Killa** means "Moon" in Quechua. She is the sister of Wayra: same geometry and pieces (a white
helmet with a gold lamp, a dark visor, an antenna and a chest screen), with a copper body in two
tones and a crescent moon on the chest screen.

### Geometry and colours

`src/ui/Killa.tsx` draws her as an inline SVG on a 240 x 240 view box; `public/pets/killa.svg` is
the same drawing as a static file in the `idle` pose.

| Part                              | Colour                                  |
| --------------------------------- | --------------------------------------- |
| Torso and head                    | Copper `#C8763E`                        |
| Feet, arms, helmet band, crescent | Dark copper `#9A5527`                   |
| Visor, neck, antenna stem         | Ink `#1B1B2C`                           |
| Eyes and mouth                    | Cyan `#7CF0F0`                          |
| Helmet dome and chest screen      | White `#FFFFFF`                         |
| Lamp and antenna tip              | `hsl(var(--lamp))` (gold), state-driven |

The body keeps these fixed colours in both themes: copper is brand, not state. Only the lamp
(`.killa-lamp`) and the antenna tip (`.killa-tip`) read tokens.

### The five states

`KillaState` is `'idle' | 'thinking' | 'ok' | 'alert' | 'offline'`. The component sets
`data-state` and the class `killa-<state>`. Every state is distinguishable without motion,
because the face changes.

| State      | Face and lamp                                                                                | Motion (only without a reduced-motion preference) |
| ---------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `idle`     | Round eyes, smile, gold lamp                                                                 | Breathes: 2 px, 3 s loop (`killa-breathe`)        |
| `thinking` | Eyes shifted 3 px to one side, gold lamp                                                     | Breathes; the lamp blinks, 1.2 s (`killa-blink`)  |
| `ok`       | Happy eyes drawn as arcs, smile                                                              | One 10 px hop on entering, 500 ms (`killa-hop`)   |
| `alert`    | Half-closed eyelids, straight mouth, lamp in `--band-deficit-fill` (red)                     | None                                              |
| `offline`  | Sad mouth, lamp and tip in `--muted-foreground`, whole figure 60 % grayscale at 85 % opacity | None                                              |

### Props

| Prop        | Type         | Default  | Notes                                                                             |
| ----------- | ------------ | -------- | --------------------------------------------------------------------------------- |
| `state`     | `KillaState` | `'idle'` |                                                                                   |
| `size`      | `number`     | `48`     | Width and height in px                                                            |
| `title`     | `string`     |          | With a title she is a named image (`role="img"`); without it she is `aria-hidden` |
| `className` | `string`     |          | `killa--inline` aligns her inside a line of text                                  |

### Where she appears

She appears where the app speaks or waits:

| Place                                        | State                                                | Size (px)             |
| -------------------------------------------- | ---------------------------------------------------- | --------------------- |
| Assistant button (`.fab`)                    | `idle`                                               | 28                    |
| Assistant panel head (`.assistant__head`)    | `thinking`, `alert` or `ok`, following the assistant | 44                    |
| Loader (`.loader`)                           | `thinking` online, `offline` without a connection    | 40 online, 56 offline |
| Start screen wait pill (`.splash__wait`)     | `thinking`                                           | 48                    |
| Planner empty state (`Empty` `mascot` slot)  | `idle`                                               | 72                    |
| A solved challenge (`src/ui/Challenges.tsx`) | `ok`                                                 | 40, inline            |
| Browser tab                                  | static `public/pets/killa.svg`                       |                       |

On a card she sits on a soft round `--muted` disc (`.fab > .killa`, `.assistant__head > .killa`,
`.splash__wait > .killa`) because her white helmet needs a ground.

### Where she must not appear

- Never as decoration of a table, a chart, a map or the 3D scene.
- Never as a state indicator for data: states are bands with glyph and text.
- Never recoloured: the body colours are fixed and gold `--lamp` is used by nothing else in the
  interface.
- Not as the brand mark: the logo is the Moon.

## 16. Icons

`src/ui/icons.tsx` holds the icon set: small stroke icons on a 24-unit grid, `fill="none"`,
`stroke="currentColor"`, stroke width 1.8, round caps and joins. They are sized `1em`, so the
parent's `font-size` sets the size (16 px in `.btn`, 14 px in HUD buttons, 22 px in
"Deploy rover") and the parent's `color` sets the colour. Every icon is `aria-hidden` and not
focusable: the accessible name comes from the button's text or `aria-label`.

The set: `IconPin`, `IconGauge`, `IconClock`, `IconChevron`, `IconHelp`, `IconCompass`,
`IconOrbit`, `IconMountain`, `IconLander`, `IconCompare`, `IconEye`, `IconEyeOff`, `IconBook`,
`IconSpark`, `IconSun`, `IconEarth`, `IconWide`, `IconSatellite`, `IconTarget`, `IconPlay`,
`IconPause`, `IconRestart`, `IconFilter`, `IconMoon`, `IconRover`.

Buttons use these icons instead of emoji. States use the text glyphs of section 7 (✓ ▲ ▼ ■ ○).

## 17. Accessibility

- **Focus ring.** One rule for the whole app in `tokens.css`: `:focus-visible` draws a 2 px
  `--ring` outline with a 2 px offset. The HUD switches and the planner controls restate it, and
  a radio card shows it through `.intro__audience-card:has(input:focus-visible)`.
- **States carry glyph and text.** `LevelTag` gives every level a glyph, a `title` and a
  screen-reader label; notices have a glyph per tone; the step bar ticks completed steps; see
  section 7.
- **Live regions.** `role="status"` for the step hint, `Busy`, the loader and HUD messages;
  `role="alert"` for errors; `Notice` picks `alert` or `status` from its tone and adds
  `aria-live="polite"` to status notices.
- **Busy.** `aria-busy` marks panels, columns and buttons that are recomputing; CSS dims their
  stale figures.
- **Toggles and selection.** `aria-pressed` on toggle buttons and segmented options;
  `aria-selected` in the tablist; `aria-current="step"` on the current step and
  `aria-current="date"` on the current date cell; `aria-expanded` and `aria-controls` on
  disclosure buttons; `aria-sort` on sorted table headers; `aria-invalid` with
  `aria-describedby` on fields.
- **Dialogs and menus.** `role="dialog"` with `aria-modal="true"` for the tour and the scenario
  editor; `role="dialog"` for the help popover; `role="menu"` with `role="menuitem"` for menus;
  `role="tooltip"` for the calendar tooltip; `role="meter"` with `aria-valuenow`,
  `aria-valuemin`, `aria-valuemax` and `aria-valuetext` for the score meter; a focusable
  `role="region"` around the scrolling day table.
- **Names.** Landmarks and groups have an `aria-label` (step navigation, top-bar tools, language
  and audience switches, HUD sections). Decorative elements are `aria-hidden`: icons, the logo
  image (`alt=""`), the scene fade and vignette, swatches, and the mascot unless she has a
  `title`.
- **Collapsed labels keep their name.** When the top bar runs out of room, `.btn__label` is
  hidden visually with the `.sr-only` technique, so the button keeps its accessible name.
- **Language.** `<html lang>` follows the chosen language and each option of the language switch
  declares its own `lang`.
- **Reduced motion.** See section 13.
- **Contrast.** The tokens document no contrast figures. The code documents two decisions: band
  fills are mid-tones chosen to hold white text, and HUD controls keep an opaque `--popover`
  background because they float over bright terrain.

## 18. Responsive behaviour

Breakpoints present in the stylesheets:

| Condition           | File          | Effect                                                                                                                                                                                                                                      |
| ------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `max-width: 1440px` | `index.css`   | Top-bar button labels collapse to icons (names stay for screen readers)                                                                                                                                                                     |
| `max-width: 1200px` | `index.css`   | Narrower panels (`--left-w` 260 px, `--right-w` 290 px, `--bottom-h` 300 px); the tagline is hidden; the date-sweep panel becomes one column                                                                                                |
| `max-width: 1200px` | `flow.css`    | Step names (`.steps__label`) are hidden; numbers and icons remain                                                                                                                                                                           |
| `min-width: 1200px` | `planner.css` | Planner in three columns; each zone scrolls on its own and the run button stays in view                                                                                                                                                     |
| `760px` to `1199px` | `planner.css` | Planner zone 3 places map and shortlist side by side                                                                                                                                                                                        |
| `max-width: 820px`  | `index.css`   | The page scrolls: `.app` becomes a column with 16 px side padding, the top bar is sticky and wraps, the stage takes `60vh`, panels sit in the flow, the toast and overlays are fixed, the rover dock sits in the flow, the polar map stacks |
| `max-width: 820px`  | `flow.css`    | The step hint sits in the flow without its text; the intro paints the page; the assistant label is hidden; editor grid in one column                                                                                                        |
| `max-width: 820px`  | `killa.css`   | The assistant button shrinks to the mascot                                                                                                                                                                                                  |
| `max-width: 820px`  | `planner.css` | The planner sits in the flow under the top bar and the stage is hidden behind it                                                                                                                                                            |
| `max-width: 640px`  | `index.css`   | The HUD keeps the compass and one "more" button (`.viewhud__more`); control rows, legends and hints open on demand (`.viewhud--more`); the hardware table drops a column and shrinks its text                                               |
| `max-width: 640px`  | `flow.css`    | Audience cards stack in one column                                                                                                                                                                                                          |
| `max-width: 560px`  | `index.css`   | Source list in one column                                                                                                                                                                                                                   |
| `max-width: 560px`  | `planner.css` | Tighter planner: smaller title, calendar and paddings                                                                                                                                                                                       |

All of these files live in `src/styles/`.

## 19. Contributor checklist

Before merging a visual change:

1. **Exact tokens.** Every colour, radius, shadow, size and duration is a token from
   `src/styles/tokens.css`; no literal colour in a component and no invented value. Fixed colours
   are allowed only in imagery (logo, mascot body, lunar disc, terrain, the black scene fade).
2. **One action per view.** A single `.btn--accent` is visible. If a second one can appear,
   demote one of them, as `.app:has(.dhud__deploy)` does for the step hint.
3. **Neon only for the active or top-ranked item.** `--bg-neon` marks the current step, the
   current phase, rank 1 and section rules; it is not decoration.
4. **No state in colour alone.** A level has a `LevelTag` or a glyph plus text; "at the limit" is
   the blue excess band, never amber.
5. **Numbers and headings.** Figures use `tabular-nums` (and `.num` or the mono face where they
   align in columns); section titles use `.cfg-heading` with `.cfg-rule`, or `.panel__label`.
6. **Glass panels.** Floating surfaces use `.panel` or the same recipe (`--glass-alpha`,
   `--glass-edge`, `--glass-shine`, 18 px blur); inner boxes use `--radius-lg`, fields
   `--radius-md`.
7. **Both themes.** Check dark and light through the `.dark` class. Anything placed inside
   `.stage` is dark in both themes; canvas charts read `useChartTheme()` and three.js marks read
   `SCENE_COLORS`.
8. **Series follow the entity.** Sun `--series-4`, Earth `--series-6`, both `--series-1`,
   battery `--series-5`, route and ice `--series-2`, scenarios A to D series 1, 2, 3, 7.
9. **Reduced motion.** Motion uses `--duration-fast`, `--duration-base` and `--ease-out`, and
   nothing essential depends on it: check with `prefers-reduced-motion: reduce`.
10. **Visible focus and names.** Every control is reachable by keyboard, shows the `--ring`
    outline and has an accessible name; icon-only buttons have an `aria-label`.
11. **Killa only where the app speaks or waits.** Assistant, loading, empty states, a success
    message; never in tables, charts or the scene. Gold `--lamp` is hers alone.
12. **Every problem brings its fix, in plain words.** A `Notice` that reports a problem carries
    the action that solves it, and an `Empty` carries the action that fills it. Interface text is
    plain and free of jargon, and every string exists in the message catalogues (Spanish, English
    and partial Quechua with Spanish fallback).
