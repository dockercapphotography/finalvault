def patch(path, old, new, expected_count=1):
    with open(path, 'r') as f:
        src = f.read()
    count = src.count(old)
    assert count == expected_count, f"{path}: expected {expected_count} occurrence(s) of {old!r}, found {count}"
    src = src.replace(old, new)
    with open(path, 'w') as f:
        f.write(src)
    print(f"OK  {path}: replaced {expected_count}x")

# --- CHANGELOG.md ---
patch('CHANGELOG.md',
"""# Changelog

All notable changes to FinalVault are documented here.

---

## v1.5.5 — August 19, 2026""",
"""# Changelog

All notable changes to FinalVault are documented here.

---

## v1.5.6 — August 21, 2026

### New Features

**Custom domains**
- Point your own domain (e.g. `book.yourstudio.com`) at client-facing links instead of the default FinalVault domain -- covers gallery, booking, client portal, and questionnaire submit links, in both the app and the emails that carry them
- Guided setup: registrar-specific CNAME instructions for GoDaddy and Squarespace Domains (verified against each platform's own current docs), a generic fallback for everyone else, and automatic + manual status checking while DNS propagates
- Plain-language error messages when DNS isn't configured correctly yet, instead of raw Cloudflare error text
- Confirmation required before removing a configured domain

### Infrastructure

- Migrated the app's primary domain from `finalvault.dockercapphotography.com` to `final-vault.app`; every existing link continues to resolve indefinitely, nothing was redirected or retired
- Email sending moved to a dedicated subdomain (`mail.final-vault.app`) with fresh SPF/DKIM/DMARC, isolated from the app's own domain

### Bug Fixes

- Fixed an invalid email at a client gallery's entry screen showing a dead-end "Gallery unavailable" message with no way to correct it and try again
- Fixed the service worker crashing entirely in local development -- an offline-navigation feature added in v1.5.5 threw on a URL that's only precached in production builds, which silently killed everything registered after it in the same script, including push notification handling
- Fixed `navigator.serviceWorker.ready` having no timeout anywhere it was awaited -- if service worker registration ever failed for any reason, the entire Push Notifications section would vanish permanently with no error shown
- Fixed 3 pre-existing signup-booking end-to-end tests that had been failing since their fixture dates passed into the past; timezone-safe fixture generation replaces the hardcoded dates

---

## v1.5.5 — August 19, 2026""")

# --- README.md ---
patch('README.md',
'- **Live status page** — a dedicated, mobile-friendly view for checking bookings on the go: a "Happening now" card shows the current or next session with a countdown, search and Booked-only filtering, a day-timeline view alongside the list, private per-slot notes, one-tap call/text/email, mark-as-no-show to free up a slot without losing the client record, registering a walk-up client directly against an open slot (creates a real booking identical to a public signup), and rescheduling an existing booking to a different open slot or a custom time (with conflict prevention and an optional updated confirmation email to the client); real push notifications for new claims, contract signatures, and questionnaire responses, each independently configurable, delivered even when the app is closed, with per-device enable/disable; an in-app notification bell alongside gallery activity and pending contracts\n',
'- **Live status page** — a dedicated, mobile-friendly view for checking bookings on the go: a "Happening now" card shows the current or next session with a countdown, search and Booked-only filtering, a day-timeline view alongside the list, private per-slot notes, one-tap call/text/email, mark-as-no-show to free up a slot without losing the client record, registering a walk-up client directly against an open slot (creates a real booking identical to a public signup), and rescheduling an existing booking to a different open slot or a custom time (with conflict prevention and an optional updated confirmation email to the client); real push notifications for new claims, contract signatures, and questionnaire responses, each independently configurable, delivered even when the app is closed, with per-device enable/disable; an in-app notification bell alongside gallery activity and pending contracts\n- **Custom domains** — point your own domain (e.g. `book.yourstudio.com`) at your client-facing links instead of the default FinalVault domain; guided CNAME setup with registrar-specific instructions, live status checking, and plain-language error messages if DNS isn\u2019t configured correctly yet\n')

patch('README.md',
'| Deployment | Cloudflare Pages |\n',
'| Deployment | Cloudflare Pages |\n| Custom domains | Cloudflare for SaaS + Workers (fallback-origin bridge) |\n')

patch('README.md',
"""**5. Deploy Edge Functions**
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

Connect the repo to Cloudflare Pages. It deploys automatically on push to `main`.""",
"""**5. Deploy Edge Functions**
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

**6. (Optional) Custom domains feature**

Requires Cloudflare for SaaS enabled on your zone, plus a small proxy Worker -- Cloudflare Pages doesn't accept traffic routed through Cloudflare for SaaS's fallback-origin mechanism directly, so this Worker bridges the two:
```bash
cd saas-proxy-worker
npx wrangler deploy
```

Then configure the Worker as your Cloudflare for SaaS Fallback Origin (via an originless DNS record + a zone-wide Worker Route), and set these secrets on the `manage-custom-domain` Edge Function:
```
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ZONE_ID
```

**7. Run locally**
```bash
npm run dev
```

**8. Deploy frontend**

Connect the repo to Cloudflare Pages. It deploys automatically on push to `main`.""")

# --- PageWrapper.jsx ---
patch('src/components/layout/PageWrapper.jsx',
"const VERSION = '1.5.5'",
"const VERSION = '1.5.6'")

patch('src/components/layout/PageWrapper.jsx',
'                <Section title="v1.5.5 — August 19, 2026">',
"""                <Section title="v1.5.6 — August 21, 2026">
                  <Group label="Custom domains">
                    <Item>Point your own domain at client-facing links instead of the default FinalVault domain -- covers gallery, booking, client portal, and questionnaire links, in the app and in emails</Item>
                    <Item>Guided setup with registrar-specific instructions for GoDaddy and Squarespace, plus automatic status checking while DNS propagates</Item>
                  </Group>
                  <Group label="Bug Fixes">
                    <Item>Fixed an invalid email at a gallery's entry screen showing a dead-end message with no way to try again</Item>
                    <Item>Fixed push notifications not working in some cases due to a service worker registration issue</Item>
                  </Group>
                </Section>
                <Section title="v1.5.5 — August 19, 2026">""")

print("\\nAll patches applied successfully.")
