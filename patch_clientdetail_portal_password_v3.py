import pathlib

path = pathlib.Path("src/routes/ClientDetail.jsx")
src = path.read_text()

# 1. Remove Eye/EyeOff from the icon import (no longer used directly -- PlainField brings its own)
old_icons = """import {
  ArrowLeft, Mail, Phone, MapPin, Tag, FileText, ChevronRight, Camera,
  Pencil, Trash2, X, Plus, Clock, CheckCircle, Images,
  AlertCircle, Ban, CalendarDays, Link2, Copy, RefreshCw, Check, Search,
  Lock, Unlock, ShieldAlert, Eye, EyeOff
} from 'lucide-react'"""

assert src.count(old_icons) == 1, "icon import anchor not found or not unique"

new_icons = """import {
  ArrowLeft, Mail, Phone, MapPin, Tag, FileText, ChevronRight, Camera,
  Pencil, Trash2, X, Plus, Clock, CheckCircle, Images,
  AlertCircle, Ban, CalendarDays, Link2, Copy, RefreshCw, Check, Search,
  Lock, Unlock, ShieldAlert
} from 'lucide-react'"""

src = src.replace(old_icons, new_icons)

# 2. Add the PlainField import, right after the TagInput import (matches this file's
#    convention of grouping shared ui/ component imports together up top)
old_taginput_import = "import TagInput from '../components/ui/TagInput.jsx'"
assert src.count(old_taginput_import) == 1, "TagInput import anchor not found or not unique"
new_taginput_import = "import TagInput from '../components/ui/TagInput.jsx'\nimport PlainField from '../components/ui/PlainField.jsx'"
src = src.replace(old_taginput_import, new_taginput_import)

# 3. Replace the whole PortalPasswordSection body: drop pw2/showPw state and
#    inputStyle/handleGenerate, simplify handleSave, swap the form JSX for PlainField
old_section = '''function PortalPasswordSection({ client, onToast }) {
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
  const [showPw, setShowPw] = useState(false)

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
    setShowPw(false)
    setShowForm(true)
  }

  function handleGenerate() {
    const generated = generatePassword()
    setPw1(generated)
    setPw2(generated)
    setPwError(null)
    setShowPw(true)
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
  }'''

assert src.count(old_section) == 1, "PortalPasswordSection header anchor not found or not unique"

new_section = '''function PortalPasswordSection({ client, onToast }) {
  const [hasPassword, setHasPassword] = useState(!!client.portal_password_hash)
  const [lockedUntil, setLockedUntil] = useState(client.portal_password_locked_until)
  const [showForm, setShowForm] = useState(false)
  const [pw1, setPw1] = useState('')
  const [pwError, setPwError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [resettingLock, setResettingLock] = useState(false)

  const isLocked = lockedUntil && new Date(lockedUntil) > new Date()

  function openForm() {
    setPw1('')
    setPwError(null)
    setShowForm(true)
  }

  async function handleSave() {
    if (pw1.length < 6) {
      setPwError('Password must be at least 6 characters.')
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
  }'''

src = src.replace(old_section, new_section)

# 4. Swap the form JSX to use PlainField, matching the exact gallery-password pattern
old_form = '''      {showForm && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2">
            <div style={{ position: 'relative', flex: 1 }}>
              <input type={showPw ? 'text' : 'password'} placeholder="New password" value={pw1}
                onChange={e => setPw1(e.target.value)} style={{ ...inputStyle, paddingRight: 36 }} />
              <button type="button" onClick={() => setShowPw(v => !v)}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <button type="button" onClick={handleGenerate}
              className="flex items-center gap-1 text-xs px-2.5 py-2 rounded-lg font-medium shrink-0"
              style={{ background: 'var(--surface-raised)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer' }}>
              <RefreshCw size={12} />Generate
            </button>
          </div>
          <input type={showPw ? 'text' : 'password'} placeholder="Confirm password" value={pw2}
            onChange={e => setPw2(e.target.value)} style={inputStyle} />
          {pwError && <p className="text-xs" style={{ color: 'var(--danger)' }}>{pwError}</p>}
          <div className="flex items-center gap-2">
            <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save password'}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setShowForm(false)} disabled={saving}>Cancel</Button>
          </div>
        </div>
      )}'''

assert src.count(old_form) == 1, "form anchor not found or not unique"

new_form = '''      {showForm && (
        <div className="mt-3 space-y-2">
          <PlainField
            value={pw1}
            onChange={setPw1}
            onRefresh={() => { setPw1(generatePassword()); setPwError(null) }}
            onCopy
            placeholder="Enter password"
            hint="Share this with your client so they can access the portal."
          />
          {pwError && <p className="text-xs" style={{ color: 'var(--danger)' }}>{pwError}</p>}
          <div className="flex items-center gap-2">
            <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save password'}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setShowForm(false)} disabled={saving}>Cancel</Button>
          </div>
        </div>
      )}'''

src = src.replace(old_form, new_form)

path.write_text(src)
print("Converted ClientDetail.jsx portal password UI to use the shared PlainField component")
