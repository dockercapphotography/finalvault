import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { GripVertical, Plus, Search, Trash2 } from 'lucide-react'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import Modal from '../ui/Modal.jsx'
import { Card, MoneyInput, LockIcon, inputStyle, smallInputStyle, focusBorder, blurBorder } from './invoiceUi.jsx'
import { formatCents, formatUnitPrice, centsToInput, parseQuantity, toCents } from '../../utils/invoiceApi.js'

// ── Line items + totals (v1.6.0) ─────────────────────────────────────────
// Each line leads with its name and description; quantity, price and the
// Taxed box sit underneath. Lines are reordered by their grip (mouse,
// touch, or keyboard: Space to pick up, arrows, Space to drop).

let lineSeq = 0
export function newLineKey() {
  lineSeq += 1
  return `line-${Date.now()}-${lineSeq}`
}

function autoGrow(el) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight + 2}px`
}

function SortableLine({ line, index, total, onChange, onRemove, focusField }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: line.key })
  const descRef = useRef(null)
  useEffect(() => { autoGrow(descRef.current) }, [line.description])

  const qtyInvalid = line.quantity !== '' && parseQuantity(line.quantity) === null
  const priceInvalid = line.unit_price !== '' && toCents(line.unit_price) === null
  const name = line.title.trim() || `line ${index + 1}`

  return (
    <div ref={setNodeRef} data-testid="line-item"
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1, background: 'var(--surface)', borderTop: index > 0 ? '1px solid var(--border)' : 'none', position: 'relative', zIndex: isDragging ? 2 : 'auto' }}>
      <div className="flex gap-3 px-5 py-4">
        <button type="button" ref={setActivatorNodeRef} {...attributes} {...listeners} aria-label={`Reorder ${name}`}
          className="shrink-0 rounded-md" style={{ marginTop: 10, width: 20, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'grab', color: 'var(--text-muted)', touchAction: 'none' }}>
          <GripVertical size={16} />
        </button>

        <div className="flex-1 min-w-0 flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <input value={line.title} onChange={e => onChange({ title: e.target.value })} aria-label="Item name" placeholder="Item name"
              data-testid="line-title"
              style={{ ...inputStyle, flex: 1, minWidth: 0, fontSize: 16, fontWeight: 600, padding: '9px 12px', borderColor: line.title.trim() ? 'var(--border)' : 'var(--danger)' }}
              onFocus={focusBorder} onBlur={e => { e.target.style.borderColor = line.title.trim() ? 'var(--border)' : 'var(--danger)' }} />
            {line.catalog_item_id && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}>Catalog</span>
            )}
          </div>
          <textarea ref={descRef} value={line.description} rows={1} aria-label={`Description for ${name}`} placeholder="Description (optional, shown to your client)"
            onChange={e => { onChange({ description: e.target.value }); autoGrow(e.target) }}
            data-testid="line-description"
            style={{ ...inputStyle, fontSize: 14, lineHeight: 1.5, color: 'var(--text-secondary)', resize: 'none', overflow: 'hidden' }}
            onFocus={focusBorder} onBlur={blurBorder} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>Qty
              <input inputMode="decimal" value={line.quantity} onChange={e => onChange({ quantity: e.target.value })}
                data-testid="line-qty"
                style={{ ...smallInputStyle, width: 64, textAlign: 'right', borderColor: qtyInvalid ? 'var(--danger)' : 'var(--border)' }} />
            </label>
            <span aria-hidden="true" className="text-sm" style={{ color: 'var(--text-muted)' }}>×</span>
            <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>Price
              <MoneyInput small width={124} value={line.unit_price} onChange={v => onChange({ unit_price: v })}
                ariaLabel={`Price for ${name}`} testId="line-price" invalid={priceInvalid} />
              {line.unit_label && <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>/ {line.unit_label}</span>}
            </label>
            <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={line.taxable} onChange={e => onChange({ taxable: e.target.checked })}
                data-testid="line-taxable" style={{ width: 16, height: 16, accentColor: '#6366f1' }} />Taxed
            </label>
          </div>
          {focusField && <FocusNewLine field={focusField} />}
        </div>

        <div className="shrink-0 flex flex-col items-end gap-2.5" style={{ minWidth: 92 }}>
          <p className="text-base font-semibold" style={{ margin: '9px 0 0', color: 'var(--text)' }} data-testid="line-total">
            {total === null ? '—' : formatCents(total)}
          </p>
          <button type="button" onClick={onRemove} aria-label={`Remove ${name}`} className="p-2 rounded-lg"
            style={{ background: 'var(--surface-raised)', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'inline-flex' }}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

// Brings a just-added line into view and puts the cursor where it's needed:
// the name for a blank custom item, otherwise the price.
function FocusNewLine({ field }) {
  const ref = useRef(null)
  useEffect(() => {
    const row = ref.current?.closest('[data-testid="line-item"]')
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    row?.querySelector(`[data-testid="${field}"]`)?.focus({ preventScroll: true })
  }, [field])
  return <span ref={ref} hidden />
}

function ReadOnlyLine({ line, index, total }) {
  return (
    <div className="flex gap-4 px-5 py-4" data-testid="line-item" style={{ borderTop: index > 0 ? '1px solid var(--border)' : 'none' }}>
      <div className="flex-1 min-w-0">
        <p className="text-base font-semibold" style={{ margin: 0, color: 'var(--text)' }} data-testid="line-title">{line.title}</p>
        {line.description && <p className="text-sm mt-1" style={{ margin: '4px 0 0', color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-line' }}>{line.description}</p>}
        <p className="text-xs mt-2" style={{ margin: '8px 0 0', color: 'var(--text-muted)' }}>
          {line.quantity} × {formatUnitPrice(line.unit_price, line.unit_label)} · {line.taxable ? 'Taxed' : 'Not taxed'}
        </p>
      </div>
      <p className="text-base font-semibold shrink-0" style={{ margin: 0, color: 'var(--text)' }} data-testid="line-total">{total === null ? '—' : formatCents(total)}</p>
    </div>
  )
}

// Type-ahead over the active catalog, with a custom-item fallback.
// "Add item" opens a dialog: search the active catalog, pick one, and that
// one line is added and the dialog closes. A custom item is the last
// option. Keyboard: type to filter, arrows to move, Enter to add, Esc to close.
function AddItemDialog({ catalog, onPick, onCustom, onClose }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef(null)

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = catalog.filter(c => c.active)
    return q ? list.filter(c => c.name.toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q)) : list
  }, [catalog, query])

  const options = [...matches.map(c => ({ kind: 'catalog', item: c })), { kind: 'custom' }]

  function choose(opt) {
    if (!opt) return
    if (opt.kind === 'catalog') onPick(opt.item)
    else onCustom(query.trim())
    onClose()
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, options.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); choose(options[active]) }
  }

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  return (
    <Modal title="Add an item" onClose={onClose} size="md">
      <div data-testid="add-item-dialog">
        <div style={{ position: 'relative' }}>
          <Search size={15} aria-hidden="true" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input autoFocus value={query} placeholder="Search your catalog or type a custom item"
            aria-label="Search catalog" role="combobox" aria-expanded="true" aria-controls="add-item-options"
            aria-activedescendant={`add-item-opt-${active}`} data-testid="add-item-search"
            onChange={e => { setQuery(e.target.value); setActive(0) }} onKeyDown={onKeyDown}
            style={{ ...inputStyle, paddingLeft: 34 }} onFocus={focusBorder} onBlur={blurBorder} />
        </div>
        <ul id="add-item-options" role="listbox" aria-label="Catalog items" ref={listRef}
          style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, border: '1px solid var(--border)', borderRadius: 12, maxHeight: '50vh', overflowY: 'auto' }}>
          {matches.length === 0 && query.trim() && (
            <li className="px-3.5 py-3 text-sm" style={{ color: 'var(--text-muted)' }}>No catalog items match "{query.trim()}".</li>
          )}
          {options.map((opt, i) => (
            <li key={opt.kind === 'catalog' ? opt.item.id : 'custom'} id={`add-item-opt-${i}`} data-index={i} role="option" aria-selected={i === active}
              data-testid={opt.kind === 'catalog' ? 'catalog-option' : 'catalog-custom'}
              onClick={() => choose(opt)} onMouseEnter={() => setActive(i)}
              className="px-3.5 py-2.5"
              style={{ cursor: 'pointer', background: i === active ? 'var(--surface-raised)' : 'transparent', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
              {opt.kind === 'catalog' ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" style={{ margin: 0, color: 'var(--text)' }}>{opt.item.name}</p>
                    {opt.item.description && <p className="text-xs truncate" style={{ margin: '2px 0 0', color: 'var(--text-muted)' }}>{opt.item.description}</p>}
                  </div>
                  <span className="text-sm font-medium shrink-0" style={{ color: 'var(--text)' }}>{formatUnitPrice(opt.item.default_unit_price, opt.item.unit_label)}</span>
                </div>
              ) : (
                <span className="flex items-center gap-2 text-sm font-medium" style={{ color: '#6366f1' }}>
                  <Plus size={15} />{query.trim() ? `Add "${query.trim()}" as a custom item` : 'Custom item (not from your catalog)'}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  )
}

function RateInput({ id, label, value, onChange, testId, invalid }) {
  return (
    <label htmlFor={id} className="flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>{label}
      <span className="inline-flex items-center gap-1">
        <input id={id} inputMode="decimal" value={value} onChange={e => onChange(e.target.value)} placeholder="0" data-testid={testId}
          style={{ ...smallInputStyle, width: 64, textAlign: 'right', borderColor: invalid ? 'var(--danger)' : 'var(--border)' }}
          onFocus={focusBorder} onBlur={e => { e.target.style.borderColor = invalid ? 'var(--danger)' : 'var(--border)' }} />
        <span>%</span>
      </span>
    </label>
  )
}

export default function LineItemsEditor({
  lines, onLinesChange, catalog, locked, totals,
  discountRate, taxRate, onDiscountRate, onTaxRate, ratesInvalid, paidCents,
}) {
  const [focusNew, setFocusNew] = useState(null)  // { key, field }
  const [adding, setAdding] = useState(false)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function update(key, patch) {
    onLinesChange(lines.map(l => (l.key === key ? { ...l, ...patch } : l)))
  }

  function addFromCatalog(item) {
    const key = newLineKey()
    setFocusNew({ key, field: 'line-price' })
    onLinesChange([...lines, {
      key, catalog_item_id: item.id, title: item.name, description: item.description || '',
      quantity: '1', unit_price: centsToInput(Math.round(Number(item.default_unit_price || 0) * 100)),
      unit_label: item.unit_label || '', taxable: item.taxable_default !== false,
    }])
  }
  function addCustom(title) {
    const key = newLineKey()
    onLinesChange([...lines, { key, catalog_item_id: null, title, description: '', quantity: '1', unit_price: '', unit_label: '', taxable: true }])
    setFocusNew({ key, field: title ? 'line-price' : 'line-title' })
  }

  function onDragEnd({ active, over }) {
    if (!over || active.id === over.id) return
    const from = lines.findIndex(l => l.key === active.id)
    const to = lines.findIndex(l => l.key === over.id)
    onLinesChange(arrayMove(lines, from, to))
  }

  const discountLabel = Number(discountRate) > 0 ? `Discount (${Number(discountRate)}%)` : 'Discount'
  const taxLabel = Number(taxRate) > 0 ? `Tax (${Number(taxRate)}%)` : 'Tax'

  return (
    <Card
      title="Line items"
      icon={locked ? <LockIcon /> : null}
      action={!locked && <Link to="/account?tab=payment" className="text-xs" style={{ color: '#6366f1', textDecoration: 'none' }}>Manage catalog</Link>}
      testId="line-items-card"
    >
      {lines.length === 0 && !locked && (
        <p className="px-5 py-6 text-sm text-center" style={{ margin: 0, color: 'var(--text-muted)' }}>No items yet.</p>
      )}

      {locked ? (
        lines.map((l, i) => <ReadOnlyLine key={l.key} line={l} index={i} total={totals.lineTotals[i]} />)
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={lines.map(l => l.key)} strategy={verticalListSortingStrategy}>
            {lines.map((l, i) => (
              <SortableLine key={l.key} line={l} index={i} total={totals.lineTotals[i]}
                focusField={focusNew?.key === l.key ? focusNew.field : null}
                onChange={patch => { update(l.key, patch); if (focusNew?.key === l.key) setFocusNew(null) }}
                onRemove={() => onLinesChange(lines.filter(x => x.key !== l.key))} />
            ))}
          </SortableContext>
        </DndContext>
      )}

      {!locked && (
        <div className="px-5 py-4" style={{ borderTop: '1px solid var(--border)' }}>
          <button type="button" onClick={() => setAdding(true)} data-testid="add-item"
            className="w-full flex items-center justify-center gap-2 text-sm font-medium rounded-xl"
            style={{ minHeight: 44, border: '1px dashed rgba(99,102,241,0.45)', background: 'rgba(99,102,241,0.04)', color: '#6366f1', cursor: 'pointer' }}>
            <Plus size={16} />Add item
          </button>
        </div>
      )}
      {adding && <AddItemDialog catalog={catalog} onPick={addFromCatalog} onCustom={addCustom} onClose={() => setAdding(false)} />}

      <div className="flex justify-end px-5 py-4" style={{ background: 'var(--bg-subtle)', borderTop: '1px solid var(--border)' }}>
        <div className="w-full flex flex-col gap-2.5 text-sm" style={{ maxWidth: 360, color: 'var(--text)' }} data-testid="invoice-totals">
          <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>Subtotal</span><span>{formatCents(totals.subtotal)}</span></div>
          {locked ? (
            <>
              {totals.discount > 0 && <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>{discountLabel}</span><span>−{formatCents(totals.discount)}</span></div>}
              {totals.tax > 0 && <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>{taxLabel}</span><span>{formatCents(totals.tax)}</span></div>}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <RateInput id="invoice-discount" label="Discount" value={discountRate} onChange={onDiscountRate} testId="invoice-discount" invalid={ratesInvalid.discount} />
                <span>{totals.discount > 0 ? `−${formatCents(totals.discount)}` : formatCents(0)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <RateInput id="invoice-tax" label="Tax" value={taxRate} onChange={onTaxRate} testId="invoice-tax" invalid={ratesInvalid.tax} />
                <span>{formatCents(totals.tax)}</span>
              </div>
              {totals.tax > 0 && (
                <p className="text-xs" style={{ margin: '-4px 0 0', color: 'var(--text-muted)' }}>
                  Tax applies to {formatCents(totals.taxableAfterDiscount)}: the taxed items{totals.discount > 0 ? ' after the discount' : ''}.
                </p>
              )}
            </>
          )}
          <div className="flex justify-between pt-2.5 text-base font-bold" style={{ borderTop: '1px solid var(--border)' }}>
            <span>Total</span><span data-testid="invoice-total">{formatCents(totals.total)}</span>
          </div>
          {paidCents > 0 && (
            <>
              <div className="flex justify-between" style={{ color: '#10b981' }}><span>Paid</span><span>−{formatCents(paidCents)}</span></div>
              <div className="flex justify-between font-semibold"><span>Balance due</span><span>{formatCents(totals.total - paidCents)}</span></div>
            </>
          )}
        </div>
      </div>
    </Card>
  )
}
