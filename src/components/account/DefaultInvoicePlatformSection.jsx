import { useEffect, useState } from 'react'
import SettingsSection from '../ui/SettingsSection.jsx'
import { getDefaultInvoicePlatform, setDefaultInvoicePlatform } from '../../utils/invoiceApi.js'

// ── Default payment platform for new invoices (v1.6.0) ───────────────────
// Lists only the platforms that have a link filled in above it on the
// Invoicing tab. Each invoice can still pick a different one.
//
// links     : current payment_links object ({ venmo: 'https://…', … })
// platforms : PAYMENT_PLATFORMS from Account.jsx ([{ id, label }])

const selectStyle = {
  width: '100%', background: 'var(--surface)', border: '1px solid var(--border)',
  color: 'var(--text)', borderRadius: '8px', padding: '9px 36px 9px 12px', fontSize: '14px',
  outline: 'none', cursor: 'pointer', appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
}

export default function DefaultInvoicePlatformSection({ links, platforms, onSaveState }) {
  const [platform, setPlatform] = useState(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    getDefaultInvoicePlatform()
      .then(p => { setPlatform(p); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [])

  async function handleChange(next) {
    const previous = platform
    setPlatform(next || null)
    try {
      await setDefaultInvoicePlatform(next || null)
      onSaveState?.('saved')
    } catch {
      setPlatform(previous)
      onSaveState?.('error')
    }
  }

  const filled = platforms.filter(p => (links?.[p.id] || '').trim())
  // Keep a saved default in the list even if its link was cleared, so the
  // select shows what's actually stored.
  const savedButEmpty = platform && !filled.some(p => p.id === platform)
    ? platforms.find(p => p.id === platform)
    : null

  return (
    <SettingsSection
      title="Default payment platform"
      description="Pre-selected on new invoices, so the client's Pay button uses it. You can change it on any invoice.">
      <div className="px-5 py-4 space-y-2" style={{ background: 'var(--surface)' }}>
        {!loaded ? null : filled.length === 0 && !savedButEmpty ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Add a payment link above to choose a default.</p>
        ) : (
          <>
            <select value={platform || ''} onChange={e => handleChange(e.target.value)}
              data-testid="default-invoice-platform" aria-label="Default payment platform" style={selectStyle}>
              <option value="">None</option>
              {filled.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              {savedButEmpty && <option value={savedButEmpty.id}>{savedButEmpty.label} (no link)</option>}
            </select>
            {savedButEmpty && (
              <p className="text-xs" style={{ color: 'var(--warning, #d97706)' }}>
                Your {savedButEmpty.label} link is empty, so clients won't get a Pay button. Add the link above or pick another platform.
              </p>
            )}
            {platform === 'zelle' && !savedButEmpty && (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Zelle has no payment links, so clients will see your Zelle email or phone to pay from their bank app.
              </p>
            )}
          </>
        )}
      </div>
    </SettingsSection>
  )
}
