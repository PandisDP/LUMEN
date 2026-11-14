import { Html, Line } from '@react-three/drei'
import { useMemo } from 'react'
import type { DemGrid } from '../../astro/dem.ts'
import { sampleDemStack } from '../../astro/dem.ts'
import type { DispersionPoint } from '../../astro/dispersion.ts'
import { destination } from '../../astro/frames.ts'
import { SLOPE_CAUTION_DEG } from '../../astro/slope.ts'
import { latLonToScene } from '../../astro/terrainMesh.ts'
import type { SiteDetail } from '../../data/catalog.ts'
import { useIceAccess } from '../../hooks/useScience.ts'
import { useDispersion } from '../../hooks/useTerrain.ts'
import { useT } from '../../i18n/index.ts'
import { selectActiveScenario, useMissionStore } from '../../store/useMissionStore.ts'
import { scoreLevel } from '../../ui/levels.ts'
import { relocateTo } from './relocate.ts'

type P3 = [number, number, number]

/** The landing-dispersion circle, draped on the terrain. */
export function EllipseRing({ detail, grids }: { detail: SiteDetail; grids: DemGrid[] }) {
  const radius = useMissionStore((s) => s.ellipseRadiusM)
  const aerial = useMissionStore((s) => s.aerial)
  const points = useMemo(() => {
    if (!radius) return null
    const pts: P3[] = []
    for (let az = 0; az <= 360; az += 3) {
      const p = destination(detail.site.lat, detail.site.lon, az, radius)
      const h = grids.length ? sampleDemStack(grids, p.lat, p.lon) : NaN
      pts.push(
        latLonToScene(
          detail.site,
          p.lat,
          p.lon,
          (Number.isNaN(h) ? detail.site.heightM : h) + (aerial ? 4 : 1),
        ) as P3,
      )
    }
    return pts
  }, [detail, grids, radius, aerial])
  if (!points) return null
  return (
    <Line
      points={points}
      color="#ffffff"
      lineWidth={aerial ? 2.5 : 1.5}
      transparent
      opacity={0.9}
    />
  )
}

function Marker({ p, site }: { p: DispersionPoint; site: SiteDetail['site'] }) {
  const t = useT()
  const steep = p.slopeDeg >= SLOPE_CAUTION_DEG
  const pos = latLonToScene(site, p.lat, p.lon, p.heightM + 3) as P3
  const label = t('dispersion.marker', {
    score: p.score,
    sun: Math.round(p.sunlitPct),
    dte: Math.round(p.dtePct),
    slope: Number.isFinite(p.slopeDeg) ? p.slopeDeg.toFixed(1) : '?',
  })
  return (
    <Html position={pos} center zIndexRange={[20, 10]}>
      <button
        type="button"
        className="dmark"
        data-level={scoreLevel(p.score)}
        data-steep={steep}
        title={label}
        aria-label={label}
        onClick={() => p.distM > 0 && relocateTo(p.lat, p.lon)}
      >
        {steep && <span aria-hidden>✕ </span>}
        {p.score}
      </button>
    </Html>
  )
}

/** Score of each sampled landing point; click one to move the site there. */
export function DispersionMarkers({ detail }: { detail: SiteDetail }) {
  const scenario = useMissionStore(selectActiveScenario)
  const { data, loading } = useDispersion(scenario)
  const sameSite = data && data.input.lat === detail.site.lat && data.input.lon === detail.site.lon
  if (!data || loading || !sameSite) return null
  return (
    <>
      {data.points.map((p, i) => (
        <Marker key={i} p={p} site={detail.site} />
      ))}
    </>
  )
}

/** The rover route to the nearest permanently shadowed ground, draped on the terrain. */
export function IceRoute({ detail, grids }: { detail: SiteDetail; grids: DemGrid[] }) {
  const t = useT()
  const aerial = useMissionStore((s) => s.aerial)
  const { data } = useIceAccess(detail)
  const points = useMemo(() => {
    if (!data?.reachable || data.path.length < 2) return null
    return data.path.map((p) => {
      const h = sampleDemStack(grids, p.lat, p.lon)
      return latLonToScene(
        detail.site,
        p.lat,
        p.lon,
        (Number.isNaN(h) ? detail.site.heightM : h) + (aerial ? 5 : 1.5),
      ) as P3
    })
  }, [data, grids, detail, aerial])
  if (!points) return null
  const end = points[points.length - 1]
  return (
    <>
      <Line
        points={points}
        color="#7fd4ff"
        lineWidth={aerial ? 3 : 2}
        dashed
        dashSize={30}
        gapSize={15}
      />
      <Html position={end} center className="label label--ice" style={{ pointerEvents: 'none' }}>
        <span aria-hidden>❄</span> {t('scene.ice', { d: Math.round(data!.routeM ?? 0) })}
      </Html>
    </>
  )
}
