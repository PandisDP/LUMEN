import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { installEphemerisTable } from './data/loadEphem.ts'
import './styles/tokens.css'
import './styles/index.css'
import './styles/flow.css'
import './styles/planner.css'
import './styles/charts.css'
import './styles/kit.css'
import './styles/killa.css'

// Main-thread copy for the per-frame sky (scene, HUD); the worker loads its own.
void installEphemerisTable()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
