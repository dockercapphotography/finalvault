import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useScrollLock } from '../../hooks/useScrollLock.js'
import Button from './Button.jsx'

/**
 * RenameModal — a small centered pop-up for renaming a single item.
 * Same visual shell as PickerModal/MovePickerModal (header, content,
 * footer buttons), portaled to document.body from the start so it's
 * never at risk of the transform-trapping bug those two had before
 * being fixed.
 *
 * Replaces the old inline rename overlay that lived directly inside
 * ImageCard's own small aspect-square thumbnail box -- cramped and hard
 * to see/edit, especially on mobile.
 *
 * Props:
 *   open    : bool
 *   value   : string  -- current name, used as the field's starting value
 *   label   : string  -- field label (default 'Name')
 *   onSave  : async (trimmedValue) => void
 *   onClose : () => void
 */
export default function RenameModal({ open, value, label = 'Name', onSave, onClose }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [visible, setVisible] = useState(false)
  const inputRef = useRef(null)
  useScrollLock(open)

  useEffect(() => {
    if (open) {
      setName(value || '')
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
      setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select() }, 50)
    } else {
      setVisible(false)
    }
  }, [open, value])

  if (!open) return null

  async function handleSave() {
    const trimmed = name.trim()
    if (!trimmed || trimmed === value) { onClose(); return }
    setSaving(true)
    try { await onSave(trimmed) }
    finally { setSaving(false); onClose() }
  }

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ background: visible ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0)', transition: 'background 0.2s ease', backdropFilter: visible ? 'blur(2px)' : 'none' }}
        onClick={onClose}
      />
      <div
        className="fixed left-1/2 z-50 w-full"
        style={{
          top: '50%',
          transform: visible ? 'translate(-50%, -50%) scale(1)' : 'translate(-50%, -50%) scale(0.95)',
          opacity: visible ? 1 : 0,
          transition: 'transform 0.2s ease, opacity 0.2s ease',
          maxWidth: 360,
          padding: '0 16px',
        }}
      >
        <div className="rounded-2xl overflow-hidden shadow-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Rename</p>
          </div>
          <div style={{ padding: '16px' }}>
            <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }}>{label}</label>
            <input
              ref={inputRef}
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose() }}
              disabled={saving}
              style={{
                width: '100%', background: 'var(--surface)', border: '1px solid var(--border)',
                color: 'var(--text)', borderRadius: 8, padding: '9px 12px',
                fontSize: 14, outline: 'none', transition: 'border-color 0.15s', boxSizing: 'border-box',
              }}
              onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
          </div>
          <div className="px-4 py-3 flex gap-2" style={{ borderTop: '1px solid var(--border)' }}>
            <Button onClick={handleSave} disabled={!name.trim() || saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}
