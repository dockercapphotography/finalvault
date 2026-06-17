import datetime

# ── 1. PageWrapper version bump ───────────────────────────────────────────────
path = '/Users/nickporterfield/code/finalvault/src/components/layout/PageWrapper.jsx'
with open(path, 'r') as f:
    src = f.read()

old = "const VERSION = '1.2.0'"
new = "const VERSION = '1.3.0'"
assert src.count(old) == 1, f"FAIL PageWrapper: {src.count(old)}"
src = src.replace(old, new)

# Also update the in-app changelog section header
old = '<Section title="v1.2.0 — June 12, 2026">'
new = '<Section title="v1.3.0 — June 16, 2026">'
assert src.count(old) == 1, f"FAIL in-app changelog header: {src.count(old)}"
src = src.replace(old, new)

with open(path, 'w') as f:
    f.write(src)
print("✅ PageWrapper.jsx: version bumped to 1.3.0")

# ── 2. CHANGELOG.md ───────────────────────────────────────────────────────────
changelog_entry = '''## v1.3.0 — June 16, 2026

### New Features

**Sessions**
- New Sessions section — create and manage photography sessions with full details (name, type, mode, date, time, location, description, internal notes)
- Two session modes: Private (one client, booked session) and Walk-up (open QR form for events)
- Session statuses: Inquiry, Booked, Completed, Delivered, Archived — with Kanban board view (drag-to-update) and List view
- Session type icons — unique icons per session type (Portrait, Convention, Boudoir, Headshot, Sports, and more)
- Session detail page — compact header with scrollable status pills, label/value info rows, financials section
- Financial tracking per session — session fee, retainer, retainer paid toggle, balance due, balance due date, payment status (Unpaid/Partial/Paid)
- Sessions card on Client Detail — shows linked sessions between Galleries and Contracts sections

**Questionnaires**
- Questionnaire template builder in Account → Templates — create, edit, duplicate, and delete questionnaire templates
- Drag-and-drop question reordering within templates
- Question types: short text, long text, multiple choice, single choice, yes/no
- Assign questionnaires to sessions at creation or edit time
- Per-questionnaire send links — sequential workflow, one questionnaire at a time
- Walk-up public submission form at `/submit/:token?q=:questionnaireId`
- Submissions viewer on Session Detail — grouped by questionnaire, paginated, CSV export, "Create client" action from walk-up submissions

**Contracts**
- Contracts now live exclusively under Sessions (removed Send Contract from Client Detail)
- Session variables in contracts: `{{session_name}}`, `{{session_date}}`, `{{session_time}}`, `{{session_location}}`, `{{session_fee}}`, `{{retainer_amount}}`, `{{balance_due}}`, `{{balance_due_date}}`

**Mobile UX**
- New Session and New Client modals now use BottomSheet on mobile (slide-up, swipe-to-close, drag handle) and inline centered dialog on desktop
- Edit Session and Edit Client modals same responsive treatment
- FilterSheet replaces inline filters on Clients and Sessions mobile
- Sessions defaults to list view on mobile, Kanban on desktop
- Mobile header consistency across Galleries, Clients, Sessions (44×44 buttons, SlidersHorizontal filter icon, #111 + button)

**UI Components**
- `KanbanBoard` — reusable Kanban component with drag-to-update, optimistic local state, snap-flicker fix
- `FilterSheet` — reusable mobile filter bottom sheet with single and multi-select support
- `MarkdownToolbar` — toolbar for contract and email template editors
- `PlaceAutocomplete` — venue/place autocomplete for session location
- `ClientPicker` now used in New Session and Edit Session modals (replaces plain select)

### Bug Fixes
- Fixed BottomSheet rendering using createPortal to document.body (escaped overflow:hidden parents)
- Fixed mobile nav z-index (z-30) so backdrop covers it correctly
- Fixed dashboard gallery filter button pop-in
- Fixed Clients page max-width constraint (now matches Sessions full-width layout)
- Fixed tags initial state in New Client modal (was string, now array)

### Tests
- Playwright E2E suite updated for all v1.3.0 changes

---

'''

path = '/Users/nickporterfield/code/finalvault/CHANGELOG.md'
with open(path, 'r') as f:
    src = f.read()

old = '## v1.2.0 — June 12, 2026'
new = changelog_entry + '## v1.2.0 — June 12, 2026'
assert src.count(old) == 1, f"FAIL CHANGELOG: {src.count(old)}"
src = src.replace(old, new)

with open(path, 'w') as f:
    f.write(src)
print("✅ CHANGELOG.md: v1.3.0 entry added")

# ── 3. README.md — bump version reference ────────────────────────────────────
path = '/Users/nickporterfield/code/finalvault/README.md'
with open(path, 'r') as f:
    src = f.read()

if 'v1.2.0' in src:
    src = src.replace('v1.2.0', 'v1.3.0')
    with open(path, 'w') as f:
        f.write(src)
    print("✅ README.md: version references updated to v1.3.0")
else:
    print("ℹ️  README.md: no v1.2.0 references found, skipping")
