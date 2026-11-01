import { useState } from 'react'
import { Copy, Pencil, Plus, Star, Trash2 } from 'lucide-react'
import SettingsSection from '../ui/SettingsSection.jsx'
import TemplateEditorModal from '../TemplateEditorModal.jsx'
import { useTemplateCollection } from '../../hooks/useTemplateCollection.js'
import {
  INVOICE_EMAIL_KINDS, INVOICE_EMAIL_VARIABLES, BUILT_IN_INVOICE_EMAILS,
  getInvoiceEmailTemplates, createInvoiceEmailTemplate, updateInvoiceEmailTemplate,
  deleteInvoiceEmailTemplate, duplicateInvoiceEmailTemplate, setDefaultInvoiceEmailTemplate,
} from '../../utils/invoiceEmailApi.js'

// ── Account -> Templates: Invoice Emails / Payment Reminders (v1.6.0) ────
// Same layout as Review Request Templates. kind = 'invoice' | 'reminder';
// the star picks the template pre-selected in the Send dialog (one per
// kind). The invoice summary, Pay button, portal button and PDF are always
// added by the email itself, so templates are just the personal message.

function DeleteConfirmRow({ label, onConfirm, onCancel }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)' }}>
      <p className="text-xs flex-1 font-medium" style={{ color: 'var(--danger)' }}>Delete {label}?</p>
      <button onClick={onConfirm} className="text-xs px-2.5 py-1 rounded-lg font-medium" style={{ background: 'var(--danger)', color: '#fff', cursor: 'pointer' }}>Delete</button>
      <button onClick={onCancel} className="text-xs px-2.5 py-1 rounded-lg font-medium" style={{ background: 'var(--surface-raised)', color: 'var(--text)', cursor: 'pointer' }}>Cancel</button>
    </div>
  )
}

const COPY = {
  invoice: {
    description: 'The message sent with a new invoice. The invoice summary, a Pay button, the PDF and (for clients with a portal) a View online button are always added below it.',
    emptyHint: 'Without one, invoices use a short built-in message you can edit before sending',
    namePlaceholder: 'e.g. Wedding invoice',
  },
  reminder: {
    description: "A nudge for an unpaid invoice. Sent from the invoice's Send reminder button, with the same summary, Pay button and PDF.",
    emptyHint: 'Without one, reminders use a short built-in message you can edit before sending',
    namePlaceholder: 'e.g. Friendly reminder',
  },
}

export default function InvoiceEmailTemplatesSection({ kind, onSaveState }) {
  const meta = INVOICE_EMAIL_KINDS[kind]
  const copy = COPY[kind]
  const builtIn = BUILT_IN_INVOICE_EMAILS[kind]
  const [fields, setFields] = useState({ name: '', subject: '', body: '' })
  const [defaultOverride, setDefaultOverride] = useState(undefined)
  const {
    templates, loaded, editing, confirmDeleteId, saving,
    startNew, startEdit, cancelEdit, save, handleDuplicate, handleDelete, setConfirmDeleteId,
  } = useTemplateCollection(
    {
      get: () => getInvoiceEmailTemplates(kind),
      create: f => createInvoiceEmailTemplate(kind, f),
      update: updateInvoiceEmailTemplate,
      remove: deleteInvoiceEmailTemplate,
      duplicate: duplicateInvoiceEmailTemplate,
    },
    onSaveState
  )

  // A new template starts from the built-in message, so it's easy to tweak.
  function openNew() {
    setFields({ name: '', subject: builtIn.subject, body: builtIn.body })
    startNew()
  }
  function openEdit(t) {
    setFields({ name: t.name || '', subject: t.subject || '', body: t.body || '' })
    startEdit(t)
  }

  const defaultId = defaultOverride !== undefined ? defaultOverride : (templates.find(t => t.is_default)?.id ?? null)

  async function toggleDefault(t) {
    const next = defaultId === t.id ? null : t.id
    try {
      await setDefaultInvoiceEmailTemplate(kind, next)
      setDefaultOverride(next)
      onSaveState?.('saved')
    } catch {
      onSaveState?.('error')
    }
  }

  const FORM_FIELDS = [
    { key: 'name', label: 'Template Name', placeholder: copy.namePlaceholder, required: true },
    { key: 'subject', label: 'Subject', placeholder: builtIn.subject, required: true, acceptsVariables: true },
    { key: 'body', label: 'Message', type: 'markdown', placeholder: builtIn.body, rows: 9 },
  ]
  const canSave = fields.name.trim() && fields.subject.trim() && fields.body.trim()

  return (
    <>
      <SettingsSection
        title={meta.label}
        description={copy.description}
        action={
          <button onClick={openNew} data-testid={`invoice-email-new-${kind}`} className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg"
            style={{ background: '#6366f1', color: '#fff', cursor: 'pointer', border: 'none' }}>
            <Plus size={14} />New Template
          </button>
        }>
        {!loaded ? null : templates.length === 0 ? (
          <div className="py-12 text-center" style={{ background: 'var(--surface)' }}>
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>No templates yet</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{copy.emptyHint}</p>
          </div>
        ) : (
          <div style={{ background: 'var(--surface)' }}>
            {templates.map((t, i) => {
              const isDefault = defaultId === t.id
              return (
                <div key={t.id}>
                  <div className="flex items-center justify-between px-5 py-4" style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none', background: 'var(--surface)' }}>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
                        {t.name}
                        {isDefault && (
                          <span className="text-xs font-semibold ml-2 px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}>Default</span>
                        )}
                      </p>
                      <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{t.subject}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-4 shrink-0">
                      <button onClick={() => toggleDefault(t)} title={isDefault ? 'Default template (click to clear)' : 'Set as default'} className="p-1.5 rounded-lg"
                        style={{ background: isDefault ? 'rgba(99,102,241,0.1)' : 'var(--surface-raised)', cursor: 'pointer', border: 'none' }}>
                        <Star size={13} style={{ color: isDefault ? '#6366f1' : 'var(--text-muted)' }} fill={isDefault ? '#6366f1' : 'none'} />
                      </button>
                      <button onClick={() => handleDuplicate(t)} title="Duplicate" className="p-1.5 rounded-lg" style={{ background: 'var(--surface-raised)', cursor: 'pointer', border: 'none' }}>
                        <Copy size={13} style={{ color: 'var(--text-muted)' }} />
                      </button>
                      <button onClick={() => openEdit(t)} title="Edit" className="p-1.5 rounded-lg" style={{ background: 'var(--surface-raised)', cursor: 'pointer' }}>
                        <Pencil size={13} style={{ color: 'var(--text-muted)' }} />
                      </button>
                      <button onClick={() => setConfirmDeleteId(confirmDeleteId === t.id ? null : t.id)} className="p-1.5 rounded-lg"
                        style={{ background: confirmDeleteId === t.id ? 'var(--danger-subtle)' : 'var(--surface-raised)', cursor: 'pointer' }}>
                        <Trash2 size={13} style={{ color: confirmDeleteId === t.id ? 'var(--danger)' : 'var(--text-muted)' }} />
                      </button>
                    </div>
                  </div>
                  {confirmDeleteId === t.id && (
                    <div className="px-5 py-4" style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
                      <DeleteConfirmRow label={`"${t.name}"`} onConfirm={() => handleDelete(t.id)} onCancel={() => setConfirmDeleteId(null)} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </SettingsSection>

      {editing !== null && (
        <TemplateEditorModal
          title={editing?.id ? 'Edit Template' : `New ${meta.noun.replace(/^./, c => c.toUpperCase())} Template`}
          fields={FORM_FIELDS}
          values={fields}
          onChange={(key, value) => setFields(f => ({ ...f, [key]: value }))}
          variables={INVOICE_EMAIL_VARIABLES}
          saving={saving}
          canSave={canSave}
          onSave={() => save(fields)}
          onClose={cancelEdit}
        />
      )}
    </>
  )
}
