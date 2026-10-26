import { createClient } from '@supabase/supabase-js'
import { test as setup, expect, MAIN_EMAIL, MAIN_AUTH_STATE, POOL_SIZE, poolEmail, poolAuthState } from '../fixtures/base.js'

// Signs in the main Playwright account and every pool account (see
// tests/fixtures/base.js), saving one session file per account. Pool
// accounts are created on first run -- like a real signup, the signup
// triggers give each its photographer row and default templates -- and
// share the main account's password, so no new secrets are needed.

setup.setTimeout(180_000)

function admin() {
  return createClient(
    process.env.PLAYWRIGHT_SUPABASE_URL,
    process.env.PLAYWRIGHT_SUPABASE_SERVICE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function ensurePoolAccounts() {
  const sb = admin()
  const { data, error } = await sb.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw new Error(`Could not list auth users: ${error.message}`)
  const password = process.env.PLAYWRIGHT_TEST_PASSWORD

  for (let i = 0; i < POOL_SIZE; i++) {
    const email = poolEmail(i)
    const existing = data.users.find(u => u.email === email)
    if (existing) {
      // Keep the password in step with the main account's.
      const { error: updErr } = await sb.auth.admin.updateUserById(existing.id, { password })
      if (updErr) throw new Error(`Could not update ${email}: ${updErr.message}`)
      // Reset the name tests may have changed, so pool accounts never
      // collide with names other tests look for (e.g. the admin tests'
      // "Test Studio", which belongs to the main account).
      const { error: nameErr } = await sb.from('photographers')
        .update({ display_name: `Playwright Pool ${i}` }).eq('id', existing.id)
      if (nameErr) throw new Error(`Could not reset the name of ${email}: ${nameErr.message}`)
      continue
    }
    const { error: createErr } = await sb.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: 'Playwright', last_name: `Pool ${i}` },
    })
    if (createErr) throw new Error(`Could not create ${email}: ${createErr.message}`)
    console.log(`Created test account ${email}`)
  }
}

async function signIn(browser, email, path) {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto('/login')
  await page.getByPlaceholder('Email').fill(email)
  await page.getByPlaceholder('Password', { exact: true }).fill(process.env.PLAYWRIGHT_TEST_PASSWORD ?? '')
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page).toHaveURL('/', { timeout: 15000 })
  await expect(page.getByRole('heading', { name: 'Galleries', exact: true })).toBeVisible({ timeout: 15000 })
  await context.storageState({ path })
  await context.close()
}

setup('authenticate as photographer', async ({ browser }) => {
  await ensurePoolAccounts()
  await signIn(browser, MAIN_EMAIL, MAIN_AUTH_STATE)
  for (let i = 0; i < POOL_SIZE; i++) {
    await signIn(browser, poolEmail(i), poolAuthState(i))
  }
})
