import pathlib

path = pathlib.Path("CHANGELOG.md")
src = path.read_text()

old_anchor = """# Changelog

All notable changes to FinalVault are documented here.

---

## v1.4.4 — July 19, 2026"""

assert src.count(old_anchor) == 1, "changelog anchor not found or not unique"

new_anchor = """# Changelog

All notable changes to FinalVault are documented here.

---

## v1.4.5 — July 19, 2026

### New Features

**Client Avatar — Choose from Gallery**
- Setting a client's avatar photo no longer requires uploading a file from your device -- a new "Choose from gallery" option lets you pick straight from any of that client's linked galleries: choose a gallery, then choose an image, then crop as usual
- The selected image becomes a real independent copy, not a live reference to the gallery -- deleting it from the gallery later won't break the client's avatar
- Both the main client page and the Edit Client modal now open the same small menu (Upload photo / Choose from gallery) instead of one being a direct file-picker shortcut and the other having two separate buttons

### Bug Fixes

- Fixed the Client Detail page's linked-galleries list showing "Active" for a gallery that had actually expired (`expires_at` passed) but was still `is_active: true` in the database -- the badge only checked `is_active` and never looked at the expiration date. Now shows a third, more accurate state: Active, Expired (date passed), or Inactive (manually turned off), distinguishing the last two instead of collapsing them together
- Fixed that same expired gallery's cover image failing to load entirely -- the request never told the Worker the gallery was expired (`allow_expired=1`), which it requires to serve a preview for an unavailable gallery
- Fixed the root cause underneath both of the above: `getClientGalleries` never selected `expires_at` in the first place, so even correct front-end logic had no data to check against

### UI Polish

- Desktop sidebar navigation reordered to match the mobile bottom nav (Bookmarked now sits after Sessions, before Account) -- the two had drifted out of sync
- Fixed the mobile "+" create-action button not using the brand purple accent color, unlike its desktop counterpart
- Fixed the Activity page's filter pills (All/Views/Favorites/Downloads/Comments) wrapping onto a second row on narrow phones -- pills now stay on one line, shrinking proportionally by their own content width if needed, with no horizontal scrolling

### Notes

- 5 new Playwright tests added this release: two regression tests for the expired-gallery fix, three covering the new avatar gallery picker

---

## v1.4.4 — July 19, 2026"""

src = src.replace(old_anchor, new_anchor)
path.write_text(src)
print("Added v1.4.5 entry to CHANGELOG.md")
