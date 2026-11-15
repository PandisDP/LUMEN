import { type DemGrid, type DemMeta, demCovers, latLonToPixel } from '../astro/dem.ts'
import type { Site } from '../astro/ephemeris.ts'
import { surfaceDistance } from '../astro/frames.ts'
import type { IceSummary } from '../astro/iceAccess.ts'
import type { IllumMeta } from '../astro/illumination.ts'
import { type HorizonMask, sphericalMask } from '../astro/horizon.ts'
import { SITE_SEEDS, type SiteSeed, usesPolarProduct } from '../config/sites.ts'
import { loadDem } from './loadDem.ts'
import { runCustomHorizon } from '../workers/astroClient.ts'
import type { DemRef } from '../workers/protocol.ts'
import type { MsgKey, MsgParams } from '../i18n/index.ts'

/**
 * 'lola': 20 m polar tile + 240 m far field; 'lola-480': browser horizon on the 480 m polar
 * DEM; 'lola-global': 60 m tile cut from the LOLA global grids (sites outside the polar
 * products); 'spherical': no topography.
 */
export type Accuracy = 'lola' | 'lola-480' | 'lola-global' | 'spherical'

export interface SiteInfo extends SiteSeed {
  heightM: number
  accuracy: Accuracy
  hasTerrain: boolean
  custom?: boolean
  /** Slope at the site and 90th percentile within 500 m (20 m DEM), deg. */
  slopeCenterDeg?: number
  slopeP90Deg?: number
  /** Precomputed rover access to the nearest PSR from the site (curated polar sites). */
  ice?: IceSummary
}

export interface SiteDetail {
  site: Site
  mask: HorizonMask
  /** Distance to the horizon-defining terrain per mask bin, km (curated sites only). */
  obstructionKm?: number[]
  /** Provenance as published (Spanish); `sourceKey` is the translatable form when known. */
  source: string
  sourceKey?: MsgKey
  sourceParams?: MsgParams
  terrain?: { file: string; meta: DemMeta }
  /** Yearly illumination map of the tile (PSR layer), when generated. */
  illum?: { file: string; meta: IllumMeta }
  /** Resolution of the finest DEM behind the horizon and slopes, m/px (undefined: none). */
  demResolutionM?: number
  /** User-placed point: its 20 m tile (if any) belongs to a nearby curated site. */
  custom?: boolean
}

export const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`

export const COARSE_DEM: DemRef & { meta: string } = {
  bin: asset('data/dem/south_480m.bin'),
  meta: asset('data/dem/south_480m.json'),
}
export const MACRO_DEM = {
  bin: asset('data/dem/south_960m.bin'),
  meta: asset('data/dem/south_960m.json'),
}

/** The 480 m DEM covers 75°S-90°S; keep a margin so the 300 km horizon march is useful. */
export const CUSTOM_DEM_MAX_LAT = -75.5

interface IndexEntry {
  id: string
  lat: number
  lon: number
  heightM: number
  accuracy: Accuracy
  hasTerrain: boolean
  slopeCenterDeg?: number
  slopeP90Deg?: number
  ice?: IceSummary
}

/** Curated seeds, refined with the pipeline output when available. */
export async function loadSiteIndex(): Promise<SiteInfo[]> {
  let index: IndexEntry[] = []
  try {
    const res = await fetch(asset('data/sites/index.json'))
    if (res.ok) index = await res.json()
  } catch {
    // Without data the app still works with spherical horizons.
  }
  return SITE_SEEDS.map((seed) => {
    const e = index.find((i) => i.id === seed.id)
    return e
      ? {
          ...seed,
          lat: e.lat,
          lon: e.lon,
          heightM: e.heightM,
          accuracy: e.accuracy,
          hasTerrain: e.hasTerrain,
          // Sites without terrain use an ideal flat horizon: treat them as level ground.
          slopeCenterDeg: e.slopeCenterDeg ?? (e.hasTerrain ? undefined : 0),
          slopeP90Deg: e.slopeP90Deg ?? (e.hasTerrain ? undefined : 0),
          ice: e.ice,
        }
      : { ...seed, heightM: 0, accuracy: 'spherical', hasTerrain: false }
  })
}

const detailCache = new Map<string, Promise<SiteDetail>>()

/**
 * A curated site's terrain tile (20 m polar, or 60 m local for the reference sites), reusable
 * for any user point that falls inside it.
 */
export interface TileRef {
  siteId: string
  file: string
  meta: DemMeta
  illum?: { file: string; meta: IllumMeta }
}

let tilesPromise: Promise<TileRef[]> | null = null

/** All published terrain tiles (one per curated site). Empty without generated data. */
export function polarTiles(): Promise<TileRef[]> {
  tilesPromise ??= (async () => {
    try {
      const res = await fetch(asset('data/sites/index.json'))
      if (!res.ok) return []
      const index: IndexEntry[] = await res.json()
      const tiles = await Promise.all(
        index
          .filter((e) => e.hasTerrain)
          .map(async (e) => {
            const r = await fetch(asset(`data/sites/${e.id}.json`))
            if (!r.ok) return null
            const j = await r.json()
            return j.terrain
              ? ({
                  siteId: e.id,
                  file: j.terrain.file,
                  meta: j.terrain.meta,
                  illum: j.illum,
                } as TileRef)
              : null
          }),
      )
      return tiles.filter((t): t is TileRef => t !== null)
    } catch {
      return []
    }
  })()
  return tilesPromise
}

/** The tile that contains (lat, lon) with the most margin, i.e. nearest its centre. */
export function tileFor(tiles: readonly TileRef[], lat: number, lon: number) {
  let best: TileRef | undefined
  let bestD = Infinity
  for (const t of tiles) {
    if (!demCovers(t.meta, lat, lon, 8)) continue
    const { c, r } = latLonToPixel(t.meta, lat, lon)
    // Metres, not pixels: tiles come in two resolutions.
    const d = Math.hypot(c - t.meta.width / 2, r - t.meta.height / 2) * t.meta.scaleM
    if (d < bestD) {
      bestD = d
      best = t
    }
  }
  return best
}

const tileDem = (terrain: { file: string; meta: DemMeta }): DemRef => ({
  bin: asset(`data/${terrain.file}`),
  meta: terrain.meta,
})

/**
 * DEM stack (finest first) behind a site, for worker requests such as dispersion. A reference
 * site outside the polar cap only has its 60 m tile (rasters may differ in projection).
 */
export function demRefs(detail: SiteDetail): DemRef[] {
  const coarse = detail.site.lat <= CUSTOM_DEM_MAX_LAT ? [COARSE_DEM] : []
  return detail.terrain ? [tileDem(detail.terrain), ...coarse] : coarse
}

/**
 * Reach of a reference site's 60 m tile (±30.7 km square) for user points: inside this radius
 * the point gets the tile's terrain, with a horizon limited to what the tile contains.
 */
const GLOBAL_TILE_REACH_M = 28_000

const inGlobalTile = (lat: number, lon: number) =>
  SITE_SEEDS.some(
    (s) => !usesPolarProduct(s) && surfaceDistance(s.lat, s.lon, lat, lon) <= GLOBAL_TILE_REACH_M,
  )

export function customSiteInfo(lat: number, lon: number): SiteInfo {
  const inPolar = lat <= CUSTOM_DEM_MAX_LAT
  const inGlobal = !inPolar && inGlobalTile(lat, lon)
  const inDem = inPolar || inGlobal
  return {
    id: `custom:${lat.toFixed(4)}:${lon.toFixed(4)}`,
    name: `Personalizado ${Math.abs(lat).toFixed(2)}°${lat < 0 ? 'S' : 'N'} ${Math.abs(lon).toFixed(2)}°${lon < 0 ? 'O' : 'E'}`,
    mission: 'Coordenadas del usuario',
    description: inPolar
      ? 'Horizonte calculado en tu navegador con el DEM LOLA de 480 m/px.'
      : inGlobal
        ? 'Horizonte calculado en tu navegador con el tile LOLA de 60 m/px del sitio de referencia cercano.'
        : 'Fuera de los DEM publicados: se usa un horizonte esférico ideal.',
    category: 'south-pole',
    lat,
    lon,
    snapRadiusM: 0,
    heightM: 0,
    accuracy: inPolar ? 'lola-480' : inGlobal ? 'lola-global' : 'spherical',
    hasTerrain: inDem,
    custom: true,
  }
}

async function fetchDetail(info: SiteInfo): Promise<SiteDetail> {
  if (info.custom) {
    const inPolar = info.lat <= CUSTOM_DEM_MAX_LAT
    // Inside a curated tile (e.g. a point picked on the terrain): full-resolution horizon
    // near the site; beyond it, the 480 m polar DEM where it exists. Around a reference site
    // there is nothing published past its 60 m tile, so the horizon stops at the tile's edge.
    const tile =
      inPolar || info.accuracy === 'lola-global'
        ? tileFor(await polarTiles(), info.lat, info.lon)
        : undefined
    if (inPolar || tile) {
      const dems = [...(tile ? [tileDem(tile)] : []), ...(inPolar ? [COARSE_DEM] : [])]
      const h = await runCustomHorizon(info.lat, info.lon, dems, tile ? 0.5 : 1)
      const local = Boolean(tile?.meta.projection)
      return {
        site: { lat: info.lat, lon: info.lon, heightM: h.heightM },
        mask: h.mask,
        source: !tile
          ? 'LOLA LDEM_75S_240M remuestreado a 480 m/px (calculado en el navegador)'
          : local
            ? `LOLA global ${tile.meta.scaleM} m/px (tile de ${tile.siteId}), calculado en el navegador`
            : `LOLA LDEM_80S_20M (tile de ${tile.siteId}) + 480 m/px, calculado en el navegador`,
        sourceKey: !tile ? 'source.coarse' : local ? 'source.globalTile' : 'source.tile',
        sourceParams: tile ? { site: tile.siteId, res: tile.meta.scaleM } : undefined,
        terrain: tile ? { file: tile.file, meta: tile.meta } : undefined,
        illum: tile?.illum,
        demResolutionM: tile ? tile.meta.scaleM : 480,
        custom: true,
      }
    }
    return {
      site: { lat: info.lat, lon: info.lon, heightM: 0 },
      mask: sphericalMask(),
      source: 'Horizonte esférico ideal (sin topografía local)',
      sourceKey: 'source.spherical',
    }
  }
  let res: Response | null = null
  try {
    res = await fetch(asset(`data/sites/${info.id}.json`))
  } catch {
    // Offline or data not generated: fall through to the ideal horizon.
  }
  if (!res?.ok) {
    return {
      site: { lat: info.lat, lon: info.lon, heightM: 0 },
      mask: sphericalMask(),
      source: 'Sin datos: ejecuta `npm run data`. Horizonte esférico ideal.',
      sourceKey: 'source.noData',
    }
  }
  const json = await res.json()
  return {
    site: { lat: json.lat, lon: json.lon, heightM: json.heightM },
    mask: json.mask,
    obstructionKm: json.mask.obstructionKm,
    source: json.source,
    sourceKey: json.terrain?.meta?.projection
      ? 'source.lolaGlobal'
      : json.terrain
        ? 'source.lola20'
        : json.mask?.obstructionKm
          ? undefined
          : 'source.spherical',
    sourceParams: json.terrain?.meta?.projection ? { res: json.terrain.meta.scaleM } : undefined,
    terrain: json.terrain,
    illum: json.illum,
    demResolutionM: json.terrain?.meta?.scaleM,
  }
}

export function loadSiteDetail(info: SiteInfo): Promise<SiteDetail> {
  let p = detailCache.get(info.id)
  if (!p) {
    p = fetchDetail(info)
    p.catch(() => detailCache.delete(info.id))
    detailCache.set(info.id, p)
  }
  return p
}

/**
 * Terrain rasters for the surface view and slopes, finest first: the site's tile (20 m polar
 * or 60 m local; plus the 480 m DEM around it for user points in the polar cap, which can
 * sit off-centre), the 480 m DEM alone, or nothing (flat plain) where no DEM is published.
 */
export function loadTerrainGrids(detail: SiteDetail): Promise<DemGrid[]> {
  const refs = detail.terrain && !detail.custom ? [tileDem(detail.terrain)] : demRefs(detail)
  return Promise.all(refs.map((d) => loadDem(d.bin, d.meta)))
}
