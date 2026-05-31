import { test, expect } from "@playwright/test"

test.use({ storageState: "tests/.auth/photographer.json" })

async function signOut(page) {
  await page.goto("/")
  await page.locator("header").getByText(/playwright@/).click()
  await page.getByText("Sign out").first().click()
  await expect(page.getByText("Sign out?")).toBeVisible()
  await page.getByRole("button", { name: "Sign out" }).click()
  await page.waitForURL("/login", { timeout: 15000 })
}

test.describe("Logout", () => {
  test("signs out and redirects to login", async ({ page }) => {
    await signOut(page)
    await expect(page).toHaveURL("/login")
  })

  test("cannot access dashboard after signing out", async ({ page }) => {
    await signOut(page)
    await page.goto("/")
    await expect(page).toHaveURL("/login")
  })
})
