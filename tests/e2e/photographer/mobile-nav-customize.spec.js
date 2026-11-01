import { photographerState, test, expect } from '../../fixtures/base.js'
import { sb, getPhotographerId } from '../../fixtures/invoices.js'

/**
 * v1.6.0: the phone bottom bar shows up to 4 chosen pages plus More
 * (sql/113 photographers.mobile_nav_items, null = Galleries, Sessions,
 * Clients, Financials). Everything else -- Bookmarked and Account by
 * default -- lives in the More sheet, which also holds Customize.
 */

test.use({ storageState: photographerState, viewport: { width: 390, height: 844 } })

async function resetBar() {
  await sb().from('photographers').update({ mobile_nav_items: null }).eq('id', await getPhotographerId())
}

test.beforeEach(resetBar)
test.afterEach(resetBar)

test('default bar is Galleries, Sessions, Clients, Financials + More; More holds Bookmarked and Account', async ({ page }) => {
  await page.goto('/financials')
  for (const key of ['galleries', 'sessions', 'clients', 'financials', 'more']) {
    await expect(page.getByTestId(`mobile-nav-${key}`)).toBeVisible()
  }
  await expect(page.getByTestId('mobile-nav-account')).toHaveCount(0)

  await page.getByTestId('mobile-nav-more').click()
  await expect(page.getByTestId('mobile-more-bookmarked')).toBeVisible()
  await page.getByTestId('mobile-more-account').click()
  await expect(page).toHaveURL(/\/account/)
})

test('Customize swaps a page onto the bar and saves it to the account', async ({ page }) => {
  await page.goto('/financials')
  await page.getByTestId('mobile-nav-more').click()
  await page.getByTestId('mobile-more-customize').click()
  await page.getByTestId('mobile-nav-remove-clients').click()
  await page.getByTestId('mobile-nav-add-account').click()
  await page.getByTestId('mobile-nav-save').click()

  await expect(page.getByTestId('mobile-nav-account')).toBeVisible({ timeout: 10000 })
  await expect(page.getByTestId('mobile-nav-clients')).toHaveCount(0)
  const { data } = await sb().from('photographers').select('mobile_nav_items').eq('id', await getPhotographerId()).single()
  expect(data.mobile_nav_items).toEqual(['galleries', 'sessions', 'financials', 'account'])

  // Clients moved into More.
  await page.getByTestId('mobile-nav-more').click()
  await expect(page.getByTestId('mobile-more-clients')).toBeVisible()
})

test('the bar holds at most 4 pages', async ({ page }) => {
  await page.goto('/sessions')
  await page.getByTestId('mobile-nav-more').click()
  await page.getByTestId('mobile-more-customize').click()
  await expect(page.getByTestId('mobile-nav-add-account')).toBeDisabled()
  await expect(page.getByText('The bar holds 4 pages. Remove one to add another.')).toBeVisible()
})
