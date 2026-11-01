import { useEffect, useState } from 'react'
import { Paperclip, Link2, CreditCard } from 'lucide-react'
import Modal from '../ui/Modal.jsx'
import Button from '../ui/Button.jsx'
import { inputStyle, focusBorder, blurBorder } from './invoiceUi.jsx'
import {
  BUILT_IN_INVOICE_EMAILS, getInvoiceEmailTemplates, getSenderNames, resolveInvoiceEmail,
} from '../../utils/invoiceEmailApi.js'

// ── Send invoice / Send reminder dialog (v1.6.0 step 9) ──────────────────
// To (the client's email, editable for this send only), template, subject
// and message with variables already filled in (what you see is what's
// sent), and whether to attach the PDF. The email itself always adds the
// invoice summary, the Pay button and -- for clients with a portal -- a
// View online button; the lines under the message say which apply.
//
// kind       : 'invoice' | 'reminder'
// ctx        : variable values (formatted strings) except the studio /
//              photographer names, which are loaded here
// payInfo    : { label, hasLink } | null -- the invoice's payment platform
// hasPortal  : the client already has a portal link
// onSend     : ({ to, subject, message, attachPdf }) => Promise
// onMarkSent : () => Promise -- invoice kind only: send without emailing

const BUILT_IN = 'built-in'

export default function SendInvoiceModal({
  kind, title, intro, clientEmail, ctx, payInfo, hasPortal, onSend, onMarkSent, onClose,
}) {
  const [templates, setTemplates] = useState(null)
  const [names, setNames] = useState(null)
  const [templateId, setTemplateId] = useState(null)
  const [to, setTo] = useState(clientEmail || '')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [attachPdf, setAttachPdf] = useState(true)
  const [busy, setBusy] = useState(null) // 'send' | 'mark' | null
  const [error, setError] = useState(null)

  const fullCtx = { ...ctx, ...(names || {}) }

  function fill(id, list = templates, nameValues = names) {
    const t = id === BUILT_IN ? BUILT_IN_INVOICE_EMAILS[kind] : list.find(x => x.id === id)
    const values = { ...ctx, ...(nameValues || {}) }
    setTemplateId(id)
    setSubject(resolveInvoiceEmail(t.subject, values))
    setMessage(resolveInvoiceEmail(t.body, values))
  }

  useEffect(() => {
    let cancelled = false
    Promise.all([
      getInvoiceEmailTemplates(kind).catch(() => []),
      getSenderNames().catch(() => ({ studio_name: '', photographer_name: '' })),
    ]).then(([list, nameValues]) => {
      if (cancelled) return
      setTemplates(list)
      setNames(nameValues)
      const initial = list.find(t => t.is_default)?.id || BUILT_IN
      fill(initial, list, nameValues)
    })
    return () => { cancelled = true }
    // Runs once per open; ctx is fixed while the dialog is up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind])

  const toValid = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/.test(to.trim())
  const canSend = templates !== null && toValid && subject.trim() && !busy

  async function handleSend() {
    setBusy('send')
    setError(null)
    try {
      await onSend({ to: to.trim(), subject: subject.trim(), message, attachPdf })
    } catch (err) {
      setError(err.message || "The email couldn't be sent.")
      setBusy(null)
    }
  }

  async function handleMarkSent() {
    setBusy('mark')
    setError(null)
    try {
      await onMarkSent()
    } catch (err) {
      setError(err.message || 'Something went wrong.')
      setBusy(null)
    }
  }

  const label = text => <span className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>{text}</span>

  return (
    <Modal title={title} onClose={busy ? () => {} : onClose} size="md">
      <div className="space-y-4" data-testid="send-invoice-modal">
        {intro && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{intro}</p>}

        <label className="block">
          {label('To')}
          <input type="email" value={to} onChange={e => setTo(e.target.value)} style={{ ...inputStyle, borderColor: to && !toValid ? 'var(--danger)' : 'var(--border)' }}
            onFocus={focusBorder} onBlur={e => { e.target.style.borderColor = to && !toValid ? 'var(--danger)' : 'var(--border)' }}
            placeholder="client@example.com" data-testid="send-invoice-to" />
          <span className="block text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            {clientEmail && to.trim() !== clientEmail ? "Only for this email; the client's saved address doesn't change." : clientEmail ? "The client's email. Change it here for this email only." : 'This client has no email saved. Add one here for this email.'}
          </span>
        </label>

        {templates === null ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
          </div>
        ) : (
          <>
            <label className="block">
              {label('Template')}
              <select value={templateId || BUILT_IN} onChange={e => fill(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}
                onFocus={focusBorder} onBlur={blurBorder} data-testid="send-invoice-template">
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}{t.is_default ? ' (default)' : ''}</option>)}
                <option value={BUILT_IN}>Built-in message</option>
              </select>
            </label>

            <label className="block">
              {label('Subject')}
              <input value={subject} onChange={e => setSubject(e.target.value)} maxLength={200} style={inputStyle}
                onFocus={focusBorder} onBlur={blurBorder} data-testid="send-invoice-subject" />
            </label>

            <label className="block">
              {label('Message')}
              <textarea value={message} onChange={e => setMessage(e.target.value)} rows={8} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
                onFocus={focusBorder} onBlur={blurBorder} data-testid="send-invoice-message" />
              <span className="block text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                **bold** and *italic* work. Templates live in Account → Templates.
              </span>
            </label>

            <div className="rounded-xl px-3.5 py-3 space-y-1.5" style={{ background: 'var(--surface-raised)' }}>
              <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Below your message, the email includes</p>
              <p className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                <CreditCard size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                {!payInfo ? 'The invoice summary. No payment platform is chosen on this invoice, so there\'s no Pay button.'
                  : payInfo.hasLink ? `The invoice summary and a Pay with ${payInfo.label} button for ${fullCtx.amount_due || 'the amount due'}.`
                  : `The invoice summary. Your ${payInfo.label} link is empty in Account → Invoicing, so there's no Pay button.`}
              </p>
              <p className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                <Link2 size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                {hasPortal ? 'A View invoice online button to their client portal.' : 'No portal button: this client has no portal link (the PDF and Pay button cover it).'}
              </p>
              <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                <input type="checkbox" checked={attachPdf} onChange={e => setAttachPdf(e.target.checked)} data-testid="send-invoice-attach" />
                <Paperclip size={13} />Attach the invoice as a PDF
              </label>
            </div>
          </>
        )}

        {error && <p className="text-sm" style={{ color: 'var(--danger)' }} data-testid="send-invoice-error">{error}</p>}

        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          {onMarkSent && (
            <button type="button" onClick={handleMarkSent} disabled={Boolean(busy)} data-testid="send-invoice-mark-sent"
              className="text-sm mr-auto" style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-secondary)', cursor: busy ? 'default' : 'pointer', textDecoration: 'underline' }}>
              {busy === 'mark' ? 'Saving…' : 'Mark as sent without emailing'}
            </button>
          )}
          <Button variant="secondary" onClick={onClose} disabled={Boolean(busy)}>Cancel</Button>
          <Button onClick={handleSend} disabled={!canSend}>
            <span data-testid="send-invoice-send">{busy === 'send' ? 'Sending…' : kind === 'reminder' ? 'Send reminder' : 'Send invoice'}</span>
          </Button>
        </div>
      </div>
    </Modal>
  )
}
