import { test, expect } from '@playwright/test'

test.describe('Logout', () => {
  test.beforeEach(async ({ page }) => {
    // Sign in first
    await page.goto('/login')
    await page.getByPlaceholder('Email').fill(process.env.PLAYWRIGHT_TEST_EMAIL)
    await page.getByPlaceholder('Password').fill(process.env.PLAYWRIGHT_TEST_PASSWORD)
    await page.getByRole('button', { name: 'Sign In' }).click()
    await expect(page).toHaveURL('/')
  })

  test('signs out and redirects to login', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL('/login')
  })

  test('cannot access dashboard after signing out', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign out' }).click()
    await page.goto('/')
    await expect(page).toHaveURL('/login')
  })
})
