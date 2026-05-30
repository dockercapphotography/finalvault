# FinalVault

**Professional client gallery delivery for photographers.**

FinalVault is a web-based client gallery platform built for photographers who want to own their delivery experience without paying monthly SaaS fees to Pixieset or Shootproof. Upload your edited images, configure access settings, and share a polished, mobile-friendly gallery link with your clients.

Clients get a beautiful, branded gallery experience — no account required. They can browse, favorite, comment, and download their photos. You stay in control of exactly what they can do and for how long.

Built on the same infrastructure as PoseVault — Cloudflare R2 for storage, Supabase for the database and auth, and Cloudflare Pages for deployment.

---

## Features

### Gallery Management
- Create galleries with title, client name, event name, event date, and internal notes
- 2-step gallery creation: info → define photo sets
- Every gallery requires at least one set — no ungrouped images
- Drag-to-reorder sets and images within sets
- Move images between sets via context menu or bulk action bar
- Set cover image with focal point adjustment
- Gallery templates — save display settings, sets, access settings, and watermark as a reusable template
- Gallery activity log — see who viewed, favorited, downloaded, and commented

### Photo Sets
- Organize images into named sets (e.g. Previews, Edited - Proofs, Final Delivery)
- Horizontally scrollable tab strip with drag-to-reorder
- Per-set context menu: rename, watermark entire set, delete
- Set deletion also removes all images in the set
- Client gallery shows sets as tabs

### Image Management
- Batch image upload with progress tracking
- WebP preview generation with watermark applied client-side via Canvas API
- Drag-to-reorder images within a set
- Per-image context menu: download (web size or original), move to set, watermark, delete
- Bulk action bar: select all, download ZIP, move to set, watermark, delete
- Cover image picker with focal point drag control

### Watermarking
- Upload and manage multiple watermark images
- Configure opacity, position (center, corners), and scale per watermark
- Apply watermark to a single image, an entire set, or bulk-selected images
- Progress bar modal during processing — locked to prevent window close
- Per-gallery watermark override — select a specific watermark per gallery, falling back to the active watermark
- Each image records which watermark was applied (`gallery_images.watermark_id`) — downloads always use the exact watermark that was baked into the preview, even if the active watermark changes later

### Download Architecture

Three distinct download types — never confused:

| Type | Source | Processing | Watermark | Format |
|------|--------|-----------|-----------|--------|
| **Gallery display** | `/preview/` WebP | None | Baked in at upload | WebP |
| **Web size download** | `/original/` | Resize to 2048px long edge | Applied fresh via worker (Photon WASM) | JPEG |
| **High resolution download** | `/original/` | None | None — clean final delivery | Original format |

**Single image downloads** are handled by the R2 Worker (`GET /download/:key?size=web|hires&watermark_id=...`). The worker fetches the original, resizes and composites the watermark (using `@cf-wasm/photon`) for web size, or serves the raw file for high resolution.

**ZIP downloads** split by type:
- *Web size ZIP* — processed entirely client-side (Canvas API + JSZip) to avoid Cloudflare Worker CPU limits. Each image is fetched, resized, watermarked, and encoded as JPEG in the browser sequentially. A progress modal shows per-image status.
- *High resolution ZIP* — processed by the R2 Worker, which streams raw originals directly into a ZIP. No image processing required, so no CPU limit issues.

### Client Gallery Experience
- Name gate on first visit (stored in session)
- Optional gallery password protection
- Optional download PIN (separate from gallery password)
- Full-bleed cover image hero with gradient overlay and focal point support
- Set tabs below the hero for multi-set navigation
- Responsive image grid with configurable thumbnail size and spacing
- Full-screen lightbox with pinch-to-zoom, double-tap to toggle zoom, swipe navigation
- Swipe to navigate at 1× zoom; pan when zoomed in
- Body scroll locked while lightbox is open
- Heart/favorite individual images
- Leave comments on individual images
- Download individual images (web size or high-resolution original)
- Download all as ZIP with progress modal — web size shows per-image progress bar; high resolution shows spinner while worker packages files
- Right-click and drag protection on preview images

### Access & Sharing
- Per-gallery access settings: active/inactive toggle, expiry date
- Password protection with plain-text storage for client sharing
- Download PIN (4-digit numeric)
- Allow/disable downloads, web-size downloads, high-resolution downloads
- Allow/disable favorites and comments
- Unique share token per gallery
- Share via email (with custom template), copy link, or QR code
- Email delivery via Supabase Edge Function with cover image, access details, and social/payment links in footer

### Gallery Templates
- Save a named template with: theme, grid size, grid spacing, default sets, access settings, and default watermark
- Two built-in templates: Classic Light and Classic Dark
- Create from scratch or duplicate any existing template
- Apply a template at gallery creation — stamps all settings and pre-fills sets
- Templates are per-photographer, fully editable and deletable

### Themes
Eight built-in color themes for the client gallery:

| Theme | Character |
|-------|-----------|
| Light | Clean white |
| Dark | Deep black |
| Slate | Cool blue-gray |
| Dusk | Warm purple twilight |
| Ember | Dark warm brown with amber accent |
| Sage | Muted green-gray |
| Blush | Soft warm white with dusty pink |
| Noir | Dark charcoal with silver accent |

All themes are defined in a single `themes.js` config file — adding a new theme is a one-line addition with no other changes required.

### Activity & Notifications
- Activity log per gallery: views, downloads, favorites, unfavorites, comments
- Notification bell in the sidebar — shows last 7 days of activity across all galleries
- Grouped by Today / Yesterday / date
- Per-action colored icons
- Unread badge count persisted via `notifications_last_read_at`
- Mobile: slide-up sheet with drag handle; Desktop: dropdown panel

### Account
- Profile: display name, business/studio name
- Security: email and password change
- Watermarks: upload, configure opacity/position/scale, set active watermark
- Gallery Templates: create, edit, duplicate, delete
- Email Templates: create reusable email templates with variable substitution
- Social links: Instagram, Facebook, TikTok, X, YouTube, Pinterest
- Payment links: Venmo, PayPal, Ko-Fi, Cash App
- Social and payment icons rendered in gallery email footer

### Admin Panel
- User management with storage tier assignment
- Storage tier management: create, edit, delete tiers
- Mobile-friendly card layout

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Tailwind CSS v4 |
| Build | Vite 7 |
| Backend | Supabase (PostgreSQL, Auth, Edge Functions) |
| Image Storage | Cloudflare R2 (S3-compatible) |
| R2 Proxy | Cloudflare Worker |
| Image Processing | @cf-wasm/photon (WASM, worker-side) + Canvas API (client-side) |
| Deployment | Cloudflare Pages |
| ZIP Downloads | JSZip (client-side web ZIPs) + custom ZIP builder (worker-side hires ZIPs) |
| Image Viewer | react-zoom-pan-pinch |
| Icons | Lucide React |
| Testing | Playwright (planned) |

---

## Project Structure

```
finalvault/
├── public/
│   └── brand-icons/             # Social and payment brand icons (PNG)
├── r2-worker/
│   └── src/
│       ├── index.js             # Worker entry point and router
│       ├── handlers/
│       │   ├── upload.js        # POST /upload — authenticated upload
│       │   ├── preview.js       # GET /preview/:key — gallery display only, never for downloads
│       │   ├── original.js      # GET /original/:key — photographer access only
│       │   ├── download.js      # GET /download/:key — unified download endpoint (web + hires)
│       │   ├── delete.js        # DELETE /:key — authenticated delete
│       │   ├── zip.js           # POST /download-zip — hires ZIP (raw originals)
│       │   └── watermark.js     # Watermark upload + serve (JWT or share token)
│       ├── middleware/
│       │   ├── auth.js          # JWT verification
│       │   └── shareToken.js    # Share token and PIN validation
│       └── utils/
│           └── imageProcess.js  # Shared image processing: resize, watermark, JPEG encode
├── supabase/
│   └── functions/
│       └── send-gallery-email/  # Email delivery with cover image, template vars, social/payment footer
├── sql/                         # Incremental database migrations
│   ├── 001_photographers.sql
│   ├── 002_galleries.sql
│   ├── 003_gallery_images.sql
│   ├── 004_gallery_viewers.sql
│   ├── 005_gallery_favorites.sql
│   ├── 006_gallery_comments.sql
│   ├── 007_gallery_activity_log.sql
│   ├── 008_storage_tiers.sql
│   ├── 009_photographer_storage.sql
│   ├── 010_storage_tiers.sql
│   ├── 011_gallery_templates.sql
│   └── 012_auth_user_trigger.sql
├── src/
│   ├── main.jsx                 # Entry point and routes
│   ├── App.jsx                  # Auth state orchestrator
│   ├── supabaseClient.js        # Authenticated Supabase client
│   ├── supabaseClientAnon.js    # Unauthenticated client for client-facing routes
│   ├── routes/
│   │   ├── Dashboard.jsx        # Gallery list with search and New Gallery button
│   │   ├── GalleryNew.jsx       # 3-step creation: template → info → sets
│   │   ├── GalleryDetail.jsx    # Photographer gallery view with sets and images
│   │   ├── GallerySettings.jsx  # 5 tabs: General, Access, Sharing, Display, Danger Zone
│   │   ├── GalleryActivity.jsx  # Activity log for a gallery
│   │   ├── ClientGallery.jsx    # Client gate page (name + password)
│   │   ├── ClientGalleryView.jsx # Client gallery with sets, lightbox, download modals
│   │   ├── Account.jsx          # Profile, Watermarks, Templates, Email, Social, Payment
│   │   └── Admin.jsx            # Users and storage tier management
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.jsx      # Desktop sidebar and mobile bottom nav
│   │   │   └── NotificationBell.jsx # Activity feed dropdown/sheet
│   │   ├── galleries/
│   │   │   ├── GalleryCard.jsx  # Dashboard gallery card
│   │   │   ├── ShareButton.jsx  # Email/link/QR share modal
│   │   │   └── CoverPickerModal.jsx # Cover image picker with focal point
│   │   ├── images/
│   │   │   ├── ImageCard.jsx    # Image thumbnail with context menu
│   │   │   ├── ImageGrid.jsx    # Grid with drag-to-reorder
│   │   │   ├── ImageUploader.jsx
│   │   │   ├── UploadProgress.jsx
│   │   │   ├── BulkActionBar.jsx # Bulk actions bar
│   │   │   └── SortDropdown.jsx
│   │   ├── watermarks/
│   │   │   └── WatermarkCard.jsx
│   │   └── ui/
│   │       ├── Button.jsx
│   │       ├── Input.jsx
│   │       ├── Modal.jsx
│   │       ├── Toast.jsx
│   │       ├── Toggle.jsx
│   │       ├── Badge.jsx
│   │       ├── Tabs.jsx
│   │       ├── SettingsSection.jsx
│   │       ├── SettingsRow.jsx
│   │       ├── StorageMeter.jsx
│   │       └── PortalMenu.jsx   # Self-contained context menu via React portal
│   ├── hooks/
│   │   ├── useImageUpload.js    # Upload handler — saves watermark_id at upload time
│   │   ├── usePreviewUrls.js    # Authenticated blob URL fetching with cache busting
│   │   └── usePageDrop.js       # Page-level drag-and-drop for file upload
│   └── utils/
│       ├── themes.js            # Central theme config — all 8 themes defined here
│       ├── galleryApi.js        # Gallery CRUD
│       ├── gallerySetApi.js     # Set CRUD and reordering
│       ├── galleryTemplateApi.js # Template CRUD and duplication
│       ├── imageApi.js          # Image CRUD including watermark_id
│       ├── clientApi.js         # Client-facing API — downloads, favorites, comments
│       ├── watermarkApi.js      # Watermark management
│       ├── imageProcessor.js    # Client-side image processing (Canvas API)
│       ├── r2.js                # R2 worker communication
│       └── formatters.js        # Date and file size formatting
├── .env.example
├── package.json
├── vite.config.js
└── wrangler.jsonc               # Cloudflare Worker config
```

---

## Environment Variables

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_R2_WORKER_URL=https://your-worker.workers.dev
```

---

## Deployment

**Frontend** — Cloudflare Pages, connected to the GitHub repo. Deploys automatically on push to `main`.

**R2 Worker** — deployed manually via Wrangler:
```bash
cd r2-worker
npx wrangler deploy
```

The worker must be deployed separately — Cloudflare Pages deploys do not include the worker.

**Supabase Edge Functions** — deployed via the Supabase CLI or dashboard.

**Database migrations** — run SQL files manually via the Supabase dashboard SQL editor in order.

---

## Database Schema (key tables)

| Table | Purpose |
|-------|---------|
| `photographers` | Photographer profiles, branding, social/payment links, notification tracking |
| `galleries` | Core gallery entity — settings, access, theme, cover, share token |
| `gallery_sets` | Named sets within a gallery with sort order |
| `gallery_images` | Images with R2 keys, set assignment, sort order, and `watermark_id` |
| `gallery_viewers` | Client session tracking (no account required) |
| `gallery_favorites` | Client favorites per image |
| `gallery_comments` | Comments on images from clients and photographer |
| `gallery_activity_log` | Audit trail: views, downloads, favorites, comments |
| `gallery_templates` | Reusable gallery creation templates |
| `watermarks` | Watermark images with opacity, position, and scale |
| `email_templates` | Reusable email templates with variable substitution |
| `storage_tiers` | Storage plan definitions |

All tables have Row Level Security (RLS) enabled. Photographers can only access their own data. Clients access galleries via share token with anon RLS policies. Watermarks are publicly readable (metadata only — the actual PNG is still served through the authenticated worker).

---

## Outstanding / Planned Work

- **Async ZIP queue** — for large galleries, a Pixieset-style async job queue (Cloudflare Queue + Supabase `download_jobs` table + email notification when ready). Requires client email collection first.
- **Client email collection** — optional email field at the gallery gate
- **Slideshow mode** — auto-advance in the client gallery lightbox
- **Email notifications to photographer** — on client view/favorite/download/comment
- **Client selection/proofing** — "Submit my selections" flow
- **Automated gallery expiry emails** — depends on client email + pg_cron
- **Preview image caching** — switch from `no-cache` to `private, max-age=3600` with watermark-timestamp cache-bust key
- **Mobile PWA** — manifest + icons done, needs installable manifest entry
- **Playwright test suite** — full end-to-end coverage (blocked on download architecture being stable — now unblocked)
- **Natural sort order** for filenames (e.g. `image-2.jpg` before `image-10.jpg`)

---

## License

Copyright © 2025-2026 Docker Cap Photography. All rights reserved.

This software and its source code are proprietary and confidential. No part of this project may be reproduced, distributed, modified, or used in any form without the express written permission of Docker Cap Photography.

Unauthorized use, copying, or distribution of this software is strictly prohibited.
