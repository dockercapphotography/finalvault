import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import Header from './Header.jsx'
import Sidebar from './Sidebar.jsx'

const VERSION = '1.5.2'
// __BUILD_DATE__ is injected by Vite's `define` at build time (see
// vite.config.js) -- NOT computed here. Computing it here with `new
// Date()` would run in the browser at page-load time, so it would show
// "today" every time someone loads the page rather than the actual date
// this bundle was built/deployed.
const BUILD_DATE = new Date(__BUILD_DATE__).toLocaleDateString('en-US', {
  year: 'numeric', month: '2-digit', day: '2-digit'
})

export default function PageWrapper({ session, children }) {
  const [showChangelog, setShowChangelog] = useState(false)
  const mainRef = useRef(null)
  const location = useLocation()

  // Reset scroll position on every route change. The scrollable element
  // here is <main> (overflow-auto), not window -- client-side navigation
  // otherwise leaves the new page scrolled to wherever the previous page
  // was left, since there's no full page load to reset it naturally.
  useEffect(() => {
    // Reset every plausible scroll owner. Which element actually scrolls
    // varies by browser/viewport -- desktop browsers typically scroll
    // <main> (overflow-auto) as intended, but mobile browsers (especially
    // iOS Safari) commonly scroll the document/viewport itself instead,
    // particularly with a fixed-position element on screen (the bottom
    // nav bar). Resetting all three is cheap and covers every case.
    mainRef.current?.scrollTo(0, 0)
    window.scrollTo(0, 0)
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  }, [location.key])

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg)' }}>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header session={session} />
        <main ref={mainRef} className="flex-1 p-4 md:p-6 overflow-auto pb-20 md:pb-6">
          <div className="max-w-7xl w-full">
            {children}
          </div>
        </main>

        {/* Desktop-only footer */}
        <footer data-testid="app-footer" className="hidden md:flex items-center justify-between px-6 py-3"
          style={{
            borderTop: '1px solid var(--border)',
            background: 'var(--bg)',
          }}>
          <div className="flex items-center gap-1.5">
            <img src="/finalvault_logo.svg" alt="FinalVault" width="14" height="14" style={{ opacity: 0.4 }} />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              © {new Date().getFullYear()} Docker Cap Photography
            </span>
          </div>
          <div className="flex items-center gap-4">
            <a href="/privacy" className="text-xs" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
              Privacy Policy
            </a>
            <a href="/terms" className="text-xs" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
              Terms of Service
            </a>
            <button
              onClick={() => setShowChangelog(true)}
              className="text-xs"
              style={{ color: 'var(--text-muted)', opacity: 0.6, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              onMouseEnter={e => e.currentTarget.style.opacity = '1'}
              onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}>
              v{VERSION} · Build: {BUILD_DATE}
            </button>
          </div>
        </footer>
      </div>

      {/* Changelog modal */}
      {showChangelog && (
        <>
          <div
            className="fixed inset-0 z-50"
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
            onClick={() => setShowChangelog(false)}
          />
          <div
            className="fixed left-1/2 top-1/2 z-50 w-full"
            style={{
              transform: 'translate(-50%, -50%)',
              maxWidth: 640,
              maxHeight: '80vh',
              padding: '0 16px',
            }}>
            <div
              className="rounded-2xl shadow-xl overflow-hidden flex flex-col"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '80vh' }}>
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
                <div>
                  <h2 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>What's New</h2>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>v{VERSION}</p>
                </div>
                <button
                  onClick={() => setShowChangelog(false)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: 'var(--surface-raised)', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16 }}>
                  ✕
                </button>
              </div>
              {/* Scrollable content */}
              <div className="overflow-y-auto px-6 py-4 space-y-5 text-sm" style={{ color: 'var(--text)' }}>
                <Section title="v1.5.2 — July 23, 2026">
                  <Group label="Live Status page">
                    <Item>New "Happening now" card showing the current or next session, with a countdown</Item>
                    <Item>Register a walk-up client directly from an open slot -- creates a real booking, same as the public page</Item>
                    <Item>Mark a claimed slot as no-show to free it back up, without losing the client or session</Item>
                    <Item>Private per-slot notes, search by name/email, and a Booked-only filter</Item>
                    <Item>Quick call/text/email actions, and a tappable manual refresh</Item>
                  </Group>
                  <Group label="Contracts & Questionnaires">
                    <Item>Session Detail now shows who a contract or questionnaire was last sent to, and when</Item>
                  </Group>
                  <Group label="Bug Fixes">
                    <Item>Fixed contract Preview not showing your edits after switching back from Edit</Item>
                    <Item>Fixed the folder ⋮ menu clipping on mobile, and a long modal title overflowing instead of truncating</Item>
                    <Item>Fixed "Mark Paid in Full" showing with no financials set, and a linked client not refreshing after Edit Session</Item>
                    <Item>Fixed several cramped mobile layouts across Client Portal, Account, and Gallery Templates</Item>
                  </Group>
                </Section>
                <Section title="v1.5.1 — July 21, 2026">
                  <Group label="Bug Fixes">
                    <Item>Fixed Sign-ups (and Dashboard's grid Display control) being completely unreachable on mobile -- both now live inside the mobile Filters & sort sheet</Item>
                    <Item>Fixed those same controls stretching and wrapping awkwardly once moved into that sheet</Item>
                    <Item>Fixed several cramped/truncated layouts inside the Signup Page detail modal on mobile</Item>
                  </Group>
                  <Group label="UI Polish">
                    <Item>Dashboard's grid size is now a direct Small/Default toggle on mobile, matching Sessions' view toggle</Item>
                  </Group>
                </Section>
                <Section title="v1.5.0 — July 21, 2026">
                  <Group label="Session Signup Pages">
                    <Item>New "Sign-ups" workspace on the Sessions page -- create public booking pages per event, with venue, timezone, shoot types, and time slots</Item>
                    <Item>Public booking page with day-grouped, venue-local-time slots; database-enforced double-booking prevention across overlapping shoot types</Item>
                    <Item>Booking auto-creates (or matches) the client and a real session -- no separate approval step -- and can auto-assign linked questionnaires</Item>
                    <Item>Client confirmation + photographer notification emails, both with a calendar link and .ics attachment; per-page custom note fields</Item>
                    <Item>Live status page for checking bookings on your phone, with real-time updates and a claimed/open progress view</Item>
                    <Item>Slot generator supports single-day or multi-day ranges, plus manual single-slot add and a clear-all-open-slots action</Item>
                  </Group>
                  <Group label="Bug Fixes">
                    <Item>Fixed a crash selecting a venue address on a signup page</Item>
                    <Item>Fixed slot times using the browser's timezone instead of the venue's</Item>
                    <Item>Fixed incorrect times on the "Add to Google Calendar" link and .ics file</Item>
                    <Item>Fixed a Gmail inline-preview error and an email crash on venue addresses with commas</Item>
                    <Item>Fixed the booking page showing slots already blocked by an overlapping claim</Item>
                    <Item>Removed a stale duplicate database function left from an earlier update</Item>
                  </Group>
                  <Group label="UI Polish">
                    <Item>Redesigned Sign-ups overview cards, the booking page flow, and the live status page</Item>
                  </Group>
                </Section>
                <Section title="v1.4.5 — July 19, 2026">
                  <Group label="Client Avatars">
                    <Item>New "Choose from gallery" option -- pick a client's avatar straight from one of their linked galleries instead of only uploading a file</Item>
                    <Item>Same Upload photo / Choose from gallery menu now used consistently on both the client page and Edit Client modal</Item>
                  </Group>
                  <Group label="Bug Fixes">
                    <Item>Fixed expired galleries showing "Active" and a broken cover image on the Client page</Item>
                  </Group>
                  <Group label="UI Polish">
                    <Item>Desktop sidebar nav order now matches mobile (Bookmarked moved after Sessions)</Item>
                    <Item>Fixed mobile "+" button color and Activity page pills wrapping on narrow phones</Item>
                  </Group>
                </Section>
                <Section title="v1.4.4 — July 19, 2026">
                  <Group label="Client Portal Password Protection">
                    <Item>Clients can now have an optional password protecting their entire portal</Item>
                    <Item>Escalating lockout after repeated wrong attempts, with a manual reset option</Item>
                    <Item>Regenerating a gallery's password now also revokes previously-unlocked access to it</Item>
                  </Group>
                  <Group label="Gallery Access Info">
                    <Item>Clients can now see a gallery's password/PIN directly in their portal, with one-click copy</Item>
                    <Item>Gallery links from the portal now open in a new tab</Item>
                  </Group>
                  <Group label="Bug Fixes">
                    <Item>Fixed the gallery "remembered password" flag resetting when opened in a new tab</Item>
                  </Group>
                </Section>
                <Section title="v1.4.3 — July 18, 2026">
                  <Group label="UI Polish">
                    <Item>Primary buttons now use the app's actual brand purple instead of near-black</Item>
                    <Item>Fixed cramped mobile layout on the client page's Portal link and Galleries cards</Item>
                    <Item>Client page's mobile header now uses the same breadcrumb used everywhere else</Item>
                    <Item>Linked Clients rows now show an avatar, email, and link to the client's page</Item>
                  </Group>
                  <Group label="Bug Fixes">
                    <Item>Fixed a gallery's tag suggestion list sometimes not updating right after a tag was assigned</Item>
                  </Group>
                </Section>
                <Section title="v1.4.2 — July 17, 2026">
                  <Group label="Unified Filters &amp; Sort">
                    <Item>Galleries, Clients, and Sessions now share one "Filters &amp; sort" pattern instead of each page having its own</Item>
                    <Item>New "Small" grid size on Galleries (up to 6 per row)</Item>
                    <Item>Gallery Sort By and Grid Size now persist across sessions</Item>
                    <Item>Clients: added Sort By (Name, Recently added)</Item>
                    <Item>Sessions: added Type and Payment status filters, plus Sort By</Item>
                  </Group>
                  <Group label="Bug Fixes">
                    <Item>Fixed Clients' tag filter only allowing one tag on desktop while mobile allowed multiple</Item>
                    <Item>Fixed the Filters &amp; sort panel occasionally rendering off-page</Item>
                    <Item>Fixed the panel closing itself when scrolling its own contents</Item>
                    <Item>Fixed clicking a tag closing the whole panel instead of selecting it</Item>
                    <Item>Fixed search/filters/create button appearing to pop in after page load</Item>
                  </Group>
                </Section>
                <Section title="v1.4.1 — July 17, 2026">
                  <Group label="Multi-Client Galleries">
                    <Item>A gallery can now be linked to more than one client, each with full portal access</Item>
                    <Item>Manage a gallery's linked clients from Gallery Settings</Item>
                    <Item>Unlink a gallery from a client directly from the client's page</Item>
                  </Group>
                  <Group label="Folders &amp; Attach Gallery">
                    <Item>Folders can now be moved (with their contents) into another folder</Item>
                    <Item>Attach Gallery now supports selecting multiple galleries at once, with search</Item>
                  </Group>
                  <Group label="Bug Fixes">
                    <Item>Fixed folder cover images showing stale after being replaced</Item>
                    <Item>Fixed deleting a folder navigating back to root instead of staying in place</Item>
                    <Item>Fixed a gallery's linked client getting cleared on unrelated settings saves</Item>
                    <Item>Fixed new galleries not generating a PIN/password when required by a template</Item>
                    <Item>Fixed the in-app Build date always showing today instead of the actual build date</Item>
                  </Group>
                </Section>
                <Section title="v1.4.0 — June 29, 2026">
                  <Group label="Client Portal">
                    <Item>Every client now gets one durable link showing all their galleries, contracts, and outstanding questionnaires</Item>
                    <Item>Generate or regenerate a client's portal link from their Client page</Item>
                    <Item>Galleries linked directly and via session are combined and de-duplicated, grouped by session</Item>
                    <Item>"New" badge on unviewed galleries, search/sort/filter for clients with many galleries</Item>
                    <Item>Contracts grouped into Needs your signature / Awaiting your photographer / Signed, with a detail page and PDF download for signed contracts</Item>
                    <Item>Questionnaires show only while outstanding, and disappear once submitted</Item>
                    <Item>"Link to existing client" suggestion on walk-up submissions matching an existing client's email</Item>
                  </Group>
                  <Group label="Bug Fixes">
                    <Item>Fixed "Create client record" on session submissions silently failing to persist the link to the database</Item>
                  </Group>
                  <Group label="Security">
                    <Item>Scoped, authenticated PDF download for signed contracts -- a client can only download their own</Item>
                  </Group>
                </Section>
                <Section title="v1.3.10 — June 28, 2026">
                  <Group label="Client Comments">
                    <Item>Photographers can now reply to client comments from the Activity feed</Item>
                    <Item>Clients now only see their own comments and the photographer's replies, not other clients' comments</Item>
                  </Group>
                  <Group label="Security">
                    <Item>General security hardening across client-facing data access</Item>
                  </Group>
                </Section>
                <Section title="v1.3.9 — June 26, 2026">
                  <Group label="Navigation &amp; Breadcrumbs">
                    <Item>Gallery breadcrumbs now correctly show the full folder path on Detail, Settings, and Activity pages</Item>
                    <Item>Long breadcrumb trails collapse with an ellipsis instead of wrapping and clipping</Item>
                    <Item>Back/Forward now walks folder navigation one level at a time instead of jumping to the dashboard root</Item>
                    <Item>Mobile gallery back button now returns to the actual previous page instead of always going to root</Item>
                    <Item>Fixed scroll position carrying over between pages on mobile</Item>
                  </Group>
                  <Group label="Clients">
                    <Item>Added "Attach Gallery" button on Client Detail to link an existing gallery without going through Gallery Settings</Item>
                    <Item>Client picker now shows uploaded client photos, with readable colored initials as a fallback</Item>
                  </Group>
                  <Group label="Bug Fixes">
                    <Item>Folder thumbnail grids now show all 4 cover images instead of only 3</Item>
                    <Item>Fixed daily activity digest and expiry reminder emails failing to send</Item>
                  </Group>
                </Section>
                <Section title="v1.3.8 — June 24, 2026">
                  <Group label="Bug Fixes">
                    <Item>Fixed high-resolution ZIP downloads failing on large galleries</Item>
                    <Item>High-resolution download progress now shows real progress instead of a static message</Item>
                  </Group>
                </Section>
                <Section title="v1.3.7 — June 20, 2026">
                  <Group label="New Features">
                    <Item>Sessions can now be linked to multiple galleries instead of just one</Item>
                    <Item>Creating a client from a submission now shows an editable review step before saving</Item>
                    <Item>Added a copy button next to submitted emails in the Sessions submissions list</Item>
                  </Group>
                  <Group label="Bug Fixes">
                    <Item>Create client record now reliably pulls name and email from the submission's structured fields</Item>
                    <Item>Removed a hardcoded greeting from gallery emails — client_name remains available as a template variable</Item>
                    <Item>Fixed a runtime error when selecting an email template</Item>
                    <Item>Fixed invalid markup and a small tap target in the submissions list</Item>
                  </Group>
                </Section>
                <Section title="v1.3.6 — June 17, 2026">
                  <Group label="Bug Fixes">
                    <Item>Custom-uploaded gallery covers now show correctly on the Dashboard and in folder thumbnails</Item>
                    <Item>Inserting a variable in Email and Contract templates now respects cursor position</Item>
                    <Item>Markdown formatting now renders correctly in sent gallery emails</Item>
                    <Item>Gallery emails to more than 5 recipients no longer silently fail past the 5th send</Item>
                    <Item>Insert template dropdown no longer gets clipped in the email composer</Item>
                  </Group>
                </Section>
                <Section title="v1.3.5 — June 16, 2026">
                  <Group label="Bug Fixes">
                    <Item>Bookmark state now stays in sync when switching between gallery sets</Item>
                    <Item>Bookmarked page now shows the current version of an image after re-watermarking</Item>
                  </Group>
                </Section>
                <Section title="v1.3.4 — June 16, 2026">
                  <Group label="New Features">
                    <Item>Submissions can now be deleted directly from the Session Detail submissions list</Item>
                  </Group>
                  <Group label="Bug Fixes">
                    <Item>Fixed address autocomplete not working in production due to a missing environment variable</Item>
                  </Group>
                </Section>
                <Section title="v1.3.3 — June 16, 2026">
                  <Group label="Bug Fixes">
                    <Item>Client Favorites detail panel no longer renders duplicate mobile and desktop versions at once</Item>
                    <Item>Desktop favorites panel now closes correctly on backdrop click</Item>
                  </Group>
                </Section>
                <Section title="v1.3.2 — June 16, 2026">
                  <Group label="Bug Fixes">
                    <Item>Sessions now correctly filter by client — previously showed all sessions on every client detail page</Item>
                    <Item>Gallery linking added to Session Detail — link or unlink a gallery from the Overview section</Item>
                    <Item>Contract event_date variable now falls back to session date when no gallery is linked</Item>
                    <Item>Contract photographer email, phone, address, and governing state variables now resolve correctly</Item>
                    <Item>Removed duplicate client row from Session Detail Overview</Item>
                  </Group>
                </Section>
                <Section title="v1.3.1 — June 16, 2026">
                  <Group label="Studio Logo">
                    <Item>Upload a studio logo under Account — PNG, JPG, WebP, or SVG (SVGs auto-converted to PNG)</Item>
                    <Item>Logo shown on the client gallery gate screen and questionnaire submission form</Item>
                    <Item>Logo shown in gallery and questionnaire emails, falls back to business name if not set</Item>
                  </Group>
                  <Group label="Bug Fixes">
                    <Item>Submissions search now matches against submitter email and credit handle</Item>
                    <Item>SubmitForm footer now shows FinalVault logo mark</Item>
                  </Group>
                </Section>
                <Section title="v1.3.0 — June 16, 2026">
                  <Group label="Sessions">
                    <Item>New Sessions section — create and manage photography sessions with Private and Walk-up modes</Item>
                    <Item>Kanban board view with drag-to-update status, plus list view</Item>
                    <Item>Financial tracking per session — fee, retainer, balance due, payment status</Item>
                    <Item>Session detail page with status pills, client link, and financials</Item>
                    <Item>Sessions card on Client Detail</Item>
                  </Group>
                  <Group label="Questionnaires">
                    <Item>Questionnaire template builder in Account → Templates</Item>
                    <Item>Attach questionnaires to sessions and send per-questionnaire links</Item>
                    <Item>Walk-up public submission form at /submit/:token</Item>
                    <Item>Submissions viewer with CSV export and Create Client action</Item>
                  </Group>
                  <Group label="Contracts">
                    <Item>Contracts now live exclusively under Sessions</Item>
                    <Item>New session variables: session name, date, time, location, fee, and balance</Item>
                  </Group>
                  <Group label="Mobile UX">
                    <Item>New/Edit Session and New/Edit Client modals use slide-up sheet on mobile</Item>
                    <Item>ClientPicker searchable combobox in New Session and Edit Session</Item>
                    <Item>Questionnaires consolidated under Account → Templates tab</Item>
                  </Group>
                </Section>
                <Section title="v1.2.0 — June 12, 2026">
                  <Group label="Client CRM">
                    <Item>New Clients section — create and manage client records with contact info, avatars, tags, and pronouns</Item>
                    <Item>Client detail page with linked galleries, contracts, and notes</Item>
                    <Item>Google Places address autocomplete in client modals</Item>
                    <Item>Tag management — chip+typeahead input with autocomplete from existing tags</Item>
                    <Item>Pronouns field shown inline next to client name throughout the app</Item>
                  </Group>
                  <Group label="Contract management">
                    <Item>Send contracts to clients from Client Detail with gallery picker, template picker, and preview step</Item>
                    <Item>Client signs with typed digital signature — legally binding under US ESIGN/UETA</Item>
                    <Item>Three default templates: General Photography Services Agreement, Print Release, Photo Licensing Agreement</Item>
                    <Item>New contract variables for business info, client address, fees, and cancellation policy</Item>
                  </Group>
                  <Group label="Account — Business Information">
                    <Item>New business info fields in Profile: email, phone, address, and governing state</Item>
                    <Item>Business info auto-fills contract variables when sending contracts</Item>
                  </Group>
                </Section>
                <Section title="v1.1.6 — June 6, 2026">
                  <Group label="Dashboard sort &amp; display">
                    <Item>Sort galleries by Created, Event Date, Last Updated, or Name</Item>
                    <Item>Toggle between Default and Large grid sizes on desktop</Item>
                  </Group>
                  <Group label="Filter improvements">
                    <Item>All filters flatten folder structure — shows matching galleries across all folders</Item>
                    <Item>Mobile filter sheet redesigned with drill-down sub-screens</Item>
                    <Item>Mobile header buttons are now icon-only with larger tap targets</Item>
                  </Group>
                  <Group label="Bottom sheets">
                    <Item>All mobile bottom sheets now share a single consistent component</Item>
                    <Item>Swipe-down-to-close and background scroll lock on every sheet</Item>
                  </Group>
                </Section>
                <Section title="v1.1.5 — June 5, 2026">
                  <Group label="Gallery Category Tags">
                    <Item>Create a tag library with custom colors via Account → Tags</Item>
                    <Item>Assign tags to galleries from Settings → General with autocomplete and inline creation</Item>
                    <Item>Dashboard search now matches tag names</Item>
                    <Item>New Tags filter pill — multi-select, AND logic, flattens folders</Item>
                  </Group>
                </Section>
                <Section title="v1.1.4 — June 5, 2026">
                  <Group label="Bug Fixes">
                    <Item>Fixed activity digest emails not sending — Edge Functions redeployed with new Supabase key format</Item>
                    <Item>Fixed folder cover upload failing with 403 error</Item>
                    <Item>RAW camera files now rejected at upload with clear error modal</Item>
                    <Item>Fixed overscroll-behavior blocking vertical scroll throughout the app</Item>
                  </Group>
                </Section>
                <Section title="v1.1.3 — June 4, 2026">
                  <Group label="Gallery Guide">
                    <Item>First-time clients see an onboarding modal explaining key gallery features</Item>
                    <Item>Steps adjust dynamically — only enabled features appear</Item>
                    <Item>Download step adapts to web size, high-res, or both</Item>
                    <Item>Toggle per gallery in Settings → Sharing</Item>
                  </Group>
                </Section>
                <Section title="v1.1.2 — June 4, 2026">
                  <Group label="iOS Safari Fix">
                    <Item>Fixed iOS Safari auto-zooming the page by 6.67%, causing UI elements to be cut off and the background to shift when swiping</Item>
                  </Group>
                </Section>
                <Section title="v1.1.1 — June 4, 2026">
                  <Group label="Folder Cover Photos">
                    <Item>Set a custom cover image for any folder via the ⋮ menu</Item>
                    <Item>Full focal point picker — control how the image crops in the folder card</Item>
                    <Item>Select from gallery images or upload a custom image</Item>
                  </Group>
                  <Group label="Faster Downloads">
                    <Item>Web size JEPGs generated at upload — no more worker memory errors on large images</Item>
                    <Item>Downloads serve pre-generated files directly — zero processing</Item>
                  </Group>
                  <Group label="Mobile Fixes">
                    <Item>Fixed horizontal scroll caused by set tabs overflowing viewport</Item>
                    <Item>iOS browser chrome no longer causes layout shifts</Item>
                    <Item>iOS share sheet no longer re-prompts after cancelling download</Item>
                    <Item>Swipe down to close mobile action sheet fixed</Item>
                  </Group>
                </Section>
                <Section title="v1.1.0 — June 3, 2026">
                  <Group label="Gallery Folders">
                    <Item>Organize galleries into nested folders with drag-and-drop</Item>
                    <Item>Rename, delete, and move folders via ⋮ menu</Item>
                    <Item>Navigable Move to Folder picker (Finder-style, no flat list)</Item>
                    <Item>Full breadcrumb trail with working back-navigation through folder hierarchy</Item>
                    <Item>Delete folder with contents shows exact subfolder and gallery counts</Item>
                  </Group>
                  <Group label="Client Favorites — Photographer View">
                    <Item>Activity page shows which clients favorited which images</Item>
                    <Item>Client cards with image thumbnails, timestamps, and lightbox</Item>
                  </Group>
                  <Group label="Improvements">
                    <Item>Comment button now available inside the image lightbox</Item>
                    <Item>iOS downloads use native share sheet (save to Photos)</Item>
                    <Item>Image card ⋮ menu always visible on mobile</Item>
                    <Item>Large batch uploads no longer rate-limited</Item>
                    <Item>Folder cards show creation date</Item>
                  </Group>
                </Section>
                <Section title="v1.0.0 — May 31, 2026">
                  <Item>Initial release — gallery management, client delivery, favorites, comments, downloads, watermarks, activity feed, admin panel</Item>
                </Section>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{title}</p>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Group({ label, children }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium" style={{ color: 'var(--text)' }}>{label}</p>
      <ul className="space-y-0.5 pl-3">{children}</ul>
    </div>
  )
}

function Item({ children }) {
  return (
    <li className="text-xs flex items-start gap-1.5" style={{ color: 'var(--text-muted)' }}>
      <span style={{ color: '#6366f1', flexShrink: 0 }}>·</span>
      {children}
    </li>
  )
}
