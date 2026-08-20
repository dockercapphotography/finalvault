#!/usr/bin/env python3
"""
Patch: v1.5.5 release prep -- CHANGELOG.md entry, VERSION bump + in-app
changelog entry in PageWrapper.jsx, and README.md feature-list updates
for the most significant new capabilities.

Run from repo root: python3 patch_v1_5_5_release.py
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).parent

def apply(path, replacements):
    p = ROOT / path
    src = p.read_text()
    for old, new, label in replacements:
        count = src.count(old)
        if count != 1:
            print(f"FAILED [{path}] anchor '{label}': expected 1 occurrence, found {count}")
            sys.exit(1)
        src = src.replace(old, new)
    p.write_text(src)
    print(f"OK: {path} ({len(replacements)} edit(s) applied)")


# ── CHANGELOG.md ──────────────────────────────────────────────────────────────
changelog_entry = """## v1.5.5 — August 19, 2026

### New Features

**Sign-Ups**
- Detail modal redesigned around two tabs -- Booking Slots (default) and Session Settings -- instead of one long scrolling page
- Cross-day search by client name/email finds a booking across every day on the page at once, instead of hunting through the day accordion; results open the same actions sheet Live Status already uses (notes, no-show, reschedule)
- Slot generator (both the date-range generator and manual single-slot add) collapsed behind a link instead of always taking up space
- Questionnaires can be assigned to a shoot type at creation time, not just afterward
- Per-shoot-type price and deposit/retainer amount, shown on the public booking page and carried into the resulting session automatically; a page-level toggle controls whether pricing is shown publicly at all

**Galleries**
- Tags assignable directly on the Gallery Info step at creation, not just afterward
- Quick Edit (title, client, event name/date, notes) reachable from both the gallery detail page and the dashboard card's ⋮ menu, without opening full Settings
- Per-folder sort persistence -- each folder can pin its own sort order, or fall back to an account-wide default
- Gallery collections/set tabs now always show, even when a gallery has only one set, for visual consistency
- Notifications for views, downloads, favorites, and comments are now clickable and take you straight to the relevant gallery

**Account**
- Zelle added as a payment option under Account → Links

**Mobile**
- Every "⋮" menu across the app (galleries, folders, images, client favorites, gallery sets) now opens as a bottom sheet on mobile instead of a dropdown that could run off-screen near an edge -- all sharing one underlying component, so this is consistent everywhere rather than page-by-page
- A menu with several options shows as a 3-column icon grid; a menu with just one option shows as a single full-width row
- Any "Delete X" action now confirms in the same sheet you tapped it from, instead of closing and showing a separate confirmation elsewhere -- including folder deletion, which shows the real number of subfolders/galleries that would also be removed (fetched live, with a brief loading state) rather than a generic warning
- Choosing from a longer list within a menu (e.g. moving an image to a different set) now opens the same reliable picker pattern already used for moving a gallery to a folder, instead of a cramped inline flyout

### Bug Fixes

- Fixed single-image web-size downloads intermittently failing on large originals -- the single-image path was missing a parameter the bulk download path already had, causing it to fall back to a much slower in-browser conversion instead of the pre-generated file
- Fixed a client's favorites/comments/selections splitting across two separate identities if they revisited from a different device or browser -- viewer records are now matched by gallery + email before creating a new one
- Fixed newly uploaded images sometimes sorting in the wrong order when filenames included numbers (e.g. "-10" sorting before "-2")
- Fixed the Getting Started checklist appearing on a genuine data-load error, indistinguishable from a brand-new account
- Fixed the client contact avatar's "Upload photo / Choose from gallery" dropdown getting clipped on shorter client cards; added one-tap copy buttons to email, phone, and address
- Fixed a session's start/end time occasionally showing as "--" when it came from a signup booking that landed off the normal 15-minute grid
- The gallery share email now pre-fills the "To" field with the linked client's email when one exists
- The app now falls back to the cached shell instead of the browser's default offline error page when reloaded without a connection

---

"""

with open(ROOT / "CHANGELOG.md") as f:
    changelog_content = f.read()

anchor = "All notable changes to FinalVault are documented here.\n\n---\n\n## v1.5.4"
if changelog_content.count(anchor) != 1:
    print(f"FAILED [CHANGELOG.md]: expected 1 occurrence of insertion anchor, found {changelog_content.count(anchor)}")
    sys.exit(1)
changelog_content = changelog_content.replace(
    anchor,
    "All notable changes to FinalVault are documented here.\n\n---\n\n" + changelog_entry + "## v1.5.4"
)
with open(ROOT / "CHANGELOG.md", "w") as f:
    f.write(changelog_content)
print("OK: CHANGELOG.md (1 edit(s) applied)")


# ── PageWrapper.jsx ───────────────────────────────────────────────────────────
pagewrapper_edits = [
    (
        "const VERSION = '1.5.4'",
        "const VERSION = '1.5.5'",
        "version bump",
    ),
    (
        '                <Section title="v1.5.4 — July 28, 2026">',
        """                <Section title="v1.5.5 — August 19, 2026">
                  <Group label="Sign-Ups">
                    <Item>Detail modal redesigned around two tabs -- Booking Slots and Session Settings -- instead of one long page</Item>
                    <Item>Cross-day search finds a booking by name/email across every day at once</Item>
                    <Item>Slot generator collapsed behind a link instead of always showing</Item>
                    <Item>Questionnaires assignable to a shoot type at creation time</Item>
                    <Item>Per-shoot-type price and deposit, shown on the public booking page and carried into the session automatically</Item>
                  </Group>
                  <Group label="Galleries">
                    <Item>Tags assignable at gallery creation, not just afterward</Item>
                    <Item>Quick Edit reachable from the detail page and the dashboard card's ⋮ menu</Item>
                    <Item>Per-folder sort persistence</Item>
                    <Item>Set tabs always show, even with just one set</Item>
                    <Item>Activity notifications are now clickable, taking you to the relevant gallery</Item>
                  </Group>
                  <Group label="Mobile">
                    <Item>Every ⋮ menu across the app now opens as a bottom sheet instead of a dropdown that could run off-screen</Item>
                    <Item>"Delete X" actions confirm in the same sheet, including folder deletion showing real counts of what would be removed</Item>
                  </Group>
                  <Group label="Bug Fixes">
                    <Item>Fixed single-image web-size downloads intermittently failing on large originals</Item>
                    <Item>Fixed a client's favorites splitting across identities when revisiting from a different device</Item>
                    <Item>Fixed newly uploaded images occasionally sorting in the wrong order</Item>
                    <Item>Fixed the Getting Started checklist appearing on a genuine data-load error</Item>
                    <Item>Fixed the client avatar dropdown getting clipped on shorter cards; added copy buttons to contact fields</Item>
                  </Group>
                </Section>
                <Section title="v1.5.4 — July 28, 2026">""",
        "add v1.5.5 in-app changelog section",
    ),
]
apply("src/components/layout/PageWrapper.jsx", pagewrapper_edits)


# ── README.md ─────────────────────────────────────────────────────────────────
readme_edits = [
    (
        '- **Session Signup Pages** — create a public, shareable booking page per event with its own venue, timezone, and shoot types; clients pick a time and book themselves, which atomically creates the client (or matches an existing one) and a real session, with automatic questionnaire assignment, database-enforced double-booking prevention across overlapping shoot types, and calendar-ready confirmation emails (Google Calendar link + .ics)',
        '- **Session Signup Pages** — create a public, shareable booking page per event with its own venue, timezone, and shoot types; clients pick a time and book themselves, which atomically creates the client (or matches an existing one) and a real session, with automatic questionnaire assignment, database-enforced double-booking prevention across overlapping shoot types, and calendar-ready confirmation emails (Google Calendar link + .ics); optional per-shoot-type pricing and deposit shown to clients before they book',
        "signup pages pricing mention",
    ),
    (
        '- **Gallery category tags** — create a per-account tag library with custom colors, assign tags to galleries, filter and search by tag on the dashboard',
        '- **Gallery category tags** — create a per-account tag library with custom colors, assign tags to galleries (including right at creation time), filter and search by tag on the dashboard',
        "tags at creation mention",
    ),
]
apply("README.md", readme_edits)

print("\nAll edits applied successfully.")
