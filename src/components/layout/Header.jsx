import { supabase } from '../../supabaseClient.js'

export default function Header({ session }) {
  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <header className="h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 shrink-0">
      <span className="text-white font-semibold tracking-tight">FinalVault</span>
      <div className="flex items-center gap-4">
        <span className="text-sm text-slate-400">{session?.user?.email}</span>
        <button
          onClick={handleSignOut}
          className="text-sm text-slate-400 hover:text-white transition-colors"
        >
          Sign out
        </button>
      </div>
    </header>
  )
}
