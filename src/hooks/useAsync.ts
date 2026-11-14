import { useEffect, useRef, useState } from 'react'

export interface AsyncState<T> {
  data: T | undefined
  error: Error | undefined
  /** True while the value for the current key is being computed (stale data is kept). */
  loading: boolean
}

/**
 * Runs `factory` whenever `key` changes and keeps the previous value on screen until the new
 * one arrives, so scrubbing dates never flashes empty panels. A null key disables it.
 */
export function useAsync<T>(key: string | null, factory: () => Promise<T>): AsyncState<T> {
  const [state, setState] = useState<{ key: string | null; data?: T; error?: Error }>({ key: null })
  const factoryRef = useRef(factory)
  useEffect(() => {
    factoryRef.current = factory
  })

  useEffect(() => {
    if (key === null) return
    let cancelled = false
    factoryRef
      .current()
      .then((data) => !cancelled && setState({ key, data }))
      .catch((error: Error) => !cancelled && setState((s) => ({ key, data: s.data, error })))
    return () => {
      cancelled = true
    }
  }, [key])

  return { data: state.data, error: state.error, loading: key !== null && state.key !== key }
}
