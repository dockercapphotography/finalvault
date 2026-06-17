import { useState } from 'react'
import { ChevronRight, ChevronLeft, Check } from 'lucide-react'
import BottomSheet from '../layout/BottomSheet.jsx'

/**
 * FilterSheet — reusable mobile filter bottom sheet with sub-screen navigation.
 *
 * Props:
 *   open        : boolean
 *   onClose     : () => void
 *   title       : string (default "Filters")
 *   filters     : [{ key, label, placeholder, multiple, options: [{ value, label }] }]
 *   values      : { [key]: string | string[] }
 *   onChange    : (key, value) => void
 */
export default function FilterSheet({ open, onClose, title = 'Filters', filters = [], values = {}, onChange }) {
  const [subScreen, setSubScreen] = useState(null)

  function handleClose() {
    setSubScreen(null)
    onClose()
  }

  const activeFilter = subScreen ? filters.find(f => f.key === subScreen) : null

  function isSelected(filter, optValue) {
    const val = values[filter.key]
    if (filter.multiple) return Array.isArray(val) && val.includes(optValue)
    return val === optValue
  }

  function handleSelect(filter, optValue) {
    if (filter.multiple) {
      const current = Array.isArray(values[filter.key]) ? values[filter.key] : []
      if (optValue === '') {
        onChange(filter.key, [])
      } else {
        const next = current.includes(optValue)
          ? current.filter(v => v !== optValue)
          : [...current, optValue]
        onChange(filter.key, next)
      }
      // Don't close sub-screen on multi-select
    } else {
      onChange(filter.key, optValue)
      setSubScreen(null)
    }
  }

  function getDisplayLabel(filter) {
    const val = values[filter.key]
    if (filter.multiple) {
      const arr = Array.isArray(val) ? val : []
      if (arr.length === 0) return filter.placeholder || 'Any'
      if (arr.length === 1) return arr[0]
      return `${arr.length} selected`
    }
    return filter.options.find(o => o.value === val)?.label || filter.placeholder || 'Any'
  }

  function hasValue(filter) {
    const val = values[filter.key]
    if (filter.multiple) return Array.isArray(val) && val.length > 0
    return !!val
  }

  return (
    <BottomSheet open={open} onClose={handleClose}>
      {/* Main screen */}
      {!subScreen && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 20px 12px', borderBottom: '0.5px solid var(--border)', flexShrink: 0 }}>
            <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--text)' }}>{title}</span>
          </div>
          {filters.map((filter, i) => {
            const isLast = i === filters.length - 1
            return (
              <button key={filter.key}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 20px', borderBottom: isLast ? 'none' : '0.5px solid var(--border)', cursor: 'pointer', background: 'none', width: '100%', textAlign: 'left' }}
                onClick={() => setSubScreen(filter.key)}>
                <span style={{ fontSize: 15, color: 'var(--text)' }}>{filter.label}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: hasValue(filter) ? '#6366f1' : 'var(--text-muted)' }}>
                  {getDisplayLabel(filter)}
                  <ChevronRight size={14} />
                </span>
              </button>
            )
          })}
          <div style={{ padding: '12px 16px 24px' }}>
            <button onClick={handleClose} style={{ width: '100%', padding: 13, borderRadius: 12, background: '#6366f1', color: '#fff', border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>Done</button>
          </div>
        </>
      )}

      {/* Sub-screen */}
      {subScreen && activeFilter && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', padding: '4px 20px 12px', borderBottom: '0.5px solid var(--border)', flexShrink: 0, position: 'relative' }}>
            <button onClick={() => setSubScreen(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', display: 'flex', alignItems: 'center', gap: 2, fontSize: 14, padding: 0, marginRight: 'auto' }}>
              <ChevronLeft size={16} /> Back
            </button>
            <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--text)', position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>{activeFilter.label}</span>
          </div>
          {activeFilter.options.map((opt, i) => {
            const selected = isSelected(activeFilter, opt.value)
            const isLast = i === activeFilter.options.length - 1
            return (
              <button key={opt.value}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 20px', borderBottom: isLast ? 'none' : '0.5px solid var(--border)', cursor: 'pointer', background: 'none', width: '100%', textAlign: 'left' }}
                onClick={() => handleSelect(activeFilter, opt.value)}>
                <span style={{ fontSize: 15, color: selected ? '#6366f1' : 'var(--text)', fontWeight: selected ? 500 : 400 }}>{opt.label}</span>
                {activeFilter.multiple ? (
                  <div style={{ width: 20, height: 20, borderRadius: 6, border: selected ? 'none' : '1.5px solid var(--border)', background: selected ? '#6366f1' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {selected && <Check size={12} color="#fff" strokeWidth={2.5} />}
                  </div>
                ) : (
                  selected && <Check size={14} style={{ color: '#6366f1', flexShrink: 0 }} />
                )}
              </button>
            )
          })}
          <div style={{ padding: '12px 16px 24px' }}>
            <button onClick={handleClose} style={{ width: '100%', padding: 13, borderRadius: 12, background: '#6366f1', color: '#fff', border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>Done</button>
          </div>
        </>
      )}
    </BottomSheet>
  )
}
