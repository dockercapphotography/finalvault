import { useState, useRef, useEffect } from 'react'
import { X, Tag } from 'lucide-react'

export default function TagInput({ value = [], onChange, allTags = [], placeholder = 'Add tag...' }) {
  const [input, setInput] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef(null)
  const containerRef = useRef(null)

  const normalized = input.trim().toLowerCase()
  const suggestions = allTags
    .filter(t => t.toLowerCase().includes(normalized) && !value.includes(t))
    .slice(0, 6)
  const showCreate = normalized && !allTags.some(t => t.toLowerCase() === normalized) && !value.includes(normalized)
  const dropdownItems = showCreate ? [...suggestions, { create: true, label: normalized }] : suggestions

  function addTag(tag) {
    const clean = tag.trim().toLowerCase()
    if (!clean || value.includes(clean)) return
    onChange([...value, clean])
    setInput('')
    setOpen(false)
    setActiveIndex(-1)
    inputRef.current?.focus()
  }

  function removeTag(tag) {
    onChange(value.filter(t => t !== tag))
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (activeIndex >= 0 && dropdownItems[activeIndex]) {
        const item = dropdownItems[activeIndex]
        addTag(item.create ? item.label : item)
      } else if (input.trim()) {
        addTag(input.trim())
      }
    } else if (e.key === 'Backspace' && !input && value.length > 0) {
      removeTag(value[value.length - 1])
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, dropdownItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, -1))
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  useEffect(() => {
    function handleOutside(e) {
      if (!containerRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div
        onClick={() => inputRef.current?.focus()}
        style={{
          display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center',
          border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px',
          background: 'var(--bg-subtle)', minHeight: 38, cursor: 'text',
        }}
      >
        {value.map(tag => (
          <span key={tag} style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            background: 'rgba(99,102,241,0.12)', color: '#534AB7',
            fontSize: 12, padding: '2px 8px', borderRadius: 20,
            border: '0.5px solid rgba(99,102,241,0.3)',
          }}>
            {tag}
            <button
              onClick={e => { e.stopPropagation(); removeTag(tag) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                display: 'flex', alignItems: 'center', color: '#534AB7', opacity: 0.7 }}>
              <X size={10} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={e => { setInput(e.target.value); setOpen(true); setActiveIndex(-1) }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : ''}
          style={{
            border: 'none', background: 'transparent', outline: 'none',
            fontSize: 13, color: 'var(--text)', minWidth: 80, flex: 1,
          }}
        />
      </div>

      {open && dropdownItems.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 8, marginTop: 3, overflow: 'hidden',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        }}>
          {dropdownItems.map((item, i) => {
            const isCreate = item?.create
            const label = isCreate ? item.label : item
            return (
              <button
                key={isCreate ? '__create__' : item}
                onMouseDown={e => { e.preventDefault(); addTag(label) }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 12px', background: i === activeIndex ? 'var(--surface-raised)' : 'transparent',
                  border: 'none', borderBottom: i < dropdownItems.length - 1 ? '1px solid var(--border)' : 'none',
                  cursor: 'pointer', textAlign: 'left', fontSize: 13,
                  color: isCreate ? '#6366f1' : 'var(--text)',
                }}>
                {isCreate
                  ? <><span style={{ fontSize: 15, lineHeight: 1 }}>+</span> Create "{label}"</>
                  : <><Tag size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} /> {label}</>
                }
              </button>
            )
          })}
        </div>
      )}
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
        Type to search or create · Enter or comma to add · Backspace to remove
      </p>
    </div>
  )
}
