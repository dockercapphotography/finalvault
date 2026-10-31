import { useState } from 'react'
import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from 'lucide-react'
import SettingsSection from '../ui/SettingsSection.jsx'
import Input from '../ui/Input.jsx'
import Toggle from '../ui/Toggle.jsx'
import TemplateEditorModal from '../TemplateEditorModal.jsx'
import { useTemplateCollection } from '../../hooks/useTemplateCollection.js'
import {
  getInvoiceCatalogItems, createInvoiceCatalogItem, updateInvoiceCatalogItem,
  setInvoiceCatalogItemActive, deleteInvoiceCatalogItem,
  formatUnitPrice, parseMoneyInput,
} from '../../utils/invoiceApi.js'

// ── Invoice Catalog (v1.6.0) ─────────────────────────────────────────────
// Reusable services and fees that pre-fill invoice lines. Same list +
// TemplateEditorModal pattern as the other Account → Templates sections.
// An item that has never been put on an invoice can be deleted; one that
// has can only be archived (hidden from the invoice picker, restorable),
// which the database also enforces (sql/109).

const EMPTY_FORM = { name: '', description: '', price: '', unit: '', taxable: true }

const BADGE = {
  taxable: { label: 'Taxable', background: 'rgba(99,102,241,0.1)', color: '#6366f1' },
  nonTaxable: { label: 'Non-taxable', background: 'var(--surface-raised)', color: 'var(--text-muted)' },
  archived: { label: 'Archived', background: 'var(--surface-raised)', color: 'var(--text-muted)' },
}

function Badge({ kind }) {
  const b = BADGE[kind]
  return (
    <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full shrink-0"
      style={{ background: b.background, color: b.color }}>{b.label}</span>
  )
}

const iconButton = { background: 'var(--surface-raised)', cursor: 'pointer', border: 'none' }

export default function InvoiceCatalogSection({ onSaveState }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [showArchived, setShowArchived] = useState(false)
  const [blockedDeleteId, setBlockedDeleteId] = useState(null)
  const {
    templates: items, setTemplates: setItems, loaded, editing, confirmDeleteId, saving,
    startNew, startEdit, cancelEdit, save, setConfirmDeleteId,
  } = useTemplateCollection(
    {
      get: getInvoiceCatalogItems,
      create: createInvoiceCatalogItem,
      update: updateInvoiceCatalogItem,
      remove: deleteInvoiceCatalogItem,
    },
    onSaveState
  )

  function openNew() {
    setForm(EMPTY_FORM)
    startNew()
  }
  function openEdit(item) {
    setForm({
      name: item.name || '',
      description: item.description || '',
      price: item.default_unit_price != null ? String(Number(item.default_unit_price).toFixed(2)) : '',
      unit: item.unit_label || '',
      taxable: item.taxable_default !== false,
    })
    startEdit(item)
  }

  const price = parseMoneyInput(form.price)
  const canSave = Boolean(form.name.trim()) && price !== null

  function handleSave() {
    save({
      name: form.name,
      description: form.description,
      defaultUnitPrice: price,
      unitLabel: form.unit,
      taxableDefault: form.taxable,
    })
  }

  async function setActive(item, active) {
    try {
      const updated = await setInvoiceCatalogItemActive(item.id, active)
      setItems(prev => prev.map(i => i.id === item.id ? updated : i))
      setBlockedDeleteId(null)
      onSaveState?.('saved')
    } catch {
      onSaveState?.('error')
    }
  }

  async function handleDelete(item) {
    try {
      await deleteInvoiceCatalogItem(item.id)
      setItems(prev => prev.filter(i => i.id !== item.id))
      setConfirmDeleteId(null)
      onSaveState?.('saved')
    } catch {
      // Put on an invoice since the list loaded (or the count was stale):
      // the database refused, so offer Archive instead.
      setConfirmDeleteId(null)
      setBlockedDeleteId(item.id)
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, use_count: Math.max(1, i.use_count) } : i))
    }
  }

  const archivedCount = items.filter(i => !i.active).length
  const visible = items.filter(i => showArchived || i.active)

  return (
    <>
      <SettingsSection
        title="Invoice Catalog"
        description="Services and fees you bill for. Pick one on an invoice to fill in the line; you can still change it there."
        action={
          <button onClick={openNew} data-testid="catalog-new-item"
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg"
            style={{ background: '#6366f1', color: '#fff', cursor: 'pointer', border: 'none' }}>
            <Plus size={14} />New Item
          </button>
        }>
        {!loaded ? null : visible.length === 0 ? (
          <div className="py-12 text-center" style={{ background: 'var(--surface)' }}>
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>No catalog items</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Add the services you bill for so they're one click away on an invoice</p>
          </div>
        ) : (
          <div style={{ background: 'var(--surface)' }} data-testid="catalog-list">
            {visible.map((item, i) => (
              <div key={item.id} data-testid="catalog-item" data-name={item.name}>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-5 py-4"
                  style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none', background: 'var(--surface)', opacity: item.active ? 1 : 0.6 }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{item.name}</p>
                      <p className="text-sm" style={{ color: 'var(--text-secondary, var(--text-muted))' }}>
                        {formatUnitPrice(item.default_unit_price, item.unit_label)}
                      </p>
                      <Badge kind={item.taxable_default ? 'taxable' : 'nonTaxable'} />
                      {!item.active && <Badge kind="archived" />}
                    </div>
                    {item.description && (
                      <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{item.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                    <button onClick={() => openEdit(item)} title="Edit" aria-label={`Edit ${item.name}`}
                      className="p-1.5 rounded-lg" style={iconButton}>
                      <Pencil size={13} style={{ color: 'var(--text-muted)' }} />
                    </button>
                    {!item.active ? (
                      <button onClick={() => setActive(item, true)} title="Restore" aria-label={`Restore ${item.name}`}
                        className="p-1.5 rounded-lg" style={iconButton}>
                        <ArchiveRestore size={13} style={{ color: 'var(--text-muted)' }} />
                      </button>
                    ) : item.use_count > 0 ? (
                      <button onClick={() => setActive(item, false)} aria-label={`Archive ${item.name}`}
                        title="Archive (it's on an invoice, so it can't be deleted)"
                        className="p-1.5 rounded-lg" style={iconButton}>
                        <Archive size={13} style={{ color: 'var(--text-muted)' }} />
                      </button>
                    ) : (
                      <button onClick={() => setConfirmDeleteId(confirmDeleteId === item.id ? null : item.id)}
                        title="Delete" aria-label={`Delete ${item.name}`} className="p-1.5 rounded-lg"
                        style={{ ...iconButton, background: confirmDeleteId === item.id ? 'var(--danger-subtle)' : 'var(--surface-raised)' }}>
                        <Trash2 size={13} style={{ color: confirmDeleteId === item.id ? 'var(--danger)' : 'var(--text-muted)' }} />
                      </button>
                    )}
                  </div>
                </div>

                {confirmDeleteId === item.id && (
                  <div className="px-5 py-4" style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)' }}>
                      <p className="text-xs flex-1 font-medium" style={{ color: 'var(--danger)' }}>Delete "{item.name}"?</p>
                      <button onClick={() => handleDelete(item)} className="text-xs px-2.5 py-1 rounded-lg font-medium" style={{ background: 'var(--danger)', color: '#fff', cursor: 'pointer', border: 'none' }}>Delete</button>
                      <button onClick={() => setConfirmDeleteId(null)} className="text-xs px-2.5 py-1 rounded-lg font-medium" style={{ background: 'var(--surface-raised)', color: 'var(--text)', cursor: 'pointer', border: 'none' }}>Cancel</button>
                    </div>
                  </div>
                )}

                {blockedDeleteId === item.id && item.active && (
                  <div className="px-5 py-4" style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)' }}>
                      <p className="text-xs flex-1" style={{ color: 'var(--text)' }}>"{item.name}" is on an invoice, so it can't be deleted. Archive it to hide it from new invoices.</p>
                      <button onClick={() => setActive(item, false)} className="text-xs px-2.5 py-1 rounded-lg font-medium" style={{ background: '#6366f1', color: '#fff', cursor: 'pointer', border: 'none' }}>Archive</button>
                      <button onClick={() => setBlockedDeleteId(null)} className="text-xs px-2.5 py-1 rounded-lg font-medium" style={{ background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', border: '1px solid var(--border)' }}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {loaded && archivedCount > 0 && (
          <div className="px-5 py-3" style={{ background: 'var(--surface)' }}>
            <button onClick={() => setShowArchived(s => !s)} data-testid="catalog-toggle-archived"
              className="text-xs font-medium" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--accent, #6366f1)' }}>
              {showArchived ? 'Hide archived' : `Show archived (${archivedCount})`}
            </button>
          </div>
        )}
      </SettingsSection>

      {editing !== null && (
        <TemplateEditorModal
          title={editing?.id ? 'Edit Catalog Item' : 'New Catalog Item'}
          saveLabel="Save Item"
          saving={saving}
          canSave={canSave}
          onSave={handleSave}
          onClose={cancelEdit}
        >
          <Input label="Name" required value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))}
            placeholder="e.g. Engagement Session" />
          <Input label="Description" type="textarea" value={form.description}
            onChange={v => setForm(f => ({ ...f, description: v }))}
            placeholder="Shown to the client under the line on the invoice" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Default price ($)" required type="number" step="0.01" value={form.price}
              onChange={v => setForm(f => ({ ...f, price: v }))} placeholder="0.00"
              error={form.price !== '' && price === null ? 'Enter an amount like 350 or 0.65' : ''} />
            <Input label="Unit" value={form.unit} onChange={v => setForm(f => ({ ...f, unit: v }))}
              placeholder="e.g. mi, hr" hint="Leave blank for a flat price" />
          </div>
          {price !== null && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Shows on invoices as <span style={{ color: 'var(--text)', fontWeight: 600 }}>{formatUnitPrice(price, form.unit)}</span>
            </p>
          )}
          <Toggle checked={form.taxable} onChange={v => setForm(f => ({ ...f, taxable: v }))}
            label="Taxable by default"
            description="Taxed when the invoice has a tax rate. You can change it on each invoice line."
            testId="catalog-taxable" />
        </TemplateEditorModal>
      )}
    </>
  )
}
