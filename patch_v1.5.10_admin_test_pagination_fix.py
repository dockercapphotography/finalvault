#!/usr/bin/env python3
"""
Patch v1.5.10 -- second fix to tests/e2e/admin/user-management.spec.js.

The display_name beforeAll (patch_v1.5.10_admin_test_fix.py) turned out
not to be the actual cause of the failure -- a live query confirmed
playwright@finalvault.test already has display_name = 'Test Studio'.

The real cause: Admin.jsx paginates the photographer list client-side at
10 per page with no explicit sort order on the query
(usePagination({ totalCount: filtered.length, initialPageSize: 10, ... })).
The roster has grown to 11 accounts since this test was written, so
"Test Studio" is no longer guaranteed to land on page 1. Two tests assert
it's visible without searching for it first; a third ('search filters the
photographer list') already searches first and was unaffected. This patch
makes the other two do the same -- correct regardless of how many more
dev/test accounts accumulate later.

Run from the repo root, after patch_v1.5.10_admin_test_fix.py. Idempotent.
"""
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent


def patch_file(rel_path, replacements):
    path = ROOT / rel_path
    text = path.read_text()
    changed = False
    for old, new, expected_count in replacements:
        if new in text:
            continue
        count = text.count(old)
        assert count == expected_count, (
            f"{rel_path}: expected {expected_count} occurrence(s) of a block, found {count}.\n"
            f"--- block ---\n{old}\n-------------"
        )
        text = text.replace(old, new)
        changed = True
    if not changed:
        print(f"  (no changes needed -- {rel_path} already patched)")
        return
    path.write_text(text)
    print(f"Patched {rel_path}")


patch_file("tests/e2e/admin/user-management.spec.js", [
    (
        "  test('lists all photographers', async ({ page }) => {\n"
        "    await goToAdmin(page)\n"
        "    await expect(page.getByText('Test Studio')).toBeVisible()\n"
        "    await expect(page.getByText(/galleries/).first()).toBeVisible()\n"
        "  })\n",
        "  test('lists all photographers', async ({ page }) => {\n"
        "    await goToAdmin(page)\n"
        "    // The photographer roster has grown past the admin list's\n"
        "    // 10-per-page client-side pagination (no explicit sort order on\n"
        "    // the query either), so \"Test Studio\" isn't guaranteed to land\n"
        "    // on page 1 anymore -- search for it explicitly, same as\n"
        "    // 'search filters the photographer list' below.\n"
        "    await page.locator('input[placeholder*=\"Search\"]').fill('Test Studio')\n"
        "    await expect(page.getByText('Test Studio')).toBeVisible()\n"
        "    await expect(page.getByText(/galleries/).first()).toBeVisible()\n"
        "  })\n",
        1,
    ),
    (
        "  test('tier changes are reflected in the photographer list', async ({ page }) => {\n"
        "    await goToAdmin(page)\n"
        "    await expect(page.getByText('Test Studio')).toBeVisible()\n"
        "    await expect(page.locator('select').first()).toBeAttached()\n"
        "  })\n",
        "  test('tier changes are reflected in the photographer list', async ({ page }) => {\n"
        "    await goToAdmin(page)\n"
        "    // Same pagination caveat as 'lists all photographers' above.\n"
        "    await page.locator('input[placeholder*=\"Search\"]').fill('Test Studio')\n"
        "    await expect(page.getByText('Test Studio')).toBeVisible()\n"
        "    await expect(page.locator('select').first()).toBeAttached()\n"
        "  })\n",
        1,
    ),
])
