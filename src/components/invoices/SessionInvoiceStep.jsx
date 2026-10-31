import Toggle from '../ui/Toggle.jsx'
import LineItemsEditor, { newLineKey } from './LineItemsEditor.jsx'
import { inputStyle, focusBorder, blurBorder } from './invoiceUi.jsx'
import {
  computeTotals, parseQuantity, parseRate, toCents, todayIso,
  templateToLines, patternAmounts, patternDueDate, describeSchedulePattern,
} from '../../utils/invoiceApi.js'

// ── New Session wizard: Invoice step (v1.6.0) ────────────────────────────
// Start from an invoice template and/or add items; tax and discount can be
// set here too. A template's payment schedule pattern is turned into dated
// installments from the session date when the session is created. Anything
// else is done in the full editor ("Open the invoice afterwards").

function rateText(v) { return v === null || v === undefined ? '' : String(Number(v)) }

export const EMPTY_SESSION_INVOICE = {
  enabled: false, templateId: '', lines: [], discount_rate: '', tax_rate: '', notes: '',
  pattern: [], usePattern: true, dueDate: '', send: false, openAfter: false,
}

// Problems that block creating the session, or [] when ready.
export function sessionInvoiceProblems(value, hasClient) {
  if (!value.enabled) return []
  const problems = []
  if (!hasClient) problems.push('Link a client in Details to create an invoice.')
  if (value.lines.length === 0) problems.push('Add at least one item, or start from a template.')
  if (value.lines.some(l => !l.title.trim() || parseQuantity(l.quantity) === null || toCents(l.unit_price) === null)) {
    problems.push('Every item needs a name, a quantity and a price.')
  }
  if (parseRate(value.discount_rate) === null || parseRate(value.tax_rate) === null) problems.push('Tax and discount are percents from 0 to 100.')
  return problems
}

// save_invoice payload for the new session.
export function sessionInvoicePayload(value, { clientId, sessionId, sessionDate }) {
  const totals = computeTotals(value.lines, value.discount_rate, value.tax_rate)
  let schedule = []
  if (value.usePattern && value.pattern.length > 1 && totals.total > 0) {
    const amounts = patternAmounts(value.pattern, totals.total)
    if (amounts.every(a => a > 0)) {
      const createdDate = todayIso()
      schedule = value.pattern.map((r, i) => ({
        amount: amounts[i] / 100,
        due_date: patternDueDate(r, { createdDate, sessionDate }) || null,
      }))
    }
  }
  return {
    client_id: clientId,
    session_id: sessionId,
    due_date: value.dueDate || (schedule.length ? schedule[schedule.length - 1].due_date : null),
    status: value.send ? 'sent' : 'draft',
    notes: value.notes || null,
    tax_rate: value.tax_rate === '' ? null : Number(value.tax_rate),
    discount_rate: value.discount_rate === '' ? null : Number(value.discount_rate),
    line_items: value.lines.map(l => ({
      catalog_item_id: l.catalog_item_id || null,
      title: l.title.trim(),
      description: l.description.trim() || null,
      quantity: parseQuantity(l.quantity) / 100,
      unit_price: toCents(l.unit_price) / 100,
      unit_label: l.unit_label || null,
      taxable: l.taxable,
    })),
    schedule,
  }
}

const labelStyle = { color: 'var(--text)' }

export default function SessionInvoiceStep({ value, onChange, catalog, templates = [], hasClient, sessionDate, onBackToDetails }) {
  const set = patch => onChange({ ...value, ...patch })

  function pickTemplate(id) {
    const t = templates.find(x => x.id === id)
    if (!t) {
      set({ templateId: '', lines: [], discount_rate: '', tax_rate: '', notes: '', pattern: [] })
      return
    }
    set({
      templateId: t.id,
      lines: templateToLines(t, newLineKey),
      discount_rate: rateText(t.discount_rate),
      tax_rate: rateText(t.tax_rate),
      notes: t.notes || '',
      pattern: (t.schedule || []).map(r => ({ percent: Number(r.percent), due_rule: r.due_rule, due_days: r.due_days })),
      usePattern: true,
    })
  }

  const totals = computeTotals(value.lines, value.discount_rate, value.tax_rate)
  const needsSessionDate = value.pattern.some(r => r.due_rule === 'before_session' || r.due_rule === 'on_session')

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
          {templates.length > 0 && (
            <div>
              <label className="text-sm font-medium block mb-1.5" style={labelStyle} htmlFor="session-invoice-template">Start from a template</label>
              <select id="session-invoice-template" value={value.templateId} onChange={e => pickTemplate(e.target.value)} data-testid="session-invoice-template"
                style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="">No template</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <p className="text-xs" style={{ margin: '6px 0 0', color: 'var(--text-muted)' }}>Fills in the items below. You can still add, remove or change them.</p>
            </div>
          )}

          <LineItemsEditor
            title="Items"
            manageCatalogLink={false}
            lines={value.lines}
            onLinesChange={lines => set({ lines })}
            catalog={catalog}
            locked={false}
            totals={totals}
            discountRate={value.discount_rate}
            taxRate={value.tax_rate}
            onDiscountRate={v => set({ discount_rate: v })}
            onTaxRate={v => set({ tax_rate: v })}
            ratesInvalid={{ discount: parseRate(value.discount_rate) === null, tax: parseRate(value.tax_rate) === null }}
            paidCents={0}
          />

          {value.pattern.length > 1 && (
            <div className="px-4 py-3 rounded-xl" style={{ border: '1px solid var(--border)' }} data-testid="session-invoice-pattern">
              <label className="flex items-start gap-2 text-sm" style={{ color: 'var(--text)', cursor: 'pointer' }}>
                <input type="checkbox" checked={value.usePattern} onChange={e => set({ usePattern: e.target.checked })}
                  style={{ width: 16, height: 16, marginTop: 2, accentColor: '#6366f1' }} />
                <span>
                  Use the template's payment schedule
                  <span className="block text-xs" style={{ color: 'var(--text-muted)', marginTop: 2 }}>{describeSchedulePattern(value.pattern)}</span>
                  {value.usePattern && needsSessionDate && !sessionDate && (
                    <span className="block text-xs" style={{ color: '#d97706', marginTop: 2 }}>This session has no date, so installments tied to it won't get a due date.</span>
                  )}
                </span>
              </label>
            </div>
          )}

          <div>
            <label className="text-sm font-medium block mb-1.5" style={labelStyle} htmlFor="session-invoice-due">
              Due date <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>(optional{value.usePattern && value.pattern.length > 1 ? '; defaults to the last installment' : ''})</span>
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
            Open the invoice afterwards to adjust it
          </label>
        </>
      )}
    </div>
  )
}
