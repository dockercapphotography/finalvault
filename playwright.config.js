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

// Parallel runs (see tests/fixtures/base.js): the pool group gets this
// many workers, each signed in as its own test account; the main group
// below always gets 1 more. Keep in step with POOL_WORKERS in base.js
// (both read PW_POOL_WORKERS). PW_POOL_WORKERS=0 = old single-worker run.
const POOL_WORKERS = Number(process.env.PW_POOL_WORKERS || 4)

// Files that must run on the MAIN account, one at a time: they use the
// pre-seeded fixture galleries (owned by the main account, with real
// images in R2 -- and their viewer data is wiped between tests), or need
// admin rights.
const MAIN_ACCOUNT_FILES = [
  'admin/user-management',
  'client/all-sessions-booking', 'client/booking-branding-and-covers', 'client/comments',
  'client/download-zip', 'client/favorites', 'client/gallery-browse', 'client/review-image-access',
  'client/review-page', 'client/zip-queue',
  'photographer/activity-feed', 'photographer/client-favorites', 'photographer/crm',
  'photographer/gallery-lightbox-swipe', 'photographer/microsite-testimonials-editor',
  'photographer/onboarding', 'photographer/rename-modal', 'photographer/review-requests',
  'photographer/zip-job-monitor', // admin-only Maintenance tab
].map(f => new RegExp(`${f}\\.spec\\.js$`))

export default defineConfig({
  testDir: './tests/e2e',
  // Off: a file's tests run together, in order, on one worker.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // 1 locally: parallel runs occasionally exceed a short wait. A retried
  // pass is reported as "flaky", so nothing is hidden.
  retries: process.env.CI ? 2 : 1,
  workers: POOL_WORKERS + 1,

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
      use: { fvAccount: 'main' },
    },
    // Both groups are named "chromium" on purpose: --project=chromium runs
    // them together. See tests/fixtures/base.js.
    {
      // Main account, one test file at a time (as before).
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], fvAccount: 'main' },
      dependencies: ['setup'],
      testMatch: POOL_WORKERS > 0 ? MAIN_ACCOUNT_FILES : /.*\.spec\.js/,
      testIgnore: /auth\/logout\.spec\.js/,
      workers: 1,
    },
    ...(POOL_WORKERS > 0 ? [{
      // Everything else, side by side, one pool account per worker.
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], fvAccount: 'pool' },
      dependencies: ['setup'],
      testIgnore: [/auth\/logout\.spec\.js/, ...MAIN_ACCOUNT_FILES],
      workers: POOL_WORKERS,
    }] : []),
    // Logout signs the main account out everywhere, so it must never run
    // alongside other tests: run it on its own with --project=chromium-logout.
    // (It can't list "chromium" as a dependency any more -- two projects
    // share that name.)
    {
      name: 'chromium-logout',
      use: { ...devices['Desktop Chrome'], fvAccount: 'main' },
      dependencies: ['setup'],
      testMatch: /auth\/logout\.spec\.js/,
    },
    // The cross-browser projects keep the old single-account behavior.
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], fvAccount: 'main' },
      dependencies: ['setup'],
      testIgnore: /auth\/logout\.spec\.js/,
      workers: 1,
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'], fvAccount: 'main' },
      dependencies: ['setup'],
      testIgnore: /auth\/logout\.spec\.js|photographer\/|admin\//,
      retries: 1,
      workers: 1,
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 13'], fvAccount: 'main' },
      dependencies: ['setup'],
      testIgnore: /auth\/logout\.spec\.js|photographer\/|admin\//,
      retries: 1,
      workers: 1,
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
