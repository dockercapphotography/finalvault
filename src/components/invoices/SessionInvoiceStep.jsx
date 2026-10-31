import Toggle from '../ui/Toggle.jsx'
import { MoneyInput, inputStyle, focusBorder, blurBorder } from './invoiceUi.jsx'
import { computeTotals, formatCents, formatUnitPrice, centsToInput, parseQuantity, toCents } from '../../utils/invoiceApi.js'

// ── New Session wizard: Invoice step (v1.6.0) ────────────────────────────
// Replaces the old Financials step. One line from the catalog (or a custom
// item), a due date, and Draft or Sent. Anything more (more lines, tax,
// a payment schedule) is done in the full editor, which "Open the invoice
// afterwards" jumps straight to.

export const EMPTY_SESSION_INVOICE = {
  enabled: false, itemId: '', title: '', description: '', unitLabel: '', taxable: true,
  quantity: '1', price: '', dueDate: '', send: false, openAfter: false,
}

// Problems that block creating the session, or [] when ready.
export function sessionInvoiceProblems(value, hasClient) {
  if (!value.enabled) return []
  const problems = []
  if (!hasClient) problems.push('Link a client in Details to create an invoice.')
  if (!value.title.trim()) problems.push('Choose an item or name a custom one.')
  if (parseQuantity(value.quantity) === null) problems.push('Enter a quantity above 0.')
  if (toCents(value.price) === null) problems.push('Enter a price.')
  return problems
}

// save_invoice payload for the new session.
export function sessionInvoicePayload(value, { clientId, sessionId }) {
  return {
    client_id: clientId,
    session_id: sessionId,
    due_date: value.dueDate || null,
    status: value.send ? 'sent' : 'draft',
    line_items: [{
      catalog_item_id: value.itemId && value.itemId !== 'custom' ? value.itemId : null,
      title: value.title.trim(),
      description: value.description.trim() || null,
      quantity: parseQuantity(value.quantity) / 100,
      unit_price: toCents(value.price) / 100,
      unit_label: value.unitLabel || null,
      taxable: value.taxable,
    }],
  }
}

const labelStyle = { color: 'var(--text)' }

export default function SessionInvoiceStep({ value, onChange, catalog, hasClient, onBackToDetails }) {
  const set = patch => onChange({ ...value, ...patch })
  const active = catalog.filter(c => c.active)

  function pickItem(id) {
    if (id === 'custom') {
      set({ itemId: 'custom', title: '', description: '', unitLabel: '', taxable: true, price: '' })
      return
    }
    const item = active.find(c => c.id === id)
    if (!item) {
      // Back to "Choose from your catalog…": forget the previous item.
      set({ itemId: '', title: '', description: '', unitLabel: '', taxable: true, quantity: '1', price: '' })
      return
    }
    set({
      itemId: item.id, title: item.name, description: item.description || '', unitLabel: item.unit_label || '',
      taxable: item.taxable_default !== false, price: centsToInput(Math.round(Number(item.default_unit_price || 0) * 100)),
    })
  }

  const totals = computeTotals([{ quantity: value.quantity, unit_price: value.price, taxable: value.taxable }], '', '')

  return (
    <div className="space-y-4" data-testid="session-invoice-step">
      <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl"
        style={{ border: `2px solid ${value.enabled ? '#6366f1' : 'var(--border)'}`, background: value.enabled ? 'rgba(99,102,241,0.04)' : 'var(--surface)' }}>
        <div>
          <p className="text-sm font-semibold" style={{ margin: 0, color: value.enabled ? '#6366f1' : 'var(--text)' }}>Create an invoice for this session</p>
          <p className="text-xs" style={{ margin: '2px 0 0', color: 'var(--text-muted)' }}>Optional. You can also add invoices later from the session.</p>
        </div>
        <Toggle checked={value.enabled} onChange={on => set({ enabled: on })} testId="session-invoice-toggle" />
      </div>

      {value.enabled && !hasClient && (
        <div className="px-4 py-3 rounded-xl text-sm" style={{ background: 'var(--warning-subtle)', border: '1px solid rgba(245,158,11,0.35)', color: 'var(--text)' }}>
          An invoice needs a client.{' '}
          <button type="button" onClick={onBackToDetails} style={{ background: 'none', border: 'none', padding: 0, color: '#6366f1', cursor: 'pointer', font: 'inherit', fontWeight: 500 }}>
            Go back to Details to link one
          </button>
          , or turn this off.
        </div>
      )}

      {value.enabled && hasClient && (
        <>
          <div>
            <label className="text-sm font-medium block mb-1.5" style={labelStyle} htmlFor="session-invoice-item">Item</label>
            <select id="session-invoice-item" value={value.itemId} onChange={e => pickItem(e.target.value)} data-testid="session-invoice-item"
              style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="">Choose from your catalog…</option>
              {active.map(c => <option key={c.id} value={c.id}>{c.name} · {formatUnitPrice(c.default_unit_price, c.unit_label)}</option>)}
              <option value="custom">Custom item…</option>
            </select>
          </div>

          {value.itemId === 'custom' && (
            <div>
              <label className="text-sm font-medium block mb-1.5" style={labelStyle} htmlFor="session-invoice-title">Item name</label>
              <input id="session-invoice-title" value={value.title} onChange={e => set({ title: e.target.value })} placeholder="e.g. Engagement Session"
                data-testid="session-invoice-title" style={inputStyle} onFocus={focusBorder} onBlur={blurBorder} />
            </div>
          )}

          {value.itemId && (
            <div className="grid gap-3" style={{ gridTemplateColumns: '90px minmax(0, 1fr)' }}>
              <div>
                <label className="text-sm font-medium block mb-1.5" style={labelStyle} htmlFor="session-invoice-qty">Qty</label>
                <input id="session-invoice-qty" inputMode="decimal" value={value.quantity} onChange={e => set({ quantity: e.target.value })}
                  data-testid="session-invoice-qty" style={{ ...inputStyle, textAlign: 'right' }} onFocus={focusBorder} onBlur={blurBorder} />
              </div>
              <div>
                <p className="text-sm font-medium" style={{ margin: '0 0 6px', ...labelStyle }}>Price{value.unitLabel ? ` per ${value.unitLabel}` : ''}</p>
                <MoneyInput value={value.price} onChange={v => set({ price: v })} ariaLabel="Price" testId="session-invoice-price" />
              </div>
            </div>
          )}

          {value.itemId && totals.valid && (
            <p className="text-sm" style={{ margin: 0, color: 'var(--text-secondary)' }}>
              Invoice total: <span className="font-semibold" style={{ color: 'var(--text)' }}>{formatCents(totals.total)}</span>
            </p>
          )}

          <div>
            <label className="text-sm font-medium block mb-1.5" style={labelStyle} htmlFor="session-invoice-due">
              Due date <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>(optional)</span>
            </label>
            <input id="session-invoice-due" type="date" value={value.dueDate} onChange={e => set({ dueDate: e.target.value })}
              data-testid="session-invoice-due" style={inputStyle} onFocus={focusBorder} onBlur={blurBorder} />
          </div>

          <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
            <legend className="text-sm font-medium mb-1.5" style={labelStyle}>When the session is created</legend>
            <div className="flex gap-2">
              {[{ send: false, label: 'Save as draft', desc: 'Only you can see it' }, { send: true, label: 'Send it', desc: 'Your client can see it' }].map(opt => (
                <button key={opt.label} type="button" aria-pressed={value.send === opt.send} onClick={() => set({ send: opt.send })}
                  className="flex-1 px-3 py-2.5 rounded-xl text-left"
                  style={{ border: value.send === opt.send ? '2px solid #6366f1' : '2px solid var(--border)', background: value.send === opt.send ? 'rgba(99,102,241,0.05)' : 'var(--surface)', cursor: 'pointer' }}>
                  <span className="block text-sm font-medium" style={{ color: value.send === opt.send ? '#6366f1' : 'var(--text)' }}>{opt.label}</span>
                  <span className="block text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{opt.desc}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)', cursor: 'pointer' }}>
            <input type="checkbox" checked={value.openAfter} onChange={e => set({ openAfter: e.target.checked })}
              data-testid="session-invoice-open-after" style={{ width: 16, height: 16, accentColor: '#6366f1' }} />
            Open the invoice afterwards to add more items, tax or a payment schedule
          </label>
        </>
      )}
    </div>
  )
}
