path = '/Users/nickporterfield/code/finalvault/src/routes/Clients.jsx'

with open(path, 'r') as f:
    src = f.read()

# ── 1. Add BottomSheet and Modal imports ──────────────────────────────────────
old = "import Input from '../components/ui/Input.jsx'"
new = "import Input from '../components/ui/Input.jsx'\nimport BottomSheet from '../components/layout/BottomSheet.jsx'\nimport Modal from '../components/ui/Modal.jsx'"
assert src.count(old) == 1, f"FAIL 1: {src.count(old)} matches"
src = src.replace(old, new)

# ── 2. Replace the entire custom backdrop+container with ClientFormWrapper ─────
old = '''  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }} onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-full" style={{ transform: 'translate(-50%, -50%)', maxWidth: 520, padding: '0 16px' }}>
        <div className="rounded-2xl shadow-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
            <h2 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>New Client</h2>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
              <X size={18} />
            </button>
          </div>

          <div className="px-6 py-5 space-y-4 overflow-y-auto" style={{ maxHeight: '70vh' }}>'''
new = '''  return (
    <ClientFormWrapper onClose={onClose}>
          <div className="px-5 py-4 space-y-4">'''
assert src.count(old) == 1, f"FAIL 2: {src.count(old)} matches"
src = src.replace(old, new)

# ── 3. Replace closing tags of old container with ClientFormWrapper close ──────
old = '''          </div>

          <div className="px-6 py-4 flex items-center justify-end gap-3" style={{ borderTop: '1px solid var(--border)' }}>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving || !form.firstName.trim() || !form.lastName.trim()}>
              {saving ? 'Saving...' : 'Create Client'}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}'''
new = '''          </div>
          <div className="px-5 py-4 flex items-center justify-end gap-3 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving || !form.firstName.trim() || !form.lastName.trim()}>
              {saving ? 'Saving...' : 'Create Client'}
            </Button>
          </div>
    </ClientFormWrapper>
  )
}'''
assert src.count(old) == 1, f"FAIL 3: {src.count(old)} matches"
src = src.replace(old, new)

# ── 4. Inject ClientFormWrapper before ClientFormModal ────────────────────────
old = "function ClientFormModal({ onClose, onSaved, existingTags = [] }) {"
new = '''function ClientFormWrapper({ onClose, children }) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  if (isMobile) {
    return (
      <BottomSheet open onClose={onClose} maxHeight="92vh">
        <div className="flex items-center px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="font-semibold text-base" style={{ color: 'var(--text)' }}>New Client</h2>
        </div>
        {children}
      </BottomSheet>
    )
  }
  return (
    <Modal onClose={onClose} title="New Client">
      {children}
    </Modal>
  )
}

function ClientFormModal({ onClose, onSaved, existingTags = [] }) {'''
assert src.count("function ClientFormModal({ onClose, onSaved, existingTags = [] }) {") == 1, "FAIL 4"
src = src.replace("function ClientFormModal({ onClose, onSaved, existingTags = [] }) {", new)

# ── Sanity checks ─────────────────────────────────────────────────────────────
assert src.count('ClientFormWrapper') == 3, f"FAIL: expected 3 ClientFormWrapper refs, got {src.count('ClientFormWrapper')}"
assert src.count('function ClientFormModal') == 1, "FAIL: ClientFormModal missing"
assert src.count('export default function Clients') == 1, "FAIL: Clients export missing"
assert 'fixed inset-0 z-40' not in src, "FAIL: old backdrop still present"
assert src.count('BottomSheet') >= 2, "FAIL: BottomSheet missing"

with open(path, 'w') as f:
    f.write(src)

print("✅ Patched: ClientFormModal now uses BottomSheet on mobile, Modal on desktop")
