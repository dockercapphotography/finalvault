import { useState } from 'react'
import Modal from '../ui/Modal.jsx'
import Button from '../ui/Button.jsx'
import { MoneyInput, LockIcon, inputStyle, focusBorder, blurBorder } from './invoiceUi.jsx'
import { PAYMENT_METHODS, toCents, centsToInput, formatCents, todayIso } from '../../utils/invoiceApi.js'

// ── Log / edit a payment (v1.6.0) ────────────────────────────────────────
// suggestions: [{ label, cents }] -- e.g. the next installment and the full
// balance. The first suggestion pre-fills a new payment.

export default function LogPaymentModal({
  title, subtitle, payment, suggestions = [], defaultMethod, firstPayment, balanceCents, onSave, onClose,
}) {
  const [amount, setAmount] = useState(() =>
    payment ? centsToInput(Math.round(Number(payment.amount) * 100))
      : suggestions[0] ? centsToInput(suggestions[0].cents) : '')
  const [paidDate, setPaidDate] = useState(payment?.paid_date || todayIso())
  const [method, setMethod] = useState(payment?.method || defaultMethod || '')
  const [note, setNote] = useState(payment?.note || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const cents = toCents(amount)
  const valid = cents !== null && cents > 0 && Boolean(paidDate)
  const over = valid && !payment && cents > balanceCents

  async function handleSave() {
    if (!valid) return
    setSaving(true)
    setError(null)
    try {
      await onSave({ amount: cents / 100, paidDate, method, note })
    } catch (err) {
      setError(err.message || 'Could not save the payment.')
      setSaving(false)
    }
  }

  return (
    <Modal title={title} onClose={onClose} size="md">
      <div className="space-y-4" data-testid="log-payment-modal">
        {subtitle && <p className="text-xs" style={{ margin: 0, color: 'var(--text-muted)' }}>{subtitle}</p>}

        <div>
          <p className="text-sm font-medium mb-1.5" style={{ margin: '0 0 6px', color: 'var(--text)' }} aria-hidden="true">Amount</p>
          <MoneyInput value={amount} onChange={setAmount} ariaLabel="Amount" testId="payment-amount" invalid={amount !== '' && !valid} />
          {suggestions.length > 0 && !payment && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {suggestions.map(s => {
                const on = cents === s.cents
                return (
                  <button key={s.label} type="button" aria-pressed={on} onClick={() => setAmount(centsToInput(s.cents))}
                    className="text-xs font-medium px-2.5 rounded-full"
                    style={{ height: 30, border: `1px solid ${on ? '#6366f1' : 'var(--border)'}`, background: on ? 'rgba(99,102,241,0.1)' : 'var(--surface)', color: on ? '#6366f1' : 'var(--text)', cursor: 'pointer' }}>
                    {s.label} · {formatCents(s.cents)}
                  </button>
                )
              })}
            </div>
          )}
          {over && <p className="text-xs mt-1.5" style={{ margin: '6px 0 0', color: '#d97706' }}>That's more than the {formatCents(balanceCents)} balance.</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }} htmlFor="payment-date">Date paid</label>
            <input id="payment-date" type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)} data-testid="payment-date"
              style={inputStyle} onFocus={focusBorder} onBlur={blurBorder} />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }} htmlFor="payment-method">Method</label>
            <select id="payment-method" value={method} onChange={e => setMethod(e.target.value)} data-testid="payment-method"
              style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="">Not recorded</option>
              {PAYMENT_METHODS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }} htmlFor="payment-note">
            Note <span className="font-normal" style={{ color: 'var(--text-muted)' }}>(only you see this)</span>
          </label>
          <input id="payment-note" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Deposit, check #1042"
            data-testid="payment-note" style={inputStyle} onFocus={focusBorder} onBlur={blurBorder} />
        </div>

        {firstPayment && !payment && (
          <div role="note" className="flex gap-2.5 px-3 py-2.5 rounded-xl text-xs"
            style={{ background: 'var(--warning-subtle)', border: '1px solid rgba(245,158,11,0.35)', color: 'var(--text)' }}>
            <span style={{ marginTop: 1 }}><LockIcon size={14} /></span>
            <span>This is the first payment on this invoice, so its client, session, line items, tax and discount will lock.</span>
          </div>
        )}

        {error && <p className="text-sm" role="alert" style={{ margin: 0, color: 'var(--danger)' }}>{error}</p>}

        <div className="flex gap-3 pt-1">
          <Button onClick={handleSave} disabled={!valid || saving}>{saving ? 'Saving…' : payment ? 'Save payment' : 'Log payment'}</Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  )
}
