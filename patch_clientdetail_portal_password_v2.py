import pathlib

path = pathlib.Path("src/routes/ClientDetail.jsx")
src = path.read_text()

# 1. Add Eye/EyeOff icons
old_icons = """import {
  ArrowLeft, Mail, Phone, MapPin, Tag, FileText, ChevronRight, Camera,
  Pencil, Trash2, X, Plus, Clock, CheckCircle, Images,
  AlertCircle, Ban, CalendarDays, Link2, Copy, RefreshCw, Check, Search,
  Lock, Unlock, ShieldAlert
} from 'lucide-react'"""

assert src.count(old_icons) == 1, "icon import anchor not found or not unique"

new_icons = """import {
  ArrowLeft, Mail, Phone, MapPin, Tag, FileText, ChevronRight, Camera,
  Pencil, Trash2, X, Plus, Clock, CheckCircle, Images,
  AlertCircle, Ban, CalendarDays, Link2, Copy, RefreshCw, Check, Search,
  Lock, Unlock, ShieldAlert, Eye, EyeOff
} from 'lucide-react'"""

src = src.replace(old_icons, new_icons)

# 2. Import the shared password generator (same one GallerySettings/GalleryNew use)
old_supabase_import = "import { supabase } from '../supabaseClient.js'"
assert src.count(old_supabase_import) == 1, "supabase import anchor not found or not unique"
new_supabase_import = "import { supabase } from '../supabaseClient.js'\nimport { generatePassword } from '../utils/secretGenerators.js'"
src = src.replace(old_supabase_import, new_supabase_import)

# 3. Add showPw state
old_state = """  const [confirmRemove, setConfirmRemove] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [resettingLock, setResettingLock] = useState(false)

  const isLocked = lockedUntil && new Date(lockedUntil) > new Date()"""

assert src.count(old_state) == 1, "state block anchor not found or not unique"

new_state = """  const [confirmRemove, setConfirmRemove] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [resettingLock, setResettingLock] = useState(false)
  const [showPw, setShowPw] = useState(false)

  const isLocked = lockedUntil && new Date(lockedUntil) > new Date()"""

src = src.replace(old_state, new_state)

# 4. Add a handleGenerate function right after openForm
old_open_form = """  function openForm() {
    setPw1('')
    setPw2('')
    setPwError(null)
    setShowForm(true)
  }"""

assert src.count(old_open_form) == 1, "openForm anchor not found or not unique"

new_open_form = """  function openForm() {
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
  }"""

src = src.replace(old_open_form, new_open_form)

# 5. Replace the form inputs with generate + show/hide controls
old_form = '''      {showForm && (
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
      )}'''

assert src.count(old_form) == 1, "form anchor not found or not unique"

new_form = '''      {showForm && (
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

src = src.replace(old_form, new_form)

path.write_text(src)
print("Patched ClientDetail.jsx with generate + show/hide password controls")
