import { test, expect } from '../../fixtures/fixtures.js'

/**
 * Account page — the Website section's "Manage website" link/button
 * reflects whether a custom domain is configured (added today: the
 * microsite can't go live without one, so the button is disabled
 * rather than linking somewhere with nothing to show).
 */

test.describe('Account — Website section reflects custom domain state', () => {
  test('Manage website is disabled when no custom domain is configured', async ({ page, sb }) => {
    const { data: { users } } = await sb.auth.admin.listUsers()
    const user = users.find(u => u.email === process.env.PLAYWRIGHT_TEST_EMAIL)
    const { data: domain } = await sb
      .from('photographer_domains')
      .select('id')
      .eq('photographer_id', user.id)
      .maybeSingle()

    // Only meaningful when no domain exists -- skip rather than give a
    // false result if the test account has one configured from other
    // custom-domain testing.
    test.skip(!!domain, 'Test photographer has a custom domain configured; this check does not apply')

    await page.goto('/account')
    await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible({ timeout: 10000 })

    const manageBtn = page.getByRole('button', { name: 'Manage website' })
    await expect(manageBtn).toBeVisible({ timeout: 10000 })
    await expect(manageBtn).toBeDisabled()
  })
})
