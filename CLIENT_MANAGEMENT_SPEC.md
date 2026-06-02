# FinalVault — Client Management & Contracts Spec
## Target Release: v1.2.0

---

## Overview

A built-in CRM for photographers to manage clients, link them to galleries, and send legally binding contracts with typed digital signatures. No third-party dependency for signing — FinalVault handles the full contract lifecycle with a solid audit trail. DocuSeal can be bolted on later for photographers who need court-grade signatures.

---

## Data Model

### `clients` table
```sql
CREATE TABLE clients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id UUID NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  email           TEXT,
  phone           TEXT,
  address         TEXT,
  city            TEXT,
  state           TEXT,
  zip             TEXT,
  notes           TEXT,
  tags            TEXT[],
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
```

### `contract_templates` table
```sql
CREATE TABLE contract_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id UUID NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,           -- e.g. "Portrait Session Agreement"
  body            TEXT NOT NULL,           -- rich text / markdown with {{variables}}
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
```

### `contracts` table
```sql
CREATE TABLE contracts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id     UUID NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
  client_id           UUID REFERENCES clients(id) ON DELETE SET NULL,
  template_id         UUID REFERENCES contract_templates(id) ON DELETE SET NULL,
  gallery_id          UUID REFERENCES galleries(id) ON DELETE SET NULL,
  title               TEXT NOT NULL,
  body                TEXT NOT NULL,           -- rendered body with variables filled in
  body_hash           TEXT NOT NULL,           -- SHA-256 of body at time of sending
  status              TEXT DEFAULT 'draft',    -- draft | sent | pending_photographer | signed | void
  sign_token          TEXT UNIQUE,             -- public token for signing URL
  signed_at           TIMESTAMPTZ,
  signed_name         TEXT,                    -- typed name of signer
  signed_ip           TEXT,                    -- IP address at time of signing
  signed_user_agent   TEXT,                    -- browser at time of signing
  photographer_signed_at TIMESTAMPTZ,          -- counter-signature timestamp
  photographer_signed_name TEXT,               -- photographer's typed/confirmed name
  sent_at             TIMESTAMPTZ,
  void_at             TIMESTAMPTZ,
  void_reason         TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);
```

### Galleries — add client_id
```sql
ALTER TABLE galleries ADD COLUMN client_id UUID REFERENCES clients(id) ON DELETE SET NULL;
```

---

## Supported Template Variables

Variables are wrapped in `{{double_braces}}` and auto-filled when sending a contract:

| Variable | Source |
|----------|--------|
| `{{client_name}}` | `clients.first_name + last_name` |
| `{{client_first_name}}` | `clients.first_name` |
| `{{client_email}}` | `clients.email` |
| `{{photographer_name}}` | `photographers.display_name` |
| `{{studio_name}}` | `photographers.business_name` |
| `{{gallery_title}}` | `galleries.title` |
| `{{event_name}}` | `galleries.event_name` |
| `{{event_date}}` | `galleries.event_date` (formatted) |
| `{{today_date}}` | Current date at time of sending |
| `{{sign_date}}` | Date client signs (filled at signing) |

---

## Features

### Client Records (`/clients`)
- List view with search and tag filtering
- Create / edit / delete clients
- Per-client detail page showing:
  - Contact information
  - Associated galleries
  - Contract history (sent, signed, draft, void)
  - Notes
- Link existing galleries to a client (or create new gallery from client page)
- Import clients from CSV (v1.3 — deferred)

### Contract Templates (`/account?tab=contracts`)
- Create named templates with rich text body
- Use `{{variable}}` syntax with live preview showing resolved values
- Built-in starter templates:
  - Portrait Session Agreement
  - Event Photography Agreement
  - Commercial Usage License
- Duplicate, edit, delete templates

### Contract Workflow

**Sending a contract:**
1. Photographer opens a client record or gallery
2. Clicks "Send Contract" → selects a template
3. Variables are auto-filled from client + gallery data
4. Photographer previews the rendered contract
5. Optionally edits the rendered body before sending
6. Clicks Send — system generates a unique `sign_token`, records `body_hash`, sets status to `sent`
7. Client receives an email with a link to `/sign/{sign_token}`

**Signing page (`/sign/{sign_token}` — public, no auth):**
- Shows the rendered contract body (read-only)
- Client scrolls to bottom to reveal the signature field
- Types their full legal name
- Checks "I agree to the terms above and confirm this is my electronic signature"
- Clicks "Sign Contract"
- System records: typed name, timestamp, IP address, user agent
- Status → `signed`, confirmation email sent to both parties

**After client signs:**
- Status → `pending_photographer`
- Photographer receives email: "Your client signed — review and counter-sign"
- Notification bell shows "Pending your signature" badge
- Contract record shows client signed name, date, and IP

**Counter-signing (photographer):**
1. Photographer clicks notification or opens contract detail
2. Reviews the fully rendered contract and client signature block
3. Confirms or types their name (pre-filled with display name)
4. Clicks "Counter-sign"
5. System records: photographer signed name + timestamp
6. Status → `signed`
7. Final PDF generated with both signature blocks
8. Confirmation email sent to both parties with PDF attached

### Audit Trail
Each signed contract stores:
- `signed_name` — exactly what the client typed
- `signed_at` — UTC timestamp
- `signed_ip` — client IP address
- `signed_user_agent` — browser/device
- `body_hash` — SHA-256 of the contract body they signed (proves it hasn't been altered)
- `photographer_signed_name` — photographer's confirmed name
- `photographer_signed_at` — counter-signature timestamp

This is sufficient for US law under ESIGN/UETA for the vast majority of photography disputes.

### PDF Generation
On signing, generate a PDF containing:
- Contract body
- Signature block: "Signed by [name] on [date] from IP [ip]"
- Document hash for tamper verification
- FinalVault footer with contract ID

Store PDF in R2 at `photographers/{id}/contracts/{contract_id}.pdf`.

PDF signature block shows both signatures in order:
- "Signed by [client name] on [date] from IP [ip]"
- "Counter-signed by [photographer name] on [date]" 

---

## UI Touchpoints

| Location | Change |
|----------|--------|
| Sidebar | Add "Clients" nav item between Galleries and Bookmarked |
| Gallery creation | Add "Link to client" step or field |
| Gallery detail | Show linked client name + contract status badge |
| Account → Contracts tab | Manage contract templates |
| Notification bell | Badge when client signs and counter-signature is pending |
| Contract detail | Counter-sign action for photographer |
| `/clients` | New route — client list |
| `/clients/:id` | New route — client detail |
| `/sign/:token` | New public route — signing page |

---

## Future: DocuSeal Integration (v1.3+)
The `contracts` table is designed to accommodate a `docuseal_submission_id` column and `signature_type` field (`typed` vs `docuseal`) without breaking existing contracts. Photographers who need court-grade signatures could opt in per contract or per account.

---

## Out of Scope for v1.2
- Client portal / login
- Payment collection
- Booking / scheduling
- Import from CSV
- Contract expiry / auto-void

---

## Build Order
1. Database migrations (clients, contract_templates, contracts, galleries.client_id)
2. Client CRUD — list, create, edit, delete, detail page
3. Gallery ↔ client linking
4. Contract templates — CRUD in Account settings
5. Send contract flow — variable resolution, email delivery
6. Signing page — public route, typed signature, audit record
7. Counter-sign flow — photographer notification, review, and counter-signature
8. PDF generation — signed contract PDF with both signature blocks stored in R2
9. Post-sign emails — confirmation to both parties with PDF attached

---

*FinalVault Client Management Spec — prepared June 2026*
