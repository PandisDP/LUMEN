/**
 * Colours of the UI-like marks inside the 3D scene (lines, markers, overlays). The scene is always
 * dark, so these are the DARK values of the design tokens (styles/tokens.css) as plain hex, which
 * is what three.js and image data need; ui/chartTheme.test.ts checks them against the tokens.
 * Lights, materials, the Sun disc and the terrain shading are physical and do not live here.
 */
export const SCENE_COLORS = {
  /** series-4: the Sun and solar energy. */
  sun: '#c7761a',
  /** series-6: the Earth and the direct-to-Earth link. */
  earth: '#3f7ff0',
  /** series-2: rover route and ice. */
  route: '#0fa3c2',
  /** series-1: generic data accent (rings, orbits, selection). */
  accent: '#9b6dff',
  /** series-5: battery. */
  battery: '#19a97b',
  /** band-ok-fill / band-excess-fill / band-deficit-fill: good, warning, bad. */
  ok: '#21ab6b',
  warn: '#4790f5',
  bad: '#e42525',
  /** band-stopped-fill: inactive. */
  stopped: '#918da5',
  /** foreground / muted-foreground: ink over the scene. */
  ink: '#edebf4',
  inkMuted: '#a7a4b7',
} as const
