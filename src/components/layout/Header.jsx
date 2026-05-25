import { supabase } from '../../supabaseClient.js'

export default function Header({ session }) {
  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  const email = session?.user?.email
  const initials = email ? email[0].toUpperCase() : '?'

  return (
    <header className="h-12 flex items-center justify-between px-6 shrink-0" style={{
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)'
    }}>
      <div />
      <div className="flex items-center gap-3">
        <span className="text-xs hidden sm:block" style={{ color: 'var(--text-muted)' }}>{email}</span>
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium"
          style={{ background: 'var(--surface-raised)', color: 'var(--text)' }}
        >
          {initials}
        </div>
        <button
          onClick={handleSignOut}
          className="text-xs transition-colors"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={e => e.target.style.color = 'var(--text)'}
          onMouseLeave={e => e.target.style.color = 'var(--text-muted)'}
        >
          Sign out
        </button>
      </div>
    </header>
  )
}
