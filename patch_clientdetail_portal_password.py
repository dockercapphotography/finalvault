import pathlib

path = pathlib.Path("src/routes/ClientDetail.jsx")
src = path.read_text()

# 1. Add new icons to the lucide-react import
old_icons = """import {
  ArrowLeft, Mail, Phone, MapPin, Tag, FileText, ChevronRight, Camera,
  Pencil, Trash2, X, Plus, Clock, CheckCircle, Images,
  AlertCircle, Ban, CalendarDays, Link2, Copy, RefreshCw, Check, Search
} from 'lucide-react'"""

assert src.count(old_icons) == 1, "icon import anchor not found or not unique"

new_icons = """import {
  ArrowLeft, Mail, Phone, MapPin, Tag, FileText, ChevronRight, Camera,
  Pencil, Trash2, X, Plus, Clock, CheckCircle, Images,
  AlertCircle, Ban, CalendarDays, Link2, Copy, RefreshCw, Check, Search,
  Lock, Unlock, ShieldAlert
} from 'lucide-react'"""

src = src.replace(old_icons, new_icons)

# 2. Add new crmApi imports
old_crmapi_import = "import { getClient, updateClient, deleteClient, getClientGalleries, getContracts, deleteContract, uploadClientAvatar, getClientAvatarUrl, getAllTags, getOrCreatePortalToken, regeneratePortalToken } from '../utils/crmApi.js'"

assert src.count(old_crmapi_import) == 1, "crmApi import anchor not found or not unique"

new_crmapi_import = "import { getClient, updateClient, deleteClient, getClientGalleries, getContracts, deleteContract, uploadClientAvatar, getClientAvatarUrl, getAllTags, getOrCreatePortalToken, regeneratePortalToken, setClientPortalPassword, clearClientPortalPassword, resetPortalLockout } from '../utils/crmApi.js'"

src = src.replace(old_crmapi_import, new_crmapi_import)

# 3. Replace the whole PortalLinkCard component with an extended version
old_component = '''function PortalLinkCard({ client, onToast, onTokenChange }) {
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirmRegen, setConfirmRegen] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  const portalUrl = client.portal_token
    ? `${window.location.origin}/client/${client.portal_token}`
    : null

  async function handleGenerate() {
    setLoading(true)
    try {
      const token = await getOrCreatePortalToken(client.id)
      onTokenChange(token)
    } catch (err) {
      onToast({ message: err.message, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy() {
    if (!portalUrl) return
    await navigator.clipboard.writeText(portalUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleRegenerate() {
    setRegenerating(true)
    try {
      const token = await regeneratePortalToken(client.id)
      onTokenChange(token)
      setConfirmRegen(false)
      onToast({ message: 'Portal link regenerated — the old link no longer works', type: 'success' })
    } catch (err) {
      onToast({ message: err.message, type: 'error' })
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
      <div className="px-5 py-4" style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
        <h3 className="font-medium text-sm" style={{ color: 'var(--text)' }}>Client portal</h3>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          One link showing all galleries, contracts, and outstanding questionnaires for this client.
        </p>
      </div>
      <div className="px-5 py-4" style={{ background: 'var(--surface)' }}>
        {!portalUrl ? (
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No portal link generated yet.</p>
            <Button variant="secondary" size="sm" onClick={handleGenerate} disabled={loading}>
              <Link2 size={13} />{loading ? 'Generating...' : 'Generate link'}
            </Button>
          </div>
        ) : !confirmRegen ? (
          <div className="flex flex-col md:flex-row md:items-center gap-2">
            <div className="flex-1 min-w-0 px-3 py-2 rounded-lg text-xs truncate"
              style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              {portalUrl}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleCopy}
                className="flex-1 md:flex-none flex items-center justify-center gap-1 text-xs px-2.5 py-2 rounded-lg font-medium"
                style={{ background: 'var(--surface-raised)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button onClick={() => setConfirmRegen(true)}
                className="flex-1 md:flex-none flex items-center justify-center gap-1 text-xs px-2.5 py-2 rounded-lg font-medium"
                style={{ background: 'var(--surface-raised)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                <RefreshCw size={12} />Regenerate
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)' }}>
            <p className="text-sm flex-1 font-medium" style={{ color: 'var(--danger)' }}>
              Regenerate? The current link will stop working immediately.
            </p>
            <Button variant="danger" size="sm" onClick={handleRegenerate} disabled={regenerating}>
              {regenerating ? 'Regenerating...' : 'Confirm'}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setConfirmRegen(false)}>Cancel</Button>
          </div>
        )}
      </div>
    </div>
  )
}'''

assert src.count(old_component) == 1, "PortalLinkCard component anchor not found or not unique"

new_component = '''function PortalPasswordSection({ client, onToast }) {
  const [hasPassword, setHasPassword] = useState(!!client.portal_password_hash)
  const [lockedUntil, setLockedUntil] = useState(client.portal_password_locked_until)
  const [showForm, setShowForm] = useState(false)
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [pwError, setPwError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [resettingLock, setResettingLock] = useState(false)

  const isLocked = lockedUntil && new Date(lockedUntil) > new Date()

  const inputStyle = {
    width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)',
    color: 'var(--text)', borderRadius: '8px', padding: '9px 12px',
    fontSize: '14px', outline: 'none',
  }

  function openForm() {
    setPw1('')
    setPw2('')
    setPwError(null)
    setShowForm(true)
  }

  async function handleSave() {
    if (pw1.length < 6) {
      setPwError('Password must be at least 6 characters.')
      return
    }
    if (pw1 !== pw2) {
      setPwError('Passwords do not match.')
      return
    }
    setSaving(true)
    setPwError(null)
    try {
      await setClientPortalPassword(client.id, pw1)
      setHasPassword(true)
      setLockedUntil(null)
      setShowForm(false)
      onToast({ message: hasPassword ? 'Portal password changed' : 'Portal password added', type: 'success' })
    } catch (err) {
      setPwError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove() {
    setRemoving(true)
    try {
      await clearClientPortalPassword(client.id)
      setHasPassword(false)
      setLockedUntil(null)
      setConfirmRemove(false)
      onToast({ message: 'Portal password removed', type: 'success' })
    } catch (err) {
      onToast({ message: err.message, type: 'error' })
    } finally {
      setRemoving(false)
    }
  }

  async function handleResetLockout() {
    setResettingLock(true)
    try {
      await resetPortalLockout(client.id)
      setLockedUntil(null)
      onToast({ message: 'Lockout cleared', type: 'success' })
    } catch (err) {
      onToast({ message: err.message, type: 'error' })
    } finally {
      setResettingLock(false)
    }
  }

  return (
    <div className="px-5 py-4" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
      <div className="flex items-center justify-between gap-4 mb-1">
        <div className="flex items-center gap-2">
          {hasPassword ? <Lock size={14} style={{ color: 'var(--text-muted)' }} /> : <Unlock size={14} style={{ color: 'var(--text-muted)' }} />}
          <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
            {hasPassword ? 'Portal password protection enabled' : 'No portal password set'}
          </p>
        </div>
        {!showForm && !confirmRemove && (
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="secondary" size="sm" onClick={openForm}>
              {hasPassword ? 'Change password' : 'Add password'}
            </Button>
            {hasPassword && (
              <Button variant="secondary" size="sm" onClick={() => setConfirmRemove(true)}>Remove</Button>
            )}
          </div>
        )}
      </div>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        When set, the client must enter this password before viewing anything in their portal — including gallery access codes and contracts.
      </p>

      {isLocked && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl mt-3"
          style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)' }}>
          <ShieldAlert size={16} style={{ color: 'var(--danger)' }} />
          <p className="text-sm flex-1 font-medium" style={{ color: 'var(--danger)' }}>
            Client is currently locked out from too many failed attempts.
          </p>
          <Button variant="danger" size="sm" onClick={handleResetLockout} disabled={resettingLock}>
            {resettingLock ? 'Clearing...' : 'Reset lockout'}
          </Button>
        </div>
      )}

      {showForm && (
        <div className="mt-3 space-y-2">
          <input type="password" placeholder="New password" value={pw1}
            onChange={e => setPw1(e.target.value)} style={inputStyle} />
          <input type="password" placeholder="Confirm password" value={pw2}
            onChange={e => setPw2(e.target.value)} style={inputStyle} />
          {pwError && <p className="text-xs" style={{ color: 'var(--danger)' }}>{pwError}</p>}
          <div className="flex items-center gap-2">
            <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save password'}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setShowForm(false)} disabled={saving}>Cancel</Button>
          </div>
        </div>
      )}

      {confirmRemove && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl mt-3"
          style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)' }}>
          <p className="text-sm flex-1 font-medium" style={{ color: 'var(--danger)' }}>
            Remove password protection? The portal link alone will grant access again.
          </p>
          <Button variant="danger" size="sm" onClick={handleRemove} disabled={removing}>
            {removing ? 'Removing...' : 'Confirm'}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setConfirmRemove(false)}>Cancel</Button>
        </div>
      )}
    </div>
  )
}

function PortalLinkCard({ client, onToast, onTokenChange }) {
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirmRegen, setConfirmRegen] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  const portalUrl = client.portal_token
    ? `${window.location.origin}/client/${client.portal_token}`
    : null

  async function handleGenerate() {
    setLoading(true)
    try {
      const token = await getOrCreatePortalToken(client.id)
      onTokenChange(token)
    } catch (err) {
      onToast({ message: err.message, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy() {
    if (!portalUrl) return
    await navigator.clipboard.writeText(portalUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleRegenerate() {
    setRegenerating(true)
    try {
      const token = await regeneratePortalToken(client.id)
      onTokenChange(token)
      setConfirmRegen(false)
      onToast({ message: 'Portal link regenerated — the old link no longer works', type: 'success' })
    } catch (err) {
      onToast({ message: err.message, type: 'error' })
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
      <div className="px-5 py-4" style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
        <h3 className="font-medium text-sm" style={{ color: 'var(--text)' }}>Client portal</h3>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          One link showing all galleries, contracts, and outstanding questionnaires for this client.
        </p>
      </div>
      <div className="px-5 py-4" style={{ background: 'var(--surface)' }}>
        {!portalUrl ? (
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No portal link generated yet.</p>
            <Button variant="secondary" size="sm" onClick={handleGenerate} disabled={loading}>
              <Link2 size={13} />{loading ? 'Generating...' : 'Generate link'}
            </Button>
          </div>
        ) : !confirmRegen ? (
          <div className="flex flex-col md:flex-row md:items-center gap-2">
            <div className="flex-1 min-w-0 px-3 py-2 rounded-lg text-xs truncate"
              style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              {portalUrl}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleCopy}
                className="flex-1 md:flex-none flex items-center justify-center gap-1 text-xs px-2.5 py-2 rounded-lg font-medium"
                style={{ background: 'var(--surface-raised)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button onClick={() => setConfirmRegen(true)}
                className="flex-1 md:flex-none flex items-center justify-center gap-1 text-xs px-2.5 py-2 rounded-lg font-medium"
                style={{ background: 'var(--surface-raised)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                <RefreshCw size={12} />Regenerate
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)' }}>
            <p className="text-sm flex-1 font-medium" style={{ color: 'var(--danger)' }}>
              Regenerate? The current link will stop working immediately.
            </p>
            <Button variant="danger" size="sm" onClick={handleRegenerate} disabled={regenerating}>
              {regenerating ? 'Regenerating...' : 'Confirm'}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setConfirmRegen(false)}>Cancel</Button>
          </div>
        )}
      </div>
      {portalUrl && <PortalPasswordSection client={client} onToast={onToast} />}
    </div>
  )
}'''

src = src.replace(old_component, new_component)
path.write_text(src)
print("Patched ClientDetail.jsx successfully")
