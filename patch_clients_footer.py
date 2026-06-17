path = '/Users/nickporterfield/code/finalvault/src/routes/Clients.jsx'

with open(path, 'r') as f:
    src = f.read()

# ── 1. Update ClientFormWrapper to accept a footer prop ───────────────────────
old = '''function ClientFormWrapper({ onClose, children }) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  if (isMobile) {
    return (
      <BottomSheet open onClose={onClose} maxHeight="92vh">
        <div className="flex items-center px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="font-semibold text-base" style={{ color: 'var(--text)' }}>New Client</h2>
        </div>
        <div className="px-5 py-4 overflow-y-auto flex-1">{children}</div>
      </BottomSheet>
    )
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg flex flex-col rounded-2xl shadow-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '90vh' }}>
        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>New Client</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <X size={16} />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  )
}'''
new = '''function ClientFormWrapper({ onClose, children, footer }) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  if (isMobile) {
    return (
      <BottomSheet open onClose={onClose} maxHeight="92vh">
        <div className="flex items-center px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="font-semibold text-base" style={{ color: 'var(--text)' }}>New Client</h2>
        </div>
        <div className="px-5 py-4 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="shrink-0">{footer}</div>}
      </BottomSheet>
    )
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg flex flex-col rounded-2xl shadow-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '90vh' }}>
        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>New Client</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <X size={16} />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="shrink-0">{footer}</div>}
      </div>
    </div>
  )
}'''
assert src.count(old) == 1, f"FAIL 1: {src.count(old)} matches"
src = src.replace(old, new)

# ── 2. Pull footer out of children into footer prop ───────────────────────────
old = '''    <ClientFormWrapper onClose={onClose}>
          <div className="space-y-4">'''
new = '''    <ClientFormWrapper onClose={onClose} footer={
      <div className="px-6 py-4 flex items-center justify-between" style={{ borderTop: '1px solid var(--border)' }}>
        <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg"
          style={{ background: 'var(--surface-raised)', color: 'var(--text-muted)', border: 'none', cursor: 'pointer' }}>
          Cancel
        </button>
        <Button onClick={handleSubmit} disabled={saving || !form.firstName.trim() || !form.lastName.trim()}>
          {saving ? 'Saving...' : 'Create Client'}
        </Button>
      </div>
    }>
          <div className="space-y-4">'''
assert src.count(old) == 1, f"FAIL 2: {src.count(old)} matches"
src = src.replace(old, new)

# ── 3. Remove the old footer div that was inside children ─────────────────────
old = '''          </div>
          <div className="px-5 py-4 flex items-center justify-end gap-3 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving || !form.firstName.trim() || !form.lastName.trim()}>
              {saving ? 'Saving...' : 'Create Client'}
            </Button>
          </div>
    </ClientFormWrapper>'''
new = '''          </div>
    </ClientFormWrapper>'''
assert src.count(old) == 1, f"FAIL 3: {src.count(old)} matches"
src = src.replace(old, new)

# ── Sanity checks ─────────────────────────────────────────────────────────────
assert src.count('export default function Clients') == 1, "FAIL: Clients export missing"
assert src.count('function ClientFormWrapper') == 1, "FAIL: wrapper missing"
assert src.count('Create Client') >= 1, "FAIL: Create Client button missing"

with open(path, 'w') as f:
    f.write(src)

print("✅ Patched: footer passed as prop, pinned outside scroll area on both mobile and desktop")
print("   - Cancel on left, Create Client on right (matching Sessions layout)")
