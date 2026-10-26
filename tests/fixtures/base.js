// tests/fixtures/base.js
//
// Per-worker test accounts, so the suite can run in parallel.
//
// Every test used to share one photographer account (PLAYWRIGHT_TEST_EMAIL).
// Running tests side by side would flip that account's tier, microsite and
// settings under each other, so the suite ran on one worker (~20 min).
//
// Now each parallel worker signs in as its own "pool" account
// (playwright+pool<N>@..., created and logged in by auth.setup.js). Tests
// that need the MAIN account -- its pre-seeded fixture galleries, admin
// rights -- run in the main group (see MAIN_ACCOUNT_FILES in
// playwright.config.js), one at a time, exactly as before.
//
// How a test finds "its" account doesn't change: a worker-scoped auto
// fixture below points process.env.PLAYWRIGHT_TEST_EMAIL at the worker's
// account before any test or hook in that worker runs, so every existing
// `users.find(u => u.email === process.env.PLAYWRIGHT_TEST_EMAIL)` keeps
// working. Logged-in pages use photographerState instead of the old fixed
// 'tests/.auth/photographer.json' path.
//
// Every spec file imports { test, expect } from here, not from
// '@playwright/test' directly -- otherwise the identity fixture never runs.

import { test as base, expect } from '@playwright/test'

export { expect }

// Parallel workers for the pool group. The main group always has 1 more.
export const POOL_WORKERS = Number(process.env.PW_POOL_WORKERS || 4)
// A pool worker's account is picked by its parallel slot (0 .. total-1);
// one slot is always busy with the main group, so the pool needs one
// account per slot to be sure every pool worker gets a unique one.
export const POOL_SIZE = POOL_WORKERS + 1

// Captured once per process, before the identity fixture below changes it.
process.env.FV_MAIN_EMAIL ||= process.env.PLAYWRIGHT_TEST_EMAIL || ''
export const MAIN_EMAIL = process.env.FV_MAIN_EMAIL

export const MAIN_AUTH_STATE = 'tests/.auth/photographer.json'

export function poolEmail(i) {
  const [user, domain] = MAIN_EMAIL.split('@')
  return `${user}+pool${i}@${domain}`
}

export function poolAuthState(i) {
  return `tests/.auth/photographer-pool-${i}.json`
}

export function isTestAccountEmail(email) {
  if (!email) return false
  if (email === MAIN_EMAIL) return true
  const [user, domain] = MAIN_EMAIL.split('@')
  return new RegExp(`^${user.replace(/[.+]/g, '\\$&')}\\+pool\\d+@${domain.replace(/[.]/g, '\\.')}$`).test(email)
}

export const test = base.extend({
  // 'main' for the main group and setup (playwright.config.js), 'pool' otherwise.
  fvAccount: ['pool', { option: true, scope: 'worker' }],

  _fvIdentity: [async ({ fvAccount }, use, workerInfo) => {
    const i = workerInfo.parallelIndex
    process.env.PLAYWRIGHT_TEST_EMAIL = fvAccount === 'main' ? MAIN_EMAIL : poolEmail(i)
    process.env.FV_AUTH_STATE = fvAccount === 'main' ? MAIN_AUTH_STATE : poolAuthState(i)
    await use()
  }, { scope: 'worker', auto: true }],
})

// test.use({ storageState: photographerState }) -- the signed-in session
// for this worker's account.
export const photographerState = async ({}, provide) => provide(process.env.FV_AUTH_STATE)

// This worker's photographer id, looked up once per worker.
let cachedId = null
export async function currentPhotographerId(sb) {
  if (cachedId?.email === process.env.PLAYWRIGHT_TEST_EMAIL) return cachedId.id
  const { data, error } = await sb.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw new Error(`Could not list auth users: ${error.message}`)
  const user = data.users.find(u => u.email === process.env.PLAYWRIGHT_TEST_EMAIL)
  if (!user) throw new Error(`Test account ${process.env.PLAYWRIGHT_TEST_EMAIL} not found`)
  cachedId = { email: process.env.PLAYWRIGHT_TEST_EMAIL, id: user.id }
  return user.id
}
