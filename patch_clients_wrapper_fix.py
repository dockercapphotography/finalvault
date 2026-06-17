path = '/Users/nickporterfield/code/finalvault/src/routes/Clients.jsx'

with open(path, 'r') as f:
    src = f.read()

# Replace ClientFormWrapper — inline centered dialog on desktop, BottomSheet on mobile
old = '''function ClientFormWrapper({ onClose, children }) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  if (isMobile) {
    return (
      <BottomSheet open onClose={onClose} maxHeight="92vh">
        <div className="flex items-center px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="font-semibold text-base" style={{ color: 'var(--text)' }}>New Client</h2>
        </div>
        <div className="px-5 py-4">{children}</div>
      </BottomSheet>
    )
  }
  return (
    <Modal onClose={onClose} title="New Client">
      {children}
    </Modal>
  )
}'''
new = '''function ClientFormWrapper({ onClose, children }) {
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
assert src.count(old) == 1, f"FAIL: {src.count(old)} matches"
src = src.replace(old, new)

# Footer already has shrink-0 and borderTop — it will now sit outside the scrollable
# div as a direct child of the flex column container. No change needed to footer itself.

assert src.count('export default function Clients') == 1, "FAIL: Clients export missing"
assert src.count('function ClientFormWrapper') == 1, "FAIL: wrapper missing"

with open(path, 'w') as f:
    f.write(src)

print("✅ Patched: ClientFormWrapper uses inline centered dialog on desktop")
print("   - Desktop: fixed centered modal with own header, scrollable body, pinned footer")
print("   - Mobile: BottomSheet slide-up, no X button")
