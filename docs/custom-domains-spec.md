# Custom Domains for Client-Facing Links — Design Spec

**Status:** Draft — not yet started, candidate for v1.5.6
**Author:** Nick Porterfield + Claude
**Date:** August 17, 2026
**Update (Aug 2026):** FinalVault's primary domain has since migrated from
`finalvault.dockercapphotography.com` to `final-vault.app` (see Phase 0 of the
v1.5.6 build). Domain references below have been updated to match; the
underlying design is unchanged.

---

## 1. Problem statement

Every photographer's client-facing links today look like:

```
https://final-vault.app/g/69d77f4622f34cb281cea...
https://final-vault.app/book/9f3a1c...
https://final-vault.app/client/8e21b0...
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
   `final-vault.app/g/abc123` resolve identically once they reach
   the app. This means **no new routing logic is needed at the application layer.**
2. **Public pages are already unauthenticated and use the anon Supabase client.**
   `ClientGalleryView.jsx`, `SignupBooking.jsx`, etc. call Supabase directly via
   `supabaseAnon`, which always targets the same Supabase project URL regardless of
   what domain served the frontend. There's no session/cookie tied to
   `final-vault.app` that would break under a different host.

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
- One-time setup on the `final-vault.app` zone: enable Cloudflare for SaaS,
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
`final-vault.app`, because that's the domain the photographer's
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

### 3.6 Fallback origin: requires a Worker bridge, not direct Pages

**Discovered during Phase 1 end-to-end testing (Aug 2026), not anticipated in
the original design above.** Pointing the Cloudflare for SaaS Fallback Origin
directly at the Pages-served domain (`final-vault.app`) does not work — it
produces a Cloudflare 522 (connection timed out) for any custom hostname
other than `final-vault.app` itself.

**Why:** Cloudflare Pages only accepts requests whose Host header matches one
of its own configured Custom Domains. It has no way to know about
photographers' individual custom domains (e.g. `book.janesmithphotography.com`)
since those exist only as Cloudflare for SaaS Custom Hostnames on the
`final-vault.app` zone, never registered with Pages itself.

**Fix (Cloudflare's own documented pattern for this exact combination):**
a small Worker (`saas-proxy-worker/`) sits as the actual Fallback Origin and
forwards every request — regardless of which hostname it arrived on — to the
Pages deployment's own `*.pages.dev` hostname, which Pages always accepts
regardless of Host header. Concretely:

- An "originless" DNS record (`origin.final-vault.app`, `AAAA 100::`,
  proxied) — Cloudflare's documented convention for "no real server, a
  Worker handles this."
- Fallback Origin (SSL/TLS → Custom Hostnames) set to `origin.final-vault.app`,
  not `final-vault.app`.
- The `customers.final-vault.app` CNAME target (§5, open question 1) also
  points to `origin.final-vault.app`, matching Cloudflare's own recommended
  pattern of CNAME target → fallback origin.
- A zone-wide Worker Route (`*/*` → `finalvault-saas-proxy`) — this
  necessarily applies to *all* traffic on the zone, not just custom-hostname
  traffic, since Cloudflare for SaaS routing can't be scoped more narrowly
  than the zone.

Since FinalVault's own routing is entirely token-based (§2), this Worker is
purely a network-level bridge — no app logic runs in it.

### 3.5 Registrar-guided setup instructions

Full automation (configuring the CNAME on the photographer's behalf via each
registrar's API) was considered and explicitly ruled out -- it's a real,
separate integration project per registrar (OAuth, write access to someone's
DNS, ongoing maintenance as each registrar's API changes), disproportionate
to what a solo-developer platform needs to solve here. Instead, the goal is
getting close to foolproof for the common case through better guidance, not
automation.

**Registrar prioritization: GoDaddy and Squarespace Domains.** Confirmed via
Pixieset's own help center (Aug 2026) -- Pixieset, solving this identical
problem for the identical photographer audience, built dedicated
registrar-specific guides for exactly these two (plus a since-retired Google
Domains guide, now folded into Squarespace after that acquisition) and
nothing else; everything else falls back to their one generic guide. This is
materially stronger evidence than general small-business registrar
market-share data (which would have suggested Namecheap over Squarespace as
the #2 priority) -- a direct competitor's actual documentation investment for
the same audience beats an inference from unrelated-market statistics.
Namecheap and Cloudflare Registrar remain reasonable future candidates if
real usage data (e.g. asked at setup time, or support ticket patterns)
justifies expanding beyond these two.

**Facts pulled from Pixieset's own guides, worth carrying into both our
implementation and the in-app copy:**

- They use **CNAME** for the connection, matching our own subdomain-first
  plan (§3.1) exactly -- no surprises there.
- Every guide carries an explicit **warning to never modify or delete
  existing MX records** -- doing so breaks the photographer's email. Worth
  a prominent warning in our own UI copy, not just in support docs, since
  this is a real way someone could hurt themselves.
- Guides instruct deleting **conflicting existing A/CNAME records** on the
  same host before adding the new one -- this maps directly to the
  pre-flight DNS check below (item 2): what we're checking for is exactly
  this class of conflict.
- SSL/DNS propagation is quoted as **up to 48 hours** -- a concrete number
  worth reusing in our own polling-UX copy (see open question 5.3) rather
  than a vaguer "some time."
- One edge case worth stealing directly: **the registrar someone bought a
  domain from isn't always where its DNS is actually managed** (e.g.
  purchased at GoDaddy, actually hosted at Bluehost). Someone could follow
  the wrong guide entirely without realizing it. Worth a plain callout in
  the UI ("Not sure where your DNS is managed? ...") before they pick a
  guide, not just embedded in the guide text itself.

**What "guided" means in practice, in rough priority order:**

1. **Registrar-specific instructions for GoDaddy and Squarespace, generic
   instructions otherwise.** Ask (or let them pick from a short list) which
   registrar they use, then show that provider's actual DNS-tab location
   and field names for these two, falling back to a generic "add a CNAME
   record" guide for everyone else. This is the single highest-leverage
   piece -- the same pattern Vercel/Netlify use for exactly this problem,
   and now validated by Pixieset's own registrar choices for this specific
   audience.
2. **Pre-flight DNS check.** Before they're asked to add anything, do a live
   DNS lookup on the subdomain they're about to use and flag likely
   conflicts (an existing A/CNAME record already there -- see Pixieset's
   own guides above) *before* they submit, rather than only surfacing a
   failure after the fact with no clear cause.
3. **Specific failure states in the status polling** (extends §3.3's status
   endpoint and resolves open question 5.4 below) -- distinguish and
   plain-language-translate the actual common failure modes: record not
   found yet, wrong record type, still propagating (just needs more time,
   up to 48 hours per Pixieset's own stated figure), CAA record blocking
   issuance. Not one undifferentiated "pending" spinner that leaves someone
   unsure whether to wait or that they did something wrong.
4. **Manual fallback for the rest.** For registrars without a specific guide,
   or a photographer who's genuinely stuck despite good instructions -- a
   clear "still not working? send us a screenshot of your DNS settings" path.
   A reasonable, low-effort escape hatch rather than trying to engineer away
   every edge case.

## 4. Non-goals (v1)

- Apex/root domain support (subdomains only, see §3.1)
- Multiple domains per photographer
- Self-branding the photographer's *own* dashboard/login (this is only about
  client-facing public links)
- Any billing/paid-tier gating (out of scope for this spec; a product decision for
  later if ever relevant)
- Direct registrar API integration (OAuth-based automatic DNS configuration) — see
  §3.5; guided instructions instead, this is a disproportionate build for a
  solo-developer platform
- Registrar-specific guides beyond GoDaddy and Squarespace at launch (see §3.5) —
  Namecheap and Cloudflare Registrar are reasonable future candidates, not v1

## 5. Open questions

1. ~~**CNAME target naming.**~~ **Resolved.** `customers.final-vault.app` — a
   dedicated indirection target, per the reasoning above (decoupled from
   hosting internals). Photographers CNAME to this; it is never shown as the
   literal serving domain. See §3.6 for what this target actually is under
   the hood (not a direct Pages record — see below).
2. **UI location.** Account → a new "Custom domain" section seems like the natural
   fit (global to the photographer, not per-gallery), consistent with how
   `photographers.default_gallery_sort` and other account-level settings already
   live in `Account.jsx`. Confirm before building.
3. **Polling UX while SSL provisions.** Cert issuance can take from minutes to (rarely)
   hours per Cloudflare's own docs; Pixieset quotes up to 48 hours for their own
   propagation + SSL process, a useful concrete number for our own copy. Does the UI
   need an explicit "check status" button, automatic polling, or both? Precedent
   elsewhere in the app: none directly analogous — worth a quick mockup before
   building; the 48-hour figure at least gives us a number to design the waiting
   state around.
4. **Removal/error recovery UX.** ~~What happens if a photographer's DNS is
   misconfigured...~~ **Resolved — see §3.5.** Translate common failure modes into
   plain-language guidance rather than showing raw Cloudflare API errors.

## 6. Suggested build sequence

1. Cloudflare account-level setup (enable Cloudflare for SaaS on the zone,
   fallback origin) — one-time, manual, not app code. Requires the Worker
   bridge in §3.6, not a direct Pages fallback origin.
2. `photographer_domains` migration.
3. `manage-custom-domain` Edge Function (create/status/delete).
4. Account settings UI: add domain, show CNAME instructions, status indicator,
   remove domain.
5. Registrar-guided instructions (§3.5) — GoDaddy and Squarespace guides, pre-flight
   DNS check, specific failure-state messaging, manual fallback path.
6. `getPublicBaseUrl()` helper + the six call-site swaps.
7. End-to-end test with a real domain Nick owns, including the DNS propagation /
   cert issuance wait.
