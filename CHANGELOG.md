# Changelog

All notable changes to FinalVault are documented here.

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
- Also added `overscroll-behavior: none` to prevent iOS elastic horizontal bounce

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
