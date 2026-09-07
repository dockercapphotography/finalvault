import { test, expect } from '../../fixtures/fixtures.js'

/**
 * Premium feature tier gating (Custom Domain + Microsite)
 *
 * Uses a disposable tier created fresh for this file, rather than
 * touching any real named tier (Free/Pro/Studio/Backup Tier/Hobbyist) --
 * this suite runs against live production Supabase, so real tier rows
 * are never safe to mutate for a test. The fixture snapshots the test
 * photographer's current tier_id, temporarily reassigns them to the
 * disposable no-access tier, and restores their original tier_id after --
 * same snapshot/restore shape as the existing testMicrosite fixture.
 *
 * NOT covered here (see session notes): the custom-domain redirect gate
 * and get_site_by_hostname's content-flash fix both require a real,
 * DNS-resolvable custom domain -- can't be exercised against localhost.
 * Also not covered: manage-custom-domain's HTTP-level 403, since there's
 * no existing convention in this suite for calling Edge Functions
 * directly, and exercising it for real would mean adding a real
 * Cloudflare custom hostname, which is not worth the risk for this test.
 */

async function getPhotographerId(sb) {
  const { data: { users } } = await sb.auth.admin.listUsers()
  const user = users.find(u => u.email === process.env.PLAYWRIGHT_TEST_EMAIL)
  if (!user) throw new Error('Test photographer not found')
  return user.id
}

const test2 = test.extend({
  // Temporarily moves the test photographer onto a disposable tier with
  // allow_premium_features: false, restoring their original tier_id
  // (and deleting the disposable tier) after the test, regardless of
  // pass/fail.
  withoutPremiumAccess: async ({ sb }, use) => {
    const photographerId = await getPhotographerId(sb)

    const { data: storageRow, error: storageErr } = await sb
      .from('photographer_storage')
      .select('tier_id')
      .eq('photographer_id', photographerId)
      .maybeSingle()
    if (storageErr) throw new Error(`Could not read photographer_storage: ${storageErr.message}`)
    const originalTierId = storageRow?.tier_id ?? null

    const { data: tier, error: tierErr } = await sb
      .from('storage_tiers')
      .insert({
        name: `pw-no-premium-${crypto.randomUUID().slice(0, 8)}`,
        storage_gb: 5,
        price_monthly: 0,
        allow_premium_features: false,
      })
      .select()
      .single()
    if (tierErr) throw new Error(`Could not create disposable tier: ${tierErr.message}`)

    const { error: assignErr } = await sb
      .from('photographer_storage')
      .upsert({ photographer_id: photographerId, tier_id: tier.id }, { onConflict: 'photographer_id' })
    if (assignErr) throw new Error(`Could not assign disposable tier: ${assignErr.message}`)

    await use({ photographerId, tierId: tier.id })

    if (originalTierId) {
      await sb.from('photographer_storage').update({ tier_id: originalTierId }).eq('photographer_id', photographerId)
    } else {
      await sb.from('photographer_storage').delete().eq('photographer_id', photographerId)
    }
    await sb.from('storage_tiers').delete().eq('id', tier.id)
  },
})

test2.describe('Premium feature tier gating', () => {
  test2('MicrositeEditor shows a locked-out message, not the editor, without premium access', async ({ page, withoutPremiumAccess }) => {
    await page.goto('/website')
    await expect(page.getByText("Microsite isn't included in your plan")).toBeVisible({ timeout: 10000 })
    // The real editor's fixed top bar is a reliable "did the real editor
    // render" signal -- absence of it confirms the lockout is a full
    // replacement, not an overlay on top of the working editor.
    await expect(page.locator('div[style*="position: fixed"][style*="height: 64"]')).not.toBeVisible()
  })

  test2('Account Custom Domain section shows an upsell card without premium access', async ({ page, withoutPremiumAccess }) => {
    await page.goto('/account')
    await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText("Custom domains aren't included in your current plan.")).toBeVisible({ timeout: 10000 })
  })

  test2('Account Website section shows an upsell card without premium access', async ({ page, withoutPremiumAccess }) => {
    await page.goto('/account')
    await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText("Websites aren't included in your current plan.")).toBeVisible({ timeout: 10000 })
  })

  test2('backend rejects enabling a microsite directly, bypassing the UI entirely, without premium access', async ({ sb, withoutPremiumAccess }) => {
    const { photographerId } = withoutPremiumAccess

    const { error } = await sb
      .from('microsites')
      .upsert({ photographer_id: photographerId, enabled: true }, { onConflict: 'photographer_id' })

    expect(error).toBeTruthy()
    expect(error.message).toContain('does not include the Microsite feature')
  })

  test2('a normal tier is unaffected — Website section shows real status, not the upsell card', async ({ page, sb }) => {
    const photographerId = await getPhotographerId(sb)
    const { data: storageRow } = await sb
      .from('photographer_storage')
      .select('tier_id, storage_tiers(allow_premium_features)')
      .eq('photographer_id', photographerId)
      .maybeSingle()

    test2.skip(!storageRow?.storage_tiers?.allow_premium_features, 'Test photographer\'s current tier does not include premium features')

    await page.goto('/account')
    await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText("Websites aren't included in your current plan.")).not.toBeVisible()
  })
})
