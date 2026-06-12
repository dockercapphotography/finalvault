import { useState } from 'react'
import Header from './Header.jsx'
import Sidebar from './Sidebar.jsx'

const VERSION = '1.2.0'
const BUILD_DATE = new Date().toLocaleDateString('en-US', {
  year: 'numeric', month: '2-digit', day: '2-digit'
})

export default function PageWrapper({ session, children }) {
  const [showChangelog, setShowChangelog] = useState(false)
  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg)' }}>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header session={session} />
        <main className="flex-1 p-4 md:p-6 overflow-auto pb-20 md:pb-6">
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
