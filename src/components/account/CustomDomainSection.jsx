import { useState, useEffect, useCallback, useRef } from 'react'
import { Copy, Check } from 'lucide-react'
import SettingsSection from '../ui/SettingsSection.jsx'
import { supabase } from '../../supabaseClient.js'

const CNAME_TARGET = 'customers.final-vault.app'
const POLL_INTERVAL_MS = 20000

const REGISTRARS = [
  { key: 'godaddy', label: 'GoDaddy' },
  { key: 'squarespace', label: 'Squarespace Domains' },
  { key: 'other', label: 'Something else' },
]

// GoDaddy and Squarespace field names verified against their own current
// help docs (Aug 2026) — see docs/custom-domains-spec.md section 3.5.
// Worth re-checking periodically; registrar UIs get redesigned.
const REGISTRAR_INSTRUCTIONS = {
  godaddy: {
    path: 'In GoDaddy: your domain → DNS → Add New Record → Type: CNAME',
    fields: [
      { label: 'Type', value: 'CNAME', copy: false },
      { label: 'Name', valueKey: 'prefix', copy: true },
      { label: 'Value', valueKey: 'target', copy: true },
    ],
    note: "Don't remove or edit any existing MX records — that's your email. If Domain Protection is on, GoDaddy may ask you to verify with a code before it saves.",
  },
  squarespace: {
    path: 'In Squarespace: your domain → DNS → DNS Settings → Custom Records → Add record → Type: CNAME',
    fields: [
      { label: 'Type', value: 'CNAME', copy: false },
      { label: 'Name', valueKey: 'prefix', copy: true },
      { label: 'Data', valueKey: 'target', copy: true },
    ],
    note: "Don't remove or edit any existing MX records — that's your email. Squarespace may ask for your password or a 2FA code before it saves.",
  },
  other: {
    path: 'Add a CNAME record with your DNS provider',
    fields: [
      { label: 'Type', value: 'CNAME', copy: false },
      { label: 'Name', valueKey: 'prefix', copy: true },
      { label: 'Target', valueKey: 'target', copy: true },
    ],
    note: "Not sure where your DNS is managed? It's not always the same place you bought the domain — check your welcome email or ask your web host.",
  },
}

// The subdomain prefix a photographer's registrar wants in the Name/Host
// field is everything before the last two labels (assumed root domain +
// TLD). This breaks for multi-part TLDs like .co.uk, where it would
// over-include — an acceptable v1 simplification given isValidSubdomain
// already requires a 3+ label subdomain; full public-suffix-list parsing
// would be needed to handle those correctly.
function domainPrefix(domain) {
  const parts = domain.split('.')
  return parts.length > 2 ? parts.slice(0, -2).join('.') : domain
}

function translateVerificationErrors(messages, domain) {
  const joined = messages.join(' ')
  if (/does not CNAME/i.test(joined)) {
    return {
      title: "We can't find your CNAME record yet",
      body: `Double check ${domain} has a CNAME record pointing to ${CNAME_TARGET} — not an A record, and not proxied through another service like Cloudflare's orange cloud.`,
    }
  }
  if (/CAA/i.test(joined)) {
    return {
      title: 'A CAA record may be blocking your certificate',
      body: 'Your domain has a CAA record that restricts which certificate providers can issue SSL certificates. You may need to add an exception, or remove the CAA record if you don\u2019t need it.',
    }
  }
  return {
    title: "There's a problem with your DNS setup",
    body: messages.join(' '),
  }
}

async function callManageCustomDomain(method, body) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not signed in')
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-custom-domain`,
    {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    }
  )
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || 'Something went wrong')
    err.status = res.status
    throw err
  }
  return data
}

export default function CustomDomainSection({ photographerId }) {
  const [loaded, setLoaded] = useState(false)
  const [domain, setDomain] = useState(null)
  const [error, setError] = useState('')

  const [inputValue, setInputValue] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')

  const [registrar, setRegistrar] = useState('godaddy')
  const [copiedField, setCopiedField] = useState('')

  const [checking, setChecking] = useState(false)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [removing, setRemoving] = useState(false)

  const domainRef = useRef(domain)
  domainRef.current = domain

  const refresh = useCallback(async ({ silent } = {}) => {
    try {
      const data = await callManageCustomDomain('GET')
      setDomain(data)
      if (!silent) setError('')
    } catch (err) {
      if (err.status === 404) {
        setDomain(null)
      } else if (!silent) {
        setError(err.message)
      }
    }
  }, [])

  useEffect(() => {
    if (!photographerId) return
    refresh().finally(() => setLoaded(true))
  }, [photographerId, refresh])

  // Auto-poll while not yet active, per the resolved "both auto + manual"
  // decision. Silent — doesn't touch the `checking` busy indicator, which
  // is reserved for the explicit button click.
  useEffect(() => {
    if (!domain || domain.status === 'active') return
    const id = setInterval(() => {
      if (domainRef.current?.status !== 'active') refresh({ silent: true })
    }, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [domain?.status, domain?.domain, refresh])

  async function handleAdd() {
    if (adding) return
    setAddError('')
    const trimmed = inputValue.trim().toLowerCase()
    if (!trimmed) {
      setAddError('Enter a domain first')
      return
    }
    setAdding(true)
    try {
      const data = await callManageCustomDomain('POST', { domain: trimmed })
      setDomain(data)
      setInputValue('')
    } catch (err) {
      setAddError(err.message)
    } finally {
      setAdding(false)
    }
  }

  async function handleCheckStatus() {
    if (checking) return
    setChecking(true)
    await refresh()
    setChecking(false)
  }

  async function handleRemove() {
    if (removing) return
    setRemoving(true)
    setError('')
    try {
      await callManageCustomDomain('DELETE')
      setDomain(null)
      setConfirmingRemove(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setRemoving(false)
    }
  }

  async function handleCopy(field, value) {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedField(field)
      setTimeout(() => setCopiedField(''), 1500)
    } catch {
      window.prompt('Copy this value:', value)
    }
  }

  if (!loaded) return null

  const uiState = !domain
    ? 'empty'
    : domain.status === 'active'
      ? 'active'
      : (domain.verification_errors && domain.verification_errors.length > 0)
        ? 'attention'
        : 'pending'

  return (
    <SettingsSection
      title="Custom domain"
      description="Use your own domain for client-facing links instead of final-vault.app.">
      <div className="px-5 py-4" style={{ background: 'var(--surface)' }}>

        {uiState === 'empty' && (
          <>
            <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }}>Your domain</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                placeholder="book.yourstudio.com"
                disabled={adding}
                style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none' }}
              />
              <button
                onClick={handleAdd}
                disabled={adding}
                style={{ fontSize: 13, fontWeight: 500, padding: '9px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'var(--accent-fg)', cursor: adding ? 'default' : 'pointer', opacity: adding ? 0.6 : 1, whiteSpace: 'nowrap' }}>
                {adding ? 'Adding\u2026' : 'Add domain'}
              </button>
            </div>
            <p className="text-xs mt-2.5" style={{ color: 'var(--text-muted)' }}>
              Must be a subdomain you own, like book.yourstudio.com. Your bare domain (yourstudio.com) can't be used on its own.
            </p>
            {addError && <p className="text-xs mt-2" style={{ color: 'var(--danger)' }}>{addError}</p>}
          </>
        )}

        {uiState !== 'empty' && domain && (
          <>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{domain.domain}</span>
              <StatusBadge state={uiState} />
            </div>

            {(uiState === 'pending' || uiState === 'attention') && (
              <>
                <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text)' }}>Where is this domain registered?</label>
                <select
                  value={registrar}
                  onChange={e => setRegistrar(e.target.value)}
                  style={{ width: '100%', fontSize: 13, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', color: 'var(--text)', background: 'var(--surface)', marginBottom: 14 }}>
                  {REGISTRARS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                </select>

                <RegistrarInstructions
                  registrar={registrar}
                  domain={domain.domain}
                  copiedField={copiedField}
                  onCopy={handleCopy}
                />
              </>
            )}

            {uiState === 'attention' && (
              <AttentionBanner messages={domain.verification_errors} domain={domain.domain} />
            )}

            {uiState === 'pending' && (
              <p className="text-xs mb-3.5" style={{ color: 'var(--text-muted)' }}>
                DNS updates usually take a few minutes, rarely up to 48 hours. We'll keep checking automatically, or check now.
              </p>
            )}
            {uiState === 'attention' && (
              <p className="text-xs mb-3.5" style={{ color: 'var(--text-muted)' }}>
                Just added the record? This can take a few minutes to catch up — try checking again shortly.
              </p>
            )}
            {uiState === 'active' && (
              <p className="text-xs mb-3.5" style={{ color: 'var(--text-muted)' }}>
                Client-facing links now use this domain.
              </p>
            )}

            <div className="flex gap-2">
              {uiState !== 'active' && (
                <button
                  onClick={handleCheckStatus}
                  disabled={checking}
                  style={{ fontSize: 13, fontWeight: 500, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: checking ? 'default' : 'pointer', opacity: checking ? 0.6 : 1 }}>
                  {checking ? 'Checking\u2026' : (uiState === 'attention' ? 'Check again' : 'Check status')}
                </button>
              )}
              <button
                onClick={() => setConfirmingRemove(true)}
                style={{ fontSize: 13, padding: '8px 14px', borderRadius: 8, border: uiState === 'active' ? '1px solid var(--border)' : 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                Remove domain
              </button>
            </div>

            {confirmingRemove && (
              <div className="mt-3 px-3.5 py-3 rounded-lg" style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)' }}>
                <p className="text-xs mb-2.5" style={{ color: 'var(--danger)' }}>
                  Remove this domain? Client-facing links will switch back to final-vault.app.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleRemove}
                    disabled={removing}
                    style={{ fontSize: 12, fontWeight: 500, padding: '6px 12px', borderRadius: 6, border: 'none', background: 'var(--danger)', color: '#fff', cursor: removing ? 'default' : 'pointer', opacity: removing ? 0.6 : 1 }}>
                    {removing ? 'Removing\u2026' : 'Remove domain'}
                  </button>
                  <button
                    onClick={() => setConfirmingRemove(false)}
                    disabled={removing}
                    style={{ fontSize: 12, padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {error && <p className="text-xs mt-3" style={{ color: 'var(--danger)' }}>{error}</p>}
      </div>
    </SettingsSection>
  )
}

function StatusBadge({ state }) {
  const config = {
    pending: { label: 'Pending', bg: 'var(--warning-subtle)', fg: 'var(--warning)' },
    attention: { label: 'Needs attention', bg: 'var(--danger-subtle)', fg: 'var(--danger)' },
    active: { label: 'Active', bg: 'var(--success-subtle)', fg: 'var(--success)' },
  }[state]
  if (!config) return null
  return (
    <span
      className="text-xs font-medium"
      style={{ marginLeft: 'auto', padding: '3px 8px', borderRadius: 999, background: config.bg, color: config.fg }}>
      {config.label}
    </span>
  )
}

function RegistrarInstructions({ registrar, domain, copiedField, onCopy }) {
  const config = REGISTRAR_INSTRUCTIONS[registrar]
  const prefix = domainPrefix(domain)
  const values = { prefix, target: CNAME_TARGET }

  return (
    <div className="rounded-lg mb-3" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', padding: 16 }}>
      <p className="text-xs font-medium mb-3" style={{ color: 'var(--text)' }}>{config.path}</p>
      <div className="flex flex-col gap-2.5">
        {config.fields.map(field => {
          const value = field.copy ? values[field.valueKey] : field.value
          const fieldId = `${registrar}-${field.label}`
          return (
            <div key={field.label} className="flex items-center justify-between rounded-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '10px 12px' }}>
              <div>
                <div className="text-xs" style={{ color: 'var(--text-muted)', marginBottom: 2 }}>{field.label}</div>
                <div className="text-sm" style={{ fontFamily: 'ui-monospace, monospace', color: 'var(--text)' }}>{value}</div>
              </div>
              {field.copy && (
                <button
                  onClick={() => onCopy(fieldId, value)}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: copiedField === fieldId ? 'var(--success)' : 'var(--accent)', cursor: 'pointer' }}>
                  {copiedField === fieldId ? <Check size={12} /> : <Copy size={12} />}
                  {copiedField === fieldId ? 'Copied' : 'Copy'}
                </button>
              )}
            </div>
          )
        })}
      </div>
      <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>{config.note}</p>
    </div>
  )
}

function AttentionBanner({ messages, domain }) {
  const { title, body } = translateVerificationErrors(messages, domain)
  return (
    <div className="rounded-lg mb-3.5" style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)', padding: '14px 16px' }}>
      <p className="text-sm font-medium mb-1.5" style={{ color: 'var(--danger)' }}>{title}</p>
      <p className="text-xs" style={{ color: 'var(--danger)', lineHeight: 1.5 }}>{body}</p>
    </div>
  )
}
