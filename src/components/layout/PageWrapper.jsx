import Header from './Header.jsx'
import Sidebar from './Sidebar.jsx'

export default function PageWrapper({ session, children }) {
  return (
    <div className="min-h-screen bg-slate-950 flex">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header session={session} />
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
