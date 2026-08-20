#!/bin/bash
# Final test-fix batch for the mobile menu consistency work — commit
# organization script. Run from repo root on the v1.5.5 branch.
set -e

git add \
  tests/e2e/photographer/client-favorites.spec.js \
  tests/e2e/photographer/gallery-bookmarks.spec.js \
  tests/e2e/photographer/gallery-folders.spec.js
git commit -m "Fix 3 pre-existing tests broken by the PortalMenu migration

PortalMenu's trigger changed from a literal <button> to a <div
role=\"button\">, which is the semantically correct thing to do (that's
what ARIA roles are for), but broke any test using a CSS tag selector
that assumed a literal button element:

- gallery-folders.spec.js: both openGalleryMenu and openFolderMenu used
  button[aria-label=...] / button.rounded-full selectors. Switched to
  role-based queries (getByRole) and the precise triggerLabel aria-label
  each trigger now carries, rather than a generic class selector that
  turned out to be shared by other circular elements in the card.
- client-favorites.spec.js: panelHeader.locator('button').last() had the
  same issue -- switched to getByRole. Separately, PortalMenu's desktop
  dropdown renders via createPortal directly into document.body, so it's
  no longer a descendant of the panel element the way the pre-migration
  implementation was; the menu-item lookup needed to be un-scoped from
  the panel to the page. Also updated the item's label to \"Delete
  favorites list\" (renamed earlier in v1.5.5) -- this test predated that
  rename and still looked for bare \"Delete\".
- gallery-bookmarks.spec.js: unrelated to the button/div change -- the
  new triggerLabel additions (e.g. \"Previews set options\") collided
  with Playwright's default substring name matching against the actual
  set-tab text (\"Previews (1)\", with a count suffix). Added a
  setTabName() helper using an anchored regex that tolerates the count
  suffix but excludes the unrelated trigger label.

All three verified against real Node execution before shipping, not
just visual inspection -- an earlier attempt at the gallery-bookmarks
fix had a backslash-escaping mistake that silently produced a
non-matching regex."

echo ""
echo "Done. Review with: git log --oneline -3"
echo "Then clean up: rm patch_*.py"
