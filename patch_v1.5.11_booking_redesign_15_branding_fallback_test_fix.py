#!/usr/bin/env python3
"""
Patch v1.5.11 -- booking-page redesign, step 15: fix a bug in step 14's own
new test, not in the app.

Requires steps 1 through 14 already applied (including sql/063, confirmed
already run against the live database -- the "Success. No rows returned"
in Supabase and the fresh, isolated re-run of just this one test both
independently ruled out the SQL fix or a stale run as the cause).

The new "no enabled microsite still shows the account's own name" test
computed its expected name as:

    photographerRow.business_name || photographerRow.display_name

to mirror the RPC's own `COALESCE(business_name, display_name)`. Those
aren't actually equivalent: SQL's COALESCE only falls through to the
second argument on NULL, while JS's || also falls through on any other
falsy value -- including an empty string. If business_name is '' rather
than NULL on this account (as opposed to unset/NULL), the RPC correctly
returns '' as studio_name, but the test's || skipped that empty string and
expected display_name instead -- a mismatch in the test's own logic, not a
regression in sql/063's fix.

One file:

  MODIFIED tests/e2e/client/all-sessions-booking.spec.js -- swaps that ||
  for ?? (nullish coalescing), which only falls through on null/undefined,
  matching COALESCE's actual behavior.

Run from the repo root, after steps 1 through 14. Idempotent -- safe to
run twice. No SQL to (re-)run this time -- sql/063 is unchanged.

Next step: re-run just the one test that was failing:
  npx playwright test all-sessions-booking.spec.js --project=chromium -g "no enabled microsite still shows"
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


patch_file("tests/e2e/client/all-sessions-booking.spec.js", [
    (
        '''      const { data: photographerRow, error } = await sb().from('photographers')
        .select('business_name, display_name').eq('id', photographer.id).single()
      if (error) throw new Error(error.message)
      const expectedName = photographerRow.business_name || photographerRow.display_name''',
        '''      const { data: photographerRow, error } = await sb().from('photographers')
        .select('business_name, display_name').eq('id', photographer.id).single()
      if (error) throw new Error(error.message)
      // ?? (nullish coalescing), not || -- COALESCE in SQL only falls
      // through on NULL, not on an empty string. Using || here would
      // mismatch the RPC's actual COALESCE(business_name, display_name)
      // whenever business_name is '' rather than null.
      const expectedName = photographerRow.business_name ?? photographerRow.display_name''',
        1,
    ),
])
