import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'
import { useLangStore } from '../i18n/index.ts'

// UI tests assert Spanish copy; pin the language so the jsdom browser locale doesn't matter.
beforeEach(() => {
  useLangStore.setState({ lang: 'es' })
})

afterEach(() => {
  cleanup()
})
