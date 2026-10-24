import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests of the real app, built for production and served by
 * `vite preview`. Synthetic data only. No retries: a check that fails once fails.
 * Run with `npm run test:e2e` (builds first).
 */
const PORT = 4317

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [['list']],
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    timezoneId: 'Europe/Madrid',
    locale: 'es-ES',
    // Each test starts from an empty origin; a service worker would carry state between them.
    serviceWorkers: 'block',
    acceptDownloads: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
