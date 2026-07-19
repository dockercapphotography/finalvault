import { useState, useEffect, useRef } from 'react'
import { Lock } from 'lucide-react'
import { verifyPortalPassword } from '../../utils/clientApi.js'

function formatCountdown(seconds) {
  const s = Math.max(0, Math.ceil(seconds))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${m}m ${rem}s`
}

// Shown in place of any portal page's content when get_client_portal_data
// reports password_required -- i.e. the client has a portal password set
// (see ClientDetail.jsx's PortalPasswordSection) and it hasn't been
// supplied yet this tab session. Deliberately rendered standalone, not
// inside ClientPortalLayout: the sidebar needs photographer branding,
// which itself comes from data this gate doesn't have yet (photographer_id
// only arrives in the real payload, post-unlock), so showing a half-built
// sidebar here would be more confusing than a clean centered screen.
//
// Each of the four portal route pages (Galleries/Contracts/Questionnaires/
// ContractDetail) independently calls getPortalData on mount rather than
// sharing one layout-level fetch (see ClientPortalLayout.jsx's own
// comments on why), so each page owns a small amount of gate-check
// boilerplate and renders this component the same way -- there's no
// single choke point in the route tree to put this behind instead.
export default function PortalPasswordGate({ token, gateResult, onUnlock }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [invalidLink, setInvalidLink] = useState(false)
  const [retryAfter, setRetryAfter] = useState(
    gateResult?.locked ? Math.ceil(gateResult.retry_after_seconds) : 0
  )
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (retryAfter <= 0) return
    const interval = setInterval(() => {
      setRetryAfter(s => (s <= 1 ? 0 : s - 1))
    }, 1000)
    return () => clearInterval(interval)
  }, [retryAfter > 0])

  const locked = retryAfter > 0

  async function handleSubmit(e) {
    e.preventDefault()
    if (!password || submitting || locked) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await verifyPortalPassword(token, password)
      if (!result) {
        setInvalidLink(true)
      } else if (result.locked) {
        setRetryAfter(Math.ceil(result.retry_after_seconds))
        setError('Too many attempts. Please wait before trying again.')
      } else if (result.password_required) {
        setError('Incorrect password. Please try again.')
        setPassword('')
      } else {
        onUnlock(result)
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (invalidLink) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
        <div className="text-center max-w-sm">
          <p className="text-base font-medium" style={{ color: 'var(--text)' }}>This link isn't valid</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            The link may have been regenerated. Contact your photographer for an updated link.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl overflow-hidden"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="px-6 pt-7 pb-2 flex flex-col items-center text-center">
          <div className="w-10 h-10 rounded-full flex items-center justify-center mb-3"
            style={{ background: 'rgba(99,102,241,0.1)' }}>
            <Lock size={16} style={{ color: '#6366f1' }} />
          </div>
          <p className="text-base font-medium" style={{ color: 'var(--text)' }}>Password required</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Enter the password your photographer shared with you to view this portal.
          </p>
        </div>
        <div className="px-6 pb-6 pt-4 space-y-3">
          <input
            ref={inputRef}
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            disabled={locked || submitting}
            autoComplete="current-password"
            style={{
              width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)',
              color: 'var(--text)', borderRadius: '8px', padding: '10px 12px',
              fontSize: '14px', outline: 'none', textAlign: 'center',
            }}
          />
          {locked ? (
            <div className="text-center px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--danger-subtle)', color: 'var(--danger)' }}>
              Too many attempts. Try again in {formatCountdown(retryAfter)}.
            </div>
          ) : error ? (
            <p className="text-xs text-center" style={{ color: 'var(--danger)' }}>{error}</p>
          ) : null}
          <button type="submit" disabled={!password || submitting || locked}
            className="w-full py-2.5 rounded-lg text-sm font-medium"
            style={{
              background: '#6366f1', color: '#fff', border: 'none',
              cursor: (!password || submitting || locked) ? 'not-allowed' : 'pointer',
              opacity: (!password || submitting || locked) ? 0.6 : 1,
            }}>
            {submitting ? 'Checking...' : 'Continue'}
          </button>
        </div>
      </form>
    </div>
  )
}
