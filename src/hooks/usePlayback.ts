import { roverTelemetry } from '../scene/micro/roverTelemetry.ts'
import { useEffect } from 'react'
import { useDescentStore } from '../store/useDescentStore.ts'
import { maxMissionDays, useMissionStore } from '../store/useMissionStore.ts'

/** Real-time playback: advances the shared mission time while `playing` is on. */
export function usePlayback() {
  const playing = useMissionStore((s) => s.playing)
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    let acc = 0
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      acc += dt
      // ~30 updates per second is plenty for the panels and keeps React work bounded.
      // The descent replays at a fixed mission time: the lighting must not drift under it.
      const descending =
        useMissionStore.getState().view === 'landing' && !useDescentStore.getState().landed
      // During the rover traverse the rover's own clock sets the mission time.
      if (descending || roverTelemetry.active) acc = 0
      else if (acc >= 1 / 30) {
        const s = useMissionStore.getState()
        const next = s.offsetH + acc * s.speed
        const end = maxMissionDays(s) * 24
        s.setOffset(next)
        if (next >= end) useMissionStore.setState({ playing: false })
        acc = 0
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])
}
