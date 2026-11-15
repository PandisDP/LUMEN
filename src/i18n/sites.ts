import { useCallback } from 'react'
import type { SiteDetail, SiteInfo } from '../data/catalog.ts'
import { formatLatLon } from '../ui/format.ts'
import { type Lang, translate, useLang, useT } from './index.ts'

interface SiteText {
  name: string
  mission: string
  description: string
}

/**
 * English copy for the curated sites. The Spanish text lives in config/sites.ts (also used by
 * the data pipeline), so it stays the source; proper names are kept untranslated.
 */
const EN: Record<string, SiteText> = {
  'shackleton-rim': {
    name: 'Shackleton rim',
    mission: 'Artemis III candidate region',
    description:
      'One of the best-lit spots on the Moon: the crater rim stands above almost all the surrounding relief.',
  },
  'connecting-ridge': {
    name: 'Connecting ridge',
    mission: 'Artemis III candidate region',
    description: 'Raised ridge joining the Shackleton and de Gerlache craters.',
  },
  'de-gerlache-rim': {
    name: 'de Gerlache rim',
    mission: 'Artemis III candidate region',
    description: 'Rim of de Gerlache crater, with long periods of illumination.',
  },
  'malapert-massif': {
    name: 'Malapert massif',
    mission: 'Artemis III candidate region',
    description:
      'A ~5 km mountain facing the Earth: excellent direct visibility for communications.',
  },
  'mons-mouton': {
    name: 'Mons Mouton',
    mission: 'IM-2 Athena (Intuitive Machines, CLPS 2025)',
    description: 'Elevated plateau; landing site of the CLPS IM-2 mission.',
  },
  'nobile-rim': {
    name: 'Nobile rim',
    mission: 'VIPER rover target area',
    description: 'Area west of Nobile crater with nearby permanently shadowed regions.',
  },
  haworth: {
    name: 'Haworth floor',
    mission: 'Permanently shadowed region (PSR)',
    description:
      'Floor of a deep crater: the Sun never clears its walls. Extreme cold and possible ice.',
  },
  'shackleton-floor': {
    name: 'Shackleton floor',
    mission: 'Permanently shadowed region (PSR)',
    description: '4 km below the rim: perpetual darkness next to the best-lit point.',
  },
  cabeus: {
    name: 'Cabeus (LCROSS impact)',
    mission: 'LCROSS (NASA, 2009)',
    description: 'Where LCROSS confirmed water ice in 2009 by impacting a shadowed area.',
  },
  'change-7': {
    name: "Chang'e-7 (candidate area)",
    mission: 'CNSA, planned 2026',
    description:
      'Orbiter, lander, rover and hopping probe to look for ice at the south pole. Approximate area near the Shackleton rim; refined to the best-lit point.',
  },
  'im-1': {
    name: 'IM-1 Odysseus (Malapert A)',
    mission: 'Intuitive Machines, CLPS 2024',
    description:
      'First commercial landing, at 80°S next to Malapert A crater. It tipped over on touchdown but still returned data. Horizon without relief.',
  },
  'luna-25': {
    name: 'Luna-25 (planned site)',
    mission: 'Roscosmos, 2023',
    description:
      'Planned site north of Boguslawsky crater, at 69.5°S; the probe crashed before descent. Horizon without relief.',
  },
  'chandrayaan-3': {
    name: 'Chandrayaan-3',
    mission: 'ISRO, 2023',
    description: 'Closest landing to the south pole until 2023 (69°S). Horizon without relief.',
  },
  'change-4': {
    name: "Chang'e-4",
    mission: 'CNSA, 2019 (far side)',
    description: 'On the far side the Earth never rises: a relay satellite (Queqiao) is needed.',
  },
  'change-6': {
    name: "Chang'e-6",
    mission: 'CNSA, 2024 (far side)',
    description:
      'First samples from the far side, in the Apollo basin (41.6°S). No Earth in the sky: link through the Queqiao-2 relay. Horizon without relief.',
  },
  'blue-ghost-m1': {
    name: 'Blue Ghost M1',
    mission: 'Firefly Aerospace, CLPS 2025',
    description:
      'Mare Crisium, 18.6°N. Operated a full lunar day with the Earth high in the sky. Horizon without relief.',
  },
  slim: {
    name: 'SLIM',
    mission: 'JAXA, 2024',
    description: 'Precision landing near Shioli crater. Horizon without relief.',
  },
  'apollo-11': {
    name: 'Apollo 11',
    mission: 'NASA, 1969',
    description:
      'Sea of Tranquility. High Sun and the Earth almost at the zenith: the opposite of the pole.',
  },
  'apollo-15': {
    name: 'Apollo 15',
    mission: 'NASA, 1971',
    description: 'Hadley-Apennine. Horizon without relief.',
  },
  'apollo-17': {
    name: 'Apollo 17',
    mission: 'NASA, 1972',
    description: 'Taurus-Littrow. Horizon without relief.',
  },
}

/** Localised name / mission / description of a site (custom points are built from coords). */
export function siteText(site: SiteInfo, lang: Lang): SiteText {
  if (site.custom) {
    return {
      name: translate(lang, 'site.custom.name', { coords: formatLatLon(site.lat, site.lon) }),
      mission: translate(lang, 'site.custom.mission'),
      description: translate(
        lang,
        site.accuracy === 'spherical' ? 'site.custom.descFlat' : 'site.custom.descDem',
      ),
    }
  }
  if (lang === 'en' && EN[site.id]) return EN[site.id]
  return { name: site.name, mission: site.mission, description: site.description }
}

/** Data-provenance line of a site in the current language. */
export function useSourceText() {
  const t = useT()
  return useCallback(
    (detail: SiteDetail | undefined) =>
      detail ? (detail.sourceKey ? t(detail.sourceKey, detail.sourceParams) : detail.source) : '',
    [t],
  )
}

export function useSiteText() {
  const lang = useLang()
  return useCallback(
    (site: SiteInfo | undefined): SiteText | undefined => (site ? siteText(site, lang) : undefined),
    [lang],
  )
}
