import { useState } from 'react'
import { Download } from 'lucide-react'
import Modal from '../ui/Modal.jsx'
import Button from '../ui/Button.jsx'
import { inputStyle, focusBorder, blurBorder } from './invoiceUi.jsx'
import { formatMoney, todayIso } from '../../utils/invoiceApi.js'
import { DATE_PRESETS, presetRange, buildPaymentsCsv, downloadTextFile } from '../../utils/financialsApi.js'

// ── Export payments (v1.6.0) ─────────────────────────────────────────────
// A CSV of logged payments for a date range, for bookkeeping or taxes.
// Works from the payments the Financials page already loaded.

const RANGE_OPTIONS = [...DATE_PRESETS, { value: 'all', label: 'All time' }, { value: 'custom', label: 'Custom range' }]

export default function ExportPaymentsModal({ payments, onClose }) {
  const [range, setRange] = useState('this_year')
  const initial = presetRange('this_year')
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(todayIso() < initial.to ? todayIso() : initial.to)
  const [includeVoid, setIncludeVoid] = useState(false)

  const bounds = range === 'custom' ? { from, to } : range === 'all' ? { from: null, to: null } : presetRange(range)
  const badRange = range === 'custom' && from && to && from > to

  const selected = badRange ? [] : payments.filter(p =>
    (includeVoid || p.invoice_status !== 'void') &&
    (!bounds.from || p.paid_date >= bounds.from) &&
    (!bounds.to || p.paid_date <= bounds.to))
  const total = selected.reduce((sum, p) => sum + Math.round(p.amount * 100), 0) / 100
  const voidCount = payments.filter(p => p.invoice_status === 'void').length

  function handleDownload() {
    const label = range === 'all' ? 'all-time' : `${bounds.from || 'start'}-to-${bounds.to || todayIso()}`
    downloadTextFile(`finalvault-payments-${label}.csv`, buildPaymentsCsv(selected))
    onClose()
  }

  return (
    <Modal title="Export payments" onClose={onClose} size="sm">
      <div className="space-y-4" data-testid="export-payments-modal">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Downloads a spreadsheet (CSV) of the payments you've logged: date, client, invoice, amount, method and note.
        </p>

        <label className="block">
          <span className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Date paid</span>
          <select value={range} onChange={e => setRange(e.target.value)} style={inputStyle}
            onFocus={focusBorder} onBlur={blurBorder} data-testid="export-range">
            {RANGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>

        {range === 'custom' && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>From</span>
              <input type="date" value={from || ''} onChange={e => setFrom(e.target.value)} style={inputStyle}
                onFocus={focusBorder} onBlur={blurBorder} data-testid="export-from" />
            </label>
            <label className="block">
              <span className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>To</span>
              <input type="date" value={to || ''} onChange={e => setTo(e.target.value)} style={inputStyle}
                onFocus={focusBorder} onBlur={blurBorder} data-testid="export-to" />
            </label>
          </div>
        )}

        {voidCount > 0 && (
          <label className="flex items-start gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={includeVoid} onChange={e => setIncludeVoid(e.target.checked)} style={{ marginTop: 3 }} />
            <span>Include payments on void invoices</span>
          </label>
        )}

        <div className="rounded-xl px-4 py-3 flex items-center justify-between gap-3"
          style={{ background: 'var(--surface-raised)' }} data-testid="export-summary">
          {badRange ? (
            <span className="text-sm" style={{ color: 'var(--danger)' }}>The start date is after the end date.</span>
          ) : (
            <>
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {selected.length} {selected.length === 1 ? 'payment' : 'payments'}
              </span>
              <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{formatMoney(total)}</span>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleDownload} disabled={selected.length === 0}>
            <Download size={15} />Download CSV
          </Button>
        </div>
      </div>
    </Modal>
  )
}
