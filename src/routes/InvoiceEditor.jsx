import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Check, Lock, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import PageBreadcrumb from '../components/ui/PageBreadcrumb.jsx'
import ClientPicker from '../components/ui/ClientPicker.jsx'
import Button from '../components/ui/Button.jsx'
import Modal from '../components/ui/Modal.jsx'
import Toast from '../components/ui/Toast.jsx'
import LineItemsEditor, { newLineKey } from '../components/invoices/LineItemsEditor.jsx'
import ScheduleEditor from '../components/invoices/ScheduleEditor.jsx'
import LogPaymentModal from '../components/invoices/LogPaymentModal.jsx'
import { Card, InvoiceStatusPill, PaymentStatusPill, inputStyle, focusBorder, blurBorder } from '../components/invoices/invoiceUi.jsx'
import { rescaleToTotal, startSchedule, newRowKey } from '../components/invoices/scheduleMath.js'
import { useDocumentTitle } from '../hooks/useDocumentTitle.js'
import { useMediaQuery } from '../hooks/useMediaQuery.js'
import { getClients } from '../utils/crmApi.js'
import { downloadInvoicePdf } from '../utils/invoicePdf.js'
import { sendInvoiceEmail, getInvoiceEmailLog } from '../utils/invoiceEmailApi.js'
import SendInvoiceModal from '../components/invoices/SendInvoiceModal.jsx'
import { getSessions } from '../utils/sessionApi.js'
import {
  getInvoice, saveInvoice, duplicateInvoice, voidInvoice, deleteInvoice,
  logPayment, updatePayment, deletePayment, getInvoiceCatalogItems, getPaymentLinks,
  computeTotals, parseQuantity, parseRate, toCents, centsToInput, formatCents, formatInvoiceDate,
  INVOICE_PLATFORMS, platformLabel, todayIso,
  getInvoiceTemplates, templateToLines, patternAmounts, patternDueDate,
} from '../utils/invoiceApi.js'

// ── Invoice editor (v1.6.0) ──────────────────────────────────────────────
// /invoices/new?client=<id>&session=<id>   and   /invoices/:id
//
// Everything is saved through save_invoice (sql/111) in one transaction;
// the database enforces the money rules (sql/109) and computes the stored
// totals (sql/108). The totals shown while typing use the same math
// (invoiceApi.computeTotals) so they match what gets saved.

function rateText(v) { return v === null || v === undefined ? '' : String(Number(v)) }

function linesFromInvoice(inv) {
  return (inv?.line_items || []).map(l => ({
    key: l.id, id: l.id, catalog_item_id: l.catalog_item_id,
    title: l.title, description: l.description || '',
    quantity: String(Number(l.quantity)), unit_price: centsToInput(Math.round(Number(l.unit_price) * 100)),
    unit_label: l.unit_label || '', taxable: l.taxable,
  }))
}

function scheduleFromInvoice(inv) {
  return (inv?.schedule || []).map(r => ({
    key: r.id, id: r.id, amountCents: Math.round(Number(r.amount) * 100),
    due_date: r.due_date || '', allocatedCents: Math.round(Number(r.allocated || 0) * 100),
  }))
}

function formFromInvoice(inv, { clientId, sessionId, defaultPlatform } = {}) {
  return {
    client_id: inv?.client_id || clientId || '',
    session_id: inv?.session_id || sessionId || '',
    due_date: inv?.due_date || '',
    payment_platform: inv ? (inv.payment_platform || '') : (defaultPlatform || ''),
    notes: inv?.notes || '',
    discount_rate: rateText(inv?.discount_rate),
    tax_rate: rateText(inv?.tax_rate),
    lines: linesFromInvoice(inv),
    scheduleOn: (inv?.schedule || []).length > 0,
    schedule: scheduleFromInvoice(inv),
  }
}

// For each fully paid installment, the date of the payment that finished it.
function paidDatesFor(schedule, payments) {
  const out = {}
  let cumulative = 0
  let rowEnd = 0
  let r = 0
  const rows = schedule
  for (const p of payments) {
    cumulative += Math.round(Number(p.amount) * 100)
    while (r < rows.length && cumulative >= rowEnd + rows[r].amountCents) {
      rowEnd += rows[r].amountCents
      out[rows[r].key] = p.paid_date
      r += 1
    }
  }
  return out
}

export default function InvoiceEditor() {
  const { id } = useParams()
  const isNew = !id
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const narrow = useMediaQuery('(max-width: 767px)')

  const [invoice, setInvoice] = useState(null)
  const [form, setForm] = useState(null)
  const [baseline, setBaseline] = useState(null)
  const [clients, setClients] = useState([])
  const [sessions, setSessions] = useState([])
  const [catalog, setCatalog] = useState([])
  const [templates, setTemplates] = useState([])
  const [links, setLinks] = useState({})
  const [loadError, setLoadError] = useState(null)
  const [saving, setSaving] = useState(false)
  const routerLocation = useLocation()
  // A toast handed over by the save that created this invoice (the new ->
  // :id navigation remounts the page). Ignored after a few seconds so a
  // reload doesn't show it again.
  const [toast, setToast] = useState(() => {
    const t = routerLocation.state?.toast
    return t && Date.now() - (t.at || 0) < 8000 ? { message: t.message, type: t.type } : null
  })
  const [confirm, setConfirm] = useState(null)       // 'send' | 'resend' | 'remind' | 'void' | 'delete'
  const [paymentModal, setPaymentModal] = useState(null)  // { payment? }
  const [confirmDeletePaymentId, setConfirmDeletePaymentId] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [errors, setErrors] = useState([])
  const [emailLog, setEmailLog] = useState([])
  const [logVersion, setLogVersion] = useState(0)

  useEffect(() => {
    if (isNew || !id) return undefined
    let cancelled = false
    getInvoiceEmailLog(id).then(rows => { if (!cancelled) setEmailLog(rows) }).catch(() => {})
    return () => { cancelled = true }
  }, [id, isNew, logVersion])

  useDocumentTitle(invoice ? `Invoice #${invoice.invoice_number}` : 'New invoice')

  const fetchAll = useCallback(() => Promise.all([
    getClients(), getInvoiceCatalogItems(), getPaymentLinks(), isNew ? Promise.resolve(null) : getInvoice(id),
    getInvoiceTemplates().catch(() => []),
  ]), [id, isNew])

  const applyLoaded = useCallback(([clientList, catalogItems, linkInfo, inv, templateList]) => {
    setClients(clientList)
    setCatalog(catalogItems)
    setTemplates(templateList || [])
    setLinks(linkInfo.links)
    setInvoice(inv)
    const f = formFromInvoice(inv, {
      clientId: searchParams.get('client') || '',
      sessionId: searchParams.get('session') || '',
      defaultPlatform: linkInfo.defaultPlatform,
    })
    setForm(f)
    setBaseline(JSON.stringify(f))
    setErrors([])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- searchParams only seeds a new invoice

  useEffect(() => {
    let cancelled = false
    fetchAll()
      .then(data => { if (!cancelled) applyLoaded(data) })
      .catch(err => { if (!cancelled) setLoadError(err.message || 'Could not load this invoice.') })
    return () => { cancelled = true }
  }, [fetchAll, applyLoaded])

  const load = useCallback(() => fetchAll().then(applyLoaded), [fetchAll, applyLoaded])

  // Sessions for the chosen client (filtered by client below, so a stale
  // list from the previous client never shows).
  const clientId = form?.client_id
  useEffect(() => {
    if (!clientId) return undefined
    let cancelled = false
    getSessions({ clientId }).then(list => { if (!cancelled) setSessions(list) }).catch(() => {})
    return () => { cancelled = true }
  }, [clientId])

  const dirty = form !== null && baseline !== null && JSON.stringify(form) !== baseline
  useEffect(() => {
    if (!dirty) return undefined
    const warn = e => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const dismissToast = useCallback(() => setToast(null), [])
  const payments = useMemo(() => invoice?.payments || [], [invoice])
  const status = invoice?.status || 'draft'
  const isVoid = status === 'void'
  const locked = payments.length > 0 || isVoid
  const paidCents = payments.reduce((s, p) => s + Math.round(Number(p.amount) * 100), 0)

  const totals = useMemo(() => form
    ? computeTotals(form.lines, form.discount_rate, form.tax_rate)
    : computeTotals([], '', ''), [form])

  if (loadError) {
    return (
      <div className="max-w-2xl py-16 text-center">
        <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{loadError}</p>
        <button type="button" onClick={() => navigate(-1)} className="text-sm mt-2" style={{ color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer' }}>Go back</button>
      </div>
    )
  }
  if (!form) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  const set = patch => setForm(f => ({ ...f, ...patch }))
  // Lines and rates change the total; installments keep their proportions.
  const setMoney = patch => setForm(f => {
    const next = { ...f, ...patch }
    if (next.scheduleOn && !locked) {
      const before = computeTotals(f.lines, f.discount_rate, f.tax_rate)
      const after = computeTotals(next.lines, next.discount_rate, next.tax_rate)
      if (after.valid && after.total !== before.total) next.schedule = rescaleToTotal(next.schedule, after.total)
    }
    return next
  })
  const client = clients.find(c => c.id === form.client_id)
  const clientName = client ? `${client.first_name || ''} ${client.last_name || ''}`.trim() : (invoice?.client_name || '')
  const clientSessions = sessions.filter(s => s.client_id === form.client_id)
  const session = clientSessions.find(s => s.id === form.session_id)

  const paymentStatus = paidCents <= 0 ? 'unpaid' : paidCents < totals.total ? 'partial' : 'paid'
  const balanceCents = totals.total - paidCents
  const scheduleRows = form.scheduleOn ? form.schedule : []
  const nextRow = scheduleRows.find(r => r.allocatedCents < r.amountCents)
  const nextDue = (nextRow && nextRow.due_date) || form.due_date
  const overdue = status === 'sent' && paymentStatus !== 'paid' && nextDue && nextDue < todayIso()
  const paidDates = paidDatesFor(form.schedule, payments)

  const platformOptions = INVOICE_PLATFORMS.filter(p => (links[p.id] || '').trim() || p.id === form.payment_platform)

  // ── Templates ───────────────────────────────────────────────────────
  // Adds the template's lines. Tax, discount and notes are filled only where
  // the invoice has none; its payment schedule is used only if this invoice
  // doesn't have one yet (dates from today/creation and the session date).
  function applyTemplate(t) {
    setForm(f => {
      const next = {
        ...f,
        lines: [...f.lines, ...templateToLines(t, newLineKey)],
        discount_rate: f.discount_rate === '' && t.discount_rate != null ? String(Number(t.discount_rate)) : f.discount_rate,
        tax_rate: f.tax_rate === '' && t.tax_rate != null ? String(Number(t.tax_rate)) : f.tax_rate,
        notes: f.notes.trim() ? f.notes : (t.notes || ''),
      }
      const total = computeTotals(next.lines, next.discount_rate, next.tax_rate)
      if (!total.valid) return next
      if (!f.scheduleOn && (t.schedule || []).length > 1 && total.total > 0) {
        const amounts = patternAmounts(t.schedule, total.total)
        if (amounts.every(a => a > 0)) {
          const createdDate = invoice?.created_at ? String(invoice.created_at).slice(0, 10) : todayIso()
          const sessionDate = clientSessions.find(s => s.id === f.session_id)?.session_date || ''
          next.scheduleOn = true
          next.schedule = t.schedule.map((r, i) => ({
            key: newRowKey(), amountCents: amounts[i], allocatedCents: 0,
            due_date: patternDueDate(r, { createdDate, sessionDate }),
          }))
        }
      } else if (f.scheduleOn) {
        next.schedule = rescaleToTotal(f.schedule, total.total)
      }
      return next
    })
  }

  // ── Validation ──────────────────────────────────────────────────────
  function validate({ forSend } = {}) {
    const problems = []
    if (!form.client_id && !isVoid) problems.push('Choose a client.')
    if (!locked) {
      form.lines.forEach((l, i) => {
        if (!l.title.trim()) problems.push(`Line ${i + 1} needs a name.`)
        if (parseQuantity(l.quantity) === null) problems.push(`Line ${i + 1} needs a quantity above 0.`)
        if (toCents(l.unit_price) === null) problems.push(`Line ${i + 1} needs a price.`)
      })
      if (parseRate(form.discount_rate) === null) problems.push('The discount must be a percent from 0 to 100.')
      if (parseRate(form.tax_rate) === null) problems.push('The tax rate must be a percent from 0 to 100.')
    }
    if (form.scheduleOn && totals.valid) {
      const sum = form.schedule.reduce((s, r) => s + r.amountCents, 0)
      if (form.schedule.some(r => !(r.amountCents > 0))) problems.push('Every installment needs an amount.')
      if (sum !== totals.total) problems.push(`The installments add up to ${formatCents(sum)}, not the ${formatCents(totals.total)} total.`)
    }
    if (forSend) {
      if (form.lines.length === 0) problems.push('Add at least one item before sending.')
      else if (totals.valid && totals.total <= 0) problems.push('The total must be more than $0 to send.')
    }
    return problems
  }

  function buildPayload(extra = {}) {
    if (isVoid) return { id: invoice.id, notes: form.notes }
    const p = {
      id: invoice?.id || null,
      due_date: form.due_date || null,
      payment_platform: form.payment_platform || null,
      notes: form.notes,
      schedule: form.scheduleOn
        ? form.schedule.map(r => ({ id: r.id || null, amount: r.amountCents / 100, due_date: r.due_date || null }))
        : [],
      ...extra,
    }
    if (!locked) {
      Object.assign(p, {
        client_id: form.client_id,
        session_id: form.session_id || null,
        tax_rate: form.tax_rate === '' ? null : Number(form.tax_rate),
        discount_rate: form.discount_rate === '' ? null : Number(form.discount_rate),
        line_items: form.lines.map(l => ({
          id: l.id || null, catalog_item_id: l.catalog_item_id || null,
          title: l.title.trim(), description: l.description.trim() || null,
          quantity: parseQuantity(l.quantity) / 100, unit_price: toCents(l.unit_price) / 100,
          unit_label: l.unit_label || null, taxable: l.taxable,
        })),
      })
    }
    return p
  }

  // afterSave(savedId) runs once the invoice is saved (used to email it);
  // if it fails the invoice stays saved and the toast says so.
  async function save({ send, afterSave } = {}) {
    const problems = validate({ forSend: send })
    setErrors(problems)
    if (problems.length) return false
    setSaving(true)
    try {
      const savedId = await saveInvoice(buildPayload(send ? { status: 'sent' } : {}))
      let note = { message: send ? 'Invoice sent' : 'Invoice saved', type: 'success' }
      if (afterSave) {
        try {
          note = { message: (await afterSave(savedId)) || note.message, type: 'success' }
        } catch (err) {
          note = { message: `Saved as sent, but the email didn't go out: ${err.message} Use More → Email invoice again.`, type: 'error' }
        }
      }
      setToast(note)
      if (isNew) {
        setBaseline(JSON.stringify(form))  // don't warn on the navigation below
        navigate(`/invoices/${savedId}`, { replace: true, state: { toast: { ...note, at: Date.now() } } })
      } else {
        await load()
        setLogVersion(v => v + 1)
      }
      return savedId
    } catch (err) {
      setErrors([err.message || 'Could not save the invoice.'])
      return false
    } finally {
      setSaving(false)
    }
  }

  async function runAction(fn, successMessage) {
    setSaving(true)
    try {
      await fn()
      if (successMessage) setToast({ message: successMessage, type: 'success' })
    } catch (err) {
      setToast({ message: err.message || 'Something went wrong.', type: 'error' })
    } finally {
      setSaving(false)
      setConfirm(null)
      setMenuOpen(false)
    }
  }

  const handleVoid = () => runAction(async () => { await voidInvoice(invoice.id); await load() }, 'Invoice voided')
  const handleDelete = () => runAction(async () => {
    await deleteInvoice(invoice.id)
    setBaseline(JSON.stringify(form))
    navigate(invoice.session_id ? `/sessions/${invoice.session_id}` : invoice.client_id ? `/clients/${invoice.client_id}` : '/sessions')
  })
  // Built from the last saved version (the server renders what's stored).
  const handleDownloadPdf = () => runAction(() => downloadInvoicePdf(invoice.id, invoice.invoice_number))

  const handleDuplicate = () => runAction(async () => {
    const newId = await duplicateInvoice(invoice.id)
    navigate(`/invoices/${newId}`)
  }, 'Copied to a new draft')

  // ── Payments ────────────────────────────────────────────────────────
  const suggestions = []
  if (nextRow) {
    const idx = scheduleRows.indexOf(nextRow)
    const remaining = nextRow.amountCents - nextRow.allocatedCents
    if (remaining > 0 && remaining !== balanceCents) suggestions.push({ label: `Installment ${idx + 1}`, cents: remaining })
  }
  if (balanceCents > 0) suggestions.push({ label: 'Full balance', cents: balanceCents })

  async function savePayment(values) {
    if (paymentModal?.payment) await updatePayment(paymentModal.payment.id, values)
    else await logPayment(invoice.id, values)
    setPaymentModal(null)
    setToast({ message: paymentModal?.payment ? 'Payment updated' : 'Payment logged', type: 'success' })
    await load()
  }

  const handleDeletePayment = pid => runAction(async () => {
    await deletePayment(pid)
    setConfirmDeletePaymentId(null)
    await load()
  }, 'Payment deleted')

  // ── Layout pieces ───────────────────────────────────────────────────
  const crumbs = invoice?.session_id && session
    ? [{ label: 'Sessions', to: '/sessions' }, { label: session.name, to: `/sessions/${session.id}` }]
    : client ? [{ label: 'Clients', to: '/clients' }, { label: clientName, to: `/clients/${client.id}` }] : [{ label: 'Sessions', to: '/sessions' }]
  crumbs.push({ label: invoice ? `Invoice #${invoice.invoice_number}` : 'New invoice' })

  const subtitle = isVoid
    ? `Voided ${formatInvoiceDate(invoice.voided_at)} · Kept for your records`
    : status === 'sent'
      ? `Sent ${formatInvoiceDate(invoice.sent_at)} · Your client can see it`
      : invoice ? `Created ${formatInvoiceDate(invoice.created_at)} · Draft: your client can't see it yet` : 'Not saved yet'

  const canSend = status === 'draft' && !isVoid
  const canRemind = status === 'sent' && balanceCents > 0

  // ── Email dialog values ─────────────────────────────────────────────
  const dueNowCents = nextRow ? nextRow.amountCents - nextRow.allocatedCents : balanceCents
  const emailCtx = {
    client_first_name: client?.first_name || clientName.split(' ')[0] || '',
    client_name: clientName,
    // A new invoice gets its number when saved; the server fills it in.
    ...(invoice ? { invoice_number: String(invoice.invoice_number) } : {}),
    invoice_total: formatCents(totals.total),
    amount_due: formatCents(Math.max(0, dueNowCents)),
    balance_due: formatCents(Math.max(0, balanceCents)),
    due_date: nextDue ? formatInvoiceDate(nextDue, { month: 'long', day: 'numeric', year: 'numeric' }) : '',
    session_name: session?.name || '',
  }
  const payPlatform = INVOICE_PLATFORMS.find(p => p.id === form.payment_platform)
  const emailPayInfo = payPlatform ? { label: payPlatform.label, hasLink: Boolean((links[payPlatform.id] || '').trim()) } : null
  const lastEmail = emailLog[0]

  // Already-sent invoice: email what's saved (unsaved edits aren't included).
  async function emailSaved(kind, fields) {
    await sendInvoiceEmail({ invoiceId: invoice.id, kind, ...fields })
    setConfirm(null)
    setLogVersion(v => v + 1)
    setToast({ message: kind === 'reminder' ? `Reminder sent to ${fields.to}` : `Invoice emailed to ${fields.to}`, type: 'success' })
  }
  const saveLabel = saving ? 'Saving…' : isNew || status === 'draft' ? 'Save draft' : 'Save'

  const menuItems = [
    invoice && { label: dirty ? 'Download PDF (last saved)' : 'Download PDF', onClick: handleDownloadPdf, testId: 'invoice-pdf' },
    invoice && status === 'sent' && { label: 'Email invoice again', onClick: () => setConfirm('resend'), testId: 'invoice-resend' },
    invoice && { label: 'Duplicate as new draft', onClick: handleDuplicate, testId: 'invoice-duplicate' },
    invoice && status === 'draft' && payments.length === 0 && { label: 'Delete draft…', danger: true, onClick: () => setConfirm('delete'), testId: 'invoice-delete' },
    invoice && !isVoid && (status !== 'draft' || payments.length > 0) && { label: 'Void invoice…', danger: true, onClick: () => setConfirm('void'), testId: 'invoice-void' },
  ].filter(Boolean)

  const actionButtons = (
    <>
      <Button variant="secondary" onClick={() => save()} disabled={saving || (!dirty && !isNew)}>
        <span data-testid="invoice-save">{saveLabel}</span>
      </Button>
      {canSend && (
        <Button onClick={() => { const p = validate({ forSend: true }); setErrors(p); if (!p.length) setConfirm('send') }} disabled={saving}>
          <span data-testid="invoice-send">Send invoice</span>
        </Button>
      )}
      {canRemind && (
        <Button variant="secondary" onClick={() => setConfirm('remind')} disabled={saving}>
          <span data-testid="invoice-remind">Send reminder</span>
        </Button>
      )}
    </>
  )

  return (
    <div style={{ maxWidth: 1080, paddingBottom: narrow ? 88 : 0 }} className="space-y-5">
      <PageBreadcrumb crumbs={crumbs} />

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold" style={{ color: 'var(--text)', margin: 0 }} data-testid="invoice-title">
              {invoice ? `Invoice #${invoice.invoice_number}` : 'New invoice'}
            </h1>
            {invoice && <InvoiceStatusPill status={status} />}
            {invoice && !isVoid && (status === 'sent' || payments.length > 0) && <PaymentStatusPill status={paymentStatus} />}
            {overdue && <PaymentStatusPill status="unpaid" label="Overdue" />}
          </div>
          <p className="text-sm mt-1" style={{ margin: '4px 0 0', color: 'var(--text-muted)' }}>{subtitle}</p>
          {lastEmail && (
            <p className="text-xs" style={{ margin: '2px 0 0', color: 'var(--text-muted)' }} data-testid="invoice-email-log">
              {lastEmail.kind === 'reminder' ? 'Reminder emailed' : 'Emailed'} {formatInvoiceDate(lastEmail.sent_at)} to {lastEmail.sent_to}
              {emailLog.length > 1 ? ` · ${emailLog.length} emails sent` : ''}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2" style={{ position: 'relative' }}>
          {!narrow && actionButtons}
          {menuItems.length > 0 && (
            <>
              <button type="button" aria-label="More actions" aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)} data-testid="invoice-menu"
                className="p-2 rounded-lg" style={{ background: menuOpen ? 'var(--border)' : 'var(--surface-raised)', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'inline-flex' }}>
                <MoreHorizontal size={18} />
              </button>
              {menuOpen && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 30 }} onClick={() => setMenuOpen(false)} />
                  <div role="menu" style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 31, width: 220, padding: 6, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)', boxShadow: '0 10px 30px rgba(0,0,0,0.12)' }}>
                    {menuItems.map(item => (
                      <button key={item.testId} type="button" role="menuitem" onClick={() => { setMenuOpen(false); item.onClick() }} data-testid={item.testId}
                        className="w-full text-left text-sm rounded-lg" style={{ padding: '9px 10px', border: 'none', background: 'none', cursor: 'pointer', color: item.danger ? 'var(--danger)' : 'var(--text)' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-raised)' }} onMouseLeave={e => { e.currentTarget.style.background = 'none' }}>
                        {item.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </header>

      {payments.length > 0 && !isVoid && (
        <div role="status" className="flex items-start gap-2.5 px-4 py-3 rounded-xl text-sm"
          style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', color: 'var(--text)' }} data-testid="invoice-locked-banner">
          <Lock size={16} style={{ flexShrink: 0, marginTop: 2, color: '#6366f1' }} />
          <span>A payment has been logged, so the client, session, line items, tax and discount are locked. To change them, void this invoice and duplicate it as a new draft. The due date, Pay with and notes can still change.</span>
        </div>
      )}
      {isVoid && (
        <div role="status" className="flex items-start gap-2.5 px-4 py-3 rounded-xl text-sm"
          style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', color: 'var(--text)' }} data-testid="invoice-void-banner">
          <Lock size={16} style={{ flexShrink: 0, marginTop: 2, color: 'var(--text-muted)' }} />
          <span>This invoice is void. It's kept for your records and doesn't count toward what you're owed. Only the notes can change.</span>
        </div>
      )}

      {errors.length > 0 && (
        <div role="alert" className="px-4 py-3 rounded-xl text-sm" style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)', color: 'var(--danger)' }} data-testid="invoice-errors">
          {errors.length === 1 ? errors[0] : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>{errors.map(e => <li key={e}>{e}</li>)}</ul>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-start gap-5">
        {/* Main column */}
        <div className="flex flex-col gap-5" style={{ flex: '999 1 560px', minWidth: 0 }}>
          <LineItemsEditor
            lines={form.lines}
            onLinesChange={lines => setMoney({ lines })}
            catalog={catalog}
            locked={locked}
            totals={totals}
            discountRate={form.discount_rate}
            taxRate={form.tax_rate}
            onDiscountRate={v => setMoney({ discount_rate: v })}
            onTaxRate={v => setMoney({ tax_rate: v })}
            ratesInvalid={{ discount: parseRate(form.discount_rate) === null, tax: parseRate(form.tax_rate) === null }}
            paidCents={paidCents}
            templates={templates}
            onApplyTemplate={applyTemplate}
          />
          {(!isVoid || form.scheduleOn) && (
            <ScheduleEditor
              rows={form.schedule}
              onChange={schedule => set({ schedule })}
              totalCents={totals.total}
              enabled={form.scheduleOn}
              onToggle={on => set(on
                ? { scheduleOn: true, schedule: form.schedule.length ? rescaleToTotal(form.schedule, totals.total) : startSchedule(totals.total, form.due_date) }
                : { scheduleOn: false, schedule: [] })}
              canDisable={!form.schedule.some(r => r.allocatedCents > 0)}
              paidDates={paidDates}
              disabled={isVoid}
            />
          )}
        </div>

        {/* Side column */}
        <aside className="flex flex-col gap-5" style={{ flex: '1 1 300px', minWidth: 0, maxWidth: '100%' }}>
          <section aria-label="Balance" className="rounded-2xl px-5 py-4" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }} data-testid="invoice-balance">
            <div className="flex items-center justify-between">
              <p className="text-sm" style={{ margin: 0, color: 'var(--text-secondary)' }}>{isVoid ? 'Void' : 'Balance due'}</p>
              {!isVoid && <PaymentStatusPill status={paymentStatus} />}
            </div>
            <p className="text-3xl font-bold" style={{ margin: '6px 0 0', color: 'var(--text)', textDecoration: isVoid ? 'line-through' : 'none' }} data-testid="invoice-balance-amount">
              {formatCents(isVoid ? totals.total : balanceCents)}
            </p>
            {paidCents > 0 && totals.total > 0 && (
              <div role="img" aria-label={`${Math.round(Math.min(1, paidCents / totals.total) * 100)}% paid`} className="mt-3 rounded-full overflow-hidden" style={{ height: 6, background: 'var(--surface-raised)' }}>
                <div style={{ width: `${Math.min(100, (paidCents / totals.total) * 100)}%`, height: '100%', background: '#10b981' }} />
              </div>
            )}
            <p className="text-sm" style={{ margin: '8px 0 0', color: 'var(--text-muted)' }}>
              {paidCents > 0 ? `${formatCents(paidCents)} of ${formatCents(totals.total)} paid` : `Total ${formatCents(totals.total)}`}
              {!isVoid && paymentStatus !== 'paid' && nextDue ? ` · Next due ${formatInvoiceDate(nextDue)}` : ''}
            </p>
          </section>

          <Card title="Bill to" icon={payments.length > 0 ? <Lock size={13} style={{ color: 'var(--text-muted)' }} /> : null} testId="bill-to-card">
            <div className="px-5 py-4 space-y-4">
              <div>
                <p className="text-sm font-medium mb-1.5" style={{ margin: '0 0 6px', color: 'var(--text)' }}>Client</p>
                {locked ? (
                  <p className="text-sm" style={{ margin: 0, color: 'var(--text)' }} data-testid="bill-to-client">
                    {clientName || 'Deleted client'}{(client?.email || invoice?.client_email) && <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)' }}>{client?.email || invoice?.client_email}</span>}
                  </p>
                ) : (
                  <ClientPicker clients={clients} value={form.client_id} placeholder="Choose a client…"
                    onChange={cid => set({ client_id: cid || '', session_id: '' })} />
                )}
              </div>
              <div>
                <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }} htmlFor="invoice-session">Session</label>
                {locked ? (
                  <p className="text-sm" style={{ margin: 0, color: 'var(--text)' }}>{session ? `${session.name}${session.session_date ? ` · ${formatInvoiceDate(session.session_date)}` : ''}` : 'Standalone invoice'}</p>
                ) : (
                  <>
                    <select id="invoice-session" value={form.session_id} onChange={e => set({ session_id: e.target.value })} disabled={!form.client_id}
                      data-testid="invoice-session" style={{ ...inputStyle, cursor: form.client_id ? 'pointer' : 'not-allowed', opacity: form.client_id ? 1 : 0.6 }}>
                      <option value="">No session (standalone invoice)</option>
                      {clientSessions.map(s => <option key={s.id} value={s.id}>{s.name}{s.session_date ? ` · ${formatInvoiceDate(s.session_date)}` : ''}</option>)}
                      {form.session_id && !clientSessions.some(s => s.id === form.session_id) && <option value={form.session_id}>Current session</option>}
                    </select>
                    <p className="text-xs" style={{ margin: '6px 0 0', color: 'var(--text-muted)' }}>For a print order or anything without a session, leave this as No session.</p>
                  </>
                )}
              </div>
            </div>
          </Card>

          <Card title="Details" testId="details-card">
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }} htmlFor="invoice-due">Due date</label>
                <input id="invoice-due" type="date" value={form.due_date} onChange={e => set({ due_date: e.target.value })} disabled={isVoid}
                  data-testid="invoice-due" style={inputStyle} onFocus={focusBorder} onBlur={blurBorder} />
                {form.scheduleOn && <p className="text-xs" style={{ margin: '6px 0 0', color: 'var(--text-muted)' }}>With installments on, each one's own date drives reminders and Overdue.</p>}
              </div>
              <div>
                <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }} htmlFor="invoice-platform">Pay with</label>
                <select id="invoice-platform" value={form.payment_platform} onChange={e => set({ payment_platform: e.target.value })} disabled={isVoid}
                  data-testid="invoice-platform" style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="">None</option>
                  {platformOptions.map(p => <option key={p.id} value={p.id}>{p.label}{(links[p.id] || '').trim() ? '' : ' (no link)'}</option>)}
                </select>
                <p className="text-xs" style={{ margin: '6px 0 0', color: 'var(--text-muted)' }}>
                  Sets your client's Pay button. Links come from Account › Invoicing.
                </p>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }} htmlFor="invoice-notes">Notes for your client</label>
                <textarea id="invoice-notes" rows={3} value={form.notes} onChange={e => set({ notes: e.target.value })} data-testid="invoice-notes"
                  placeholder="e.g. Thank you! The first payment holds your date."
                  style={{ ...inputStyle, resize: 'vertical' }} onFocus={focusBorder} onBlur={blurBorder} />
              </div>
            </div>
          </Card>

          <Card title="Payments" testId="payments-card"
            action={invoice && !isVoid && (
              <button type="button" onClick={() => (dirty ? setErrors(['Save your changes before logging a payment.']) : setPaymentModal({}))}
                data-testid="log-payment" className="flex items-center gap-1.5 text-xs font-semibold px-3 rounded-lg"
                style={{ height: 30, background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer' }}>
                <Plus size={13} />Log payment
              </button>
            )}>
            {payments.length === 0 ? (
              <div className="px-5 py-5 text-center">
                <p className="text-sm font-medium" style={{ margin: 0, color: 'var(--text)' }}>No payments yet</p>
                <p className="text-xs" style={{ margin: '4px 0 0', color: 'var(--text-muted)' }}>
                  {invoice ? 'Logging the first payment locks the line items, tax and discount.' : 'Save the invoice first, then log payments here.'}
                </p>
              </div>
            ) : (
              <>
                {payments.map((p, i) => (
                  <div key={p.id} data-testid="payment-row" style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                    <div className="flex items-center gap-3 px-5 py-3">
                      <span className="flex items-center justify-center shrink-0 rounded-full" style={{ width: 32, height: 32, background: 'rgba(16,185,129,0.1)', color: '#10b981' }}><Check size={15} /></span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium" style={{ margin: 0, color: 'var(--text)' }}>{formatCents(Math.round(Number(p.amount) * 100))}{p.method ? ` · ${platformLabel(p.method)}` : ''}</p>
                        <p className="text-xs truncate" style={{ margin: '2px 0 0', color: 'var(--text-muted)' }}>{formatInvoiceDate(p.paid_date)}{p.note ? ` · ${p.note}` : ''}</p>
                      </div>
                      {!isVoid && (
                        <>
                          <button type="button" aria-label={`Edit payment from ${formatInvoiceDate(p.paid_date)}`} onClick={() => setPaymentModal({ payment: p })}
                            className="p-1.5 rounded-lg" style={{ background: 'var(--surface-raised)', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'inline-flex' }}><Pencil size={13} /></button>
                          <button type="button" aria-label={`Delete payment from ${formatInvoiceDate(p.paid_date)}`} onClick={() => setConfirmDeletePaymentId(confirmDeletePaymentId === p.id ? null : p.id)}
                            className="p-1.5 rounded-lg" style={{ background: confirmDeletePaymentId === p.id ? 'var(--danger-subtle)' : 'var(--surface-raised)', border: 'none', cursor: 'pointer', color: confirmDeletePaymentId === p.id ? 'var(--danger)' : 'var(--text-muted)', display: 'inline-flex' }}><Trash2 size={13} /></button>
                        </>
                      )}
                    </div>
                    {confirmDeletePaymentId === p.id && (
                      <div className="px-5 pb-3">
                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)' }}>
                          <p className="text-xs flex-1 font-medium" style={{ margin: 0, color: 'var(--danger)' }}>
                            Delete this payment?{payments.length === 1 ? ' The invoice will unlock.' : ''}
                          </p>
                          <button type="button" onClick={() => handleDeletePayment(p.id)} className="text-xs px-2.5 py-1 rounded-lg font-medium" style={{ background: 'var(--danger)', color: '#fff', border: 'none', cursor: 'pointer' }}>Delete</button>
                          <button type="button" onClick={() => setConfirmDeletePaymentId(null)} className="text-xs px-2.5 py-1 rounded-lg font-medium" style={{ background: 'var(--surface-raised)', color: 'var(--text)', border: 'none', cursor: 'pointer' }}>Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </Card>
        </aside>
      </div>

      {narrow && (
        <div className="flex gap-2.5" style={{ position: 'fixed', left: 0, right: 0, bottom: 'calc(56px + env(safe-area-inset-bottom))', zIndex: 20, padding: '10px 16px', borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
          {actionButtons}
        </div>
      )}

      {confirm === 'send' && (
        <SendInvoiceModal
          kind="invoice"
          title={`Send invoice${invoice ? ` #${invoice.invoice_number}` : ''}`}
          intro={`${clientName || 'Your client'} will be able to see it, and its line items can still change until a payment is logged. A sent invoice can't go back to draft, but it can be voided.${invoice ? '' : ' The invoice number is filled in when it saves.'}`}
          clientEmail={client?.email || ''}
          ctx={emailCtx}
          payInfo={emailPayInfo}
          hasPortal={Boolean(client?.portal_token)}
          onSend={async fields => {
            const savedId = await save({
              send: true,
              afterSave: async newId => {
                await sendInvoiceEmail({ invoiceId: newId, kind: 'invoice', ...fields })
                return `Invoice sent and emailed to ${fields.to}`
              },
            })
            if (!savedId) throw new Error("The invoice couldn't be saved. See the problems on the page.")
            setConfirm(null)
          }}
          onMarkSent={async () => {
            const savedId = await save({ send: true })
            if (!savedId) throw new Error("The invoice couldn't be saved. See the problems on the page.")
            setConfirm(null)
          }}
          onClose={() => setConfirm(null)}
        />
      )}
      {(confirm === 'resend' || confirm === 'remind') && invoice && (
        <SendInvoiceModal
          kind={confirm === 'remind' ? 'reminder' : 'invoice'}
          title={confirm === 'remind' ? `Payment reminder for invoice #${invoice.invoice_number}` : `Email invoice #${invoice.invoice_number}`}
          intro={dirty ? 'You have unsaved changes on this page. The email uses the last saved version, so save first if they should be included.' : null}
          clientEmail={client?.email || invoice.client_email || ''}
          ctx={emailCtx}
          payInfo={emailPayInfo}
          hasPortal={Boolean(client?.portal_token)}
          onSend={fields => emailSaved(confirm === 'remind' ? 'reminder' : 'invoice', fields)}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm === 'void' && (
        <Modal title={`Void invoice #${invoice.invoice_number}?`} onClose={() => setConfirm(null)} size="sm">
          <p className="text-sm" style={{ margin: 0, color: 'var(--text)' }}>
            It stays in your records{payments.length ? ` with its ${payments.length === 1 ? 'payment' : 'payments'}` : ''} but stops counting toward what you're owed, and can't be changed afterwards. To reissue it, use Duplicate as new draft.
            {dirty && ' Unsaved changes on this page will be discarded.'}
          </p>
          <div className="flex gap-3 mt-5">
            <Button variant="danger" onClick={handleVoid} disabled={saving}><span data-testid="invoice-void-confirm">Void invoice</span></Button>
            <Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button>
          </div>
        </Modal>
      )}
      {confirm === 'delete' && (
        <Modal title={`Delete draft #${invoice.invoice_number}?`} onClose={() => setConfirm(null)} size="sm">
          <p className="text-sm" style={{ margin: 0, color: 'var(--text)' }}>This can't be undone. The number #{invoice.invoice_number} won't be reused.</p>
          <div className="flex gap-3 mt-5">
            <Button variant="danger" onClick={handleDelete} disabled={saving}><span data-testid="invoice-delete-confirm">Delete draft</span></Button>
            <Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button>
          </div>
        </Modal>
      )}

      {paymentModal && (
        <LogPaymentModal
          title={paymentModal.payment ? 'Edit payment' : 'Log payment'}
          subtitle={`Invoice #${invoice.invoice_number}${clientName ? ` · ${clientName}` : ''} · Balance ${formatCents(balanceCents)}`}
          payment={paymentModal.payment}
          suggestions={suggestions}
          defaultMethod={form.payment_platform}
          firstPayment={payments.length === 0}
          balanceCents={balanceCents}
          onSave={savePayment}
          onClose={() => setPaymentModal(null)}
        />
      )}

      {toast && (
        <div style={{ position: 'fixed', right: 16, bottom: narrow ? 150 : 24, zIndex: 60, maxWidth: 360 }}>
          <Toast message={toast.message} type={toast.type} onDismiss={dismissToast} />
        </div>
      )}

    </div>
  )
}
