# Sign-Ups management modal redesign — spec

Deferred to v1.5.5. Scoped out during v1.5.4 but not built, so this
doesn't need to be re-derived from scratch when picked up.

## Problem

`SignupPageDetailModal` (opened from Sessions → Signups → click a
page) mixes two different jobs in one long scrolling column: page
configuration (venue, timezone, booking emails, shoot types) and
booking management (finding/viewing/editing a specific claimed slot).

The booking list is the *last* thing in the modal, sitting inside a
collapsed-by-default day-by-day accordion. Finding a specific booking
today means: open the modal → scroll past settings, shoot types, and
the slot generator → reach "Slots by day" → click the right day to
expand it → scroll through that day's list to find the booking. Per
Nick: "It's not as seamless... It's A LOT."

Confirmed with Nick directly:
- The friction is specifically in **finding** a booking, not acting on
  one once found.
- The two things actually done in this view, in order of frequency:
  finding bookings, and making changes to them. Page settings are a
  distant third.
- Motivating line: "Something shouldn't be easier to do from a phone
  than a computer" — the Live Status page (mobile-first, built this
  same release cycle) already handles "find a booking fast" well;
  this modal, the desktop-native surface, currently doesn't.

## Design direction (agreed with Nick)

Split the modal into two tabs instead of one long scroll:

**"Booking slots" tab** (opens by default — this is the primary task):
- A real search box at the top, searching by client name/email across
  **all days at once**, not scoped to whichever day happens to be
  expanded. Typing shows a flat list of matches (day + time range +
  shoot type shown inline on each result, so there's no need to
  already know which day something is on).
- Empty search state falls back to the existing day-by-day accordion
  list (browsing-by-day doesn't go away, it's just no longer the
  first thing you have to scroll past to search).
- Clicking a result opens the **same actions/reschedule flow already
  built for Live Status** (`SlotActionsFields` equivalent + the
  shared `RescheduleModal`) — reused here, not rebuilt. This was a
  deliberate call: avoid a second, slightly-different booking-actions
  UI existing in two places.
- The slot generator (`GenerateSlotsForm` + `ManualAddSlotForm`) moves
  here too, since it's booking-related — but tucked behind a small
  expandable "+ Generate or add time slots" link at the bottom rather
  than always visible, since creating new slots happens far less
  often than finding existing ones.
- "Clear all open slots" stays with the slot list it acts on.

**"Session settings" tab**:
- Booking page description
- Venue + timezone
- Booking emails (confirmation note, notification note)
- Shoot types (add/edit/delete)
- Danger zone (delete signup page)

**Stays outside/above both tabs** (persistent regardless of which tab
is active): the link-copy row, the "Live status" button, and the
Active/Inactive toggle. Rationale floated with Nick but not explicitly
re-confirmed after the tab redesign landed — worth a quick sanity
check before building, since it's a small thing to get wrong: does
"is this page active" / "jump to Live Status" still feel right living
outside the tabs, or should it move into Session settings?

## Open questions / things to verify before building

1. **Persistent header placement** — see above, wasn't explicitly
   re-confirmed after the tabs idea replaced the original
   search-at-top-of-one-column idea.
2. **Search scope** — client name/email only (matching what
   `SlotDayRow` already displays), or should it also match shoot type
   name? Not discussed explicitly.
3. **Cross-day search result count** — no upper bound on results was
   discussed. Worth deciding whether to cap/paginate for a page with a
   very large number of bookings, or just let the list grow (probably
   fine unscoped for now, given realistic signup page sizes so far).
4. **Mobile behavior** — this modal is currently used on both mobile
   and desktop (it's the same Sessions page). Tabs need a sensible
   mobile treatment (likely the same segmented-pill-style tab switcher
   already used elsewhere in the app, e.g. Push Notifications' Move/
   Custom-time tabs in `RescheduleModal`) — not discussed in detail,
   but there's already a proven pattern to reuse rather than invent a
   new one.
5. **Whether `SlotActionsFields` needs any adaptation** to work well
   embedded inline in this modal's "Booking slots" tab vs. how it's
   currently used (inside its own `Modal`/`BottomSheet` on top of
   Live Status). Likely fine as-is, but worth checking during
   implementation rather than assuming.

## Suggested build sequence

1. Restructure `SignupPageDetailModal` into a tab switcher (reuse the
   existing pill-toggle pattern from `RescheduleModal`), moving
   existing JSX into the two tabs without changing behavior yet —
   get the reorganization landed and visually confirmed first.
2. Add the cross-day search box + flat result list to the Booking
   Slots tab, with the existing day-accordion as the empty-search
   fallback.
3. Wire result rows to open `SlotActionsFields`/`RescheduleModal` the
   same way Live Status does, reusing those components directly
   rather than duplicating their logic.
4. Move the slot generator forms behind the collapsed "+ Generate or
   add time slots" link.
5. Confirm settings-only content (venue, shoot types, booking emails,
   danger zone) reads correctly under its own tab with nothing lost
   in the move.
6. Test both tabs on mobile and desktop.

## Explicitly not in scope for this change

- No changes to the Live Status page itself (it already does the
  "find a booking fast" job well — this spec is about bringing that
  same quality to the desktop-settings entry point, not replacing or
  duplicating Live Status).
- No changes to the underlying slot/booking data model, RPCs, or
  conflict-checking logic — this is purely a UI reorganization of an
  existing modal.
