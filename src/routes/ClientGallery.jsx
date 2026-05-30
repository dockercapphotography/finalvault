import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { Lock, ArrowRight } from 'lucide-react'
import {
  getGalleryByToken, verifyGalleryPassword, getPhotographerName,
  getOrCreateViewer, getViewerFromSession
} from '../utils/clientApi.js'
import { supabaseAnon } from '../supabaseClientAnon.js'

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL

function GateWrapper({ gallery, photographerName, children }) {
  const [coverBlobUrl, setCoverBlobUrl] = useState(null)

  useEffect(() => {
    if (!gallery) return
    async function loadCover() {
      let r2Key = gallery.cover_r2_key
      if (!r2Key && gallery.cover_image_id) {
        try {
          const { createClient } = await import('@supabase/supabase-js')
          const anonClient = createClient(
            import.meta.env.VITE_SUPABASE_URL,
            import.meta.env.VITE_SUPABASE_ANON_KEY
          )
          const { data } = await anonClient
            .from('gallery_images')
            .select('preview_r2_key')
            .eq('id', gallery.cover_image_id)
            .single()
          r2Key = data?.preview_r2_key
        } catch { return }
      }
      if (!r2Key) return
      const url = gallery.share_token
        ? `${WORKER_URL}/preview/${encodeURIComponent(r2Key)}?share_token=${gallery.share_token}`
        : `${WORKER_URL}/preview/${encodeURIComponent(r2Key)}`
      try {
        const resp = await fetch(url)
        if (resp.ok) {
          const blob = await resp.blob()
          setCoverBlobUrl(URL.createObjectURL(blob))
        }
      } catch {}
    }
    loadCover()
  }, [gallery?.cover_image_id, gallery?.cover_r2_key])

  return (
    <div className="min-h-screen relative flex flex-col items-center justify-center px-4"
      style={{ background: 'linear-gradient(135deg, #0f0f1a 0%, #1a0f2e 50%, #0f1a1a 100%)' }}>

      {/* Cover image background with focal point */}
      {coverBlobUrl && (
        <>
          <div className="absolute inset-0 bg-cover"
            style={{
              backgroundImage: `url(${coverBlobUrl})`,
              backgroundPosition: `${(gallery.cover_focus_x ?? 0.5) * 100}% ${(gallery.cover_focus_y ?? 0.5) * 100}%`,
            }} />
          <div className="absolute inset-0"
            style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.65) 100%)' }} />
        </>
      )}

      {/* Content */}
      <div className="relative z-10 w-full max-w-sm space-y-6 pb-12">
        {gallery && (
          <div className="text-center space-y-1">
            <p className="text-xs uppercase tracking-widest font-medium text-white/60">
              {photographerName || 'Your photographer'}
            </p>
            <h1 className="text-3xl font-bold text-white tracking-tight">{gallery.title}</h1>
            {gallery.client_name && (
              <p className="text-sm text-white/60">For {gallery.client_name}</p>
            )}
          </div>
        )}
        {children}
      </div>

      {/* Footer */}
      <div className="relative z-10 mt-8 text-center flex flex-col items-center gap-1.5">
        <img src="/finalvault_logo.svg" alt="FinalVault" width="20" height="20" style={{ opacity: 0.4 }} />
        <span style={{
          fontFamily: "'Montserrat', sans-serif",
          fontWeight: 700,
          fontSize: '9px',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.3)',
        }}>FinalVault</span>
      </div>
    </div>
  )
}

function InputField({ value, onChange, type = 'text', placeholder, autoFocus }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      style={{
        width: '100%',
        background: 'rgba(255,255,255,0.12)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,0.25)',
        color: '#fff',
        borderRadius: '10px',
        padding: '12px 16px',
        fontSize: '15px',
        outline: 'none',
      }}
      onFocus={e => e.target.style.borderColor = 'rgba(255,255,255,0.6)'}
      onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.25)'}
    />
  )
}

function GateButton({ onClick, loading, children }) {
  return (
    <button onClick={onClick} disabled={loading}
      className="w-full flex items-center justify-center gap-2 font-semibold rounded-xl py-3 transition-opacity"
      style={{
        background: '#fff',
        color: '#111',
        opacity: loading ? 0.5 : 1,
        cursor: loading ? 'not-allowed' : 'pointer',
        fontSize: '15px',
        letterSpacing: '0.02em',
      }}>
      {children}
    </button>
  )
}

export default function ClientGallery() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [gallery, setGallery] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [stage, setStage] = useState('loading')
  const [photographerName, setPhotographerName] = useState('')

  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { load() }, [token])

  async function load() {
    try {
      setLoading(true)
      if (searchParams.get('preview') === '1') {
        navigate(`/g/${token}/view?preview=1`, { replace: true })
        return
      }
      const g = await getGalleryByToken(token)

      if (!g) { setError('Gallery not found.'); return }
      if (!g.is_active) { setError('This gallery is no longer available.'); return }
      if (g.expires_at && new Date(g.expires_at) < new Date()) {
        setError('This gallery has expired.'); return
      }

      setGallery(g)

      if (g.photographer_id) {
        getPhotographerName(g.photographer_id).then(n => { if (n) setPhotographerName(n) })
      }

      const existingViewer = getViewerFromSession(g.id)
      if (existingViewer) {
        if (g.require_password) {
          const pwVerified = sessionStorage.getItem(`fv-pw-${g.id}`)
          if (pwVerified) { navigate(`/g/${token}/view${window.location.search}`, { replace: true }); return }
          setStage('password')
        } else {
          navigate(`/g/${token}/view${window.location.search}`, { replace: true })
        }
        return
      }

      setStage('name')
    } catch {
      setError('Could not load gallery.')
    } finally {
      setLoading(false)
    }
  }

  async function handleNameSubmit() {
    if (!name.trim()) return
    setSubmitting(true)
    try {
      await getOrCreateViewer(gallery.id, name.trim())
      if (gallery.require_password) setStage('password')
      else navigate(`/g/${token}/view${window.location.search}`, { replace: true })
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handlePasswordSubmit() {
    if (!password.trim()) return
    setSubmitting(true)
    setPasswordError('')
    try {
      const correct = await verifyGalleryPassword(gallery.id, password)
      if (correct) {
        sessionStorage.setItem(`fv-pw-${gallery.id}`, '1')
        navigate(`/g/${token}/view${window.location.search}`, { replace: true })
      } else {
        setPasswordError('Incorrect password. Please try again.')
      }
    } catch {
      setPasswordError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleKeyDown(e, fn) { if (e.key === 'Enter') fn() }

  if (loading || stage === 'loading') return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#111' }}>
      <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
        style={{ borderColor: '#fff', borderTopColor: 'transparent' }} />
    </div>
  )

  if (error) return (
    <GateWrapper gallery={gallery} photographerName={photographerName}>
      <div className="text-center space-y-2 rounded-2xl p-6"
        style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <p className="text-lg font-semibold text-white">Gallery unavailable</p>
        <p className="text-sm text-white/60">{error}</p>
      </div>
    </GateWrapper>
  )

  if (stage === 'name') return (
    <GateWrapper gallery={gallery} photographerName={photographerName}>
      <div className="space-y-3">
        <InputField
          value={name}
          onChange={setName}
          placeholder="Enter your name to continue"
          autoFocus
        />
        <GateButton onClick={handleNameSubmit} loading={submitting || !name.trim()}>
          View Gallery <ArrowRight size={16} />
        </GateButton>
      </div>
    </GateWrapper>
  )

  if (stage === 'password') return (
    <GateWrapper gallery={gallery} photographerName={photographerName}>
      <form className="space-y-3" onSubmit={e => { e.preventDefault(); handlePasswordSubmit() }}>
        <div className="flex items-center gap-2 justify-center text-white/70 text-sm">
          <Lock size={14} />
          This gallery is password protected
        </div>
        <InputField
          value={password}
          onChange={v => { setPassword(v); setPasswordError('') }}
          type="password"
          placeholder="Enter gallery password"
          autoFocus
        />
        {passwordError && (
          <p className="text-sm text-center" style={{ color: '#f87171' }}>{passwordError}</p>
        )}
        <GateButton onClick={handlePasswordSubmit} loading={submitting || !password.trim()}>
          Unlock Gallery <ArrowRight size={16} />
        </GateButton>
      </form>
    </GateWrapper>
  )

  return null
}
