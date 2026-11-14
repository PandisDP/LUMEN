import { DAY_MS, HOUR_MS } from '../astro/constants.ts'
import { type Lang, getLang, t } from '../i18n/index.ts'

/** Formatters follow the UI language; components re-render on change through useT(). */
const LOCALES: Record<Lang, string> = { es: 'es-MX', en: 'en-US' }

const dateFmts = new Map<Lang, Intl.DateTimeFormat>()
const dayFmts = new Map<Lang, Intl.DateTimeFormat>()

function dateFmt(lang: Lang) {
  let f = dateFmts.get(lang)
  if (!f) {
    f = new Intl.DateTimeFormat(LOCALES[lang], {
      timeZone: 'UTC',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
    dateFmts.set(lang, f)
  }
  return f
}

function dayFmt(lang: Lang) {
  let f = dayFmts.get(lang)
  if (!f) {
    f = new Intl.DateTimeFormat(LOCALES[lang], { timeZone: 'UTC', day: '2-digit', month: 'short' })
    dayFmts.set(lang, f)
  }
  return f
}

export const formatDateTime = (ms: number) => `${dateFmt(getLang()).format(ms)} UTC`
export const formatDay = (ms: number) => dayFmt(getLang()).format(ms)

/** "3 d 4 h", "5 h 20 min", "12 min". */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) return '—'
  const abs = Math.abs(ms)
  const d = Math.floor(abs / DAY_MS)
  const h = Math.floor((abs % DAY_MS) / HOUR_MS)
  const m = Math.round((abs % HOUR_MS) / 60_000)
  if (d > 0) return `${d} d ${h} h`
  if (h > 0) return `${h} h ${m} min`
  return `${m} min`
}

export const formatHours = (h: number) => formatDuration(h * HOUR_MS)

export const formatDeg = (deg: number, digits = 2) =>
  Number.isFinite(deg) ? `${deg.toFixed(digits)}°` : '—'

export const formatPct = (pct: number, digits = 0) =>
  Number.isFinite(pct) ? `${pct.toFixed(digits)} %` : '—'

/** "500 m", "1.5 km". */
export const formatDistance = (m: number) =>
  !Number.isFinite(m) ? '—' : m < 1000 ? `${Math.round(m)} m` : `${+(m / 1000).toFixed(1)} km`

const CARDINALS: Record<Lang, string[]> = {
  es: ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'],
  en: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
}
export const cardinals = () => CARDINALS[getLang()]
export const cardinal = (az: number) => cardinals()[Math.round((((az % 360) + 360) % 360) / 45) % 8]

export const formatLatLon = (lat: number, lon: number) => {
  const west = getLang() === 'es' ? 'O' : 'W'
  return `${Math.abs(lat).toFixed(3)}°${lat < 0 ? 'S' : 'N'}, ${Math.abs(lon).toFixed(3)}°${lon < 0 ? west : 'E'}`
}

/** Value for <input type="datetime-local"> interpreted as UTC. */
export const toInputValue = (ms: number) => new Date(ms).toISOString().slice(0, 16)
export const fromInputValue = (v: string) => Date.parse(`${v}:00Z`)

/** Longest night: "no night" instead of "0 min" for always-lit stretches. */
export const formatNight = (h: number) => (h > 0 ? formatHours(h) : t('night.none'))
