import { useState, useEffect, useRef } from 'react'
import { LogOut } from 'lucide-react'
import { supabase } from '../../supabaseClient.js'

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL

const LogoMark = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 532.02 542.02" width="24" height="24" style={{ flexShrink: 0 }}>
    <path fill="#ebdcfa" d="M439.34,65.62v132.41l-101.98-103.41L246.39.76c70.46-5.44,140.07,18.4,192.95,64.86Z"/>
    <path fill="#f7effe" d="M531.32,251.43l-91.96,92.14V65.62c53.83,47.29,86.78,113.86,91.96,185.8Z"/>
    <path fill="#481a7a" d="M467.34,447.67h-129.32l101.39-104.11,91.91-92.14c5.12,71.11-17.86,142.13-63.98,196.25Z"/>
    <path fill="#6731a1" d="M338.02,447.58h129.32c-46.24,54.27-110.69,88.11-181.9,93.66l-90.98-93.66h143.56Z"/>
    <path fill="#974ae7" d="M194.46,447.39l90.98,93.85c-70.28,5.48-139.92-18.33-192.72-64.81v-132.33l101.73,103.29Z"/>
    <path fill="#a766eb" d="M92.77,344.1v132.33C38.76,428.88,5.94,362.55.72,290.58l92.05-92.62v146.14Z"/>
    <path fill="#b780ef" d="M194.01,94.75l-101.15,103.21L.72,290.58c-5.14-70.88,17.47-141.47,63.16-195.83h130.13Z"/>
    <path fill="#d7b8f6" d="M246.39.76l90.97,93.95H63.88C109.81,40.07,174.89,6.28,246.39.76Z"/>
    <path fill="#b780ef" d="M317.66,398.93h-103.13l-73.8-74.73v-106.2l73.84-74.95h103.61l73.07,75.08v106.04l-73.6,74.76ZM296.82,344.99l42.12-43.56v-61.2l-43.33-44.16h-59.18l-43.35,43.39v62.03c13.74,15.79,28.37,29.02,42.59,43.51h61.15Z"/>
  </svg>
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
    </header>
  )
}
