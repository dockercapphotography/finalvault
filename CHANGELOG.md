# Changelog

All notable changes to FinalVault are documented here.

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
- Gallery detail, settings, and activity pages now show breadcrumb navigation instead of plain back button
- Breadcrumb shows full folder path (e.g. Galleries › 2026 › FanExpo › Private Shoots › Gallery Name)
- Clicking any folder segment in the breadcrumb navigates back to that exact folder level

**Performance**
- Preview images are now cached in memory after first load — re-renders and sort changes no longer re-fetch from R2
- In-flight request deduplication prevents redundant R2 requests when multiple renders fire simultaneously
- First load of a 160-image gallery: 166MB → 36MB transferred; subsequent loads: ~91KB transferred

**Uploads**
- Removed rate limiting on upload and watermark endpoints — JWT authentication is the real protection
- Download endpoint rate limit kept at 100 requests/min per IP
- Large batch uploads (180+ images) no longer hit rate limits

**Mobile Downloads (iOS)**
- Downloads on iOS Safari now use the native Web Share API, presenting the system share sheet
- Users can save directly to Photos from the share sheet
- Desktop and Android downloads unchanged (standard anchor download)

**Gallery Cards**
- Image card ⋮ menu is always visible on mobile (was hover-only, unusable on touch)
- Folder cards show creation date below gallery/subfolder count

### Bug Fixes
- Fixed drag handle z-index blocking gallery card ⋮ menu click
- Fixed gallery card navigation with 200ms hold-to-drag — clicks always register instantly
- Fixed folder deletion blocked by subfolders — now deletes entire subtree via server-side RPC
- Fixed comment overlay z-index rendering behind lightbox

### Tests
- 473 passing across chromium, firefox, mobile-chrome, mobile-safari
- 5 skipped (2 pre-existing, 2 intentional iOS download skips, 1 pre-existing upload)
- New specs: `client-favorites.spec.js`, `gallery-folders.spec.js`

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
