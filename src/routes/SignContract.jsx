import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient.js'
import { CheckCircle, AlertCircle, Loader } from 'lucide-react'

const APP_URL = 'https://finalvault.dockercapphotography.com'

// Fetch contract by sign_token using anon client (no auth needed)
async function getContractByToken(token) {
  const { data, error } = await supabase
    .from('contracts')
    .select('id, title, body, body_hash, status, signed_at, signed_name, clients(first_name, last_name), photographers(display_name, business_name)')
    .eq('sign_token', token)
    .in('status', ['sent', 'pending_photographer'])
    .single()
  if (error) return null
  return data
}

function LoadingScreen() {
  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Loader size={24} style={{ color: '#6366f1', animation: 'spin 1s linear infinite' }} />
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

function ErrorScreen({ message }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <AlertCircle size={24} style={{ color: '#ef4444' }} />
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111', margin: '0 0 8px', fontFamily: 'system-ui, sans-serif' }}>
          Contract unavailable
        </h1>
        <p style={{ fontSize: 15, color: '#6b7280', margin: 0, fontFamily: 'system-ui, sans-serif', lineHeight: 1.6 }}>
          {message}
        </p>
      </div>
    </div>
  )
}

function AlreadySignedScreen({ contract }) {
  const senderName = contract.photographers?.business_name || contract.photographers?.display_name || 'Your Photographer'
  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <CheckCircle size={24} style={{ color: '#22c55e' }} />
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111', margin: '0 0 8px', fontFamily: 'system-ui, sans-serif' }}>
          Already signed
        </h1>
        <p style={{ fontSize: 15, color: '#6b7280', margin: '0 0 4px', fontFamily: 'system-ui, sans-serif', lineHeight: 1.6 }}>
          You signed <strong>{contract.title}</strong> on{' '}
          {new Date(contract.signed_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.
        </p>
        <p style={{ fontSize: 14, color: '#9ca3af', margin: '12px 0 0', fontFamily: 'system-ui, sans-serif' }}>
          {senderName} has been notified.
        </p>
      </div>
    </div>
  )
}

function SignedConfirmScreen({ contract, signedName }) {
  const senderName = contract.photographers?.business_name || contract.photographers?.display_name || 'Your Photographer'
  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <CheckCircle size={28} style={{ color: '#22c55e' }} />
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111', margin: '0 0 10px', fontFamily: 'system-ui, sans-serif' }}>
          Contract signed!
        </h1>
        <p style={{ fontSize: 15, color: '#374151', margin: '0 0 6px', fontFamily: 'system-ui, sans-serif', lineHeight: 1.6 }}>
          You've signed <strong>{contract.title}</strong> as <strong>{signedName}</strong>.
        </p>
        <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 24px', fontFamily: 'system-ui, sans-serif', lineHeight: 1.6 }}>
          {senderName} has been notified and will counter-sign shortly. You'll receive a copy once both parties have signed.
        </p>
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '14px 18px' }}>
          <p style={{ fontSize: 13, color: '#15803d', margin: 0, fontFamily: 'system-ui, sans-serif' }}>
            This signature is legally binding under US ESIGN/UETA.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function SignContract() {
  const { token } = useParams()
  const [contract, setContract] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [signed, setSigned] = useState(false)
  const [signedName, setSignedName] = useState('')

  // Signing form state
  const [typedName, setTypedName] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false)
  const bodyRef = useRef(null)
  const signatureRef = useRef(null)

  useEffect(() => {
    load()
  }, [token])

  async function load() {
    try {
      const c = await getContractByToken(token)
      if (!c) {
        setError('This contract link is invalid or has already been completed.')
        return
      }
      setContract(c)
    } catch {
      setError('Could not load contract. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Detect scroll to bottom of contract body
  function handleBodyScroll(e) {
    const el = e.currentTarget
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    if (atBottom) setHasScrolledToBottom(true)
  }

  async function handleSign() {
    if (!typedName.trim() || !agreed) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      // Call edge function to record signature server-side (captures real IP)
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sign-contract`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, signedName: typedName.trim() }),
        }
      )
      const result = await resp.json()
      if (!result.ok) throw new Error(result.error || 'Signing failed')
      setSignedName(typedName.trim())
      setSigned(true)
    } catch (err) {
      setSubmitError(err.message)
      setSubmitting(false)
    }
  }

  if (loading) return <LoadingScreen />
  if (error) return <ErrorScreen message={error} />
  if (signed) return <SignedConfirmScreen contract={contract} signedName={signedName} />
  if (contract?.status === 'pending_photographer' || (contract?.signed_at && contract?.signed_name)) {
    return <AlreadySignedScreen contract={contract} />
  }

  const senderName = contract.photographers?.business_name || contract.photographers?.display_name || 'Your Photographer'
  const clientName = contract.clients ? `${contract.clients.first_name} ${contract.clients.last_name}` : ''

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <div style={{ background: '#111', padding: '20px 24px', textAlign: 'center' }}>
        <p style={{ margin: 0, color: '#fff', fontSize: 13, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          {senderName}
        </p>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px 80px' }}>
        {/* Title */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111', margin: '0 0 6px' }}>
            {contract.title}
          </h1>
          <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
            Please read the full contract below before signing.
          </p>
        </div>

        {/* Contract body */}
        <div
          ref={bodyRef}
          onScroll={handleBodyScroll}
          style={{
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            padding: '28px 32px',
            maxHeight: 520,
            overflowY: 'auto',
            marginBottom: 24,
            position: 'relative',
          }}
        >
          <pre style={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontSize: 14,
            lineHeight: 1.8,
            color: '#1f2937',
            fontFamily: 'inherit',
            margin: 0,
          }}>
            {contract.body}
          </pre>
        </div>

        {/* Scroll nudge */}
        {!hasScrolledToBottom && (
          <p style={{ textAlign: 'center', fontSize: 13, color: '#6b7280', marginBottom: 20 }}>
            ↓ Scroll to the bottom of the contract to sign
          </p>
        )}

        {/* Signature block — revealed after scrolling */}
        <div
          ref={signatureRef}
          style={{
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            padding: '24px 28px',
            opacity: hasScrolledToBottom ? 1 : 0.4,
            pointerEvents: hasScrolledToBottom ? 'auto' : 'none',
            transition: 'opacity 0.3s ease',
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#111', margin: '0 0 6px' }}>
            Electronic Signature
          </h2>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 20px', lineHeight: 1.6 }}>
            By typing your full legal name and checking the box below, you agree that this constitutes your legally binding electronic signature.
          </p>

          {/* Typed name */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              Type your full legal name
            </label>
            <input
              type="text"
              value={typedName}
              onChange={e => setTypedName(e.target.value)}
              placeholder={clientName || 'Your full name'}
              style={{
                width: '100%',
                padding: '10px 14px',
                border: '1px solid #d1d5db',
                borderRadius: 8,
                fontSize: 15,
                color: '#111',
                outline: 'none',
                boxSizing: 'border-box',
                letterSpacing: '0.02em',
              }}
              onFocus={e => e.target.style.borderColor = '#6366f1'}
              onBlur={e => e.target.style.borderColor = '#d1d5db'}
            />
          </div>

          {/* Agreement checkbox */}
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 20 }}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={e => setAgreed(e.target.checked)}
              style={{ marginTop: 2, width: 16, height: 16, accentColor: '#6366f1', flexShrink: 0, cursor: 'pointer' }}
            />
            <span style={{ fontSize: 14, color: '#374151', lineHeight: 1.6 }}>
              I have read and agree to the terms above, and confirm that typing my name constitutes my legally binding electronic signature.
            </span>
          </label>

          {submitError && (
            <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
              <p style={{ fontSize: 13, color: '#dc2626', margin: 0 }}>{submitError}</p>
            </div>
          )}

          {/* Sign button */}
          <button
            onClick={handleSign}
            disabled={!typedName.trim() || !agreed || submitting}
            style={{
              width: '100%',
              padding: '13px 20px',
              background: !typedName.trim() || !agreed || submitting ? '#e5e7eb' : '#6366f1',
              color: !typedName.trim() || !agreed || submitting ? '#9ca3af' : '#fff',
              border: 'none',
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 600,
              cursor: !typedName.trim() || !agreed || submitting ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
            }}
          >
            {submitting ? 'Signing...' : 'Sign Contract'}
          </button>

          <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', margin: '12px 0 0', lineHeight: 1.5 }}>
            This signature is legally binding under the US Electronic Signatures in Global and National Commerce Act (ESIGN) and the Uniform Electronic Transactions Act (UETA).
          </p>
        </div>
      </div>
    </div>
  )
}
