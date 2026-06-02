# FinalVault v1.0.0

**Release date: June 1, 2026**

This is the first public release of FinalVault — a self-hosted client gallery delivery platform for photographers. Built from the ground up as an alternative to Pixieset and Shootproof, FinalVault gives photographers full ownership of their delivery experience with no monthly SaaS fees.

---

## What's Included

### Gallery Management
- Create galleries with title, client name, event name, event date, and internal notes
- Organize images into named **photo sets** (e.g. Previews, Edited Finals, BTS)
- Drag-to-reorder sets and images within sets
- Move images between sets via context menu or bulk action bar
- Set a **cover image** with focal point drag control — used in the gallery hero and email
- **Gallery templates** — save display settings, sets, access settings, and watermark as a reusable template for faster creation
- **8 color themes** for the client gallery: Light, Dark, Slate, Dusk, Ember, Sage, Blush, Noir

### Watermarking
- Upload and manage multiple watermark images (PNG or SVG — SVGs auto-converted to PNG)
- Configure opacity, position (center, corners), and scale per watermark
- Apply to a single image, an entire set, or bulk-selected images
- Per-gallery watermark override — choose a specific watermark per gallery
- Each image records exactly which watermark was applied, ensuring downloads always use the correct version even if the active watermark changes later

### Download Architecture
Three independent download types — never confused:

| Type | Source | Processing | Watermark |
|------|--------|-----------|-----------|
| Gallery display | WebP preview | None | Baked in at upload |
| Web size download | Original | Resize to 2048px | Applied fresh via Worker |
| High-res download | Original | None | None — clean delivery |

Single-image downloads handled by the Cloudflare Worker. ZIP downloads split by type — web size processed client-side via Canvas + JSZip with per-image progress; high-res packaged by the Worker with no CPU limits.

### Client Gallery Experience
- **Email gate** on first visit — clients enter their email address (no account required)
- Optional **gallery password** and separate **download PIN**
- Full-bleed cover image hero with focal point support
- Set tabs for multi-set navigation
- Responsive image grid with configurable thumbnail size and spacing
- **Full-screen lightbox** with pinch-to-zoom, double-tap, swipe navigation, and body scroll lock
- Heart/favorite individual images
- Leave comments on individual images
- Download individual images or full-gallery ZIP with progress modal
- Right-click and drag protection on preview images

### Access & Sharing
- Per-gallery active/inactive toggle and expiry date
- Share via **email** (with custom templates and variable substitution), **direct link**, or **QR code**
- Email delivery includes cover image, access details, and social/payment links in footer
- **Expiry reminder emails** — automatically notify clients before their gallery expires (1, 3, 7, 14, or 30 days), configurable per gallery

### Activity & Notifications
- Per-gallery **activity log** — views, downloads, favorites, comments
- **Notification bell** — last 7 days of activity across all galleries, grouped by day
- **Daily activity digest emails** — morning summary of client activity (favorites, comments, downloads) with per-event notification toggles in Account settings

### Account
- Profile: display name, business/studio name, profile photo
- Security: email and password change
- Watermarks: upload, configure, set active watermark
- Gallery Templates: create, edit, duplicate, delete
- Email Templates: reusable templates with variable substitution (`{{gallery_name}}`, `{{client_name}}`, etc.)
- Social links: Instagram, Facebook, TikTok, X, YouTube, Pinterest
- Payment links: Venmo, PayPal, Ko-Fi, Cash App
- Notification preferences: per-event digest toggles
- Storage meter showing current usage vs. plan limit

### Bookmarks
- Bookmark galleries and individual images for quick reference
- `/bookmarked` route with Galleries and Photos tabs
- Bookmarked photo lightbox with View Gallery navigation

### Admin Panel
- User management with storage tier assignment
- Storage tier management: create, edit, delete tiers with GB limits
- Mobile-friendly layout

### PWA
- Installable as a home screen app on iOS and Android
- Service worker with network-first caching for the app shell

---

## Infrastructure

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Tailwind CSS v4, Vite 7 |
| Database & Auth | Supabase (PostgreSQL + RLS + Edge Functions) |
| Storage | Cloudflare R2 |
| Image Processing | `@cf-wasm/photon` (worker-side) + Canvas API (client-side) |
| Deployment | Cloudflare Pages |
| Email | Resend |
| Scheduling | pg_cron (daily digest + expiry reminders) |
| Testing | Playwright — 387 end-to-end tests passing |

---

## v1.1.0 Roadmap

- **Gallery folders** — hierarchical folder organization for galleries using PostgreSQL `ltree`. Planned support for nested folders (e.g. PopCon Indy → PopCon Indy 2026 → Hall Shots). UI will support 2 levels initially with arbitrary depth at the data layer.
- **Self-serve billing** — Stripe integration for photographers to upgrade storage tiers without admin intervention
- **Async ZIP queue** — server-side job queue for large gallery downloads via Cloudflare Queues + email notification when ready
- **Google Analytics** — visitor and funnel tracking for marketing insights once user acquisition begins

---

## Known Limitations

- **Storage tier enforcement** — hard limits are in place and enforced per tier. Free tier is 5 GB. Upgrading to a higher tier currently requires manual assignment by an admin; self-serve billing and plan upgrades via Stripe are planned for v1.1.
- **EXIF stripping** — originals are stored as-is. Photographers should strip GPS data on export from Lightroom or Capture One if privacy is a concern.
- **Async ZIP queue** — very large galleries may hit browser memory limits on web-size ZIP downloads. A server-side queue is planned for v1.1.

---

## Self-Hosting Cost

FinalVault is designed to run on free or near-free infrastructure:

| Service | Free Tier |
|---------|-----------|
| Cloudflare Pages | Unlimited deployments |
| Cloudflare R2 | 10 GB storage, 1M ops/month |
| Supabase | 500 MB database, 2 GB storage |
| Resend | 3,000 emails/month |

---

*FinalVault is proprietary software. Copyright © 2025–2026 Docker Cap Photography. All rights reserved.*
