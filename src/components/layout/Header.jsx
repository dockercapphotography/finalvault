import { supabase } from '../../supabaseClient.js'

export default function Header({ session }) {
  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  const email = session?.user?.email
  const initials = email ? email[0].toUpperCase() : '?'

  return (
    <header className="h-13 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 shrink-0">
      <div />
      <div className="flex items-center gap-3">
        <span className="text-slate-500 text-xs hidden sm:block">{email}</span>
        <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-xs font-medium text-white">
          {initials}
        </div>
        <button
          onClick={handleSignOut}
          className="text-xs text-slate-500 hover:text-white transition-colors"
        >
          Sign out
        </button>
      </div>
    </header>
  )
}
