import re

# ── SESSION DETAIL ────────────────────────────────────────────────────────────
path = '/Users/nickporterfield/code/finalvault/src/routes/SessionDetail.jsx'
with open(path, 'r') as f:
    src = f.read()

# 1. Add BottomSheet import
old = "import PlaceAutocomplete from '../components/ui/PlaceAutocomplete.jsx'"
new = "import PlaceAutocomplete from '../components/ui/PlaceAutocomplete.jsx'\nimport BottomSheet from '../components/layout/BottomSheet.jsx'\nimport ClientPicker from '../components/ui/ClientPicker.jsx'"
assert src.count(old) == 1, f"FAIL SD-1: {src.count(old)}"
src = src.replace(old, new)

# 2. Inject EditSessionWrapper before EditSessionModal
old = "// ── Edit Session Modal ────────────────────────────────────────────────────────\n\nfunction EditSessionModal("
new = '''// ── Edit Session Modal ────────────────────────────────────────────────────────

function EditSessionWrapper({ onClose, footer, children }) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  if (isMobile) {
    return (
      <BottomSheet open onClose={onClose} maxHeight="92vh">
        <div className="flex items-center px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="font-semibold text-base" style={{ color: 'var(--text)' }}>Edit Session</h2>
        </div>
        <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="shrink-0">{footer}</div>}
      </BottomSheet>
    )
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg flex flex-col rounded-2xl shadow-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '90vh' }}>
        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Edit Session</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <X size={16} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="shrink-0">{footer}</div>}
      </div>
    </div>
  )
}

function EditSessionModal('''
assert src.count("// ── Edit Session Modal ────────────────────────────────────────────────────────\n\nfunction EditSessionModal(") == 1, "FAIL SD-2"
src = src.replace("// ── Edit Session Modal ────────────────────────────────────────────────────────\n\nfunction EditSessionModal(", new)

# 3. Replace the return statement — swap custom container for EditSessionWrapper
old = '''  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}>
      <div className="w-full rounded-2xl overflow-hidden flex flex-col" style={{ maxWidth: 560, maxHeight: '90vh', background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Edit Session</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={16} /></button>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-4">'''
new = '''  const footerEl = (
    <div className="flex items-center justify-between px-5 py-4" style={{ borderTop: '1px solid var(--border)' }}>
      <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg"
        style={{ background: 'var(--surface-raised)', color: 'var(--text-muted)', border: 'none', cursor: 'pointer' }}>
        Cancel
      </button>
      <Button onClick={handleSave} disabled={saving || !name.trim()}>
        {saving ? 'Saving...' : 'Save Changes'}
      </Button>
    </div>
  )

  return (
    <EditSessionWrapper onClose={onClose} footer={footerEl}>
      <div>'''
assert src.count(old) == 1, f"FAIL SD-3: {src.count(old)}"
src = src.replace(old, new)

# 4. Replace plain select for client with ClientPicker
old = '''          {session.mode === 'private' && (
            <div>
              <label className="text-sm font-medium block mb-1" style={{ color: 'var(--text)' }}>Client</label>
              <select value={clientId} onChange={e => setClientId(e.target.value)}
                style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none', cursor: 'pointer' }}>
                <option value="">No client linked</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
              </select>
            </div>
          )}'''
new = '''          {session.mode === 'private' && (
            <div>
              <label className="text-sm font-medium block mb-1" style={{ color: 'var(--text)' }}>Client</label>
              <ClientPicker clients={clients} value={clientId} onChange={setClientId} placeholder="Link to a client..." />
            </div>
          )}'''
assert src.count(old) == 1, f"FAIL SD-4: {src.count(old)}"
src = src.replace(old, new)

# 5. Remove old footer + closing tags
old = '''        <div className="flex gap-3 px-6 py-4 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  )
}'''
new = '''      </div>
    </EditSessionWrapper>
  )
}'''
assert src.count(old) == 1, f"FAIL SD-5: {src.count(old)}"
src = src.replace(old, new)

assert src.count('function EditSessionWrapper') == 1, "FAIL: EditSessionWrapper missing"
assert src.count('function EditSessionModal') == 1, "FAIL: EditSessionModal missing"

with open(path, 'w') as f:
    f.write(src)
print("✅ SessionDetail.jsx patched")

# ── CLIENT DETAIL ─────────────────────────────────────────────────────────────
path = '/Users/nickporterfield/code/finalvault/src/routes/ClientDetail.jsx'
with open(path, 'r') as f:
    src = f.read()

# 1. Add BottomSheet import
old = "import AddressAutocomplete from '../components/ui/AddressAutocomplete.jsx'"
new = "import AddressAutocomplete from '../components/ui/AddressAutocomplete.jsx'\nimport BottomSheet from '../components/layout/BottomSheet.jsx'"
assert src.count(old) == 1, f"FAIL CD-1: {src.count(old)}"
src = src.replace(old, new)

# 2. Inject EditClientWrapper before EditClientModal
old = "function EditClientModal({ client, avatarUrl, uploadingAvatar, onAvatarUpload, onClose, onSaved, allTags = [] }) {"
new = '''function EditClientWrapper({ onClose, footer, children }) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  if (isMobile) {
    return (
      <BottomSheet open onClose={onClose} maxHeight="92vh">
        <div className="flex items-center px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="font-semibold text-base" style={{ color: 'var(--text)' }}>Edit Client</h2>
        </div>
        <div className="px-5 py-4 space-y-3 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="shrink-0">{footer}</div>}
      </BottomSheet>
    )
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg flex flex-col rounded-2xl shadow-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '90vh' }}>
        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Edit Client</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <X size={16} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-3 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="shrink-0">{footer}</div>}
      </div>
    </div>
  )
}

function EditClientModal({ client, avatarUrl, uploadingAvatar, onAvatarUpload, onClose, onSaved, allTags = [] }) {'''
assert src.count("function EditClientModal({ client, avatarUrl, uploadingAvatar, onAvatarUpload, onClose, onSaved, allTags = [] }) {") == 1, "FAIL CD-2"
src = src.replace("function EditClientModal({ client, avatarUrl, uploadingAvatar, onAvatarUpload, onClose, onSaved, allTags = [] }) {", new)

# 3. Replace custom backdrop+container return with EditClientWrapper
old = '''  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }} onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-full" style={{ transform: 'translate(-50%, -50%)', maxWidth: 520, padding: '0 16px' }}>
        <div className="rounded-2xl shadow-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
            <h2 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Edit Client</h2>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
              <X size={18} />
            </button>
          </div>

          <div className="px-4 py-4 space-y-3 overflow-y-auto" style={{ maxHeight: '75vh' }}>'''
new = '''  const footerEl = (
    <div className="flex items-center justify-between px-6 py-4" style={{ borderTop: '1px solid var(--border)' }}>
      <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg"
        style={{ background: 'var(--surface-raised)', color: 'var(--text-muted)', border: 'none', cursor: 'pointer' }}>
        Cancel
      </button>
      <Button onClick={handleSubmit} disabled={saving || !form.firstName.trim() || !form.lastName.trim()}>
        {saving ? 'Saving...' : 'Save Changes'}
      </Button>
    </div>
  )

  return (
    <EditClientWrapper onClose={onClose} footer={footerEl}>
      <div>'''
assert src.count(old) == 1, f"FAIL CD-3: {src.count(old)}"
src = src.replace(old, new)

# 4. Remove old footer + closing tags
old = '''          <div className="px-6 py-4 flex items-center justify-end gap-3" style={{ borderTop: '1px solid var(--border)' }}>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving || !form.firstName.trim() || !form.lastName.trim()}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>'''
new = '''          <div style={{display:'none'}}>'''
assert src.count(old) == 1, f"FAIL CD-4: {src.count(old)}"
src = src.replace(old, new)

old = '''          </div>
        </div>
      </div>
    </>
  )
}'''
new = '''          </div>
      </div>
    </EditClientWrapper>
  )
}'''
assert src.count(old) == 1, f"FAIL CD-5: {src.count(old)}"
src = src.replace(old, new)

assert src.count('function EditClientWrapper') == 1, "FAIL: EditClientWrapper missing"
assert src.count('function EditClientModal') == 1, "FAIL: EditClientModal missing"

with open(path, 'w') as f:
    f.write(src)
print("✅ ClientDetail.jsx patched")
print("Done — both Edit modals now use BottomSheet on mobile, inline dialog on desktop")
