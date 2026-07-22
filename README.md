<div align="center">

<img src="public/finalvault_logo.svg" width="64" height="64" alt="FinalVault" />

# FinalVault

**Professional client gallery delivery for photographers.**

Own your delivery experience. No monthly SaaS fees. No compromises.

[Live App](https://finalvault.dockercapphotography.com) · [Report a Bug](https://github.com/dockercapphotography/finalvault/issues) · [Request a Feature](https://github.com/dockercapphotography/finalvault/issues)

![Tests](https://img.shields.io/badge/tests-355%20passing-22c55e?style=flat-square)
![Cloudflare Pages](https://img.shields.io/badge/deployed-Cloudflare%20Pages-F38020?style=flat-square&logo=cloudflare&logoColor=white)
![Supabase](https://img.shields.io/badge/database-Supabase-3ECF8E?style=flat-square&logo=supabase&logoColor=white)

</div>

---

FinalVault is a self-hosted client gallery platform built for photographers who want full control over how they deliver work — without paying $30–60/month to Pixieset or Shootproof. Upload your edited images, configure access settings, and share a polished, mobile-friendly gallery link with your clients.

Clients get a beautiful, branded gallery experience with no account required. They can browse, favorite, comment, and download their photos. You decide exactly what they can do, for how long, and how it looks.

---

## Features

### For Photographers

- **Gallery management** — create galleries with client name, event details, internal notes, and named photo sets
- **Folder organization** — organize galleries into nested folders with drag-and-drop, breadcrumb navigation, full path tracking, custom folder cover photos, and the ability to move a folder (with its entire contents) into another folder
- **8 color themes** — Light, Dark, Slate, Dusk, Ember, Sage, Blush, Noir — applied per gallery
- **Watermarking** — upload watermark images, configure opacity/position/scale, apply per image, set, or in bulk
- **Gallery templates** — save your preferred settings as a reusable template for faster gallery creation
- **Flexible downloads** — three independent download types: gallery display (WebP preview), web-size JPEG (generated at upload time, served directly), and full-resolution original
- **Access controls** — gallery password, download PIN, expiry date, active/inactive toggle
- **Expiry reminders** — automatically email clients before their gallery expires (1, 3, 7, 14, or 30 days warning)
- **Activity feed** — see who viewed, favorited, downloaded, and commented across all galleries
- **Client Favorites** — see exactly which images each client favorited, with timestamps and a lightbox viewer
- **Daily digest emails** — morning summary of client activity, with per-event notification controls
- **Share via email, link, or QR code** — with custom email templates, variable substitution, and your social/payment links in the footer
- **Bookmarks** — save galleries and individual images for quick reference
- **Gallery Guide control** — enable or disable the client onboarding guide per gallery
- **Gallery category tags** — create a per-account tag library with custom colors, assign tags to galleries, filter and search by tag on the dashboard
- **Dashboard sort & display** — sort galleries by Created, Event Date, Last Updated, or Name (persists across sessions); Small/Default/Large grid sizes (persists across sessions); Status, Event Date, Expiry Date, and Tags filters, all in one unified Filters & sort panel shared across Galleries, Clients, and Sessions
- **Client CRM** — create and manage client records with contact info, avatars (upload a photo or pick straight from one of the client's linked galleries), pronouns, tags, and linked galleries (a gallery can be linked to multiple clients, e.g. both spouses in a wedding, each with full portal access); Google Places address autocomplete; chip+typeahead tag input with autocomplete; search, tag filtering (multi-select), and Sort By (Name, Recently added)
- **Contract management** — send contracts to clients with typed digital signatures (US ESIGN/UETA compliant), SHA-256 body hash, IP/timestamp audit trail, and signed PDF stored in R2; three default templates included (General Photography Services Agreement, Print Release, Photo Licensing Agreement)
- **Contract templates** — create reusable templates with variable substitution for client info, photographer business info, gallery details, fees, and more
- **Business information** — store your business email, phone, address, and governing state in Account → Profile; auto-fills contract variables
- **Client Portal** — generate a single, durable link for each client showing all their galleries, contracts, and outstanding questionnaires in one place; regenerate anytime to revoke an old link; optionally protect the whole portal with a password, with automatic escalating lockout after repeated wrong attempts and a manual reset if a client gets stuck
- **Session Signup Pages** — create a public, shareable booking page per event with its own venue, timezone, and shoot types; clients pick a time and book themselves, which atomically creates the client (or matches an existing one) and a real session, with automatic questionnaire assignment, database-enforced double-booking prevention across overlapping shoot types, calendar-ready confirmation emails (Google Calendar link + .ics), and a live status page for checking bookings on the go

### For Clients

- **No account required** — clients enter their email at the gallery gate, that's it
- **Gallery Guide** — first-time visitors see a short onboarding modal explaining how to download, favorite, and comment; steps adjust dynamically based on what's enabled
- **Set tabs** — galleries organized into named sections (Previews, Finals, etc.)
- **Full-screen lightbox** — pinch-to-zoom, double-tap, swipe navigation, body scroll lock
- **Favorites** — heart individual images; your photographer can see your picks
- **Comments** — leave notes on specific images, including from inside the lightbox; the photographer can reply, and each client only sees their own comments and the photographer's replies
- **Downloads** — web-size JPEG or full-resolution original, individual or full-gallery ZIP
- **Client Portal** — a single link showing all of your galleries (grouped by session, with search/sort/filter once you have several), contracts awaiting or already signed with downloadable PDFs, and any outstanding questionnaires; password- or PIN-protected galleries show their access code directly in the portal with one-click copy, and open in a new tab so the code stays visible while you browse
- **iOS native downloads** — save directly to Photos via the system share sheet
- **Right-click and drag protection** on preview images
- **Mobile PWA** — installable as a home screen app on iOS and Android

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Tailwind CSS v4 |
| Build | Vite 7 |
| Auth & Database | Supabase (PostgreSQL + Auth + Edge Functions) |
| Image Storage | Cloudflare R2 |
| Image Processing | `@cf-wasm/photon` (worker-side) + Canvas API (client-side) |
| Deployment | Cloudflare Pages |
| Email | Resend |
| Scheduling | pg_cron (daily digest + expiry reminders) |
| Testing | Playwright (321 end-to-end tests) |
| Icons | Lucide React |

---

## Self-Hosting

FinalVault is designed to run on free or near-free infrastructure. The full stack costs ~$0/month at modest usage:

| Service | Free Tier |
|---------|-----------|
| Cloudflare Pages | Unlimited deployments |
| Cloudflare R2 | 10 GB storage, 1M Class A ops |
| Supabase | 500 MB database, 2 GB file storage |
| Resend | 3,000 emails/month |

### Prerequisites

- Node.js 18+
- Supabase project
- Cloudflare account (R2 + Pages + Workers)
- Resend account

### Setup

**1. Clone and install**
```bash
git clone https://github.com/dockercapphotography/finalvault.git
cd finalvault
npm install
```

**2. Environment variables**

Copy `.env.example` to `.env` and fill in your values:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_R2_WORKER_URL=https://your-worker.workers.dev
```

**3. Database**

Run the SQL migrations in order via the Supabase SQL editor:
```
sql/001_photographers.sql
sql/002_galleries.sql
...
sql/020_gallery_tags.sql
```

**4. Deploy the R2 Worker**
```bash
cd r2-worker
npx wrangler deploy
```

Set the following Worker secrets via the Cloudflare dashboard or Wrangler:
```
SUPABASE_URL
SUPABASE_SERVICE_KEY
JWT_SECRET
```

**5. Deploy Edge Functions**
```bash
supabase functions deploy send-gallery-email
supabase functions deploy send-activity-digest
supabase functions deploy send-expiry-reminder
```

Set Edge Function secrets:
```
RESEND_API_KEY
R2_WORKER_URL
```

**6. Run locally**
```bash
npm run dev
```

**7. Deploy frontend**

Connect the repo to Cloudflare Pages. It deploys automatically on push to `main`.

---

## Running Tests

```bash
npx playwright install
npx playwright test
```

571 end-to-end tests covering auth, client gallery access, photographer workflows, gallery guide, category tags, dashboard sort/filter, uploads, and admin.

---

## Database Schema

| Table | Purpose |
|-------|---------|
| `photographers` | Profiles, branding, social/payment links |
| `galleries` | Core gallery entity — settings, access, theme, share token |
| `gallery_folders` | Nested folder organization for galleries |
| `gallery_sets` | Named sets within a gallery |
| `gallery_images` | Images with R2 keys, set assignment, watermark reference |
| `gallery_viewers` | Client session tracking (no account required) |
| `gallery_favorites` | Client favorites per image |
| `gallery_comments` | Comments on images |
| `gallery_selections` | Client proofing — submitted image selections |
| `gallery_activity_log` | Audit trail: views, downloads, favorites, comments |
| `gallery_templates` | Reusable gallery creation templates |
| `watermarks` | Watermark images with opacity, position, and scale |
| `email_templates` | Reusable email templates with variable substitution |
| `notification_preferences` | Per-photographer digest notification toggles |
| `storage_tiers` | Storage plan definitions |
| `gallery_tags` | Per-photographer tag library with custom colors |
| `gallery_tag_assignments` | Many-to-many tag assignments to galleries |

All tables use Row Level Security (RLS). Photographers access only their own data. Clients access galleries via share token through anon RLS policies.

---

## Project Structure

```
finalvault/
├── public/                      # Static assets, PWA manifest, brand icons
├── r2-worker/src/               # Cloudflare Worker — image serving, downloads, uploads
│   ├── handlers/                # upload, preview, download, zip, watermark
│   ├── middleware/              # JWT auth, share token validation
│   └── utils/                  # Image processing (resize, watermark, encode)
├── supabase/functions/          # Edge Functions — email delivery, digest, expiry reminders
├── sql/                         # Incremental database migrations (001–019)
└── src/
    ├── routes/                  # Page components
    ├── components/              # UI components (galleries, images, watermarks, layout)
    │   ├── client/              # Client-facing components (GalleryGuide, etc.)
    │   └── layout/              # Shared layout components (BottomSheet, PageWrapper, NotificationBell)
    ├── hooks/                   # useImageUpload, usePreviewUrls, usePageDrop
    └── utils/                   # API helpers, themes, image processing, R2 communication
```

---

## License

Copyright © 2025–2026 Docker Cap Photography. All rights reserved.

This software is proprietary and confidential. No part of this project may be reproduced, distributed, modified, or used in any form without express written permission.
