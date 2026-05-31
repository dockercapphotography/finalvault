import { test, expect } from "@playwright/test"
import { createClient } from "@supabase/supabase-js"

function sb() {
  return createClient(
    process.env.PLAYWRIGHT_SUPABASE_URL,
    process.env.PLAYWRIGHT_SUPABASE_SERVICE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

test.use({ storageState: "tests/.auth/photographer.json" })

test.describe("Gallery Creation", () => {
  test.afterEach(async () => {
    const { data } = await sb().from("galleries")
      .select("id").ilike("title", "Playwright Test Gallery%")
    if (data?.length) {
      await sb().from("galleries").delete().in("id", data.map(g => g.id))
    }
  })

  test("navigates to new gallery wizard", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "New Gallery" }).click()
    await expect(page).toHaveURL("/galleries/new")
    await expect(page.getByRole("heading", { name: "New Gallery" })).toBeVisible()
    await expect(page.getByText("Gallery Info")).toBeVisible()
  })

  test("wizard step 1 shows template options and start from scratch", async ({ page }) => {
    await page.goto("/galleries/new")
    await expect(page.getByRole("button", { name: "Use Template →" })).toBeVisible()
    await expect(page.getByText("Start from scratch")).toBeVisible()
  })

  test("start from scratch advances to gallery info step", async ({ page }) => {
    await page.goto("/galleries/new")
    await page.getByText("Start from scratch").click()
    await expect(page.getByText("Gallery Info")).toBeVisible()
    await expect(page.getByPlaceholder("e.g. The Smith Wedding")).toBeVisible()
  })

  test("Create Gallery button is disabled when title is empty", async ({ page }) => {
    await page.goto("/galleries/new")
    await page.getByText("Start from scratch").click()
    await expect(page.getByRole("button", { name: "Next: Define Sets →" })).toBeDisabled()
  })

  test("creates a gallery and redirects to detail page", async ({ page }) => {
    await page.goto("/galleries/new")
    await page.getByText("Start from scratch").click()
    await page.getByPlaceholder("e.g. The Smith Wedding").fill("Playwright Test Gallery")
    await page.getByPlaceholder("e.g. Sarah & James", { exact: true }).fill("Test Client")
    await page.getByRole("button", { name: "Next: Define Sets →" }).click()
    // Step 3: Photo Sets — fill in set name then create
    await expect(page.getByRole("heading", { name: "Photo Sets" })).toBeVisible()
    await page.getByPlaceholder("e.g. Edited - Standard").fill("Photos")
    await page.getByRole("button", { name: "Create Gallery" }).click()
    await expect(page).toHaveURL(/\/galleries\/[0-9a-f-]{36}/, { timeout: 10000 })
  })

  test("cancel returns to dashboard", async ({ page }) => {
    await page.goto("/galleries/new")
    await page.getByText("Start from scratch").click()
    await page.getByRole("button", { name: "Cancel" }).click()
    await expect(page).toHaveURL("/")
  })
})
