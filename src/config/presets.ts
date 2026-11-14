import { DAY_MS } from '../astro/constants.ts'
import type { MsgKey } from '../i18n/index.ts'
import type { ScenarioParams } from '../store/useMissionStore.ts'

/** One scenario of a preset, before ids are assigned by the store. */
export interface PresetScenario extends Partial<ScenarioParams> {
  siteId: string
  startMs: number
}

export interface PresetContext {
  /** The active scenario when the preset is applied. */
  siteId: string
  startMs: number
}

/**
 * One-click "what if?" comparisons. Each preset builds the Compare scenarios from the current
 * context, so "delay" works on whatever site/date the user is looking at.
 */
export interface Preset {
  id: string
  titleKey: MsgKey
  descKey: MsgKey
  build: (ctx: PresetContext) => {
    scenarios: PresetScenario[]
    missionDays?: number
    /** Engineering↔Science weight to apply with the preset (0..1). */
    scienceWeight?: number
    /** Energy profile (config/energyProfiles.ts) to apply with the preset. */
    energyId?: string
  }
}

export const PRESETS: readonly Preset[] = [
  {
    id: 'delay-14d',
    titleKey: 'presets.delay.title',
    descKey: 'presets.delay.desc',
    build: ({ siteId, startMs }) => ({
      scenarios: [
        { siteId, startMs },
        { siteId, startMs: startMs + 14 * DAY_MS },
      ],
    }),
  },
  {
    id: 'peak-vs-psr',
    titleKey: 'presets.peakVsPsr.title',
    descKey: 'presets.peakVsPsr.desc',
    build: ({ startMs }) => ({
      scenarios: [
        { siteId: 'connecting-ridge', startMs },
        { siteId: 'shackleton-floor', startMs },
      ],
    }),
  },
  {
    id: 'light-vs-ice',
    titleKey: 'presets.lightIce.title',
    descKey: 'presets.lightIce.desc',
    build: ({ startMs }) => ({
      scenarios: ['connecting-ridge', 'shackleton-rim', 'nobile-rim', 'de-gerlache-rim'].map(
        (siteId) => ({ siteId, startMs }),
      ),
      scienceWeight: 0.3,
    }),
  },
  {
    id: 'artemis-candidates',
    titleKey: 'presets.artemis.title',
    descKey: 'presets.artemis.desc',
    build: ({ startMs }) => ({
      scenarios: ['connecting-ridge', 'de-gerlache-rim', 'malapert-massif', 'mons-mouton'].map(
        (siteId) => ({ siteId, startMs }),
      ),
    }),
  },
  {
    // Canadian Space Agency utility rover (concept, launch in the 2030s): night survival.
    id: 'csa-rover',
    titleKey: 'presets.csaRover.title',
    descKey: 'presets.csaRover.desc',
    build: ({ startMs }) => ({
      scenarios: ['connecting-ridge', 'malapert-massif', 'cabeus'].map((siteId) => ({
        siteId,
        startMs,
      })),
      missionDays: 30,
      energyId: 'csa-rover',
    }),
  },
]
