path = '/Users/nickporterfield/code/finalvault/src/routes/Sessions.jsx'

with open(path, 'r') as f:
    src = f.read()

# ── 1. Remove Modal import (no longer needed) ────────────────────────────────
old = "import Modal from '../components/ui/Modal.jsx'\n"
new = ""
assert src.count(old) == 1, f"FAIL 1: {src.count(old)} matches"
src = src.replace(old, new)

# ── 2. Replace <Modal> wrapper + double-scroll body with inline container ─────
old = '''    <Modal onClose={onClose} title="New Session" maxWidth={540}>
      <div className="flex items-center px-6 py-3" style={{ borderBottom: '1px solid var(--border)' }}>'''
new = '''    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ padding: '0' }}>
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
assert src.count(old) == 1, f"FAIL 2: {src.count(old)} matches"
src = src.replace(old, new)

# ── 3. Fix stepper px-6 → px-5 (already changed above in header, now body) ──
# Replace the body div: remove inner scroll, reduce padding, let modal scroll
old = '''      <div className="px-6 py-5 space-y-4 overflow-y-auto" style={{ maxHeight: '60vh' }}>'''
new = '''      <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">'''
assert src.count(old) == 1, f"FAIL 3: {src.count(old)} matches"
src = src.replace(old, new)

# ── 4. Fix footer px-6 → px-5 ────────────────────────────────────────────────
old = '''      <div className="flex items-center justify-between px-6 py-4" style={{ borderTop: '1px solid var(--border)' }}>'''
new = '''      <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>'''
assert src.count(old) == 1, f"FAIL 4: {src.count(old)} matches"
src = src.replace(old, new)

# ── 5. Close the two extra divs that Modal used to provide ───────────────────
old = '''      </div>
    </Modal>'''
new = '''      </div>
      </div>
    </div>'''
assert src.count(old) == 1, f"FAIL 5: {src.count(old)} matches"
src = src.replace(old, new)

# ── Sanity checks ─────────────────────────────────────────────────────────────
assert "import Modal from '../components/ui/Modal.jsx'" not in src, "FAIL: Modal import still present"
assert src.count('function NewSessionModal') == 1, "FAIL: NewSessionModal missing"
assert src.count('function SessionCard') == 1, "FAIL: SessionCard missing"
assert src.count('export default function Sessions') == 1, "FAIL: Sessions export missing"
assert src.count('fixed inset-0 z-50') == 1, "FAIL: backdrop missing"

with open(path, 'w') as f:
    f.write(src)

print("✅ Modal structure patched successfully")
print("   - Replaced <Modal> with inline backdrop + rounded-t-2xl sheet on mobile")
print("   - Single scroll region (flex-1 overflow-y-auto on body only)")
print("   - Reduced padding px-6 → px-5 throughout")
print("   - Modal slides up from bottom on mobile, centered on desktop")
