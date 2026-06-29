# FinalVault Client Portal Spec — v1.4.0

## Purpose

Give each client a single, durable link that shows everything relevant to them across FinalVault: galleries (whether linked directly or through a session), pending contracts, and pending questionnaires. Replaces the current pattern of emailing three separate one-off links (gallery share link, sign link, submit link) with one link that stays useful for the life of the relationship.

No client login, no password. Same trust model as every other client-facing surface in FinalVault — a long random token in the URL is the credential, consistent with `galleries.share_token` and `sessions.submit_token`.

**Navigation shell:** the portal reuses FinalVault's existing sidebar (desktop) / bottom-nav (mobile) pattern from `Sidebar.jsx`, but as a **separate sibling component** (`ClientPortalSidebar.jsx`), not a shared/parameterized version of the photographer's sidebar. The photographer sidebar is wired to authenticated routes gated by `auth.uid()`; the portal's nav is wired to anonymous, token-scoped sections. Threading one prop-driven component to serve both adds more fragility than the ~40 lines of duplicated layout JSX saves.

**Routing:** real sub-routes per section, not client-side tab state on one route — `/client/:token/galleries`, `/client/:token/contracts`, `/client/:token/questionnaires`. This matches how `/clients` vs `/sessions` work today, keeps the back button sane, and means a photographer can link a client directly to e.g. the contracts section in an email.

**Nav items** (initial set — array-driven, same pattern as `Sidebar.jsx`, so a fourth item like Invoices/Payments slots in later with no shell changes):
- Galleries
- Contracts — small amber dot badge when at least one contract is `sent`/`pending_photographer`
- Questionnaires — small amber dot badge when at least one is outstanding (unfilled); the nav item itself could be omitted entirely if there are zero questionnaires ever assigned to this client, to avoid showing an empty section

---

## Stack & Patterns

- Same stack as v1.3.x: React 18 / Vite 7 / Tailwind v4, Supabase, Cloudflare R2
- Public route pattern: `/client/:token`, no auth — same shape as `/g/:token` and `/submit/:token`
- Dedup logic lives in SQL (a `UNION`, not application-side merging) — cheapest and least error-prone place to guarantee a gallery linked both ways only appears once
- Anon access via a `SECURITY DEFINER` RPC, not a new Edge Function — there's no secret to protect here (no password gate), so the existing pattern used for `get_gallery_password_hash` etc. (RPC + `GRANT EXECUTE TO anon`) is sufficient and lighter-weight than spinning up an Edge Function
- Token generated **lazily**, on first request from the photographer UI — not eagerly on client creation. Most clients won't need a portal link; no reason to mint one for every row.

---

## Data Model

### `clients` — add portal token
```sql
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS portal_token TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_clients_portal_token ON clients (portal_token)
  WHERE portal_token IS NOT NULL;
```

Generated with `crypto.randomUUID().replace(/-/g, '')` client-side at request time (same pattern as `submit_token`), or via `gen_random_uuid()::text` if generated in SQL — either is fine since this isn't the place doing the actual access-control judgment, just the lookup key.

### RPC — `get_client_portal_data`

One RPC, one round trip, returns everything the portal page needs: client display info, deduped galleries, pending contracts, pending questionnaires.

```sql
CREATE OR REPLACE FUNCTION get_client_portal_data(p_token TEXT)
RETURNS JSON AS $$
DECLARE
  v_client clients;
  v_result JSON;
BEGIN
  SELECT * INTO v_client FROM clients WHERE portal_token = p_token;
  IF v_client IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT json_build_object(
    'client', json_build_object(
      'id', v_client.id,
      'first_name', v_client.first_name,
      'last_name', v_client.last_name,
      'email', v_client.email,
      'photographer_id', v_client.photographer_id
    ),
    'galleries', (
      SELECT COALESCE(json_agg(deduped.* ORDER BY deduped.event_date DESC NULLS LAST), '[]'::json)
      FROM (
        SELECT DISTINCT ON (g.id)
          g.id, g.title, g.event_name, g.event_date, g.share_token,
          g.cover_r2_key, g.cover_focus_x, g.cover_focus_y,
          g.is_active, g.expires_at, g.session_id, g.session_name,
          EXISTS (
            SELECT 1 FROM gallery_viewers gv
            WHERE gv.gallery_id = g.id
              AND v_client.email IS NOT NULL
              AND lower(trim(gv.email)) = lower(trim(v_client.email))
          ) AS viewed
        FROM (
          SELECT g.id, g.title, g.event_name, g.event_date, g.share_token,
                 g.cover_r2_key, g.cover_focus_x, g.cover_focus_y,
                 g.is_active, g.expires_at,
                 NULL::UUID AS session_id, NULL::TEXT AS session_name
          FROM galleries g WHERE g.client_id = v_client.id
          UNION ALL
          SELECT g.id, g.title, g.event_name, g.event_date, g.share_token,
                 g.cover_r2_key, g.cover_focus_x, g.cover_focus_y,
                 g.is_active, g.expires_at,
                 s.id AS session_id, s.name AS session_name
          FROM galleries g
          JOIN session_galleries sg ON sg.gallery_id = g.id
          JOIN sessions s ON s.id = sg.session_id
          WHERE s.client_id = v_client.id
        ) g
        ORDER BY g.id, g.session_id NULLS LAST
      ) deduped
    ),
    'contracts', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', c.id, 'title', c.title, 'status', c.status,
        'sign_token', c.sign_token, 'sent_at', c.sent_at,
        'signed_at', c.signed_at, 'signed_name', c.signed_name,
        'photographer_signed_at', c.photographer_signed_at,
        'photographer_signed_name', c.photographer_signed_name,
        'body_hash', c.body_hash, 'pdf_r2_key', c.pdf_r2_key
      ) ORDER BY COALESCE(c.signed_at, c.sent_at) DESC), '[]'::json)
      FROM contracts c
      WHERE c.client_id = v_client.id AND c.status IN ('sent', 'pending_photographer', 'signed')
    ),
    'pending_questionnaires', (
      SELECT COALESCE(json_agg(json_build_object(
        'session_id', s.id,
        'session_name', s.name,
        'submit_token', s.submit_token,
        'questionnaire_id', sq.questionnaire_id,
        'questionnaire_name', qt.name
      )), '[]'::json)
      FROM sessions s
      JOIN session_questionnaires sq ON sq.session_id = s.id
      JOIN questionnaire_templates qt ON qt.id = sq.questionnaire_id
      WHERE s.client_id = v_client.id
        AND s.submit_token IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM session_submissions ss
          WHERE ss.session_id = s.id
            AND ss.questionnaire_id = sq.questionnaire_id
            AND v_client.email IS NOT NULL
            AND lower(trim(ss.email)) = lower(trim(v_client.email))
        )
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION get_client_portal_data(TEXT) TO anon;
```

Note on the gallery dedup: the first working draft used a plain `UNION`, which only dedupes rows that are byte-for-byte identical — a gallery linked both directly AND via a session produces two *different* rows (one with `session_id` populated, one null), so `UNION` doesn't collapse them. Confirmed live against a real client record with this exact shape (a gallery linked both ways) before catching this. Fixed with `UNION ALL` (combine everything) followed by `DISTINCT ON (g.id) ... ORDER BY g.id, g.session_id NULLS LAST` (pick exactly one row per gallery, preferring the row that has real session context over the null one). `session_id`/`session_name` come along so the frontend can group by session (idea #3) without a second query.

Note on `viewed`: added after confirming `gallery_viewers`' RLS policy ("Anon can read viewers within the same active gallery") is scoped to active/non-expired galleries only and would silently stop working once a gallery expires — querying it directly from the frontend would make the "New" badge unreliable exactly when expired-gallery handling matters most. Folding it into this `SECURITY DEFINER` RPC instead keeps the check correct regardless of gallery status, and keeps all client-portal logic funneled through one audited function rather than opening a second anon read path. Matched by lowercased, trimmed email against `v_client.email` — same normalization rule as idea #4's existing-client match, for the same reason (case/whitespace shouldn't cause a false "still new").

Note on contracts: includes both pending (`sent`, `pending_photographer`) and `signed` — per discussion, a signed contract (e.g. a print release) stays visible indefinitely since the client may need to reference or re-download it long after signing. `void` contracts are excluded — a voided contract was never valid, surfacing it on the client's portal would only invite confusion ("why does this say agreement was cancelled?"). Confirmed with Nick: voided contracts should not show. `pdf_r2_key` is included in the payload not for the browser to use directly (it's a private R2 path, not a public URL) but so the frontend can pass the contract id to a download endpoint that resolves it server-side — see "PDF download path" below.

Note on "pending questionnaire": unchanged from the original logic — defined as a session with a questionnaire attached and no submission yet *from this client*. Once a client submits a questionnaire, it should not reappear anywhere on the portal — no archive view needed, this is intentionally one-directional (outstanding → gone).

### "New" badge support

No new column needed. The frontend checks, per gallery, whether a `gallery_viewers` row exists for that `gallery_id` + the client's email. If `getClientPortalGalleries` returns the client's email alongside (cheap addition to the `client` object in the RPC above), a single `gallery_viewers` query per portal load (`select gallery_id from gallery_viewers where email = $1 and gallery_id = any($galleryIds)`) is enough to compute "new" client-side.

### Token regeneration (idea #5)

No new column — regeneration is just overwriting `portal_token`:
```sql
UPDATE clients SET portal_token = <new token> WHERE id = $1 AND photographer_id = auth.uid();
```
Covered by the existing "Photographers manage own clients" RLS policy — no new policy needed since this goes through the authenticated photographer session, not anon.

---

## RLS / Grants

- `clients` table itself: **no new anon policy.** The RPC is `SECURITY DEFINER`, so it bypasses RLS internally and is the only way anon ever touches `clients` data. This is intentional — we don't want a blanket "anon can read clients by token" policy that could be queried directly; funneling everything through one RPC keeps the surface area small and auditable.
- `GRANT EXECUTE ON FUNCTION get_client_portal_data(TEXT) TO anon;` — only grant needed for the core feature.
- Existing anon grants on `galleries`, `gallery_viewers` already cover what the portal page needs once it has gallery IDs in hand (gallery card click-through still goes through `/g/:token` exactly as today; the portal RPC never exposes raw image data, only metadata for the card).
- `contracts` and `session_submissions`: no new anon grants — the RPC reads these internally as `SECURITY DEFINER`, and the actual sign/submit flows continue through their existing public routes (`/sign/:token`, `/submit/:token`) unchanged.

---

## Client-Facing UI — Section Behavior

### Galleries (`/client/:token/galleries`)
- Grouped by session name, with a "General" bucket for galleries linked directly to the client (no session). Cards show cover image, title, photo count or "Expired" badge for inactive/past-expiry galleries (shown grayed out at reduced opacity, not hidden — matches Pixieset's pattern of visible-but-inert rather than disappearing).
- Sort control with multiple options (e.g. "Newest first" / "Oldest first") — not a single hardcoded order. Exact option set TBD at build time, but the UI must expose more than one.
- "New" badge on cover thumbnail when no `gallery_viewers` row exists for that gallery + the client's email yet.
- Clicking a card navigates to the existing `/g/:share_token` flow, unchanged.

### Contracts (`/client/:token/contracts`)
- Two groups: "Needs your signature" (status `sent`/`pending_photographer`) and "Signed" (status `signed`), most recent first within each.
- Pending row: full-width, visually warm/amber treatment (the one actionable item on the whole portal), labeled "Review & sign", links straight to the existing `/sign/:sign_token` page — no new signing flow, just another entry point to the one that exists.
- Signed row: green check icon, title, "Signed [date]" — clicking navigates to a **client-facing contract detail page** (`/client/:token/contracts/:contractId`), not a direct file download.

**Contract detail page** (signed contracts only):
- Status banner: "Signed by both parties", with each party's line read as `You · [client display name] · [date]` and `Photographer · [photographer display name] · [date]` — "You" rather than the client's own name, since they're looking at their own record.
- "Download PDF" as a button/action on this page, not the only way to reach the contract.
- Collapsed-by-default "Audit trail" disclosure containing: typed signature name + date for both parties, and the SHA-256 document hash. **IP addresses are omitted from the client-facing view** — useful as backend audit data, not something to reflect back at the person who signed (per discussion: "not important" to show their own IP back to them).

**PDF download — auth gap to resolve at build time:** `contracts.pdf_r2_key` is a private R2 path, not something the browser can fetch directly, and the existing anon RLS policy on `contracts` only covers `sent`/`pending_photographer` status — once a contract is `signed`, it falls outside that policy entirely (the `get_client_portal_data` RPC still sees it fine since it's `SECURITY DEFINER`, but a raw download request from the browser would not). Need a small Worker endpoint, similar in shape to the existing `upload-pdf` handler but for retrieval, that takes a contract id + the client's portal token, verifies server-side that the contract's `client_id` matches the token's client, then streams the R2 object back. This is real, non-trivial work, not a frontend afterthought — flagging it explicitly so it's scoped into the build estimate rather than discovered midway through.

### Questionnaires (`/client/:token/questionnaires`)
- Shows only outstanding (unfilled) questionnaires — same `pending_questionnaires` RPC field as before. Once a client submits, it drops off this list permanently; no signed-style archive view, this section is intentionally one-directional.
- Each row links to the existing `/submit/:submit_token` flow, unchanged.
- If a client has zero questionnaires ever assigned, this nav item can be omitted from the sidebar/bottom-nav entirely rather than showing an empty section.

---

## Idea #4 — Email-match suggestion on existing "Create client record" flow

This piggybacks on the flow that already exists in `SessionDetail.jsx` (`openCreateClientForm` / `handleCreateClient`) for walk-up submissions. No new table, no new route.

**Change:** before showing the create-client review form, check for an existing client with a matching email (case-insensitive, trimmed) for this photographer:

```js
async function checkExistingClient(email) {
  if (!email?.trim()) return null
  const { data } = await supabase
    .from('clients')
    .select('id, first_name, last_name')
    .ilike('email', email.trim())
    .maybeSingle()
  return data
}
```

If a match is found, `openCreateClientForm` shows a third option alongside the existing form: **"Link to [First Last]"** (sets `session_submissions.client_id` to the existing client's id directly, no insert) next to the existing **"Confirm & create"** (renamed implicitly to "create new anyway" via the match banner above it). No match → current behavior, untouched.

Email comparison note: `clients.email` is plain `TEXT`, not `citext`, so the match must `ilike` or `lower(trim())` both sides rather than `=` — otherwise `John@X.com` and `john@x.com` are treated as different people.

---

## UI Touchpoints

| Location | Change |
|---|---|
| `/clients/:id` (Client Detail) | New "Portal link" row — shows copyable link once generated; "Generate portal link" button if not yet generated; "Regenerate link" with confirm step if already generated (invalidates old link immediately) |
| `SessionDetail.jsx` — submission create-client flow | Existing-client match banner + "Link to existing" option, per idea #4 above |
| New component `ClientPortalSidebar.jsx` | Sibling to `Sidebar.jsx`, not a shared/parameterized version — desktop sidebar + mobile bottom nav, array-driven nav items (Galleries, Contracts, Questionnaires; Invoices/Payments slots in later with no shell change) |
| New routes `/client/:token/galleries`, `/client/:token/contracts`, `/client/:token/contracts/:contractId`, `/client/:token/questionnaires` | Real sub-routes, not tab state on one route — see "Client-Facing UI" section above |
| New Worker endpoint (TBD name, e.g. `/contract-pdf/:contractId`) | Authenticated-by-portal-token PDF retrieval for signed contracts — see PDF download auth gap above |

---

## Build Order

1. SQL migration — `clients.portal_token` column, `get_client_portal_data` RPC (galleries deduped + contracts incl. signed + pending questionnaires), grants
2. `clientApi.js` — `getOrCreatePortalToken(clientId)`, `regeneratePortalToken(clientId)`, `getPortalData(token)`
3. Client Detail page — portal link row (generate / copy / regenerate with confirm)
4. `ClientPortalSidebar.jsx` — sibling component, desktop sidebar + mobile bottom nav, array-driven items with badge-dot support
5. `/client/:token/galleries` — grouped-by-session card grid, sort control, expired-badge state, "New" badge via `gallery_viewers` lookup, empty state
6. `/client/:token/contracts` — pending/signed grouping, pending row → `/sign/:token`, signed row → detail page
7. `/client/:token/contracts/:contractId` — client-facing contract detail (status banner, both signatures, collapsed audit trail without IPs, Download PDF action)
8. Worker endpoint for authenticated signed-contract PDF retrieval (portal token → verify `client_id` match → stream R2 object) — see PDF download auth gap above; this is its own unit of work, not a trivial wire-up
9. `/client/:token/questionnaires` — outstanding-only list, links to existing `/submit/:token` flow, nav item omitted when zero questionnaires ever assigned
10. Idea #4 — existing-client match check wired into `SessionDetail.jsx` create-client flow
11. Playwright tests:
    - Portal shows gallery linked directly to client
    - Portal shows gallery linked via session, no duplicate when both paths apply
    - Expired/inactive galleries shown grayed-out with badge, not hidden
    - Regenerated token invalidates old link (old token returns null from RPC)
    - Pending vs. signed contracts render in the correct group; voided contracts excluded
    - Signed contract detail page omits IP addresses; PDF download succeeds only for the matching client's token
    - Questionnaire disappears from the list immediately after submission
    - Existing-client match banner appears on submission with matching email; "Link to existing" sets `client_id` without inserting a new row
12. `CHANGELOG.md`, `PageWrapper.jsx` version constant, `README.md` schema table update (add `portal_token` note)

---

## Open Decisions

1. ~~Voided contracts~~ — resolved: excluded from the client view entirely. RPC already filters to `sent`/`pending_photographer`/`signed` only, no change needed.
2. **Sort options on Galleries** — confirmed multiple options are needed; exact set (newest first / oldest first / by session) still open, low-stakes enough to decide at build time rather than blocking the spec.
3. ~~Grouping display~~ — resolved: sidebar/bottom-nav shell with real sub-routes per section, sibling component to the photographer `Sidebar.jsx`.

---

## Deferred — Questionnaire prefill from known client (not started)

When a client reaches `/submit/:token?q=...` via the portal, the form currently has zero awareness of who they are — `SubmitForm.jsx` collects email/name fresh from blank state every time, the same as a true walk-up stranger. `session_submissions.client_id` is only ever populated after the fact, via the photographer's manual "create client" action on `SessionDetail.jsx` — confirmed by checking 10 real submission rows, all with `client_id: null`. This is also why the portal's own outstanding-questionnaire check has to match by `email`, not `client_id` (see schema corrections below) — the column the table was designed around isn't the column the real submit flow actually sets.

**Scoped plan when resumed:**
1. Portal's questionnaire link adds a `client` param: `/submit/:token?q=<questionnaire_id>&client=<client_id>` — uses the client's row id, not the portal token, since the token is the client's access credential and shouldn't end up embedded in a link that might get forwarded or screenshotted for something unrelated.
2. `SubmitForm.jsx` reads `client` from the URL, fetches that client's `first_name`/`last_name`/`email` via a narrow anon-safe query (not yet designed — needs its own RLS/RPC scoping decision), and pre-fills the `collect_email`/`collect_name` fields.
3. Pre-filled fields stay editable, not locked — a shared email, a parent filling in for a minor, etc. are real cases where the client needs to correct what's shown.
4. Does **not** touch the actual questionnaire question answers (the substantive per-session content) — only the two built-in identity fields. Pre-filling real answers risks the client skimming past stale/wrong information instead of giving a real answer for *this* session.
5. Submission insert should pass `client_id` through when known, finally giving that column real data from the primary submit path instead of only ever being backfilled manually.

---

## Schema corrections discovered during build (logged for accuracy, not as open questions)

These were wrong assumptions in earlier drafts of this spec, caught by testing against real data rather than trusting column names that sounded right:

- **Questionnaire attachment is many-to-many, not a single column.** `sessions.questionnaire_id` exists but is vestigial/unused by the real send flow. The actual relationship is `session_questionnaires` (`session_id`, `questionnaire_id`, `sort_order`) joined to `questionnaire_templates` — a session can have multiple questionnaires attached, each with its own `?q=<questionnaire_id>` param on the shared `submit_token` URL. The RPC's `pending_questionnaires` block now joins through `session_questionnaires`/`questionnaire_templates` accordingly, and returns `questionnaire_id`/`questionnaire_name` per row so the frontend can build the correct link and show which form is outstanding (not just which session).
- **Outstanding-questionnaire matching is by email, not `client_id`.** Confirmed via 10 real `session_submissions` rows: `client_id` is null on every one, `email` is reliably populated. Matched with the same `lower(trim(...))` normalization used for the gallery `viewed` check, for the same reason (case/whitespace shouldn't produce a false "still outstanding").

---

*FinalVault Client Portal Spec — prepared June 2026*
