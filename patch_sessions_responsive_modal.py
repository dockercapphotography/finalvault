path = '/Users/nickporterfield/code/finalvault/src/routes/Sessions.jsx'

with open(path, 'r') as f:
    src = f.read()

# ── 1. Add Modal import back ──────────────────────────────────────────────────
old = "import KanbanBoard from '../components/ui/KanbanBoard.jsx'\nimport BottomSheet from '../components/layout/BottomSheet.jsx'"
new = "import KanbanBoard from '../components/ui/KanbanBoard.jsx'\nimport BottomSheet from '../components/layout/BottomSheet.jsx'\nimport Modal from '../components/ui/Modal.jsx'"
assert src.count(old) == 1, f"FAIL 1: {src.count(old)} matches"
src = src.replace(old, new)

# ── 2. Replace BottomSheet wrapper with responsive wrapper ────────────────────
old = '''    <BottomSheet open onClose={onClose} maxHeight="92vh">
      <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <h2 className="font-semibold text-base" style={{ color: 'var(--text)' }}>New Session</h2>
        <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <X size={16} />
        </button>
      </div>
      <div className="flex items-center px-5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>'''
new = '''    <NewSessionWrapper onClose={onClose}>
      <div className="flex items-center px-5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>'''
assert src.count(old) == 1, f"FAIL 2: {src.count(old)} matches"
src = src.replace(old, new)

# ── 3. Close NewSessionWrapper ────────────────────────────────────────────────
old = '''      </div>
    </BottomSheet>'''
new = '''      </div>
    </NewSessionWrapper>'''
assert src.count(old) == 1, f"FAIL 3: {src.count(old)} matches"
src = src.replace(old, new)

# ── 4. Inject NewSessionWrapper component before NewSessionModal ──────────────
old = "function NewSessionModal({ onClose, onCreated }) {"
new = '''function NewSessionWrapper({ onClose, children }) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  if (isMobile) {
    return (
      <BottomSheet open onClose={onClose} maxHeight="92vh">
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="font-semibold text-base" style={{ color: 'var(--text)' }}>New Session</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <X size={16} />
          </button>
        </div>
        {children}
      </BottomSheet>
    )
  }
  return (
    <Modal onClose={onClose} title="New Session">
      {children}
    </Modal>
  )
}

function NewSessionModal({ onClose, onCreated }) {'''
assert src.count("function NewSessionModal({ onClose, onCreated }) {") == 1, f"FAIL 4"
src = src.replace("function NewSessionModal({ onClose, onCreated }) {", new)

# ── Sanity checks ─────────────────────────────────────────────────────────────
assert src.count('NewSessionWrapper') == 3, f"FAIL: expected 3 NewSessionWrapper refs, got {src.count('NewSessionWrapper')}"
assert src.count('function NewSessionModal') == 1, "FAIL: NewSessionModal missing"
assert src.count('BottomSheet') >= 2, "FAIL: BottomSheet missing"
assert src.count("import Modal from '../components/ui/Modal.jsx'") == 1, "FAIL: Modal import missing"
assert src.count('export default function Sessions') == 1, "FAIL: Sessions export missing"

with open(path, 'w') as f:
    f.write(src)

print("✅ Patched: responsive modal wrapper")
print("   - Mobile (< 768px): BottomSheet with slide-up + swipe-to-close")
print("   - Desktop (>= 768px): centered Modal dialog")
