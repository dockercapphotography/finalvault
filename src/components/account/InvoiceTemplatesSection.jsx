import { useEffect, useState } from 'react'
import { Copy, Pencil, Plus, Trash2, X } from 'lucide-react'
import SettingsSection from '../ui/SettingsSection.jsx'
import Input from '../ui/Input.jsx'
import TemplateEditorModal from '../TemplateEditorModal.jsx'
import LineItemsEditor, { newLineKey } from '../invoices/LineItemsEditor.jsx'
import { inputStyle, focusBorder, blurBorder } from '../invoices/invoiceUi.jsx'
import {
  getInvoiceTemplates, saveInvoiceTemplate, deleteInvoiceTemplate, getInvoiceCatalogItems,
  templateToLines, computeTotals, describeSchedulePattern, formatCents, parseQuantity, parseRate, toCents,
  DUE_RULES,
} from '../../utils/invoiceApi.js'

// ── Invoice Templates (v1.6.0) ───────────────────────────────────────────
// A template is a reusable invoice: lines, tax, discount, notes and a
// payment schedule pattern ("50% now, 50% 14 days before the session").
// Lines picked from the catalog keep following the catalog's price unless
// changed here (sql/112 stores only what differs).

function rateText(v) { return v === null || v === undefined ? '' : String(Number(v)) }

function emptyForm() {
  return { name: '', notes: '', discount_rate: '', tax_rate: '', lines: [], schedule: [] }
}

function formFromTemplate(t) {
  return {
    name: t.name, notes: t.notes || '',
    discount_rate: rateText(t.discount_rate), tax_rate: rateText(t.tax_rate),
    lines: templateToLines(t, newLineKey),
    schedule: (t.schedule || []).map(r => ({ key: newLineKey(), percent: String(Number(r.percent)), due_rule: r.due_rule, due_days: String(r.due_days ?? 0) })),
  }
}

function templateTotal(t) {
  return computeTotals(
    t.items.map(i => ({ quantity: Number(i.quantity), unit_price: Number(i.unit_price || 0), taxable: i.taxable })),
    t.discount_rate ?? '', t.tax_rate ?? '',
  ).total
}

function SchedulePatternEditor({ rows, onChange }) {
  const sum = rows.reduce((s, r) => s + (Number(r.percent) || 0), 0)
  const set = (i, patch) => onChange(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)))

  return (
    <div className="space-y-2" data-testid="template-schedule">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium" style={{ margin: 0, color: 'var(--text)' }}>Payment schedule</p>
        <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)', cursor: 'pointer' }}>
          <input type="checkbox" checked={rows.length > 0} data-testid="template-schedule-toggle"
            onChange={e => onChange(e.target.checked
              ? [{ key: newLineKey(), percent: '50', due_rule: 'on_create', due_days: '0' }, { key: newLineKey(), percent: '50', due_rule: 'before_session', due_days: '14' }]
              : [])}
            style={{ width: 16, height: 16, accentColor: '#6366f1' }} />
          Split into installments
        </label>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs" style={{ margin: 0, color: 'var(--text-muted)' }}>One payment for the full amount.</p>
      ) : (
        <>
          {rows.map((r, i) => {
            const rule = DUE_RULES.find(d => d.id === r.due_rule) || DUE_RULES[0]
            return (
              <div key={r.key} className="flex flex-wrap items-center gap-2 px-3 py-2.5 rounded-xl" style={{ border: '1px solid var(--border)' }} data-testid="template-schedule-row">
                <span className="text-sm" style={{ color: 'var(--text-secondary)', width: 18 }}>{i + 1}.</span>
                <span className="flex items-center gap-1">
                  <input inputMode="decimal" value={r.percent} onChange={e => set(i, { percent: e.target.value })} aria-label={`Installment ${i + 1} percent`}
                    style={{ ...inputStyle, width: 64, textAlign: 'right' }} onFocus={focusBorder} onBlur={blurBorder} />
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>%</span>
                </span>
                {rule.needsDays && (
                  <input inputMode="numeric" value={r.due_days} onChange={e => set(i, { due_days: e.target.value.replace(/\D/g, '') })} aria-label={`Installment ${i + 1} days`}
                    style={{ ...inputStyle, width: 64, textAlign: 'right' }} onFocus={focusBorder} onBlur={blurBorder} />
                )}
                <select value={r.due_rule} onChange={e => set(i, { due_rule: e.target.value })} aria-label={`Installment ${i + 1} due`}
                  style={{ ...inputStyle, flex: '1 1 200px', width: 'auto', cursor: 'pointer' }}>
                  {DUE_RULES.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                </select>
                {rows.length > 1 && (
                  <button type="button" onClick={() => onChange(rows.filter((_, k) => k !== i))} aria-label={`Remove installment ${i + 1}`}
                    className="p-1.5 rounded-lg" style={{ background: 'var(--surface-raised)', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'inline-flex' }}>
                    <X size={14} />
                  </button>
                )}
              </div>
            )
          })}
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => onChange([...rows, { key: newLineKey(), percent: String(Math.max(0, 100 - sum)), due_rule: 'on_session', due_days: '0' }])}
              className="flex items-center gap-1.5 text-sm font-medium" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#6366f1' }}>
              <Plus size={14} />Add installment
            </button>
            <span className="text-sm" style={{ color: Math.abs(sum - 100) < 0.0005 ? '#10b981' : 'var(--danger)' }} data-testid="template-schedule-sum">
              {Math.abs(sum - 100) < 0.0005 ? 'Adds up to 100%' : `Adds up to ${Math.round(sum * 1000) / 1000}%, needs 100%`}
            </span>
          </div>
          <p className="text-xs" style={{ margin: 0, color: 'var(--text-muted)' }}>
            Dates are worked out when the template is used: from the day the invoice is created, or from the session date.
          </p>
        </>
      )}
    </div>
  )
}

// catalogVersion: bumped by the Invoicing tab whenever the catalog changes,
// so prices and "follows the catalog" are never shown from stale data.
export default function InvoiceTemplatesSection({ onSaveState, catalogVersion = 0 }) {
  const [templates, setTemplates] = useState(null)
  const [catalog, setCatalog] = useState([])
  const [editing, setEditing] = useState(null)   // null closed, { id? } open
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)

  function reload() {
    return Promise.all([getInvoiceTemplates(), getInvoiceCatalogItems()])
      .then(([t, c]) => { setTemplates(t); setCatalog(c) })
  }

  useEffect(() => {
    let cancelled = false
    Promise.all([getInvoiceTemplates(), getInvoiceCatalogItems()])
      .then(([t, c]) => { if (!cancelled) { setTemplates(t); setCatalog(c) } })
      .catch(() => { if (!cancelled) setTemplates([]) })
    return () => { cancelled = true }
  }, [catalogVersion])

  // The editor always opens on freshly loaded templates and catalog.
  async function openFresh(id, { copy } = {}) {
    setError(null)
    try {
      const [t, c] = await Promise.all([getInvoiceTemplates(), getInvoiceCatalogItems()])
      setTemplates(t)
      setCatalog(c)
      if (!id) { setForm(emptyForm()); setEditing({}); return }
      const tpl = t.find(x => x.id === id)
      if (!tpl) return
      setForm(copy ? { ...formFromTemplate(tpl), name: `${tpl.name} (Copy)` } : formFromTemplate(tpl))
      setEditing(copy ? {} : tpl)
    } catch {
      onSaveState?.('error')
    }
  }
  const openNew = () => openFresh(null)
  const openEdit = t => openFresh(t.id)
  const openCopy = t => openFresh(t.id, { copy: true })

  const totals = computeTotals(form.lines, form.discount_rate, form.tax_rate)
  const scheduleSum = form.schedule.reduce((s, r) => s + (Number(r.percent) || 0), 0)
  const problems = [
    !form.name.trim() && 'Give the template a name.',
    form.lines.some(l => !l.title.trim() || parseQuantity(l.quantity) === null || toCents(l.unit_price) === null) && 'Every line needs a name, a quantity and a price.',
    (parseRate(form.discount_rate) === null || parseRate(form.tax_rate) === null) && 'Tax and discount are percents from 0 to 100.',
    form.schedule.length > 0 && Math.abs(scheduleSum - 100) >= 0.0005 && 'The payment schedule needs to add up to 100%.',
    form.schedule.some(r => !(Number(r.percent) > 0)) && 'Every installment needs a percent above 0.',
  ].filter(Boolean)

  async function handleSave() {
    if (problems.length) { setError(problems[0]); return }
    setSaving(true)
    setError(null)
    try {
      await saveInvoiceTemplate({
        id: editing?.id || null,
        name: form.name,
        notes: form.notes,
        tax_rate: form.tax_rate === '' ? null : Number(form.tax_rate),
        discount_rate: form.discount_rate === '' ? null : Number(form.discount_rate),
        // Catalog lines send only the fields the photographer changed
        // (l.overrides); everything else is null and keeps following the
        // catalog. Custom lines send all their values.
        items: form.lines.map(l => {
          const own = !l.catalog_item_id
          const ov = l.overrides || {}
          const keep = field => own || ov[field]
          return {
            catalog_item_id: l.catalog_item_id || null,
            title: keep('title') ? l.title.trim() : null,
            description: keep('description') ? (l.description.trim() || null) : null,
            unit_price: keep('unit_price') ? toCents(l.unit_price) / 100 : null,
            unit_label: keep('unit_label') ? (l.unit_label || null) : null,
            taxable: keep('taxable') ? l.taxable : null,
            quantity: parseQuantity(l.quantity) / 100,
          }
        }),
        schedule: form.schedule.map(r => ({ percent: Number(r.percent), due_rule: r.due_rule, due_days: Number(r.due_days || 0) })),
      })
      await reload()
      setEditing(null)
      onSaveState?.('saved')
    } catch (err) {
      setError(err.message || 'Could not save the template.')
      onSaveState?.('error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    try {
      await deleteInvoiceTemplate(id)
      setTemplates(prev => prev.filter(t => t.id !== id))
      setConfirmDeleteId(null)
      onSaveState?.('saved')
    } catch { onSaveState?.('error') }
  }

  return (
    <>
      <SettingsSection
        title="Invoice Templates"
        description="Reusable invoices, like a package with its deposit schedule. Apply one when creating a session or on any invoice."
        action={
          <button onClick={openNew} data-testid="template-new"
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg"
            style={{ background: '#6366f1', color: '#fff', cursor: 'pointer', border: 'none' }}>
            <Plus size={14} />New Template
          </button>
        }>
        {templates === null ? null : templates.length === 0 ? (
          <div className="py-12 text-center" style={{ background: 'var(--surface)' }}>
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>No invoice templates yet</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Save a package you sell often, like "Full Wedding", to add it in one step</p>
          </div>
        ) : (
          <div style={{ background: 'var(--surface)' }}>
            {templates.map((t, i) => (
              <div key={t.id} data-testid="template-row" data-name={t.name}>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-5 py-4" style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium" style={{ margin: 0, color: 'var(--text)' }}>{t.name}</p>
                      <p className="text-sm" style={{ margin: 0, color: 'var(--text-secondary)' }}>{formatCents(templateTotal(t))}</p>
                    </div>
                    <p className="text-xs mt-0.5 truncate" style={{ margin: '2px 0 0', color: 'var(--text-muted)' }}>
                      {t.items.length} {t.items.length === 1 ? 'item' : 'items'}
                      {t.items.length ? `: ${t.items.map(it => it.title).join(', ')}` : ''}
                    </p>
                    {t.schedule.length > 0 && (
                      <p className="text-xs truncate" style={{ margin: '2px 0 0', color: 'var(--text-muted)' }}>{describeSchedulePattern(t.schedule)}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                    <button onClick={() => openCopy(t)} title="Duplicate" aria-label={`Duplicate ${t.name}`} className="p-1.5 rounded-lg" style={{ background: 'var(--surface-raised)', cursor: 'pointer', border: 'none' }}>
                      <Copy size={13} style={{ color: 'var(--text-muted)' }} />
                    </button>
                    <button onClick={() => openEdit(t)} title="Edit" aria-label={`Edit ${t.name}`} className="p-1.5 rounded-lg" style={{ background: 'var(--surface-raised)', cursor: 'pointer', border: 'none' }}>
                      <Pencil size={13} style={{ color: 'var(--text-muted)' }} />
                    </button>
                    <button onClick={() => setConfirmDeleteId(confirmDeleteId === t.id ? null : t.id)} title="Delete" aria-label={`Delete ${t.name}`} className="p-1.5 rounded-lg"
                      style={{ background: confirmDeleteId === t.id ? 'var(--danger-subtle)' : 'var(--surface-raised)', cursor: 'pointer', border: 'none' }}>
                      <Trash2 size={13} style={{ color: confirmDeleteId === t.id ? 'var(--danger)' : 'var(--text-muted)' }} />
                    </button>
                  </div>
                </div>
                {confirmDeleteId === t.id && (
                  <div className="px-5 py-4" style={{ borderTop: '1px solid var(--border)' }}>
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)' }}>
                      <p className="text-xs flex-1 font-medium" style={{ margin: 0, color: 'var(--danger)' }}>Delete "{t.name}"? Invoices made from it aren't affected.</p>
                      <button onClick={() => handleDelete(t.id)} className="text-xs px-2.5 py-1 rounded-lg font-medium" style={{ background: 'var(--danger)', color: '#fff', cursor: 'pointer', border: 'none' }}>Delete</button>
                      <button onClick={() => setConfirmDeleteId(null)} className="text-xs px-2.5 py-1 rounded-lg font-medium" style={{ background: 'var(--surface-raised)', color: 'var(--text)', cursor: 'pointer', border: 'none' }}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </SettingsSection>

      {editing !== null && (
        <TemplateEditorModal
          title={editing?.id ? 'Edit Invoice Template' : 'New Invoice Template'}
          maxWidth={760}
          saveLabel="Save Template"
          saving={saving}
          canSave={!saving}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        >
          <Input label="Template name" required value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="e.g. Full Wedding" />
          <LineItemsEditor
            lines={form.lines}
            onLinesChange={lines => setForm(f => ({ ...f, lines }))}
            catalog={catalog}
            locked={false}
            totals={totals}
            discountRate={form.discount_rate}
            taxRate={form.tax_rate}
            onDiscountRate={v => setForm(f => ({ ...f, discount_rate: v }))}
            onTaxRate={v => setForm(f => ({ ...f, tax_rate: v }))}
            ratesInvalid={{ discount: parseRate(form.discount_rate) === null, tax: parseRate(form.tax_rate) === null }}
            paidCents={0}
            catalogHints
            manageCatalogLink={false}
          />
          <SchedulePatternEditor rows={form.schedule} onChange={schedule => setForm(f => ({ ...f, schedule }))} />
          <div>
            <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }} htmlFor="template-notes">Notes for your client</label>
            <textarea id="template-notes" rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="e.g. Thank you! The first payment holds your date." style={{ ...inputStyle, resize: 'vertical' }} onFocus={focusBorder} onBlur={blurBorder} />
          </div>
          {error && <p className="text-sm" role="alert" style={{ margin: 0, color: 'var(--danger)' }} data-testid="template-error">{error}</p>}
        </TemplateEditorModal>
      )}
    </>
  )
}
