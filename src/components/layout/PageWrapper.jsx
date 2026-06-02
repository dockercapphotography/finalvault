import Header from './Header.jsx'
import Sidebar from './Sidebar.jsx'

const VERSION = '1.0.0'
const BUILD_DATE = new Date().toLocaleDateString('en-US', {
  year: 'numeric', month: '2-digit', day: '2-digit'
})

export default function PageWrapper({ session, children }) {
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
        <footer className="hidden md:flex items-center justify-between px-6 py-3"
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
            <span className="text-xs" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
              v{VERSION} · Build: {BUILD_DATE}
            </span>
          </div>
        </footer>
      </div>
    </div>
  )
}
