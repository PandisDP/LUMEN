import { type FormEvent, useState } from 'react'
import {
  type HorizonsBody,
  horizonsUrl,
  moonTrekUrl,
  quickmapUrl,
} from '../config/externalLinks.ts'
import { type SiteInfo, customSiteInfo } from '../data/catalog.ts'
import { type MsgKey, useT } from '../i18n/index.ts'
import { useSiteText } from '../i18n/sites.ts'
import { findSite, selectActiveScenario, useMissionStore } from '../store/useMissionStore.ts'
import { useUiStore } from '../store/useUiStore.ts'
import { formatLatLon } from './format.ts'
import { MoonLocator } from './MoonLocator.tsx'
import { TopSites } from './TopSites.tsx'
import { useShow } from './audience.ts'

const ACCURACY_LABEL: Record<SiteInfo['accuracy'], MsgKey> = {
  lola: 'acc.lola',
  'lola-480': 'acc.lola480',
  'lola-global': 'acc.lolaGlobal',
  spherical: 'acc.spherical',
}

/**
 * Opens the active site (curated, relocated or custom) in the two NASA/ASU map portals, and the
 * mission window in JPL Horizons (Sun and Earth as seen from the site, hourly).
 */
function ActiveSiteLinks({ site }: { site: SiteInfo | undefined }) {
  const t = useT()
  const scenario = useMissionStore(selectActiveScenario)
  if (!site) return null
  const horizons = (body: HorizonsBody) =>
    horizonsUrl(body, site.lat, site.lon, site.heightM, scenario.startMs, scenario.missionDays)
  return (
    <div className="sites__links" data-tour="links">
      <p className="panel__label">{t('links.title')}</p>
      <div className="sites__links-row">
        <a
          className="btn"
          href={horizons('sun')}
          target="_blank"
          rel="noopener noreferrer"
          title={t('links.horizonsTitle')}
        >
          Horizons ☀ ↗
        </a>
        <a
          className="btn"
          href={horizons('earth')}
          target="_blank"
          rel="noopener noreferrer"
          title={t('links.horizonsTitle')}
        >
          Horizons ⊕ ↗
        </a>
        <a
          className="btn"
          href={quickmapUrl(site.lat, site.lon)}
          target="_blank"
          rel="noopener noreferrer"
          title={t('links.quickmapTitle')}
        >
          LROC QuickMap ↗
        </a>
        <a
          className="btn"
          href={moonTrekUrl(site.lat, site.lon)}
          target="_blank"
          rel="noopener noreferrer"
          title={t('links.trekTitle')}
        >
          Moon Trek ↗
        </a>
      </div>
    </div>
  )
}

/** Latitude/longitude form; `onSite` receives the new custom site (default: use it now). */
export function CustomSiteForm({ onSite }: { onSite?: (site: SiteInfo) => void }) {
  const t = useT()
  const [lat, setLat] = useState('-89.0')
  const [lon, setLon] = useState('-60.0')
  const addCustomSite = useMissionStore((s) => s.addCustomSite)
  const latN = Number(lat)
  const lonN = Number(lon)
  const valid =
    Number.isFinite(latN) && Math.abs(latN) <= 90 && Number.isFinite(lonN) && Math.abs(lonN) <= 180

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return
    const site = customSiteInfo(latN, lonN)
    if (onSite) onSite(site)
    else addCustomSite(site)
  }

  return (
    <form className="custom" onSubmit={submit}>
      <p className="panel__label">{t('picker.customTitle')}</p>
      <div className="custom__row">
        <label className="field">
          <span>{t('picker.lat')}</span>
          <input inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} />
        </label>
        <label className="field">
          <span>{t('picker.lon')}</span>
          <input inputMode="decimal" value={lon} onChange={(e) => setLon(e.target.value)} />
        </label>
        <button type="submit" className="btn" disabled={!valid}>
          {t('picker.use')}
        </button>
      </div>
      <p className="hint">{t('picker.customHint')}</p>
    </form>
  )
}

/** Every site, grouped (south pole, custom, reference), as one radio group. */
export function SiteList({
  value,
  onChange,
  name = 'site',
}: {
  value: string
  onChange: (siteId: string) => void
  name?: string
}) {
  const t = useT()
  const siteText = useSiteText()
  const sites = useMissionStore((s) => s.sites)
  const groups: [MsgKey, SiteInfo[]][] = [
    ['picker.group.pole', sites.filter((s) => s.category === 'south-pole' && !s.custom)],
    ['picker.group.custom', sites.filter((s) => s.custom)],
    ['picker.group.ref', sites.filter((s) => s.category === 'reference')],
  ]
  return (
    <>
      {groups.map(
        ([title, list]) =>
          list.length > 0 && (
            <fieldset key={title} className="sites__group">
              <legend className="panel__label">{t(title)}</legend>
              {list.map((site) => {
                const text = siteText(site)!
                return (
                  <label
                    key={site.id}
                    className="site"
                    data-active={site.id === value}
                    title={text.description}
                  >
                    <input
                      type="radio"
                      name={name}
                      value={site.id}
                      checked={site.id === value}
                      onChange={() => onChange(site.id)}
                    />
                    <span className="site__name">{text.name}</span>
                    <span className="site__meta">
                      {text.mission} ·{' '}
                      <span className="tag">{t(ACCURACY_LABEL[site.accuracy])}</span>
                    </span>
                    <span className="site__coords">{formatLatLon(site.lat, site.lon)}</span>
                  </label>
                )
              })}
            </fieldset>
          ),
      )}
    </>
  )
}

/**
 * Site panel: where the active site is on the Moon, the Top 3 for the current mission, and on
 * demand the whole catalogue plus custom coordinates.
 */
export function SitePicker() {
  const t = useT()
  const siteText = useSiteText()
  const sites = useMissionStore((s) => s.sites)
  const scenario = useMissionStore(selectActiveScenario)
  const selectSite = useMissionStore((s) => s.selectSite)
  const showAll = useUiStore((s) => s.showAllSites)
  const setShowAll = useUiStore((s) => s.setShowAllSites)
  const site = findSite(sites, scenario.siteId)
  const curated = sites.filter((s) => !s.custom).length
  const showCustom = useShow('customCoords')

  return (
    <div className="sites">
      {site && (
        <div className="sites__where">
          <MoonLocator points={[{ lat: site.lat, lon: site.lon }]} size={64} showCaption />
          <div>
            <p className="panel__label">{t('picker.current')}</p>
            <p className="sites__current">{siteText(site)?.name}</p>
            <p className="hint">{formatLatLon(site.lat, site.lon)}</p>
          </div>
        </div>
      )}
      <p className="panel__label">{t('top.title')}</p>
      <TopSites />
      <button
        type="button"
        className="btn btn--ghost sites__more"
        aria-expanded={showAll}
        onClick={() => setShowAll(!showAll)}
      >
        {showAll ? t('top.less') : t('top.more', { n: curated })}
      </button>
      {showAll && (
        <>
          <SiteList value={scenario.siteId} onChange={selectSite} />
          {showCustom && <CustomSiteForm />}
        </>
      )}
      <ActiveSiteLinks site={site} />
    </div>
  )
}
