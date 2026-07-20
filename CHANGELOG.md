# Changelog

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

## v1.4.4 — July 19, 2026

### New Features

**Client Portal Password Protection**
- Clients can now have an optional password protecting their entire portal, set from the client's page -- gates galleries, contracts, and questionnaires all at once, not just individual galleries
- Escalating lockout after repeated wrong attempts (5 free attempts, then a doubling delay capped at 24 hours) -- makes brute-forcing the portal password impractical without punishing a client who mistypes it a few times
- Manual "Reset lockout" action lets you clear a client's lockout immediately instead of waiting it out
- Regenerating a gallery's password (already possible from Gallery Settings) now also revokes previously-unlocked access to that specific gallery on other devices, without disabling the gallery for anyone else

**Gallery Access Info in the Portal**
- Clients can now see a gallery's password and/or download PIN directly in their portal gallery list, each with its own one-click copy button -- no more asking the photographer for the code
- Gallery links from the portal now open in a new tab, so the portal (with the codes still visible) stays open behind it instead of navigating away

### Bug Fixes

- Fixed the gallery "remembered password" flag resetting every time a gallery link was opened in a new tab -- it now persists the same way the portal already remembers a client's identity
- Fixed a portal password lockout not showing the correct "too many attempts" message on the exact attempt that triggered it -- the message previously only appeared starting on the *next* attempt after the lock had already taken effect

### Security

- Fixed an ownership-check gap in `set_client_portal_password` where a `NULL` caller identity could silently pass the authorization check instead of being rejected
- Fixed `get_client_portal_data`'s lockout response not reflecting the newly-triggered lock state on the same call that caused it (see Bug Fixes above)

### Notes

- Deferred: real per-tag colors and live usage counts for client tags (matching the existing gallery tag system) -- scoped as its own schema change for v1.5.0 rather than folded into this release, since it needs a proper `client_tags` table rather than a UI-only patch
- 15 new or extended Playwright tests added this release, covering the password gate, escalating lockout, photographer-side password management, portal gallery access info, and the persistence/revocation fixes

---

## v1.4.3 — July 18, 2026

### UI Polish

- Primary buttons ("New Gallery", "New Client", "New Session", etc.) now use the app's actual brand purple instead of near-black -- a mismatched `--accent` variable, unrelated to the intentional hardcoded purple already used for Share/Filters & sort
- Fixed cramped mobile layout on the Client Portal link card and Galleries card on a client's page -- both now stack their title/buttons vertically on small screens instead of forcing everything into one row
- Client detail page's mobile header now uses the same breadcrumb component used everywhere else in the app, instead of a separate plain "back" button
- Linked Clients rows in Gallery Settings now show an avatar and email, and link to that client's page, instead of just a bare name

### Bug Fixes

- Fixed a gallery's tag suggestion dropdown showing a tag as still available right after it had already been assigned -- inconsistent, since it depended entirely on whether something else happened to refresh the list afterward

---

## v1.4.2 — July 17, 2026

### New Features

**Unified Filters & Sort**
- Every list page (Galleries, Clients, Sessions) now shares the same "Filters & sort" pattern first built for the Client Portal -- one button, a mobile drill-down sheet, and a desktop panel, instead of each page having its own bespoke filter UI
- Galleries: Status, Event Date, Expiry Date, Tags, and Sort now live in one panel instead of a row of always-visible pills; Event Date/Expiry Date simplified from a full calendar widget to a preset dropdown + custom range, matching the same pattern everywhere else
- New "Small" grid size option (up to 6 galleries per row, down from 4)
- Gallery Sort By and Grid Size selections now persist across sessions instead of resetting on every reload
- Clients: Sort By added (Name, Recently added) -- previously no sort control existed at all
- Sessions: Type and Payment status filters added, plus Sort By (Session Date, Client Name, Recently created)
- Unified page header layout across Galleries/Clients/Sessions -- title, then search + create action(s), then Filters & sort (and view toggles, where applicable) right-aligned below

### Bug Fixes

- Fixed Clients' desktop tag filter only allowing one tag to be selected at a time, while the mobile version already allowed multiple -- both are consistently multi-select now
- Fixed the Filters & sort panel occasionally rendering off-page depending on the surrounding page layout
- Fixed the Filters & sort panel closing itself whenever anything inside it was scrolled, including its own contents
- Fixed clicking a tag in the Tags picker closing the whole Filters & sort panel instead of selecting the tag
- Fixed the Tags picker requiring two separate scroll actions (scroll the panel, then scroll the tag list) to reach the bottom of a long tag list
- Fixed search, Filters & sort, and the create button appearing to "pop in" a moment after a page finished loading instead of being present immediately

### Notes

- Gallery Activity's activity-type filter intentionally stayed as always-visible pill buttons rather than moving to the new Filters & sort button -- with only one filter dimension, the extra click to open a panel added friction without a real benefit. The page title size was still brought in line with the rest of the app.
- Bookmarked was left untouched -- its header already matched the app-wide convention and it has nothing to filter or sort.

---

## v1.4.1 — July 17, 2026

### New Features

**Multi-Client Galleries**
- A gallery can now be linked to more than one client (e.g. both spouses in a wedding), each with full portal access to it
- Manage a gallery's linked clients from Gallery Settings — add or remove clients without affecting the gallery's other links
- Attaching a gallery to a client now shows galleries already linked to a *different* client too, instead of hiding them
- Unlink a gallery from a client directly from the client's page

**Folder Organization**
- Folders can now be moved (with their entire contents) into another folder, or back to the top level, from the folder's own menu

**Attach Gallery**
- Select multiple galleries at once instead of attaching one, saving, and reopening the picker each time
- Search added to the picker for accounts with a large number of galleries

### Bug Fixes

- Fixed folder cover images showing the old image after being replaced, until the browser cache was manually cleared
- Fixed deleting a folder navigating all the way back to the root gallery view instead of staying where you were
- Fixed a gallery's linked client silently getting cleared any time an unrelated setting was saved on that gallery
- Fixed new galleries not generating a download PIN or password when a template defaulted "Require Download PIN" or "Require Password" to on -- the requirement was enabled but no actual PIN/password existed until one was manually generated
- Fixed the in-app "Build" date always showing the current date instead of the date the app was actually last deployed

### Notes

- `galleries.client_id` (the old single-client column) is no longer written to by any part of the app -- `gallery_clients` is now the sole source of truth for gallery-client links. The column is left in place, unused, rather than dropped.
- Known gap: `GalleryDetail.jsx`'s client link still reads the now-stale `gallery.client_id` instead of the new linked-clients list -- scheduled for a follow-up pass.
- Known gap: gallery creation (`GalleryNew.jsx`) still only supports selecting one client at creation time; additional clients are added afterward via Gallery Settings.
- As with the Client Portal work in v1.4.0, the `gallery_folders` and `gallery_clients` schemas (tables, RLS, and the `move_folder_tree` / `get_client_portal_data` functions) were changed directly in the Supabase SQL Editor and aren't yet reflected in any tracked migration file -- same pre-existing gap as the rest of the untracked schema, to be closed by the deferred canonical `schema.sql` task.

---

## v1.4.0 — June 29, 2026

### New Features

**Client Portal**
- Every client now gets a single, durable link showing all their galleries, contracts, and outstanding questionnaires in one place — no more juggling separate links for each gallery, contract, and form
- Generate or regenerate a client's portal link from their Client page — regenerating immediately invalidates the old link
- Galleries linked directly to a client and galleries linked through a session are combined and de-duplicated automatically, grouped by session with a "General" section for anything linked directly
- A "New" badge appears on galleries the client hasn't viewed yet, and clears automatically once they do
- Search, sort (newest/oldest), and filter (event date — including a custom date range — and active/expired) for clients with many galleries
- Expired galleries show grayed out with an "Expired" label rather than disappearing, so clients always see their full history
- Contracts are grouped into "Needs your signature," "Awaiting your photographer," and "Signed" — a client who already signed never sees a misleading prompt to sign again
- Signed contracts have their own detail page showing both signatures and a downloadable PDF, with sensitive audit data (IP addresses) kept out of the client-facing view
- Questionnaires show only while outstanding and disappear immediately once submitted
- The portal shows the studio's logo or photo and name in its own header, on both desktop and mobile
- New "link to existing client" suggestion when reviewing a walk-up submission whose email matches an existing client record, instead of only ever offering to create a new one

### Bug Fixes

**Client Linking**
- Fixed "Create client record" on a session's submissions silently failing to save the link between a submission and its client — every previous use of this feature, going back to its original release, appeared to succeed but never actually persisted; the link is now saved correctly and verified to survive a page reload

### Security

- Added a scoped, authenticated download endpoint for signed contract PDFs so a client can only download their own contracts, never another client's, even with a guessed or shared link
- Added a narrow, read-only endpoint for serving studio logos and profile photos to clients, scoped strictly to those asset types

### Notes

- The Client Portal's filter/sort interface is intentionally separate from the main dashboard's filters for now (no shared component yet) — revisit if a second use case for the same pattern comes up
- A pre-existing, unrelated test (`dashboard search by tag name`) was found to be flaky during this release's testing; it predates this release and was not investigated further

---

## v1.3.10 — June 28, 2026

### New Features

**Client Comments**
- Photographers can now reply to client comments directly from the Activity feed — replies post into the same comment thread the client sees, attributed with the photographer's name

### Bug Fixes

**Client Comments**
- Clients viewing a gallery now only see their own comments and the photographer's replies, instead of seeing every other client's comments on the same gallery

### Security

- Hardened row-level security across several client-facing tables (viewer sessions, comments, favorites, proofing selections) to properly scope access per-gallery and per-viewer instead of relying on broader, less-restrictive policies
- Closed a gap where a database secret key was stored in plaintext in a scheduled job definition — moved to Supabase Vault
- Removed an unused, empty database schema left over from earlier testing
- Added a database-level safeguard so storage tier changes can only be performed by admin accounts, closing a gap where the restriction previously existed only in the interface

---

## v1.3.9 — June 26, 2026

### Bug Fixes

**Navigation & Breadcrumbs**
- Gallery breadcrumbs (Detail, Settings, Activity) now correctly show the full folder path instead of losing it when navigating between pages — derived from the gallery's `folder_id` via a new shared `buildGalleryCrumbs()` helper instead of fragile relayed navigation state
- Breadcrumb trails longer than 5 crumbs now collapse the middle with an ellipsis instead of wrapping and clipping
- Long folder/gallery names in breadcrumbs now show in full more often (widened from 200px to 320px) and reveal the complete name on hover via tooltip if still truncated
- Browser Back/Forward now walks folder navigation one level at a time instead of jumping straight to the dashboard root — folder clicks and breadcrumb clicks now push real history entries
- Mobile gallery back button now returns to the actual previous page/folder (`navigate(-1)`) instead of always returning to the dashboard root
- Fixed page scroll position carrying over between pages on mobile — navigating to a new page (including into a folder) now correctly resets scroll to the top

**Client ↔ Gallery Linking**
- Added "Attach Gallery" button on the Client page, letting a photographer link an existing unlinked gallery directly from Client Detail instead of only from Gallery Settings
- Fixed client avatar initials being nearly unreadable (low-contrast gray-on-gray) in the client picker dropdown — clients now get a distinct, readable color
- Client picker now shows actual uploaded client photos where available, falling back to colored initials otherwise — consistent with the Clients list
- Fixed the gallery picker's selected-item display clipping the gallery title down to a few characters when the event name/date didn't leave it enough room

**Dashboard**
- Fixed folder thumbnail grids only ever showing 3 of 4 possible cover images, leaving the bottom-right cell empty even when a folder had 4 or more galleries

**Infrastructure**
- Fixed the daily activity digest and expiry reminder cron jobs failing silently every run since `pg_net` (the Postgres extension that lets `pg_cron` make HTTP calls to Edge Functions) was not installed on the database — reinstalled `pg_net` and corrected an incorrect API key type on the activity digest job's auth header

---

## v1.3.8 — June 24, 2026

### Bug Fixes
- Fixed high-resolution ZIP downloads failing (503 error) on galleries with a large number of full-resolution images — the download is now streamed image-by-image instead of loading the entire archive into the Worker's memory at once, removing the prior size ceiling
- High-resolution download progress now shows real progress (estimated size downloaded) instead of a static "preparing" message with no movement

### Notes
- A design spec for a fully asynchronous, queue-based ZIP download system has been added to `docs/tier3-async-zip-queue-spec.md` for a future release — intended to add resilience to network interruptions and support arbitrarily large galleries via email notification when a download is ready

---

## v1.3.7 — June 20, 2026

### New Features
- Sessions can now be linked to multiple galleries instead of just one
- A new editable review step appears before creating a client from a walk-up submission, with name and email pre-filled from the submission's structured fields
- Added a copy button next to submitted emails in the Sessions submissions list

### Bug Fixes
- "Create client record" now reliably pulls name and email from the submission's built-in fields instead of guessing from custom question labels
- Removed a hardcoded "Hi {name}," greeting from gallery emails — `{{client_name}}` remains available as a template variable for anyone who wants to include their own greeting
- Fixed a runtime error when selecting an email template after the Insert Template dropdown was converted to use PortalMenu
- Fixed invalid nested-button markup in the submissions list and increased the copy-email button's tap target for mobile

---

## v1.3.6 — June 17, 2026

### Bug Fixes
- A custom-uploaded gallery cover (not part of the gallery's image set) now correctly appears on the Dashboard, in folder thumbnails, and during drag-and-drop — previously it only showed when viewing the gallery directly
- Clicking a variable in Email and Contract templates now inserts it at the actual cursor position instead of always appending to the end
- Markdown formatting (bold, italic, headings, lists) now renders correctly in sent gallery emails instead of showing literal asterisks and hashes
- Sending a gallery email to more than 5 recipients no longer silently fails for recipients past the 5th — emails are now throttled and retried to stay within Resend's rate limit
- The "Insert template" dropdown in the email composer no longer gets clipped by the modal's scroll area

---

## v1.3.5 — June 16, 2026

### Bug Fixes
- Bookmarking an image in a gallery now correctly reflects its bookmarked state after switching sets and back — previously the bookmark icon would silently reset even though the bookmark was saved
- The Bookmarked page now displays the current version of an image, including watermark changes — previously it could serve a stale cached preview that ignored re-watermarking

---

## v1.3.4 — June 16, 2026

### New Features
- Submissions can now be deleted directly from the Session Detail submissions list — previously only possible via direct database access

### Bug Fixes
- Added missing `VITE_GOOGLE_PLACES_KEY` production environment variable to Cloudflare Pages — address autocomplete in Session and Gallery location fields was silently non-functional in production

---

## v1.3.3 — June 16, 2026

### Bug Fixes
- Client Favorites detail panel no longer renders both mobile and desktop versions simultaneously — was causing duplicate UI and likely the root cause of intermittent Playwright flakiness in this area
- Desktop favorites panel now closes correctly on backdrop click

---

## v1.3.2 — June 16, 2026

### Bug Fixes
- Sessions were showing under all clients regardless of link — now correctly filtered by `client_id`
- Gallery linking added to Session Detail — link or unlink a gallery directly from the Overview section
- Contract `{{event_date}}` variable now falls back to session date when no gallery is linked
- Contract `{{photographer_email}}`, `{{photographer_phone}}`, `{{photographer_address}}`, `{{governing_state}}` variables now resolve correctly in the Send Contract preview
- Removed duplicate client row from Session Detail Overview (client already shown in header)

---

## v1.3.1 — June 16, 2026

### New Features

**Studio Logo**
- Upload a studio logo under Account → Profile — accepts PNG, JPG, WebP, and SVG (SVGs are automatically converted to PNG on upload)
- Logo appears in the client gallery gate screen (replacing plain studio name text)
- Logo appears in the questionnaire submission form header
- Logo appears in gallery notification emails and questionnaire emails — falls back to business name text if no logo is set
- New public `/logo/` Worker endpoint serves logo files without authentication

### Bug Fixes
- Submissions search now correctly matches against submitter email and credit handle (previously only searched answer text)
- SubmitForm footer now shows FinalVault logo mark instead of plain text

---

## v1.3.0 — June 16, 2026

### New Features

**Sessions**
- New Sessions section — create and manage photography sessions with full details (name, type, mode, date, time, location, description, internal notes)
- Two session modes: Private (one client, booked session) and Walk-up (open QR form for events)
- Session statuses: Inquiry, Booked, Completed, Delivered, Archived — with Kanban board view (drag-to-update) and List view
- Session type icons — unique icons per session type (Portrait, Convention, Boudoir, Headshot, Sports, and more)
- Session detail page — compact header with scrollable status pills, label/value info rows, financials section
- Financial tracking per session — session fee, retainer, retainer paid toggle, balance due, balance due date, payment status (Unpaid/Partial/Paid)
- Sessions card on Client Detail — shows linked sessions between Galleries and Contracts sections

**Questionnaires**
- Questionnaire template builder in Account → Templates — create, edit, duplicate, and delete questionnaire templates
- Drag-and-drop question reordering within templates
- Question types: short text, long text, multiple choice, single choice, yes/no
- Assign questionnaires to sessions at creation or edit time
- Per-questionnaire send links — sequential workflow, one questionnaire at a time
- Walk-up public submission form at `/submit/:token?q=:questionnaireId`
- Submissions viewer on Session Detail — grouped by questionnaire, paginated, CSV export, "Create client" action from walk-up submissions

**Contracts**
- Contracts now live exclusively under Sessions (removed Send Contract from Client Detail)
- Session variables in contracts: `{{session_name}}`, `{{session_date}}`, `{{session_time}}`, `{{session_location}}`, `{{session_fee}}`, `{{retainer_amount}}`, `{{balance_due}}`, `{{balance_due_date}}`

**Mobile UX**
- New Session and New Client modals now use BottomSheet on mobile (slide-up, swipe-to-close, drag handle) and inline centered dialog on desktop
- Edit Session and Edit Client modals same responsive treatment
- FilterSheet replaces inline filters on Clients and Sessions mobile
- Sessions defaults to list view on mobile, Kanban on desktop
- Mobile header consistency across Galleries, Clients, Sessions (44×44 buttons, SlidersHorizontal filter icon, #111 + button)

**UI Components**
- `KanbanBoard` — reusable Kanban component with drag-to-update, optimistic local state, snap-flicker fix
- `FilterSheet` — reusable mobile filter bottom sheet with single and multi-select support
- `MarkdownToolbar` — toolbar for contract and email template editors
- `PlaceAutocomplete` — venue/place autocomplete for session location
- `ClientPicker` now used in New Session and Edit Session modals (replaces plain select)

### Bug Fixes
- Fixed BottomSheet rendering using createPortal to document.body (escaped overflow:hidden parents)
- Fixed mobile nav z-index (z-30) so backdrop covers it correctly
- Fixed dashboard gallery filter button pop-in
- Fixed Clients page max-width constraint (now matches Sessions full-width layout)
- Fixed tags initial state in New Client modal (was string, now array)

### Tests
- Playwright E2E suite updated for all v1.3.0 changes

---

## v1.2.0 — June 12, 2026

### New Features

**Client CRM**
- New Clients section — create and manage client records with full contact info (name, email, phone, address, city, state, ZIP)
- Client detail page showing all client info, linked galleries, contracts, and notes
- Client list with search, tag filter, avatar initials, pronouns display, phone on desktop
- Client avatars — upload, crop, and zoom a profile photo per client using react-easy-crop
- Pronouns field — dropdown (she/her, he/him, they/them, and more) shown inline next to client name on both list and detail views
- Google Places address autocomplete in both New Client and Edit Client modals
- Tag management — chip+typeahead tag input with autocomplete from existing client tags; create new tags on the fly; backspace to remove

**Contract Management**
- Send contracts to clients directly from Client Detail — searchable template picker, gallery picker, contract preview with edit/preview toggle, and confirm-and-send step
- Contract templates — create, edit, duplicate, and delete templates in Account → Templates with live preview and variable fill
- Contract variables — `{{client_name}}`, `{{client_address}}`, `{{photographer_name}}`, `{{studio_name}}`, `{{photographer_email}}`, `{{photographer_phone}}`, `{{photographer_address}}`, `{{governing_state}}`, `{{gallery_title}}`, `{{event_name}}`, `{{event_date}}`, `{{session_fee}}`, `{{retainer_amount}}`, `{{balance_due}}`, `{{balance_due_date}}`, `{{cancellation_days}}`, `{{today_date}}`, `{{sign_date}}`
- Gallery picker in Send Contract modal — auto-selects when client has one gallery; shows searchable picker when multiple galleries exist; "No specific gallery" option
- Three default contract templates included: General Photography Services Agreement, Print Release, Photo Licensing Agreement — all marked as templates with a disclaimer notice
- Client signing flow — typed digital signature, legally binding under US ESIGN/UETA, SHA-256 body hash, IP/timestamp audit trail, signed PDF stored in R2
- Photographer counter-sign from Contract Detail
- Resend button on Contract Detail for sent/draft contracts

**Account — Business Information**
- New Business Information fields in Account → Profile: business email, business phone, street address, city, state, ZIP, and governing state
- All fields save on blur, consistent with existing profile fields
- Business info auto-fills contract variables when sending contracts

**UI Components**
- `GalleryPicker` — searchable combobox for selecting a gallery, modeled after ClientPicker
- `TemplatePicker` — searchable combobox for selecting a contract template, modeled after ClientPicker
- `SearchSelect` — reusable inline searchable list component
- `TagInput` — chip+typeahead tag input with autocomplete and create-on-the-fly
- `AddressAutocomplete` — shared Google Places address autocomplete component

### Bug Fixes
- Fixed border shorthand conflicts in Clients row (React console warnings)
- Fixed overflow shorthand conflicts in SendContractModal (React console warnings)
- Fixed SendContractModal scroll behavior on mobile
- Fixed mobile footer layout in contract review step
- Fixed tags not saving when TagInput array was passed as string to createClient/updateClient
- Fixed pronouns not saving — added pronouns field to updateClient and createClient in crmApi.js

### Tests
- Added Playwright E2E test suite for all v1.2.0 CRM flows (38 tests): client list, new client modal, client detail, send contract modal, contract detail, account business info

---

## v1.1.6 — June 6, 2026

### New Features

**Dashboard Gallery Sort**
- New sort dropdown on the dashboard — sort by Created, Event Date, Last Updated, or Name
- Sort applies to both galleries and folders in the current view
- Sort available in the mobile filter sheet under "Sort by"

**Dashboard Display Options**
- New display button on desktop — toggle between Default and Large grid sizes
- Grid size control lives in the desktop toolbar; hidden on mobile (full-width already)

**Dashboard Filter Improvements**
- All filters (Status, Event Date, Expiry, Tags) now flatten folder structure and show matching galleries across all folders — same behavior as search
- Mobile filter sheet redesigned with drill-down navigation — each filter opens a clean sub-screen with radio or checkbox selection
- Filters auto-apply on selection (no separate Apply button needed)
- Mobile header buttons are now icon-only with larger 44px tap targets

**Shared Bottom Sheet Component**
- All mobile bottom sheets (Dashboard filters, Gallery action sheet, Notification bell, Activity panel) now use a shared BottomSheet component
- Consistent swipe-down-to-close from the drag handle across every sheet
- Background scroll locked when any sheet is open
- Scroll chaining prevented — background no longer scrolls when touching non-scrollable sheet areas

---

## v1.1.5 — June 5, 2026

### New Features

**Gallery Category Tags**

- Create a tag library per account with custom colors via Account → Tags
- Assign tags to galleries from Gallery Settings → General with typeahead autocomplete and inline tag creation
- Tags persist across galleries — create once, reuse everywhere
- Dashboard search now matches tag names — search "convention" to find all tagged galleries
- New Tags filter pill on the dashboard — multi-select with AND logic (gallery must have all selected tags)
- Tag filter flattens folder structure to show matching galleries across all folders
- Tags filter included in mobile filter sheet

---

## v1.1.4 — June 5, 2026

### Bug Fixes

**Activity Digest**
- Fixed activity digest emails not sending since June 1st
- Root cause: Supabase migrated to new API key format (`sb_publishable_` / `sb_secret_`) which is not a JWT and cannot be used in Edge Function Authorization headers
- Redeployed all three Edge Functions (`send-activity-digest`, `send-gallery-email`, `send-expiry-reminder`) with `--no-verify-jwt` flag
- Updated cron job to use new key format with both `apikey` and `Authorization` headers

**Image Uploads**
- RAW camera files (CR2, CR3, NEF, NRW, ARW, SR2, DNG, RAF, ORF, RW2, PEF, SRW) are now explicitly rejected at upload time
- Custom error modal shows rejected filenames and lists supported formats (JPEG, PNG, TIFF, HEIC)
- Upload zone label updated — RAW removed from supported formats list

**Folder Covers**
- Fixed folder cover upload failing with 403 error — `photographer_id` was missing from folder queries
- Folder cover images upload correctly to `photographers/{id}/folders/{id}/cover.{ext}` path

**Scroll**
- Removed `overscroll-behavior: none` that was unintentionally blocking vertical scroll throughout the app (introduced in v1.1.2)

---

## v1.1.3 — June 4, 2026

### New Features

**Gallery Guide**
- First-time clients see an onboarding modal walking them through the gallery
- Steps are dynamic — only features that are enabled on the gallery appear (downloads, favorites, comments)
- Download step description adjusts based on whether web size, high-res, or both are available
- Guide is dismissed with a single "Go to gallery" button and never shown again (stored in localStorage)
- Photographers can enable or disable the guide per gallery via Settings → Sharing

---

## v1.1.2 — June 4, 2026

### Bug Fixes

**iOS Safari Layout Fix**
- Fixed iOS Safari automatically zooming the page by 6.67% due to automatic text size adjustment
- Root cause: Safari was bumping font size from 15px to 16px and zooming the entire page to compensate (`visualViewport.scale` was 1.0666667 instead of 1.0)
- This caused UI elements (download button, sticky header) to appear cut off on the right edge
- Also caused the page background to visibly shift when swiping in the lightbox
- Fixed with `-webkit-text-size-adjust: 100%` — tells Safari the text size is already correct

---

## v1.1.1 — June 4, 2026

### New Features

**Folder Cover Photos**
- Set a custom cover image for any folder via the ⋮ menu
- Full focal point picker — drag the circle to control how the image crops in the folder card
- Select from images already inside the folder's galleries, or upload a custom image
- Remove custom cover to revert to the automatic 2×2 gallery thumbnail grid

**Web JPEG Generation at Upload Time**
- Web size downloads are now generated client-side at upload time and stored as a separate R2 file
- Downloads serve the pre-generated JPEG directly — zero WASM processing in the worker
- Eliminates 503 errors on large print-quality images (12–20MB+) that previously exceeded worker memory limits
- Old images fall back to the previous WASM path automatically
- Storage meter only counts original file sizes — web and preview files are hidden infrastructure

### Bug Fixes

**Mobile / iOS**
- Fixed horizontal scroll caused by set tabs container being wider than the viewport
- Added `overflow-x: hidden` globally to prevent horizontal drift
- Hero and root container now use `100svh` instead of `100vh`
- Sticky header constrained to `100%` width with `box-sizing: border-box`
- iOS share sheet no longer re-prompts after user cancels download

**Downloads**
- Fixed 503 errors on web size downloads for large images (WASM memory limit exceeded)
- Added WASM cold-start retry — worker retries once on `unreachable` error before failing
- Worker upload handler now accepts `/web/` and `/folders/` key paths

**Client Gallery**
- Comment button in lightbox no longer closes the lightbox before opening comments
- Comment overlay z-index raised above lightbox
- Scrollbar hidden on client gallery

**Photographer Dashboard**
- Swipe down to close mobile action sheet now works correctly

### Infrastructure
- R2 worker serves `web_r2_key` directly for fast zero-processing downloads
- `gallery_folders` table: added `cover_r2_key`, `cover_focus_x`, `cover_focus_y` columns
- `gallery_images` table: added `web_r2_key`, `web_size` columns

---

## v1.1.0 — June 3, 2026

### New Features

**Gallery Folders**
- Organize galleries into folders with unlimited nesting depth
- Drag and drop galleries into folders (desktop)
- Navigate folders with breadcrumb trail showing full path
- Create, rename, and delete folders via ⋮ menu on folder cards
- Delete folder with contents shows warning with subfolder and gallery counts before confirming
- Move gallery to folder via navigable Finder-style picker (no flat list)
- New gallery created inside a folder is automatically assigned to that folder
- Gallery count subtitle shows count for current folder only, not total
- Folder breadcrumb persists when navigating into a gallery and back

**Client Favorites — Photographer View**
- Activity page shows which clients favorited which images
- Client cards display viewer email and favorited image count
- Click a client card to open a detail panel with image thumbnails and timestamps
- Thumbnails open a lightbox with full navigation
- Delete a client's favorites record from the ⋮ menu

**Client Gallery — Lightbox Comments**
- Comment button now available inside the image lightbox
- Comment sheet overlays the lightbox without closing it

### Improvements

**Navigation & Breadcrumbs**
- Gallery detail, settings, and activity pages now show breadcrumb navigation
- Breadcrumb shows full folder path
- Clicking any folder segment navigates back to that exact folder level

**Performance**
- Preview images cached in memory after first load
- In-flight request deduplication prevents redundant R2 requests

**Uploads**
- Removed rate limiting on upload and watermark endpoints
- Large batch uploads no longer hit rate limits

**Mobile Downloads (iOS)**
- Downloads on iOS Safari now use the native Web Share API
- Users can save directly to Photos from the share sheet

**Gallery Cards**
- Image card ⋮ menu always visible on mobile
- Folder cards show creation date

### Bug Fixes
- Fixed drag handle z-index blocking gallery card ⋮ menu click
- Fixed folder deletion blocked by subfolders
- Fixed comment overlay z-index rendering behind lightbox

### Tests
- 473 passing across chromium, firefox, mobile-chrome, mobile-safari
- 5 skipped (intentional)

---

## v1.0.0 — May 31, 2026

Initial release of FinalVault.

**Core Features**
- Photographer dashboard with gallery management
- Gallery creation wizard with set management
- Image upload with client-side watermark application and R2 storage
- Client gallery delivery via share token with name gate and optional password
- Client favorites, comments, and ZIP download with optional PIN
- Web Size (watermarked) and High Res download options
- Gallery settings: status, expiry, password, PIN, download permissions, color themes, grid options
- Watermark management: upload, opacity, position, scale
- Share via email, direct link, and QR code
- Activity feed: views, favorites, comments, downloads per gallery
- Admin panel: user management, storage tiers
- Account: profile, avatar, storage meter
- Full Playwright test suite across 3 browsers + 2 mobile viewports
