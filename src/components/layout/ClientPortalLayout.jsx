import ClientPortalSidebar from './ClientPortalSidebar.jsx'

// Analogous to PageWrapper.jsx, but PageWrapper hardcodes the authenticated
// Sidebar directly rather than accepting it as a prop -- so this is a
// parallel wrapper rather than a parameterized version of that one.
export default function ClientPortalLayout({ token, hasQuestionnaires, pendingContracts, pendingQuestionnaires, children }) {
  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg)' }}>
      <ClientPortalSidebar
        token={token}
        hasQuestionnaires={hasQuestionnaires}
        pendingContracts={pendingContracts}
        pendingQuestionnaires={pendingQuestionnaires}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 p-6 overflow-auto" style={{ paddingBottom: 'calc(1.5rem + 60px)' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
