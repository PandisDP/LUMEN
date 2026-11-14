import { Canvas } from '@react-three/fiber'
import { Suspense, useEffect, useState } from 'react'
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
import { BottomPanel } from './ui/BottomPanel.tsx'
import { CollapsiblePanel } from './ui/CollapsiblePanel.tsx'
import { CompareView } from './ui/CompareView.tsx'
import { HardwareFilter } from './ui/HardwareFilter.tsx'
import { ExplainPanel } from './ui/ExplainPanel.tsx'
import { IconPin } from './ui/icons.tsx'
import { Loader } from './ui/Loader.tsx'
import { MetricsPanel } from './ui/MetricsPanel.tsx'
import { SitePicker } from './ui/SitePicker.tsx'
import { Splash } from './ui/Splash.tsx'
import { StepHint } from './ui/StepBar.tsx'
import { TopBar } from './ui/TopBar.tsx'
import { Tour } from './ui/Tour.tsx'
import { ViewHud } from './ui/ViewHud.tsx'
import { ChooseSite, Welcome } from './ui/Welcome.tsx'

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
  const t = useT()
  const exploring = stage === 'explore'

  useEffect(() => {
    loadSiteIndex().then((sites) => {
      useMissionStore.getState().setSites(sites)
      setReady(true)
    })
  }, [])
  useUrlSync(ready)
  usePlayback()
  usePanelShortcuts()

  const cls = [
    'app',
    !exploring && 'app--intro',
    panelsHidden && 'app--focus',
    exploring && panels.left && 'app--left-open',
    exploring && panels.right && 'app--right-open',
    exploring && panels.bottom && 'app--bottom-open',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={cls}>
      <div className="stage" data-tour="stage">
        <Canvas shadows gl={{ logarithmicDepthBuffer: true, antialias: true }} dpr={[1, 2]}>
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
          {ready && <AssistantFab />}
        </>
      )}
      {!splash && ready && stage === 'welcome' && <Welcome />}
      {!splash && ready && stage === 'choose' && <ChooseSite />}
      <Tour />
      <Loader />
      {splash && <Splash ready={ready} onDone={() => setSplash(false)} />}
    </div>
  )
}
