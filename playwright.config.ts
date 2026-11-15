import { defineConfig } from '@playwright/test'

/**
 * End-to-end smoke tests against the production build (`npm run build` first; `npm run test:e2e`
 * does both). Locally they drive the installed Chrome, with the GPU, so the 3D scenes render at
 * full speed; in CI (no Chrome channel) Playwright's own Chromium and software WebGL are used.
 */
const ci = !!process.env.CI
export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: ci ? 1 : 0,
  reporter: ci ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:4173/',
    viewport: { width: 1440, height: 900 },
    channel: ci ? undefined : 'chrome',
    launchOptions: {
      args: ci
        ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
        : ['--enable-gpu', '--ignore-gpu-blocklist'],
    },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: !ci,
    timeout: 60_000,
  },
})
