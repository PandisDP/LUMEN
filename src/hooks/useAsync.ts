import { useCallback, useEffect, useRef, useState } from 'react'

export interface AsyncState<T> {
  data: T | undefined
  error: Error | undefined
  /** True while the value for the current key is being computed (stale data is kept). */
  loading: boolean
  /** Runs the factory again for the same key (the fix offered next to an error). */
  retry: () => void
}

/**
 * Runs `factory` whenever `key` changes and keeps the previous value on screen until the new
 * one arrives, so scrubbing dates never flashes empty panels. A null key disables it.
 */
export function useAsync<T>(key: string | null, factory: () => Promise<T>): AsyncState<T> {
  const [state, setState] = useState<{ key: string | null; data?: T; error?: Error }>({ key: null })
  const [attempt, setAttempt] = useState(0)
  // What was asked for: the key plus the retry count, so a retry reads as loading again.
  const run = key === null ? null : `${key}#${attempt}`
  const factoryRef = useRef(factory)
  useEffect(() => {
    factoryRef.current = factory
  })

  useEffect(() => {
    if (run === null) return
    let cancelled = false
    factoryRef
      .current()
      .then((data) => !cancelled && setState({ key: run, data }))
      .catch((error: Error) => !cancelled && setState((s) => ({ key: run, data: s.data, error })))
    return () => {
      cancelled = true
    }
  }, [run])
  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  return {
    data: state.data,
    error: state.error,
    loading: run !== null && state.key !== run,
    retry,
  }
}
