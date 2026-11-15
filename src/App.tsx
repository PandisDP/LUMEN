import { Canvas } from '@react-three/fiber'
import { Suspense, useEffect, useRef, useState } from 'react'
import { loadSiteIndex } from './data/catalog.ts'
import { usePanelShortcuts } from './hooks/usePanelShortcuts.ts'
import { usePlayback } from './hooks/usePlayback.ts'
import { useUrlSync } from './hooks/useUrlSync.ts'
import { Experience } from './scene/Experience.tsx'
import { useT } from './i18n/index.ts'
import { useSiteText } from './i18n/sites.ts'
import { findSite, selectActiveScenario, useMissionStore } from './store/useMissionStore.ts'
import { useUiStore } from './store/useUiStore.ts'
import { AssistantFab } from './ui/AssistantFab.tsx'
import { useShow } from './ui/audience.ts'
import { BottomPanel } from './ui/BottomPanel.tsx'
import { Challenges } from './ui/Challenges.tsx'
import { CollapsiblePanel } from './ui/CollapsiblePanel.tsx'
import { CompareView } from './ui/CompareView.tsx'
import { HardwareFilter } from './ui/HardwareFilter.tsx'
import { ExplainPanel } from './ui/ExplainPanel.tsx'
import { IconPin } from './ui/icons.tsx'
import { Loader } from './ui/Loader.tsx'
import { MetricsPanel } from './ui/MetricsPanel.tsx'
import { Planner } from './ui/Planner.tsx'
import { SitePicker } from './ui/SitePicker.tsx'
import { Splash } from './ui/Splash.tsx'
import { StepHint } from './ui/StepBar.tsx'
import { TopBar } from './ui/TopBar.tsx'
import { Tour } from './ui/Tour.tsx'
import { ViewHud } from './ui/ViewHud.tsx'
import { ChooseSite, Welcome } from './ui/Welcome.tsx'

/** Session flag: the "Why?" cards were already shown automatically (reloads don't repeat it). */
const EXPLAINED_KEY = 'lumen3d.explained'

/** Collapsed header of the site panel: the active site. */
function SiteSummary() {
  const siteText = useSiteText()
  const site = useMissionStore((s) => findSite(s.sites, selectActiveScenario(s).siteId))
  return <span className="panel__site">{siteText(site)?.name ?? '…'}</span>
}

export default function App() {
  const [ready, setReady] = useState(false)
  const [splash, setSplash] = useState(true)
  const view = useMissionStore((s) => s.view)
  const panelsHidden = useMissionStore((s) => s.panelsHidden)
  const panels = useUiStore((s) => s.panels)
  const stage = useUiStore((s) => s.stage)
  const audience = useUiStore((s) => s.audience)
  // The map and the seasons chart need more room than the timeline strips.
  const tallBottom = useMissionStore((s) => s.bottomPanel === 'map' || s.bottomPanel === 'seasons')
  const explainAuto = useShow('explainAuto')
  const t = useT()
  const exploring = stage === 'explore'

  // Educators and the public get the "Why?" cards first; once per session, not on every visit.
  const explained = useRef(false)
  useEffect(() => {
    if (!exploring || !explainAuto || explained.current) return
    explained.current = true
    // Arriving through "Play the challenges": that overlay is the introduction.
    if (useUiStore.getState().challengesOpen) return
    try {
      if (sessionStorage.getItem(EXPLAINED_KEY)) return
      sessionStorage.setItem(EXPLAINED_KEY, '1')
    } catch {
      // Storage blocked: fall back to once per page load.
    }
    useMissionStore.getState().setExplainOpen(true)
  }, [exploring, explainAuto])

  useEffect(() => {
    loadSiteIndex().then((sites) => {
      useMissionStore.getState().setSites(sites)
      setReady(true)
    })
  }, [])
  useUrlSync(ready)
  usePlayback()
  // The planner step belongs to the planner audience: the others choose among the Top 3.
  useEffect(() => {
    if (stage === 'plan' && audience !== 'planner') useUiStore.getState().setStage('choose')
  }, [stage, audience])
  usePanelShortcuts()

  const cls = [
    'app',
    `app--${audience}`,
    !exploring && 'app--intro',
    panelsHidden && 'app--focus',
    exploring && panels.left && 'app--left-open',
    exploring && panels.right && 'app--right-open',
    exploring && panels.bottom && 'app--bottom-open',
    exploring && panels.bottom && tallBottom && 'app--bottom-tall',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={cls}>
      <div className="stage" data-tour="stage">
        {/* zIndex 0: the 3D labels (drei <Html>) get their own stacking context, below the HUD. */}
        <Canvas
          shadows
          gl={{ logarithmicDepthBuffer: true, antialias: true }}
          dpr={[1, 2]}
          style={{ zIndex: 0 }}
        >
          <Suspense fallback={null}>{ready && <Experience />}</Suspense>
        </Canvas>
        {/* Short fade when switching between orbit and surface. */}
        <div className="stage__fade" key={view} aria-hidden />
        <div className="stage__vignette" aria-hidden />
        {exploring && <ViewHud />}
      </div>
      <TopBar />
      {exploring && (
        <>
          <StepHint />
          <CollapsiblePanel
            id="left"
            title={t('panel.left')}
            label={t('app.sitePanel')}
            icon={<IconPin />}
            help="sites"
            summary={ready && <SiteSummary />}
          >
            {ready ? <SitePicker /> : <p className="hint">{t('app.loadingSites')}</p>}
          </CollapsiblePanel>
          <MetricsPanel />
          <BottomPanel />
          <CompareView />
          <HardwareFilter />
          <ExplainPanel />
          <Challenges />
          {ready && <AssistantFab />}
        </>
      )}
      {!splash && ready && stage === 'welcome' && <Welcome />}
      {!splash && ready && stage === 'choose' && <ChooseSite />}
      {!splash && ready && stage === 'plan' && <Planner />}
      <Tour />
      <Loader />
      {splash && <Splash ready={ready} onDone={() => setSplash(false)} />}
    </div>
  )
}
