import { useState } from 'react'
import { Check, Plus, X } from 'lucide-react'
import { Card, MoneyInput, Pill, LockIcon, inputStyle, focusBorder, blurBorder } from './invoiceUi.jsx'
import { useMediaQuery } from '../../hooks/useMediaQuery.js'
import { toCents, centsToInput, formatCents, formatInvoiceDate, PAYMENT_STATUS_STYLES } from '../../utils/invoiceApi.js'
import { isLocked, rebalanceAfterEdit, addRow, removeRow, scheduleProblems } from './scheduleMath.js'

// ── Payment schedule (v1.6.0) ────────────────────────────────────────────
// rows: see scheduleMath.js. While a field is being typed in, its text is
// kept as typed (drafts) so the value doesn't reformat under the cursor;
// the other rows rebalance live.

function rowStatus(row) {
  if (row.allocatedCents <= 0) return 'unpaid'
  return row.allocatedCents >= row.amountCents ? 'paid' : 'partial'
}

export default function ScheduleEditor({ rows, onChange, totalCents, enabled, onToggle, canDisable, paidDates = {}, disabled }) {
  const narrow = useMediaQuery('(max-width: 639px)')
  const [drafts, setDrafts] = useState({})  // { [key:field]: text }

  const problems = enabled ? scheduleProblems(rows, totalCents) : []
  const sum = rows.reduce((s, r) => s + r.amountCents, 0)

  function setAmount(index, text) {
    const row = rows[index]
    setDrafts(d => ({ ...d, [`${row.key}:amount`]: text }))
    const cents = toCents(text)
    if (cents !== null && cents > 0) onChange(rebalanceAfterEdit(rows, index, cents, totalCents))
  }
  function setShare(index, text) {
    const row = rows[index]
    setDrafts(d => ({ ...d, [`${row.key}:share`]: text }))
    const pct = Number(String(text).replace('%', ''))
    if (text !== '' && Number.isFinite(pct) && pct > 0 && pct < 100) {
      onChange(rebalanceAfterEdit(rows, index, Math.round(totalCents * pct / 100), totalCents))
    }
  }
  function endEdit(row, field) {
    setDrafts(d => { const n = { ...d }; delete n[`${row.key}:${field}`]; return n })
  }
  function setDue(index, value) {
    onChange(rows.map((r, i) => (i === index ? { ...r, due_date: value } : r)))
  }

  const share = r => (totalCents > 0 ? Math.round((r.amountCents / totalCents) * 1000) / 10 : 0)

  const toggle = (
    <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)', cursor: canDisable || !enabled ? 'pointer' : 'not-allowed', opacity: !canDisable && enabled ? 0.6 : 1 }}
      title={!canDisable && enabled ? 'Installments with payments can\'t be removed' : undefined}>
      <input type="checkbox" checked={enabled} disabled={disabled || (enabled && !canDisable)}
        onChange={e => onToggle(e.target.checked)} data-testid="schedule-toggle"
        style={{ width: 16, height: 16, accentColor: '#6366f1' }} />
      Split into installments
    </label>
  )

  return (
    <Card title="Payment schedule" action={toggle} testId="schedule-card">
      {!enabled ? (
        <p className="px-5 py-4 text-sm" style={{ color: 'var(--text-secondary)', margin: 0 }}>
          One payment for the full amount. Turn on installments to split it, for example a deposit now and the rest before the shoot.
        </p>
      ) : (
        <>
          <p className="px-5 pt-3 text-xs" style={{ color: 'var(--text-secondary)', margin: 0 }}>
            Payments fill installments in order. Change one amount and the other unpaid installments rebalance.
          </p>
          <div className="mt-2">
            {rows.map((row, i) => {
              const locked = isLocked(row) || disabled
              const status = rowStatus(row)
              const st = PAYMENT_STATUS_STYLES[status]
              const statusLabel = status === 'paid' && paidDates[row.key] ? `Paid ${formatInvoiceDate(paidDates[row.key], { month: 'short', day: 'numeric' })}` : st.label
              const amountText = drafts[`${row.key}:amount`] ?? centsToInput(row.amountCents)
              const shareText = drafts[`${row.key}:share`] ?? String(share(row))
              const remove = !locked && row.allocatedCents === 0 && rows.length > 1 && (
                <button type="button" onClick={() => onChange(removeRow(rows, i, totalCents))}
                  aria-label={`Remove installment ${i + 1}`} className="p-1.5 rounded-lg"
                  style={{ background: 'var(--surface-raised)', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'inline-flex' }}>
                  <X size={14} />
                </button>
              )
              const amountField = locked
                ? <span className="text-sm" style={{ color: 'var(--text)' }}>{formatCents(row.amountCents)}</span>
                : <MoneyInput value={amountText} onChange={t => setAmount(i, t)} ariaLabel={`Installment ${i + 1} amount`}
                    testId={`schedule-amount-${i + 1}`} invalid={row.allocatedCents > row.amountCents} />
              const shareField = locked
                ? <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{share(row)}%</span>
                : (
                  <span className="flex items-center gap-1">
                    <input inputMode="decimal" value={shareText} aria-label={`Installment ${i + 1} share of total`}
                      onChange={e => setShare(i, e.target.value)} onBlur={e => { endEdit(row, 'share'); blurBorder(e) }} onFocus={focusBorder}
                      style={{ ...inputStyle, textAlign: 'right' }} />
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>%</span>
                  </span>
                )
              const dueField = (isLocked(row) || disabled)
                ? <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{row.due_date ? formatInvoiceDate(row.due_date) : 'No date'}</span>
                : <input type="date" value={row.due_date || ''} onChange={e => setDue(i, e.target.value)} aria-label={`Installment ${i + 1} due date`}
                    data-testid={`schedule-due-${i + 1}`} style={{ ...inputStyle, maxWidth: 180 }} onFocus={focusBorder} onBlur={blurBorder} />
              const label = (
                <span className="text-sm flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                  {i + 1} of {rows.length}{isLocked(row) && <LockIcon size={12} />}
                </span>
              )

              return (
                <div key={row.key} data-testid="schedule-row" onBlurCapture={() => endEdit(row, 'amount')}
                  style={{ borderTop: '1px solid var(--border)', background: isLocked(row) ? 'var(--bg-subtle)' : 'var(--surface)' }}>
                  {narrow ? (
                    <div className="px-5 py-3 space-y-2">
                      <div className="flex items-center justify-between">{label}<Pill label={statusLabel} color={st.color} /></div>
                      <div className="grid gap-2" style={{ gridTemplateColumns: 'minmax(0, 1fr) 84px' }}>{amountField}{shareField}</div>
                      <div className="flex items-center gap-2">{dueField}{remove}</div>
                    </div>
                  ) : (
                    <div className="grid items-center gap-3 px-5 py-3" style={{ gridTemplateColumns: '64px 150px 92px minmax(0, 1fr) 110px 32px' }}>
                      {label}{amountField}{shareField}{dueField}
                      <span style={{ justifySelf: 'start' }}><Pill label={statusLabel} color={st.color} /></span>
                      <span>{remove}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3" style={{ borderTop: '1px solid var(--border)' }}>
            {!disabled ? (
              <button type="button" onClick={() => onChange(addRow(rows))} data-testid="schedule-add"
                className="flex items-center gap-1.5 text-sm font-medium" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#6366f1' }}>
                <Plus size={14} />Add installment
              </button>
            ) : <span />}
            {problems.length === 0 ? (
              <span className="flex items-center gap-1.5 text-sm" style={{ color: '#10b981' }}>
                <Check size={14} />Adds up to {formatCents(sum)}
              </span>
            ) : (
              <span className="text-sm" role="alert" style={{ color: 'var(--danger)' }} data-testid="schedule-problem">{problems[0]}</span>
            )}
          </div>
        </>
      )}
    </Card>
  )
}
