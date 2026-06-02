import { test, expect } from '@playwright/test'

test.describe('Login', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
  })

  test('shows FinalVault branding', async ({ page }) => {
    // Two FinalVault spans exist: desktop (hidden on mobile) + mobile (hidden on desktop)
    // Use the alt text on the logo image which is always present, or check either span visible
    await expect(page.getByAltText('FinalVault').first()).toBeAttached()
  })

  test('shows sign in form by default', async ({ page }) => {
    await expect(page.getByPlaceholder('Email')).toBeVisible()
    await expect(page.getByPlaceholder('Password', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible()
  })

  test('shows error on empty submit', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign In' }).click()
    await expect(page.getByText('Please enter both email and password')).toBeVisible()
  })

  test('shows error on invalid credentials', async ({ page }) => {
    await page.getByPlaceholder('Email').fill('wrong@example.com')
    await page.getByPlaceholder('Password', { exact: true }).fill('wrongpassword')
    await page.getByRole('button', { name: 'Sign In' }).click()
    await expect(page.getByText(/invalid/i).or(page.getByText(/authentication failed/i))).toBeVisible()
  })

  test('signs in with valid credentials and redirects to dashboard', async ({ page }) => {
    await page.getByPlaceholder('Email').fill(process.env.PLAYWRIGHT_TEST_EMAIL ?? '')
    await page.getByPlaceholder('Password', { exact: true }).fill(process.env.PLAYWRIGHT_TEST_PASSWORD ?? '')
    await page.getByRole('button', { name: 'Sign In' }).click()
    await expect(page).toHaveURL('/')
    await expect(page.getByRole('heading', { name: 'Galleries', exact: true })).toBeVisible()
  })

  test('toggles password visibility', async ({ page }) => {
    const passwordInput = page.getByPlaceholder('Password', { exact: true })
    await expect(passwordInput).toHaveAttribute('type', 'password')
    await page.locator('button').filter({ has: page.locator('svg') }).first().click()
    await expect(passwordInput).toHaveAttribute('type', 'text')
  })
})

test.describe('Forgot Password', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: 'Forgot password?' }).click()
  })

  test('shows forgot password form', async ({ page }) => {
    await expect(page.getByText('Reset your password', { exact: true })).toBeVisible()
    await expect(page.getByPlaceholder('Email')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Send Reset Email' })).toBeVisible()
  })

  test('shows error on empty email', async ({ page }) => {
    await page.getByRole('button', { name: 'Send Reset Email' }).click()
    await expect(page.getByText('Please enter your email address')).toBeVisible()
  })

  test('navigates back to sign in', async ({ page }) => {
    await page.getByText('← Back to sign in').click()
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible()
  })
})

test.describe('Register', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: 'Create account' }).click()
  })

  test('shows registration form', async ({ page }) => {
    await expect(page.getByText('Create your account')).toBeVisible()
    await expect(page.getByPlaceholder('First Name *')).toBeVisible()
    await expect(page.getByPlaceholder('Last Name *')).toBeVisible()
  })

  test('shows password requirements', async ({ page }) => {
    await page.getByPlaceholder('Email').fill('test@example.com')
    await page.getByPlaceholder('First Name *').fill('Test')
    await page.getByPlaceholder('Last Name *').fill('Test')
    await page.getByPlaceholder('Password', { exact: true }).fill('weak')
    await expect(page.getByText('Lowercase (a-z)')).toBeVisible()
    await expect(page.getByText('Uppercase (A-Z)')).toBeVisible()
  })

  test('shows passwords match indicator', async ({ page }) => {
    await page.getByPlaceholder('Password', { exact: true }).fill('Test@1234')
    await page.getByPlaceholder('Confirm Password').fill('Test@1234')
    await expect(page.getByText('Passwords match')).toBeVisible()
  })

  test('disables submit when passwords do not match', async ({ page }) => {
    await page.getByPlaceholder('Password', { exact: true }).fill('Test@1234')
    await page.getByPlaceholder('Confirm Password').fill('Different@1234')
    await expect(page.getByRole('button', { name: 'Create Account' })).toBeDisabled()
  })
})
