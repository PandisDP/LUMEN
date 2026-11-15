/**
 * Curated landing sites. Coordinates are approximate, taken from public mission
 * material and the literature; the data pipeline (scripts/data/build-data.ts) refines
 * ridge/peak sites within `snapRadiusM` (highest or best-lit LOLA point).
 * Plain data, no Vite APIs: this file is also imported by the Node data scripts.
 */
export type SiteCategory = 'south-pole' | 'reference'

export interface SiteSeed {
  id: string
  name: string
  /** Short context: mission, programme or why it is interesting. */
  mission: string
  description: string
  category: SiteCategory
  lat: number
  lon: number
  /** Search radius for refining the coordinates. 0 = keep them as they are. */
  snapRadiusM: number
  /**
   * How to refine: 'height' picks the highest point, 'sun' the best-lit of the high points
   * (one year of Sun positions against each candidate's horizon).
   */
  snapMode?: 'height' | 'sun'
}

export const SITE_SEEDS: readonly SiteSeed[] = [
  {
    id: 'shackleton-rim',
    name: 'Borde de Shackleton',
    mission: 'Región candidata Artemis III',
    description:
      'Uno de los puntos mejor iluminados de la Luna: el borde del cráter queda por encima de casi todo el relieve circundante.',
    category: 'south-pole',
    lat: -89.45,
    lon: -137.31,
    snapRadiusM: 1500,
    snapMode: 'sun',
  },
  {
    id: 'connecting-ridge',
    name: 'Cresta de conexión',
    mission: 'Región candidata Artemis III',
    description: 'Cresta elevada que une los cráteres Shackleton y de Gerlache.',
    category: 'south-pole',
    // Midpoint between the Shackleton and de Gerlache rims; the pipeline picks the best-lit point.
    lat: -89.19,
    lon: -87.2,
    snapRadiusM: 9000,
    snapMode: 'sun',
  },
  {
    id: 'de-gerlache-rim',
    name: 'Borde de de Gerlache',
    mission: 'Región candidata Artemis III',
    description: 'Borde del cráter de Gerlache, con largos periodos de iluminación.',
    category: 'south-pole',
    lat: -88.71,
    lon: -68.2,
    snapRadiusM: 2500,
    snapMode: 'sun',
  },
  {
    id: 'malapert-massif',
    name: 'Macizo Malapert',
    mission: 'Región candidata Artemis III',
    description:
      'Montaña de ~5 km orientada hacia la Tierra: excelente visibilidad directa para comunicaciones.',
    category: 'south-pole',
    lat: -85.99,
    lon: 2.7,
    snapRadiusM: 3000,
  },
  {
    id: 'mons-mouton',
    name: 'Mons Mouton',
    mission: 'IM-2 Athena (Intuitive Machines, CLPS 2025)',
    description: 'Meseta elevada; sitio de alunizaje de la misión IM-2 del programa CLPS.',
    category: 'south-pole',
    lat: -84.79,
    lon: 29.19,
    snapRadiusM: 0,
  },
  {
    id: 'nobile-rim',
    name: 'Borde de Nobile',
    mission: 'Zona objetivo del rover VIPER',
    description: 'Región al oeste del cráter Nobile con zonas de sombra permanente cercanas.',
    category: 'south-pole',
    lat: -85.42,
    lon: 31.6,
    snapRadiusM: 0,
  },
  {
    id: 'haworth',
    name: 'Interior de Haworth',
    mission: 'Región de sombra permanente (PSR)',
    description:
      'Fondo de un cráter profundo: el Sol nunca supera sus paredes. Frío extremo y posible hielo.',
    category: 'south-pole',
    lat: -87.45,
    lon: -5,
    snapRadiusM: 0,
  },
  {
    id: 'shackleton-floor',
    name: 'Interior de Shackleton',
    mission: 'Región de sombra permanente (PSR)',
    description:
      'A 4 km de profundidad bajo el borde: oscuridad perpetua junto al punto más iluminado.',
    category: 'south-pole',
    lat: -89.67,
    lon: 129.78,
    snapRadiusM: 0,
  },
  {
    id: 'cabeus',
    name: 'Cabeus (impacto LCROSS)',
    mission: 'LCROSS (NASA, 2009)',
    description: 'Donde LCROSS confirmó agua helada en 2009 al impactar contra una zona en sombra.',
    category: 'south-pole',
    lat: -84.675,
    lon: -48.725,
    snapRadiusM: 0,
  },
  {
    id: 'change-7',
    name: "Chang'e-7 (zona candidata)",
    mission: 'CNSA, previsto 2026',
    description:
      'Orbitador, módulo de aterrizaje, rover y sonda saltadora para buscar hielo en el polo sur. Zona aproximada junto al borde de Shackleton; se refina al punto mejor iluminado.',
    category: 'south-pole',
    lat: -88.8,
    lon: 123.4,
    snapRadiusM: 2000,
    snapMode: 'sun',
  },
  {
    id: 'im-1',
    name: 'IM-1 Odysseus (Malapert A)',
    mission: 'Intuitive Machines, CLPS 2024',
    description:
      'Primer alunizaje comercial, a 80°S junto al cráter Malapert A. Volcó al tocar suelo, pero transmitió datos. Horizonte sin relieve.',
    category: 'reference',
    lat: -80.13,
    lon: 1.44,
    snapRadiusM: 0,
  },
  {
    id: 'luna-25',
    name: 'Luna-25 (sitio previsto)',
    mission: 'Roscosmos, 2023',
    description:
      'Sitio previsto al norte del cráter Boguslawsky, a 69,5°S; la sonda se estrelló antes del descenso. Horizonte sin relieve.',
    category: 'reference',
    lat: -69.545,
    lon: 43.544,
    snapRadiusM: 0,
  },
  {
    id: 'chandrayaan-3',
    name: 'Chandrayaan-3',
    mission: 'ISRO, 2023',
    description: 'Alunizaje más cercano al polo sur hasta 2023 (69°S). Horizonte sin relieve.',
    category: 'reference',
    lat: -69.3733,
    lon: 32.3191,
    snapRadiusM: 0,
  },
  {
    id: 'change-4',
    name: "Chang'e-4",
    mission: 'CNSA, 2019 (cara oculta)',
    description:
      'En la cara oculta la Tierra nunca sale: hace falta un satélite repetidor (Queqiao).',
    category: 'reference',
    lat: -45.4446,
    lon: 177.5991,
    snapRadiusM: 0,
  },
  {
    id: 'change-6',
    name: "Chang'e-6",
    mission: 'CNSA, 2024 (cara oculta)',
    description:
      'Primeras muestras de la cara oculta, en la cuenca Apolo (41,6°S). Sin Tierra a la vista: enlace vía el relé Queqiao-2. Horizonte sin relieve.',
    category: 'reference',
    lat: -41.6385,
    lon: -153.9852,
    snapRadiusM: 0,
  },
  {
    id: 'blue-ghost-m1',
    name: 'Blue Ghost M1',
    mission: 'Firefly Aerospace, CLPS 2025',
    description:
      'Mare Crisium, 18,6°N. Operó un día lunar completo con la Tierra alta en el cielo. Horizonte sin relieve.',
    category: 'reference',
    lat: 18.56,
    lon: 61.81,
    snapRadiusM: 0,
  },
  {
    id: 'slim',
    name: 'SLIM',
    mission: 'JAXA, 2024',
    description: 'Alunizaje de precisión cerca del cráter Shioli. Horizonte sin relieve.',
    category: 'reference',
    lat: -13.316,
    lon: 25.251,
    snapRadiusM: 0,
  },
  {
    id: 'apollo-11',
    name: 'Apolo 11',
    mission: 'NASA, 1969',
    description: 'Mar de la Tranquilidad. Sol alto y Tierra casi en el cénit: lo opuesto al polo.',
    category: 'reference',
    lat: 0.6741,
    lon: 23.473,
    snapRadiusM: 0,
  },
  {
    id: 'apollo-15',
    name: 'Apolo 15',
    mission: 'NASA, 1971',
    description: 'Hadley-Apennine. Horizonte sin relieve.',
    category: 'reference',
    lat: 26.1322,
    lon: 3.6339,
    snapRadiusM: 0,
  },
  {
    id: 'apollo-17',
    name: 'Apolo 17',
    mission: 'NASA, 1972',
    description: 'Taurus-Littrow. Horizonte sin relieve.',
    category: 'reference',
    lat: 20.1908,
    lon: 30.7717,
    snapRadiusM: 0,
  },
]

export const DEFAULT_SITE_ID = 'shackleton-rim'
