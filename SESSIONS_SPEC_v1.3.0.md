# FinalVault — Sessions, Questionnaires & Walk-up Submissions Spec
## Target Release: v1.3.0

---

## Overview

Sessions are the missing container that ties clients, galleries, contracts, and financials together into a single job record. A session represents a booked or walk-up photography engagement — from the initial inquiry through delivery.

v1.3.0 ships two distinct session modes:

- **Private sessions** — one client, one session, booked in advance. Full financials, contracts, questionnaire, linked gallery.
- **Walk-up sessions** — many unknown clients at a single event (e.g. a convention photo booth). Clients scan a QR code, fill out a submission form with optional photo release terms, and submit. No pre-existing client record required.

This replaces the current Google Forms workflow entirely: no more downloading Excel files, no Google dependency, all submissions live in FinalVault.

---

## Stack & Patterns

- Same stack as v1.2.0: React 18 / Vite 7 / Tailwind v4, Supabase, Cloudflare R2
- Google Places API for session location (`VITE_GOOGLE_PLACES_KEY` — already in env)
- Markdown rendering: `marked` or `micromark` (lightweight, no heavy deps)
- Markdown toolbar: custom component, generates Markdown syntax on selection (no WYSIWYG lib needed)
- Questionnaire template builder: drag-to-reorder via `@dnd-kit` (already installed)
- Public submission URL: `/submit/{token}` — no auth, same pattern as `/sign/{token}`
- CSV export: browser-side via existing SheetJS (`xlsx`) already in the project

---

## Data Model

### `sessions` table
```sql
CREATE TABLE sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id   UUID NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
  client_id         UUID REFERENCES clients(id) ON DELETE SET NULL,
  gallery_id        UUID REFERENCES galleries(id) ON DELETE SET NULL,
  questionnaire_id  UUID REFERENCES questionnaire_templates(id) ON DELETE SET NULL,

  name              TEXT NOT NULL,
  type              TEXT NOT NULL DEFAULT 'Portrait',
  -- Convention | Corporate | Event | Family | Graduation | Maternity | Newborn | Portrait | Wedding | Other

  mode              TEXT NOT NULL DEFAULT 'private',
  -- private (one client, booked) | walkup (many clients, open submission)

  status            TEXT NOT NULL DEFAULT 'inquiry',
  -- inquiry | booked | completed | delivered | archived

  session_date      DATE,
  start_time        TIME,
  end_time          TIME,          -- optional

  location          TEXT,          -- full address string from Google Places
  location_lat      NUMERIC,       -- for future map display
  location_lng      NUMERIC,

  description       TEXT,          -- client-facing, shown in emails and submission form header
  internal_notes    TEXT,          -- private, never shown to client

  -- Financials (private sessions only)
  session_fee       NUMERIC(10,2),
  retainer_amount   NUMERIC(10,2),
  retainer_paid     BOOLEAN DEFAULT false,
  balance_due       NUMERIC(10,2),
  balance_due_date  DATE,
  payment_status    TEXT DEFAULT 'unpaid',
  -- unpaid | partial | paid

  -- Walk-up token (walkup sessions only)
  submit_token      TEXT UNIQUE,   -- public token for /submit/{token}

  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);
```

### `questionnaire_templates` table
```sql
CREATE TABLE questionnaire_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id UUID NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  header_text     TEXT,            -- Markdown, shown at top of form before questions
  require_agreement BOOLEAN DEFAULT false,
  agreement_label TEXT DEFAULT 'I have read and agree to the terms above.',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
```

### `questionnaire_questions` table
```sql
CREATE TABLE questionnaire_questions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  UUID NOT NULL REFERENCES questionnaire_templates(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,
  -- short_text | long_text | yes_no | single_choice | multi_choice | date
  label        TEXT NOT NULL,
  options      JSONB,             -- for single_choice / multi_choice: ["Option A", "Option B"]
  required     BOOLEAN DEFAULT false,
  sort_order   INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT now()
);
```

### `session_submissions` table
```sql
CREATE TABLE session_submissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,

  -- Submitter info (always collected)
  email           TEXT NOT NULL,
  credit_handle   TEXT,            -- how they want to be credited (name, IG handle, etc.)

  -- Snapshot of questions at time of submission
  questions       JSONB NOT NULL,  -- full question list snapshot
  answers         JSONB NOT NULL,  -- { question_id: answer }

  -- Agreement
  agreed_to_terms BOOLEAN DEFAULT false,
  agreed_at       TIMESTAMPTZ,

  -- Metadata
  submitted_ip    TEXT,
  submitted_user_agent TEXT,
  submitted_at    TIMESTAMPTZ DEFAULT now(),

  -- Optional: linked to a client record if photographer creates one from submission
  client_id       UUID REFERENCES clients(id) ON DELETE SET NULL
);
```

---

## Contract Variables — New in v1.3.0

Sessions add new auto-fill variables when sending a contract from a session:

| Variable | Source |
|----------|--------|
| `{{session_name}}` | `sessions.name` |
| `{{session_type}}` | `sessions.type` |
| `{{session_date}}` | `sessions.session_date` (formatted) |
| `{{session_time}}` | `sessions.start_time` (+ end_time if set) |
| `{{session_location}}` | `sessions.location` |
| `{{session_fee}}` | `sessions.session_fee` |
| `{{retainer_amount}}` | `sessions.retainer_amount` |
| `{{balance_due}}` | `sessions.balance_due` |
| `{{balance_due_date}}` | `sessions.balance_due_date` (formatted) |
| `{{cancellation_days}}` | From session or template (manual fill) |

In v1.2.0 these variables were blank placeholders. In v1.3.0 they auto-fill from the session record.

---

## Features

### Sessions List (`/sessions`)

- List all sessions sorted by session_date descending
- Search by session name or client name
- Filter by: status, type, mode (private / walk-up)
- Session row shows: name, client (if linked), type, date, status badge, payment status badge
- "New Session" button → opens New Session modal
- Click row → Session detail page

### New Session Modal

**Step 1 — Basic Info**
- Session name (required)
- Type dropdown: Convention, Corporate, Event, Family, Graduation, Maternity, Newborn, Portrait, Wedding, Other
- Mode toggle: Private / Walk-up
- Date picker
- Start time (required)
- End time (optional)
- Location — Google Places autocomplete (same `AddressAutocomplete` component, adapted for places not just addresses)

**Step 2 — Details**
- Session Description (Markdown textarea with toolbar — client-facing)
- Internal Notes (plain textarea — private)
- Link client (ClientPicker — only shown for Private mode)
- Link questionnaire template (TemplatePicker)

**Step 3 — Financials** (Private mode only)
- Session fee
- Retainer amount
- Retainer paid toggle
- Balance due (auto-calculated: fee − retainer, editable)
- Balance due date
- Payment status (auto-set based on paid amounts, manually adjustable)

### Session Detail (`/sessions/:id`)

**Header**
- Session name, type badge, status badge
- Date + time, location
- Edit button

**Sections (tabs or stacked cards):**

**Overview**
- Session description (rendered Markdown)
- Internal notes
- Linked client (with link to client detail)
- Linked gallery (with link to gallery)

**Financials** (Private only)
- Fee breakdown: session fee, retainer, balance due, due date
- Payment status pill
- Quick "Mark retainer paid" / "Mark paid in full" actions

**Contracts**
- List of contracts for this session
- "Send Contract" button — opens SendContractModal pre-filled with session financials
- Contract variables auto-resolve from session record

**Questionnaire**
- Shows attached template name
- "Send questionnaire link" button (private mode) — copies/emails link to client
- Submission list (walk-up mode) — see below

**Walk-up Submissions** (Walk-up mode only)
- Table of all submissions: email, credit handle, cosplay/character, submitted at
- Search and filter submissions
- Click row → expand answers inline
- "Export to CSV" button — downloads all submissions as Excel-compatible CSV
- "Create client record" action per submission — one-click creates a client from submission data

### Walk-up Submission Form (`/submit/{token}` — public, no auth)

- FinalVault-branded, mobile-optimized (convention attendees are on phones)
- Shows session name and description at top
- Renders questionnaire header text as Markdown
- Always collects: Email (required), Credit/handle (required by default, configurable)
- Then renders all questionnaire questions in order
- Agreement checkbox at bottom (if template has `require_agreement: true`)
- Submit button → confirmation screen: "Thanks! Your photos will be delivered to {email}."
- QR code auto-generated for the submission URL — downloadable from Session detail

---

## Questionnaire Template Builder (`/account?tab=questionnaires`)

### Template List
- List of all questionnaire templates
- Create, duplicate, delete
- Click to edit

### Template Editor

**Header section**
- Template name
- Header text — Markdown textarea with simple toolbar:
  - **B** — bold (`**text**`)
  - *I* — italic (`*text*`)
  - H2 — heading (`## text`)
  - Bullet — unordered list (`- item`)
  - Numbered — ordered list (`1. item`)
  - Preview toggle — renders Markdown below textarea
- Require agreement toggle
- Agreement label text (editable when toggle is on)

**Questions section**
- Add question button → inline form:
  - Question type selector
  - Label text
  - Options (for choice types) — add/remove options inline
  - Required toggle
- Questions displayed as draggable cards (dnd-kit, already installed)
- Drag handle on left, question label, type badge, required indicator, edit/delete buttons
- Edit question — expands inline (no separate modal)

---

## Markdown Toolbar Component (`src/components/ui/MarkdownToolbar.jsx`)

Reusable component used in:
- Questionnaire template header text
- Contract template body editor (upgrade existing textarea)
- Session description field

**Props:** `value`, `onChange`, `placeholder`, `rows`

**Behavior:**
- Toolbar sits above the textarea
- Each button wraps selected text or inserts at cursor
- Bold: `**{selection}**`
- Italic: `*{selection}*`
- H2: `## {selection}` (prepended to line)
- Bullet: `- {selection}` (prepended to line)
- Numbered: `1. {selection}` (prepended to line)
- Preview toggle: renders Markdown using `marked` in a styled div below

**Implementation notes:**
- Use `textarea` ref to get/set selection range
- No external WYSIWYG dependency
- Store raw Markdown, render on preview and on display

---

## Navigation Changes

| Location | Change |
|----------|--------|
| Sidebar (desktop) | Add "Sessions" nav item between Clients and Bookmarked |
| Mobile nav bar | Add "Sessions" tab (may need to restructure — currently 5 items) |
| Client detail | Add "Sessions" section showing all sessions for this client |
| Account nav | Add "Questionnaires" tab alongside Templates |
| `/sessions` | New route — sessions list |
| `/sessions/:id` | New route — session detail |
| `/submit/:token` | New public route — walk-up submission form |

**Mobile nav restructure note:** Currently: Galleries, Bookmarked, Clients, Alerts, Account. Adding Sessions makes 6 items — too many for a bottom bar. Options:
- Replace Bookmarked with Sessions in the bottom bar (Bookmarked moves to sidebar/account)
- Use a "More" overflow menu for less-used items
- Decide before building

---

## Supabase Edge Functions

### `send-questionnaire-email` (new)
- Sends questionnaire link to client for private sessions
- Same pattern as `send-contract`
- Input: `sessionId`
- Fetches session, client, submit_token
- Sends email via Resend with link to `/submit/{token}`

---

## RLS Policies

- `sessions` — photographer can CRUD own sessions; no public read
- `questionnaire_templates` — photographer can CRUD own templates
- `questionnaire_questions` — cascade from template ownership
- `session_submissions` — public INSERT (anyone with token can submit); photographer SELECT own sessions' submissions only

---

## Build Order

1. **Database** — run SQL migrations for all new tables
2. **Questionnaire template builder** — CRUD in Account → Questionnaires, including MarkdownToolbar component
3. **Session CRUD** — list, new session modal (both modes), session detail page
4. **Walk-up submission form** — public `/submit/:token` route, QR code generation, CSV export
5. **Private session questionnaire** — send link via email, view responses on session detail
6. **Financials** — fee fields, payment status, auto-calculation
7. **Contract integration** — SendContractModal reads session financials, variables auto-fill
8. **Navigation** — Sessions in sidebar + mobile nav, Sessions section on Client detail
9. **MarkdownToolbar upgrade** — retrofit contract template editor with toolbar
10. **Playwright tests** — sessions CRUD, walk-up submission flow, questionnaire builder

---

## Deferred to v1.4+

- Stripe payment collection
- Client-facing session portal (client logs in to see their session details)
- Automated reminders (session in X days, questionnaire not submitted)
- Invoice PDF generation
- CSV import of sessions
- Session templates (save a session config as a reusable template)
- Tag-based public gallery collections

---

## Key Decisions & Notes

- **Walk-up mode always collects email** — built-in, not a question. Email is the delivery mechanism.
- **Credit/handle field** — built-in on the submission form (not a questionnaire question), always shown, required by default. This maps directly to your current Google Form "how would you like to be credited" field.
- **Questions are snapshotted at submission time** — editing the template after submissions exist doesn't alter existing submissions.
- **Submit token is generated when session is created in walk-up mode** — `crypto.randomUUID().replace(/-/g, '')`, same pattern as contract sign tokens.
- **CSV export includes all submission fields** — email, credit handle, all question answers, submitted_at, agreed_to_terms. Compatible with Excel without any formatting.
- **"Create client from submission"** — one-click creates a `clients` record from submission email + credit handle, links `session_submissions.client_id`. Does not create duplicate if client already exists (match by email).
- **Mobile-first submission form** — convention attendees are on phones. Large tap targets, minimal scrolling, fast.
- **Google Places for session location** — reuse existing `AddressAutocomplete` component, but configure for `types: ['establishment', 'geocode']` instead of just address, so convention centers and venues appear.

---

## Known Constraints

- Cloudflare Workers 128MB memory limit — bulk PDF generation for many submissions not viable; CSV export is browser-side only.
- Mobile nav currently at 5 items — adding Sessions requires a nav restructure decision before build starts.
- `dnd-kit` is already installed — no new dependency needed for drag-to-reorder questions.
- `xlsx` (SheetJS) is already available in artifacts — use for CSV export.

---

*FinalVault Sessions Spec — prepared June 12, 2026*
