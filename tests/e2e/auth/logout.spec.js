import { test, expect } from '@playwright/test'

test.describe('Logout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('Email').fill(process.env.PLAYWRIGHT_TEST_EMAIL ?? '')
    await page.getByPlaceholder('Password', { exact: true }).fill(process.env.PLAYWRIGHT_TEST_PASSWORD ?? '')
    await page.getByRole('button', { name: 'Sign In' }).click()
    await expect(page).toHaveURL('/')
  })

  test('signs out and redirects to login', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL('/login', { timeout: 10000 })
  })

  test('cannot access dashboard after signing out', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL('/login', { timeout: 10000 })
    await page.goto('/')
    await expect(page).toHaveURL('/login')
  })
})
