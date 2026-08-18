# Custom Domains for Client-Facing Links — Design Spec

**Status:** Draft — not yet started, candidate for v1.5.6
**Author:** Nick Porterfield + Claude
**Date:** August 17, 2026

---

## 1. Problem statement

Every photographer's client-facing links today look like:

```
https://finalvault.dockercapphotography.com/g/69d77f4622f34cb281cea...
https://finalvault.dockercapphotography.com/book/9f3a1c...
https://finalvault.dockercapphotography.com/client/8e21b0...
```

Regardless of which photographer sent the link, the client sees FinalVault's domain,
not the photographer's own brand. Photographers asked for the ability to put their
own domain in front of these links — e.g. `book.janesmithphotography.com` — so their
gallery, booking, client portal, and questionnaire links look like part of their own
business, not a third-party tool.

## 2. Why this is more tractable than it sounds

Two things about FinalVault's existing architecture make this meaningfully simpler
than a typical multi-tenant custom-domain feature:

1. **Routing is already token-based, not domain-based.** Every public route
   (`/g/:token`, `/book/:token`, `/client/:portal_token`, `/submit/:submit_token`)
   identifies "which photographer / which gallery" entirely from the token in the
   URL path. The app never needs to know or care which domain served the request —
   a request to `book.janesmithphotography.com/g/abc123` and a request to
   `finalvault.dockercapphotography.com/g/abc123` resolve identically once they reach
   the app. This means **no new routing logic is needed at the application layer.**
2. **Public pages are already unauthenticated and use the anon Supabase client.**
   `ClientGalleryView.jsx`, `SignupBooking.jsx`, etc. call Supabase directly via
   `supabaseAnon`, which always targets the same Supabase project URL regardless of
   what domain served the frontend. There's no session/cookie tied to
   `finalvault.dockercapphotography.com` that would break under a different host.

Confirmed via `pg_get_functiondef`/codebase read (Aug 17, 2026) — this isn't assumed,
it's checked against the live app.

## 3. What actually needs to change

Given the above, the real work is narrower than "rebuild routing for multi-domain."
It breaks into four pieces:

### 3.1 Cloudflare for SaaS (Custom Hostnames) — infrastructure, one-time setup

This is the standard, well-trodden way to do this on Cloudflare, and Pixieset (a
direct competitor solving the identical problem) uses the equivalent pattern —
confirmed via their own help docs (Aug 17, 2026 web search).

- Available on Cloudflare's Free/Pro/Business plans, not Enterprise-only. 100
  hostnames included, then $0.10/hostname/month, up to 50,000 on pay-as-you-go.
  Trivial cost even at 100+ photographers.
- One-time setup on the `dockercapphotography.com` zone: enable Cloudflare for SaaS,
  configure a fallback origin (where custom-hostname traffic gets routed — the
  existing Cloudflare Pages deployment).
- Per-photographer: create a "custom hostname" via Cloudflare's API when they add a
  domain. Cloudflare handles DNS validation and automatic SSL certificate
  provisioning for each one.

**Subdomain-first, not apex-first.** Pixieset's own docs frame a subdomain
(`gallery.patriciajohnsonphoto.com`) as the primary, recommended path — one CNAME
record, works identically regardless of DNS provider. Apex/root domains
(`patriciajohnsonphoto.com` with no subdomain) require a CNAME + two A records and
have real, documented failure modes (CAA records blocking cert issuance, conflicting
AAAA records, longer propagation). Recommendation: **support subdomains as the
primary/only path in v1**, revisit apex support later if photographers actually ask
for it.

### 3.2 New table: `photographer_domains`

```sql
CREATE TABLE photographer_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id uuid NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
  domain text NOT NULL UNIQUE,              -- e.g. 'book.janesmithphotography.com'
  cloudflare_hostname_id text,              -- Cloudflare's custom hostname resource ID
  status text NOT NULL DEFAULT 'pending',   -- pending | active | error
  ssl_status text,                          -- mirrors Cloudflare's ssl.status
  verification_errors jsonb,                -- raw error detail from Cloudflare, for support/debugging
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

One domain per photographer in v1 (simpler UI, matches the likely actual need — a
photographer wants exactly one branded link surface, not several). `UNIQUE` on
`domain` prevents two photographers from accidentally claiming the same hostname.

### 3.3 New Edge Function: `manage-custom-domain`

Handles the Cloudflare API calls, since these need to be synchronous
(request → response with DNS instructions / status), which fits an Edge Function
better than a `pg_net`-fired Postgres RPC (the existing pattern for fire-and-forget
notifications, not request/response flows). Requires a normal authenticated
Supabase JWT (the photographer is logged into their dashboard) — no
`--no-verify-jwt` needed here, unlike the public-facing functions.

- `POST` (create): takes a domain string, calls Cloudflare's Create Custom Hostname
  API, stores the returned hostname ID + initial status in `photographer_domains`,
  returns the CNAME target + any TXT validation record for the UI to display.
- `GET` (status): re-checks the hostname's current status with Cloudflare (SSL
  issuance can take minutes to hours), updates the row, returns current state — used
  for polling from the UI.
- `DELETE` (remove): removes the custom hostname from Cloudflare, deletes the row.

Cloudflare API token stored as an Edge Function secret (`supabase secrets set`), not
in `vault.decrypted_secrets` — that pattern is Postgres-side and this call doesn't
originate from a Postgres function.

### 3.4 App changes: make generated links domain-aware

This is the part that's easy to miss. Six places in the codebase currently build
client-facing URLs from `window.location.origin` — which is *always*
`finalvault.dockercapphotography.com`, because that's the domain the photographer's
own dashboard is served from, regardless of any custom domain they've set up for
their *clients*:

| File | What it builds |
|---|---|
| `ShareButton.jsx` (×3) | Gallery share link |
| `ClientDetail.jsx` | Client portal link |
| `Dashboard.jsx` | Quick-copy gallery link |
| `SessionDetail.jsx` | Questionnaire submit link |
| `Sessions.jsx` | Signup/booking page link |

All six need to switch from `window.location.origin` to a shared helper —
`getPublicBaseUrl(photographerId)` or similar — that checks whether the
photographer has an `active`-status custom domain and uses it if so, falling back to
`window.location.origin` otherwise. One new function, six call-site swaps.

**Explicitly excluded from this list:** `Login.jsx`'s redirect URL (that's the
photographer's own login flow, always on the main FinalVault domain, never
client-facing) and the `claim_signup_slot` RPC's `v_session_url` (the link inside the
*photographer's own* new-booking notification email, pointing back to their internal
session view — also correctly stays on the main domain).

## 4. Non-goals (v1)

- Apex/root domain support (subdomains only, see §3.1)
- Multiple domains per photographer
- Self-branding the photographer's *own* dashboard/login (this is only about
  client-facing public links)
- Any billing/paid-tier gating (out of scope for this spec; a product decision for
  later if ever relevant)

## 5. Open questions

1. **CNAME target naming.** Something like `customers.finalvault.dockercapphotography.com`
   (a dedicated, documented target) vs. pointing directly at the Cloudflare Pages
   fallback origin. A dedicated target is slightly more setup but more flexible if
   the underlying hosting ever changes.
2. **UI location.** Account → a new "Custom domain" section seems like the natural
   fit (global to the photographer, not per-gallery), consistent with how
   `photographers.default_gallery_sort` and other account-level settings already
   live in `Account.jsx`. Confirm before building.
3. **Polling UX while SSL provisions.** Cert issuance can take from minutes to (rarely)
   hours per Cloudflare's own docs. Does the UI need an explicit "check status" button,
   automatic polling, or both? Precedent elsewhere in the app: none directly
   analogous — worth a quick mockup before building.
4. **Removal/error recovery UX.** What happens if a photographer's DNS is misconfigured
   and Cloudflare returns a validation error — do we surface Cloudflare's raw error
   text, or translate common failure modes (missing CNAME, CAA record blocking,
   propagation still pending) into plain-language guidance? Pixieset's docs suggest
   these are the actual common failure modes in practice, so probably worth
   pattern-matching on them specifically rather than showing raw API errors.

## 6. Suggested build sequence

1. Cloudflare account-level setup (enable Cloudflare for SaaS on the zone, fallback
   origin) — one-time, manual, not app code.
2. `photographer_domains` migration.
3. `manage-custom-domain` Edge Function (create/status/delete).
4. Account settings UI: add domain, show CNAME instructions, status indicator,
   remove domain.
5. `getPublicBaseUrl()` helper + the six call-site swaps.
6. End-to-end test with a real domain Nick owns, including the DNS propagation /
   cert issuance wait.
