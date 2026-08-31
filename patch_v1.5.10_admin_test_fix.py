#!/usr/bin/env python3
"""
Patch v1.5.10 -- fix a pre-existing cross-file test-order bug in
tests/e2e/admin/user-management.spec.js, found while running the full
suite for the favicon + all-sessions-booking release.

Three assertions in that file ('lists all photographers', 'search filters
the photographer list', 'tier changes are reflected in the photographer
list') expect the test account's display_name to already read
"Test Studio". Nothing in the suite guarantees that going into this file
-- the only test that ever sets it (tests/e2e/photographer/watermark.spec.js's
"saves display name on blur") runs much later in file order and never
reverts it, so this file only ever passed by coincidence, whenever a prior
suite run happened to leave that name lying around. Confirmed unrelated to
anything in the favicon/all-sessions branch itself.

Fix: set display_name explicitly in a file-level beforeAll, the same way
other spec files (e.g. signup-booking.spec.js) seed fixture state via the
service-role client rather than relying on what ran before them.

Run from the repo root. Idempotent -- safe to run twice.
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
        "test.use({ storageState: 'tests/.auth/photographer.json' })\n"
        "test.describe.configure({ mode: 'serial' })\n",
        "test.use({ storageState: 'tests/.auth/photographer.json' })\n"
        "test.describe.configure({ mode: 'serial' })\n"
        "\n"
        "// The assertions below expect the test account's display_name to\n"
        "// already read \"Test Studio\" -- previously that only held by\n"
        "// coincidence, left over from watermark.spec.js's \"saves display\n"
        "// name on blur\" test having run earlier in some prior suite run.\n"
        "// Set it explicitly here so this file doesn't silently depend on\n"
        "// cross-file test order or leftover state from a previous run.\n"
        "test.beforeAll(async () => {\n"
        "  const { data: { users } } = await sb().auth.admin.listUsers()\n"
        "  const user = users.find(u => u.email === process.env.PLAYWRIGHT_TEST_EMAIL)\n"
        "  if (!user) throw new Error('Test photographer not found')\n"
        "  await sb().from('photographers').update({ display_name: 'Test Studio' }).eq('id', user.id)\n"
        "})\n",
        1,
    ),
])
