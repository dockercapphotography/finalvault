import { useState, useEffect, useRef } from 'react'
import { LogOut } from 'lucide-react'
import { supabase } from '../../supabaseClient.js'
import NotificationBell from './NotificationBell.jsx'

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL

const LogoMark = () => (
  <img src="/finalvault_logo.svg" alt="FinalVault" width="24" height="24" style={{ flexShrink: 0 }} />
)

export default function Header({ session }) {
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const dropdownRef = useRef(null)

  const email = session?.user?.email
  const initials = email ? email[0].toUpperCase() : '?'

  useEffect(() => {
    if (!session?.user?.id) return
    async function loadAvatar() {
      try {
        const { data } = await supabase
          .from('photographers')
          .select('avatar_r2_key')
          .eq('id', session.user.id)
          .single()
        if (!data?.avatar_r2_key) return
        const { data: { session: s } } = await supabase.auth.getSession()
        const resp = await fetch(
          `${WORKER_URL}/watermark/${encodeURIComponent(data.avatar_r2_key)}`,
          { headers: { Authorization: `Bearer ${s.access_token}` } }
        )
        if (resp.ok) {
          const blob = await resp.blob()
          setAvatarUrl(URL.createObjectURL(blob))
        }
      } catch {}
    }
    loadAvatar()
    window.addEventListener('fv-avatar-updated', loadAvatar)
    return () => window.removeEventListener('fv-avatar-updated', loadAvatar)
  }, [session?.user?.id])

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (!dropdownRef.current?.contains(e.target)) {
        setOpen(false)
        setConfirming(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <header className="h-12 flex items-center justify-between px-4 shrink-0" style={{
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)'
    }}>
      {/* Logo — mobile only */}
      <div className="flex items-center gap-2 md:hidden">
        <LogoMark />
        <span style={{
          fontFamily: "'Montserrat', sans-serif",
          fontWeight: 700,
          fontSize: '12px',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--text)',
        }}>
          FinalVault
        </span>
      </div>
      <div className="hidden md:block" />

      {/* Right side: bell (mobile only) + avatar */}
      <div className="flex items-center gap-1">
        <div className="md:hidden">
          <NotificationBell mobile />
        </div>

        {/* Avatar dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => { setOpen(o => !o); setConfirming(false) }}
            className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors"
            style={{ cursor: 'pointer', background: open ? 'var(--surface-raised)' : 'transparent', border: 'none' }}
          >
            <span className="text-xs hidden md:block" style={{ color: 'var(--text-muted)' }}>{email}</span>
            <div className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center text-xs font-medium"
              style={{ background: 'var(--surface-raised)', color: 'var(--text)', flexShrink: 0 }}>
              {avatarUrl
                ? <img src={avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : initials}
            </div>
          </button>

          {open && (
            <div className="absolute right-0 top-full mt-1 rounded-xl shadow-lg overflow-hidden z-50"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 180 }}>

              {/* Email */}
              <div className="px-4 py-3 md:hidden" style={{ borderBottom: '1px solid var(--border)' }}>
                <p className="text-xs font-medium truncate" style={{ color: 'var(--text-muted)' }}>{email}</p>
              </div>

              {/* Sign out — two-step */}
              {!confirming ? (
                <button
                  onClick={() => setConfirming(true)}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left"
                  style={{ color: 'var(--text)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <LogOut size={14} style={{ color: 'var(--text-muted)' }} />
                  Sign out
                </button>
              ) : (
                <div className="px-4 py-3 space-y-2">
                  <p className="text-xs font-medium" style={{ color: 'var(--text)' }}>Sign out?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSignOut}
                      className="flex-1 py-1.5 rounded-lg text-xs font-medium"
                      style={{ background: 'var(--danger)', color: '#fff', cursor: 'pointer', border: 'none' }}>
                      Sign out
                    </button>
                    <button
                      onClick={() => setConfirming(false)}
                      className="flex-1 py-1.5 rounded-lg text-xs font-medium"
                      style={{ background: 'var(--surface-raised)', color: 'var(--text)', cursor: 'pointer', border: 'none' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
