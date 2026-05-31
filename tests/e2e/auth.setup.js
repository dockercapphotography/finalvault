import { test as setup, expect } from '@playwright/test'

setup('authenticate as photographer', async ({ page }) => {
  await page.goto('/login')
  await page.getByPlaceholder('Email').fill(process.env.PLAYWRIGHT_TEST_EMAIL ?? '')
  await page.getByPlaceholder('Password', { exact: true }).fill(process.env.PLAYWRIGHT_TEST_PASSWORD ?? '')
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page).toHaveURL('/', { timeout: 10000 })
  await expect(page.getByRole('heading', { name: 'Galleries', exact: true })).toBeVisible()
  await page.context().storageState({ path: 'tests/.auth/photographer.json' })
})
