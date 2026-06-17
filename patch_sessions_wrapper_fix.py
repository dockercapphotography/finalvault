path = '/Users/nickporterfield/code/finalvault/src/routes/Sessions.jsx'

with open(path, 'r') as f:
    src = f.read()

# ── 1. Update NewSessionWrapper to accept stepper + footer props ──────────────
old = '''function NewSessionWrapper({ onClose, children }) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  if (isMobile) {
    return (
      <BottomSheet open onClose={onClose} maxHeight="92vh">
        <div className="flex items-center px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="font-semibold text-base" style={{ color: 'var(--text)' }}>New Session</h2>
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
}'''
new = '''function NewSessionWrapper({ onClose, stepper, children, footer }) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  if (isMobile) {
    return (
      <BottomSheet open onClose={onClose} maxHeight="92vh">
        <div className="flex items-center px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="font-semibold text-base" style={{ color: 'var(--text)' }}>New Session</h2>
        </div>
        {stepper && <div className="shrink-0">{stepper}</div>}
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
          <h2 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>New Session</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <X size={16} />
          </button>
        </div>
        {stepper && <div className="shrink-0">{stepper}</div>}
        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="shrink-0">{footer}</div>}
      </div>
    </div>
  )
}'''
assert src.count(old) == 1, f"FAIL 1: {src.count(old)} matches"
src = src.replace(old, new)

# ── 2. Pass stepper and footer as props, remove them from children ────────────
old = '''  return (
    <NewSessionWrapper onClose={onClose}>
      <div className="flex items-center px-5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        {stepTitles.map((label, i) => (
          <div key={label} className="flex items-center" style={{ flex: i < stepTitles.length - 1 ? 1 : 'none' }}>
            <div className="flex flex-col items-center" style={{ flexShrink: 0 }}>
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold"
                style={{ background: step === i + 1 ? '#6366f1' : step > i + 1 ? '#10b981' : 'var(--surface-raised)', color: step >= i + 1 ? '#fff' : 'var(--text-muted)' }}>
                {step > i + 1 ? '✓' : i + 1}
              </div>
              <span className="text-xs font-medium mt-0.5" style={{ color: step === i + 1 ? 'var(--text)' : 'var(--text-muted)' }}>{label}</span>
            </div>
            {i < stepTitles.length - 1 && (
              <div style={{ flex: 1, height: 1, background: step > i + 1 ? '#10b981' : 'var(--border)', opacity: step > i + 1 ? 0.4 : 1, margin: '0 8px', alignSelf: 'flex-start', marginTop: 12 }} />
            )}
          </div>
        ))}
      </div>

      <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">'''
new = '''  const stepperEl = (
    <div className="flex items-center px-5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
      {stepTitles.map((label, i) => (
        <div key={label} className="flex items-center" style={{ flex: i < stepTitles.length - 1 ? 1 : 'none' }}>
          <div className="flex flex-col items-center" style={{ flexShrink: 0 }}>
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold"
              style={{ background: step === i + 1 ? '#6366f1' : step > i + 1 ? '#10b981' : 'var(--surface-raised)', color: step >= i + 1 ? '#fff' : 'var(--text-muted)' }}>
              {step > i + 1 ? '✓' : i + 1}
            </div>
            <span className="text-xs font-medium mt-0.5" style={{ color: step === i + 1 ? 'var(--text)' : 'var(--text-muted)' }}>{label}</span>
          </div>
          {i < stepTitles.length - 1 && (
            <div style={{ flex: 1, height: 1, background: step > i + 1 ? '#10b981' : 'var(--border)', opacity: step > i + 1 ? 0.4 : 1, margin: '0 8px', alignSelf: 'flex-start', marginTop: 12 }} />
          )}
        </div>
      ))}
    </div>
  )

  const footerEl = (
    <div className="flex items-center justify-between px-5 py-4" style={{ borderTop: '1px solid var(--border)' }}>
      <button onClick={step === 1 ? onClose : () => setStep(s => s - 1)} className="text-sm px-4 py-2 rounded-lg"
        style={{ background: 'var(--surface-raised)', color: 'var(--text-muted)', border: 'none', cursor: 'pointer' }}>
        {step === 1 ? 'Cancel' : '← Back'}
      </button>
      {step < totalSteps
        ? <Button onClick={() => setStep(s => s + 1)} disabled={step === 1 && !name.trim()}>Next →</Button>
        : <Button onClick={handleCreate} disabled={saving || !name.trim()}>{saving ? 'Creating...' : 'Create Session'}</Button>
      }
    </div>
  )

  return (
    <NewSessionWrapper onClose={onClose} stepper={stepperEl} footer={footerEl}>
      <div>'''
assert src.count(old) == 1, f"FAIL 2: {src.count(old)} matches"
src = src.replace(old, new)

# ── 3. Remove the old inline footer that was inside children ──────────────────
old = '''      </div>

      <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
        <button onClick={step === 1 ? onClose : () => setStep(s => s - 1)} className="text-sm px-4 py-2 rounded-lg"
          style={{ background: 'var(--surface-raised)', color: 'var(--text-muted)', border: 'none', cursor: 'pointer' }}>
          {step === 1 ? 'Cancel' : '← Back'}
        </button>'''
new = '''      </div>
      <div style={{display:'none'}}>'''
assert src.count(old) == 1, f"FAIL 3: {src.count(old)} matches"
src = src.replace(old, new)

# ── 4. Remove the old Next/Create buttons and close tag ──────────────────────
old = '''        {step < totalSteps
          ? <Button onClick={() => setStep(s => s + 1)} disabled={step === 1 && !name.trim()}>Next →</Button>
          : <Button onClick={handleCreate} disabled={saving || !name.trim()}>{saving ? 'Creating...' : 'Create Session'}</Button>
        }
      </div>
    </NewSessionWrapper>'''
new = '''      </div>
    </NewSessionWrapper>'''
assert src.count(old) == 1, f"FAIL 4: {src.count(old)} matches"
src = src.replace(old, new)

# ── Sanity checks ─────────────────────────────────────────────────────────────
assert src.count('function NewSessionWrapper') == 1, "FAIL: wrapper missing"
assert src.count('function NewSessionModal') == 1, "FAIL: modal missing"
assert src.count('export default function Sessions') == 1, "FAIL: Sessions export missing"
assert src.count('Create Session') >= 1, "FAIL: Create Session button missing"

with open(path, 'w') as f:
    f.write(src)

print("✅ Patched: NewSessionWrapper desktop now uses inline container")
print("   - Stepper pinned below title, never scrolls")
print("   - Footer pinned at bottom, never scrolls")
print("   - Only step content scrolls")
print("   - Mobile BottomSheet unchanged")
