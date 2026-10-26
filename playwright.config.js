import { defineConfig, devices } from '@playwright/test'
import { readFileSync } from 'fs'
import { resolve } from 'path'

try {
  const envFile = readFileSync(resolve(process.cwd(), '.env'), 'utf-8')
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[key]) process.env[key] = val
  }
} catch { /* .env not found */ }

// Default: test a production build (mode "e2e") served by `vite preview`
// -- a few bundled files per page instead of the dev server's hundreds of
// separate modules, which made every test's first page load slow.
// PW_DEV=1 switches back to the dev server (handy while debugging a test
// against code you're editing, since it needs no rebuild).
const useDevServer = process.env.PW_DEV === '1'
const appUrl = useDevServer ? 'http://localhost:5173' : 'http://localhost:4173'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,

  reporter: process.env.CI
    ? [['github'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : [
        ['list'],
        ['html', { outputFolder: 'playwright-report', open: 'never' }],
      ],

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || appUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },

  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.js/,
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
      testIgnore: /auth\/logout\.spec\.js/,
    },
    // Logout runs last in its own project — signing out invalidates the
    // shared session token and would break concurrent tests if run alongside
    {
      name: 'chromium-logout',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['chromium', 'firefox', 'mobile-chrome', 'mobile-safari'],
      testMatch: /auth\/logout\.spec\.js/,
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      dependencies: ['setup'],
      testIgnore: /auth\/logout\.spec\.js/,
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
      dependencies: ['setup'],
      testIgnore: /auth\/logout\.spec\.js|photographer\/|admin\//,
      retries: 1,
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 13'] },
      dependencies: ['setup'],
      testIgnore: /auth\/logout\.spec\.js|photographer\/|admin\//,
      retries: 1,
    },
  ],

  webServer: useDevServer
    ? {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
      }
    : {
        // Fresh build every run, so tests never hit a stale bundle.
        command: 'FV_E2E_BUILD=1 npx vite build --mode e2e --outDir dist-e2e && npx vite preview --outDir dist-e2e --port 4173 --strictPort',
        url: 'http://localhost:4173',
        reuseExistingServer: false,
        timeout: 180_000,
      },
})
