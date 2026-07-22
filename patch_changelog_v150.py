import pathlib

path = pathlib.Path("CHANGELOG.md")
src = path.read_text()

old_anchor = """# Changelog

All notable changes to FinalVault are documented here.

---

## v1.4.5 — July 19, 2026"""

assert src.count(old_anchor) == 1, "CHANGELOG anchor not found or not unique"

new_entry = """# Changelog

All notable changes to FinalVault are documented here.

---

## v1.5.0 — July 21, 2026

### New Features

**Session Signup Pages (booking module)**
- A photographer-facing "Sign-ups" workspace (new tab alongside Board/List on the Sessions page) for creating public, shareable booking pages -- build one per event, each with its own venue, timezone, shoot types, and time slots
- Public booking page (`/book/:token`) with a 3-step flow (shoot type -> time -> contact details) -- the shoot-type step is skipped automatically when a page only has one type
- Slots grouped by day and shown in the venue's own local time regardless of the visitor's device timezone or location
- Optional per-page "booking page description" shown to clients above the shoot-type options, and separate per-page "confirmation note" / "notification note" fields for customizing the email content without a code change each time
- Optional pronoun collection on the booking form, using the same list already used elsewhere in the app
- Slot generator supports both a single day and a date range (generate the same daily pattern across multiple consecutive days in one action), plus a manual single-slot add for one-off exceptions, and a "clear all open slots" bulk action that never touches already-claimed slots
- **Double-booking prevention enforced at the database level** -- a Postgres exclusion constraint blocks two *different* shoot types (e.g. a 60-minute slot and an overlapping 30-minute slot) from both being claimed for overlapping time, not just duplicate claims on the same row; verified this can't be raced around even under concurrent claim attempts
- Claiming a slot atomically creates (or matches, by email) the client and creates a real `inquiry`-status session -- no separate approval step, the booking *is* the session
- **Automatic questionnaire assignment** -- link one or more questionnaire templates to a shoot type, and they're attached to the resulting session automatically when someone books
- Client confirmation email (shoot type, full date/time range, venue, calendar links) and a separate photographer notification email (client contact info, pronouns, a direct link to the new session in FinalVault) -- both include a "Add to Google Calendar" link and a `.ics` calendar file attachment (Apple Calendar / Outlook)
- Live status page (`/sessions/signups/:id/status`) -- a dedicated, sidebar-free view built for checking bookings on your phone while away from a desk: day tabs, a claimed/open progress stat, real-time updates via Supabase Realtime with a 30-second fallback refetch if the live connection drops, and color-coded slot cards (claimed vs. open)

### Bug Fixes

- Fixed a crash when selecting a venue address on a signup page: three of the page-editing handlers (address select, timezone change, active/inactive toggle) were replacing the entire page state with just the raw update result, silently dropping the shoot types list and crashing the next render
- Fixed slot times being computed using the browser's own local timezone instead of the venue's configured timezone -- verified against the DST boundary (EDT/EST) and multiple US timezones
- Fixed the "Add to Google Calendar" link and downloaded `.ics` file showing the wrong time (a malformed timestamp format was silently misread as local time instead of UTC by calendar apps)
- Fixed the confirmation email's `.ics` attachment triggering Gmail's inline "Unable to load event" banner -- the calendar file now explicitly declares itself a non-actionable entry (`METHOD:PUBLISH`) instead of leaving Gmail to guess
- Fixed a bytea encoding crash in the confirmation-email code path that only surfaced when a venue address (or other emailed field) contained a comma or semicolon -- the RFC 5545 escaping needed for those characters conflicted with how the text was being converted to bytes
- Fixed the public booking page displaying slots that were already blocked by a *different* shoot type's overlapping claimed slot -- the availability check now applies the same overlap logic as the claim itself, so nothing shown as open can actually fail to book
- Removed a duplicate/stale `claim_signup_slot` function overload left behind by an earlier `CREATE OR REPLACE` that had changed the parameter list -- Postgres created a second overload instead of replacing the first, which could cause "could not choose the best candidate function" errors depending on which parameters a caller passed
- Fixed the slot generator's "X slots created" success message never being visible in practice -- an in-modal action was triggering a full data reload that swapped the entire modal to a loading spinner and back, discarding the generator form's own local state before it could render
- Removed the Google Time Zone API auto-resolve call (billed per request) in favor of a manual timezone dropdown -- venue address/coordinates are still captured for session location data, just without an automatic per-edit API call

### UI Polish

- Signup Pages overview cards redesigned: icon, an Active/Inactive badge, a real progress bar (not just text) for claimed/total slots, and shoot-type/day-count stats
- Public booking page: added a 3-step progress indicator, icon-led shoot type cards, and slot buttons that fill solid on hover
- Live status page: replaced the plain claimed/total text with a stat card and a progress ring, and added a colored left border per slot card so status reads at a glance
- The Sessions page header's primary action now reads "New signup page" while on the Sign-ups tab, instead of the unrelated "New Session"

### Notes
- 21 new Playwright tests added this release, covering the public booking flow (including the exact race-condition scenario the exclusion constraint exists for), photographer-side page/shoot-type/slot management, and the live status page
- Test data cleanup on the live account is still pending from this module's development -- tracked separately, not part of this release

---

## v1.4.5 — July 19, 2026"""

src = src.replace(old_anchor, new_entry)
path.write_text(src)
print("Added v1.5.0 entry to CHANGELOG.md")
