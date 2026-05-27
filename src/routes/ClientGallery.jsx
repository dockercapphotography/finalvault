import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Lock, ArrowRight } from 'lucide-react'
import {
  getGalleryByToken, verifyGalleryPassword, getPhotographerName,
  getOrCreateViewer, getViewerFromSession
} from '../utils/clientApi.js'

function GateWrapper({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm space-y-6">
        {children}
      </div>
    </div>
  )
}

function InputField({ label, value, onChange, type = 'text', placeholder, autoFocus }) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="text-sm font-medium block" style={{ color: 'var(--text)' }}>{label}</label>
      )}
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        style={{
          width: '100%',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          color: 'var(--text)',
          borderRadius: '10px',
          padding: '10px 14px',
          fontSize: '15px',
          outline: 'none',
        }}
        onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
        onBlur={e => e.target.style.borderColor = 'var(--border)'}
      />
    </div>
  )
}

function GateButton({ onClick, loading, children }) {
  return (
    <button onClick={onClick} disabled={loading}
      className="w-full flex items-center justify-center gap-2 font-medium rounded-xl py-3 transition-opacity"
      style={{
        background: '#6366f1',
        color: '#fff',
        opacity: loading ? 0.6 : 1,
        cursor: loading ? 'not-allowed' : 'pointer',
        fontSize: '15px',
      }}>
      {children}
    </button>
  )
}

export default function ClientGallery() {
  const { token } = useParams()
  const navigate = useNavigate()

  const [gallery, setGallery] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [stage, setStage] = useState('loading') // loading | name | password | done
  const [photographerName, setPhotographerName] = useState('')

  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { load() }, [token])

  async function load() {
    try {
      setLoading(true)
      const g = await getGalleryByToken(token)

      if (!g) { setError('Gallery not found.'); return }
      if (!g.is_active) { setError('This gallery is no longer available.'); return }
      if (g.expires_at && new Date(g.expires_at) < new Date()) {
        setError('This gallery has expired.'); return
      }

      setGallery(g)

      // Fetch photographer name
      if (g.photographer_id) {
        getPhotographerName(g.photographer_id).then(name => {
          if (name) setPhotographerName(name)
        })
      }

      // Check if viewer already has a session for this gallery
      const existingViewer = getViewerFromSession(g.id)
      if (existingViewer) {
        // Already named — check if password still needed
        if (g.require_password) {
          const pwVerified = sessionStorage.getItem(`fv-pw-${g.id}`)
          if (pwVerified) {
            navigate(`/g/${token}/view`, { replace: true })
            return
          }
          setStage('password')
        } else {
          navigate(`/g/${token}/view`, { replace: true })
        }
        return
      }

      setStage('name')
    } catch (err) {
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
      if (gallery.require_password) {
        setStage('password')
      } else {
        navigate(`/g/${token}/view`, { replace: true })
      }
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
        navigate(`/g/${token}/view`, { replace: true })
      } else {
        setPasswordError('Incorrect password. Please try again.')
      }
    } catch {
      setPasswordError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleKeyDown(e, fn) {
    if (e.key === 'Enter') fn()
  }

  if (loading || stage === 'loading') return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
        style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
    </div>
  )

  if (error) return (
    <GateWrapper>
      <div className="text-center space-y-2">
        <p className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Gallery unavailable</p>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{error}</p>
      </div>
    </GateWrapper>
  )

  // Name gate
  if (stage === 'name') return (
    <GateWrapper>
      <div className="text-center space-y-1">
        <p className="text-xs uppercase tracking-widest font-medium" style={{ color: 'var(--text-muted)' }}>
          {photographerName || 'Your photographer'}
        </p>
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--text)' }}>{gallery.title}</h1>
        {gallery.client_name && (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>For {gallery.client_name}</p>
        )}
      </div>
      <div className="space-y-3">
        <InputField
          label="Your name"
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

  // Password gate
  if (stage === 'password') return (
    <GateWrapper>
      <div className="text-center space-y-1">
        <div className="flex justify-center mb-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <Lock size={18} style={{ color: 'var(--text-muted)' }} />
          </div>
        </div>
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Password required</h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          This gallery is password protected.
        </p>
      </div>
      <div className="space-y-3">
        <InputField
          label="Password"
          value={password}
          onChange={v => { setPassword(v); setPasswordError('') }}
          type="password"
          placeholder="Enter gallery password"
          autoFocus
        />
        {passwordError && (
          <p className="text-sm" style={{ color: 'var(--danger)' }}>{passwordError}</p>
        )}
        <GateButton onClick={handlePasswordSubmit} loading={submitting || !password.trim()}>
          Unlock Gallery <ArrowRight size={16} />
        </GateButton>
      </div>
    </GateWrapper>
  )

  return null
}
