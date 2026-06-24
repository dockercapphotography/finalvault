# Async ZIP Job Queue — Design Spec ("Tier 3")

**Status:** Draft — not yet started
**Author:** Nick Porterfield + Claude
**Date:** June 24, 2026
**Supersedes:** The streaming-Worker fix shipped June 24, 2026 (see "Why this is still needed" below)

---

## 1. Problem statement

Hi-res ZIP downloads are built by a single Cloudflare Worker invocation that streams
every original image, one at a time, directly into the HTTP response as it's fetched
from R2. This fixed the original bug (a 199-image, ~326MB gallery was crashing the
Worker with a `503` because the old implementation tried to load every image into
memory simultaneously via `Promise.all` before building the ZIP).

The streaming fix removes the memory ceiling — peak memory is now bounded by the size
of one image, not the whole gallery. Cloudflare confirms there's no fixed wall-clock
limit on a Worker as long as the client stays connected and the response keeps
streaming. In principle this could scale indefinitely.

### Why this is still needed

The streaming fix has real, practical limits that justify a proper async system:

- **No resilience to disconnection.** If the client's network drops, the tab is
  closed, or the laptop sleeps mid-download, the entire job is lost. There's no
  partial result, no resume — the person has to start over from zero, every time,
  for however many hundred images are in the gallery.
- **No graceful large-gallery story.** A 2,000-image convention gallery (multiple GB)
  streaming over a client's home or mobile connection could realistically take much
  longer than anyone wants to sit on a page for, "please keep this window open" or
  not. There's no way to back away from the page and check back later.
- **No retry path for transient failures.** If R2 returns a transient error on image
  #150 of 199, today's code just skips that image silently and the rest of the ZIP
  finishes incomplete with no indication to the client which photo is missing.
- **One-at-a-time R2 fetches are slow for very large galleries.** Streaming
  necessarily processes images sequentially (to bound memory), so total wall-clock
  time scales linearly with gallery size. For small/medium galleries this is fine;
  for very large ones it isn't, and there's no way to parallelize within the
  single-request model without reintroducing the memory problem.
- **Poor UX for "set it and forget it."** Photographers and clients alike would
  rather kick off a big download and get notified when it's ready, especially for
  hundreds of full-resolution images that may take several minutes regardless of
  approach.

### Target

Replace the synchronous streaming download (for hi-res ZIPs specifically) with an
asynchronous job: the person clicks "Download All (High Res)," the system queues a
background job, the photographer or client can close the tab, and an email arrives
with a download link once the ZIP is ready. The web-size download flow (client-side,
already fast and reliable) is unaffected by this work.

---

## 2. What Cloudflare actually offers (researched June 24, 2026)

No managed "zip these files for me" product exists. The relevant building blocks:

| Need | Cloudflare offering | Notes |
|---|---|---|
| Run a background job after a request returns | `ctx.waitUntil()` | Capped at 30 seconds after response sent/client disconnects — **not long enough** for a multi-minute ZIP job. Not viable as the primary mechanism. |
| Decouple "start a job" from "run a job" | **Cloudflare Queues** | A message broker — one Worker produces a message, another consumes it. Right fit for "user clicks button → job gets queued → separate consumer Worker does the work whenever it's ready." |
| Multi-step durable background process | **Cloudflare Workflows** | Built for exactly this: each step's result is persisted; if a step fails, only that step retries, not the whole job. Supports running for hours/days and can `step.waitForEvent()`. This is the better fit than Queues alone if the job has multiple dependent steps (fetch → zip → upload → notify). |
| Temp storage with auto-cleanup | **R2 Object Lifecycle Rules** | Native, no custom cleanup code needed. Scope a rule to a prefix (e.g. `zip-jobs/`) with `Expiration: { Days: N }`. Rule changes can take up to 24h to propagate, irrelevant for an expiry policy. |
| Track job state | **D1 or Supabase** (existing project DB) | No specific Cloudflare primitive needed beyond what we already have — use a Postgres table in Supabase, consistent with the rest of the app's data model. |

**Recommendation: use Cloudflare Workflows**, not just Queues, for the job itself.
Workflows give us per-step retry semantics (if step 47 of 199 fails, only that step
retries, not the whole job from scratch) and durable execution across however long the
job takes, without us hand-rolling checkpoint/resume logic. Queues can still be the
trigger that kicks the Workflow off, if useful for decoupling, but Workflows alone may
be sufficient for a single-producer (the app) / single-consumer (the job) relationship.

---

## 3. Architecture overview

```
Client clicks "Download All (High Res)"
        │
        ▼
POST /zip-jobs  (new Worker endpoint)
  - validates auth/share token same as today's /download-zip
  - validates allow_hires_download same as today
  - inserts a row into zip_jobs (status: 'queued')
  - triggers a Cloudflare Workflow instance, passing the job id
  - returns { jobId } immediately (no waiting)
        │
        ▼
Client shows "We'll email you when it's ready" + closes the loop
        │
        ▼
Cloudflare Workflow (runs independently, no client connection needed)
  - step 1..N: fetch each image from R2, write into a streaming ZIP writer
    that uploads directly to R2 via multipart upload as it goes
    (same incremental-write principle as the current streaming fix,
    but writing TO R2 instead of TO the client)
  - step N+1: finalize the R2 multipart upload
  - step N+2: update zip_jobs row (status: 'ready', download_r2_key, completed_at)
  - step N+3: call existing Resend-backed Edge Function to email the
    photographer/client a download link
  - on any step failure after retries exhausted: status: 'failed',
    email a failure notice instead
        │
        ▼
Person clicks the email link → GET /zip-jobs/:id/download
  - verifies the job belongs to the right gallery/share token
  - redirects to (or streams) the R2 object
  - R2 lifecycle rule deletes the object automatically after N days
```

---

## 4. Data model

New Supabase table, `zip_jobs`:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `gallery_id` | uuid, FK → galleries, `ON DELETE CASCADE` | |
| `requested_by_viewer_id` | uuid, nullable, FK → gallery_viewers | null if photographer-initiated |
| `requested_by_photographer_id` | uuid, nullable, FK → photographers | null if client-initiated |
| `status` | text | `'queued' \| 'processing' \| 'ready' \| 'failed' \| 'expired'` |
| `image_count` | integer | total images requested |
| `images_completed` | integer | for progress reporting, updated per-step |
| `estimated_total_bytes` | bigint | sum of `file_size` at queue time, for UI display |
| `download_r2_key` | text, nullable | set once `status = 'ready'` |
| `error_message` | text, nullable | set if `status = 'failed'` |
| `notify_email` | text | where to send the "ready" email |
| `created_at` | timestamptz | |
| `started_at` | timestamptz, nullable | |
| `completed_at` | timestamptz, nullable | |
| `expires_at` | timestamptz | `created_at + 7 days`, mirrors the R2 lifecycle rule for the DB-side record |

RLS: photographers can read/manage jobs for their own galleries (mirrors the
`session_questionnaires`/`session_galleries` pattern already established in this
project — `gallery_id IN (SELECT id FROM galleries WHERE photographer_id = auth.uid())`).
Clients can read (not manage) jobs tied to their gallery via share token, similar to
the existing share-token read policies on other gallery-adjacent tables.

---

## 5. New/changed endpoints

| Endpoint | Change |
|---|---|
| `POST /zip-jobs` | **New.** Replaces hi-res calls to `/download-zip`. Body: `{ galleryId, imageKeys, fileNames, notifyEmail }`. Returns `{ jobId }` immediately. |
| `GET /zip-jobs/:id` | **New.** Poll endpoint for job status (used if we want an in-app "still processing" indicator in addition to email, e.g. for the photographer's own dashboard). |
| `GET /zip-jobs/:id/download` | **New.** Resolves to the finished R2 object once `status = 'ready'`; 404/410 if expired or not ready. |
| `POST /download-zip` | **Unchanged for `size: 'web'`.** Client-side path is untouched. The `size: 'hires'` branch can either be deprecated/removed once the new flow ships, or kept as a fallback for small galleries (e.g. under some threshold like 20 images) where synchronous streaming is still simpler and faster than the async round-trip. **Decision needed before implementation** — see Open Questions. |

---

## 6. Frontend changes

- `ClientGalleryView.jsx`: hi-res branch of `handleDownloadZip` calls the new
  `POST /zip-jobs` instead of `downloadZip(..., 'hires', ...)`. Replace
  `ZipProgressModal`'s hi-res branch with a simple confirmation state: "We're
  preparing your download — you'll get an email at `{email}` when it's ready. You can
  close this page." No more progress bar needed for hi-res (the byte-estimate
  approach built today becomes unnecessary and can be removed).
- Need a way to capture `notifyEmail` for client-initiated downloads — likely already
  have the viewer's email from the gallery's name-gate flow (`gallery_viewers`); for
  photographer-initiated downloads from `GalleryDetail.jsx`, use the photographer's
  account email.
- New email template (mirrors existing `send-gallery-email` patterns): "Your download
  is ready" with a button linking to `GET /zip-jobs/:id/download`.
- Failure email template: "We ran into a problem preparing your download" with a
  simple explanation and a way to retry (re-trigger `POST /zip-jobs`).

---

## 7. Open questions to resolve before building

1. **Keep a synchronous fallback for small galleries?** If yes, what's the threshold
   (image count or total bytes) below which we still use today's streaming
   `/download-zip` for instant gratification, versus always going through the queue?
2. **Polling vs. email-only?** Should the app also poll `GET /zip-jobs/:id` while the
   tab stays open (showing live progress if the person doesn't close the page), or is
   email-only sufficient? Polling adds complexity but improves UX for the common case
   of someone who just waits a few minutes instead of actually leaving.
3. **Multipart upload part-size tuning.** R2 multipart parts must be at least 5MiB
   (except the last). Need to batch images into parts that satisfy this minimum
   without holding too many images in memory before flushing a part — this is the
   one piece of real engineering risk in the spec and deserves a prototype/spike
   before committing to exact part-batching logic.
3. **Retry/backoff policy** for individual image fetch failures within a Workflow
   step — how many retries, what backoff, and at what point does a single missing
   image get skipped vs. failing the whole job?
4. **R2 lifecycle rule expiration window** — 7 days suggested above; confirm this
   matches photographer expectations (could tie to the gallery's own `expires_at` if
   shorter).
5. **Concurrent job limits per gallery/photographer** — should a person be blocked
   from queueing a second hi-res job while one is already in progress for the same
   gallery, to avoid wasted duplicate work?

---

## 8. Rough build sequence

1. Spike: confirm Cloudflare Workflows + R2 multipart upload together, with a small
   test gallery, before committing to the full design. This is the part of the spec
   with the most technical uncertainty.
2. `zip_jobs` table + RLS policies.
3. `POST /zip-jobs` endpoint (validation, job creation, Workflow trigger).
4. The Workflow itself (fetch-and-multipart-upload steps, retry policy, status
   updates).
5. `GET /zip-jobs/:id` and `GET /zip-jobs/:id/download`.
6. Ready/failure email templates + sending logic (reuse existing Resend integration).
7. Frontend: swap the hi-res button's behavior, simplify `ZipProgressModal`.
8. R2 lifecycle rule for the `zip-jobs/` prefix.
9. Playwright coverage: job creation, status transitions (can likely only test
   `queued` → mocked `ready` without actually running a multi-minute real job in CI),
   and the email-sent assertion pattern already established elsewhere in this project.
10. Decide and implement the small-gallery synchronous fallback, if kept (Open
    Question 1).
