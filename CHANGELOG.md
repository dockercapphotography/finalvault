# Changelog

All notable changes to FinalVault are documented here.

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
