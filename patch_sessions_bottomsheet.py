path = '/Users/nickporterfield/code/finalvault/src/routes/Sessions.jsx'

with open(path, 'r') as f:
    src = f.read()

# ── 1. Add BottomSheet import ─────────────────────────────────────────────────
old = "import KanbanBoard from '../components/ui/KanbanBoard.jsx'"
new = "import KanbanBoard from '../components/ui/KanbanBoard.jsx'\nimport BottomSheet from '../components/layout/BottomSheet.jsx'"
assert src.count(old) == 1, f"FAIL 1: {src.count(old)} matches"
src = src.replace(old, new)

# ── 2. Replace the inline backdrop/container with BottomSheet + desktop modal ─
old = '''    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ padding: '0' }}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full flex flex-col rounded-t-2xl sm:rounded-2xl sm:max-w-lg"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '92vh' }}>
      <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <h2 className="font-semibold text-base" style={{ color: 'var(--text)' }}>New Session</h2>
        <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <X size={16} />
        </button>
      </div>
      <div className="flex items-center px-5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>'''
new = '''    <BottomSheet open onClose={onClose} maxHeight="92vh">
      <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <h2 className="font-semibold text-base" style={{ color: 'var(--text)' }}>New Session</h2>
        <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <X size={16} />
        </button>
      </div>
      <div className="flex items-center px-5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>'''
assert src.count(old) == 1, f"FAIL 2: {src.count(old)} matches"
src = src.replace(old, new)

# ── 3. Close BottomSheet instead of the two extra divs ───────────────────────
old = '''      </div>
      </div>
    </div>'''
new = '''      </div>
    </BottomSheet>'''
assert src.count(old) == 1, f"FAIL 3: {src.count(old)} matches"
src = src.replace(old, new)

# ── Sanity checks ─────────────────────────────────────────────────────────────
assert src.count('BottomSheet') >= 3, f"FAIL: expected BottomSheet import + open + close, got {src.count('BottomSheet')}"
assert src.count('function NewSessionModal') == 1, "FAIL: NewSessionModal missing"
assert src.count('function SessionCard') == 1, "FAIL: SessionCard missing"
assert src.count('export default function Sessions') == 1, "FAIL: Sessions export missing"
assert 'fixed inset-0 z-50' not in src, "FAIL: old backdrop still present"

with open(path, 'w') as f:
    f.write(src)

print("✅ Patched: NewSessionModal now uses BottomSheet")
print("   - Slide-up animation with swipe-to-close drag handle")
print("   - Scroll lock, backdrop, portal — all from BottomSheet")
print("   - maxHeight 92vh so content has room")
