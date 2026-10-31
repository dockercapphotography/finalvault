import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { ChevronUp, ChevronDown, MinusCircle, PlusCircle, SlidersHorizontal, MoreHorizontal, ChevronLeft } from 'lucide-react'
import BottomSheet from './BottomSheet.jsx'
import {
  NAV_DESTINATIONS, MAX_MOBILE_NAV, DEFAULT_MOBILE_NAV, destinationByKey, saveMobileNav,
} from '../../utils/mobileNav.js'

// ── Mobile "More" sheet (v1.6.0) ─────────────────────────────────────────
// Lists every page that isn't on the bottom bar, plus "Customize menu",
// where the photographer picks up to 4 pages for the bar and their order.
// The choice is saved on the account (sql/113) so it follows them to any
// phone.

const rowStyle = {
  display: 'flex', alignItems: 'center', gap: 12, width: '100%',
  padding: '12px 20px', background: 'none', border: 'none',
  color: 'var(--text)', fontSize: 15, textAlign: 'left', cursor: 'pointer',
  textDecoration: 'none', boxSizing: 'border-box',
}

const iconButton = (disabled) => ({
  width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'none', border: 'none', borderRadius: 8, flexShrink: 0,
  color: disabled ? 'var(--border-strong)' : 'var(--text-secondary)',
  cursor: disabled ? 'default' : 'pointer',
})

const sectionLabel = {
  fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
  color: 'var(--text-muted)', padding: '14px 20px 6px', margin: 0,
}

function MoreMenu({ picked, onNavigate, onCustomize }) {
  const others = NAV_DESTINATIONS.filter(d => !picked.includes(d.key))
  return (
    <div style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }} data-testid="mobile-more-menu">
      <p style={{ ...sectionLabel, paddingTop: 0 }}>More</p>
      {others.map(({ key, to, label, icon: Icon, end }) => (
        <NavLink key={key} to={to} end={end} onClick={onNavigate} data-testid={`mobile-more-${key}`}
          style={({ isActive }) => ({ ...rowStyle, fontWeight: isActive ? 600 : 400, background: isActive ? 'var(--surface-raised)' : 'none' })}>
          <Icon size={18} style={{ color: 'var(--text-secondary)' }} />
          {label}
        </NavLink>
      ))}
      <div style={{ borderTop: '1px solid var(--border)', margin: '8px 0' }} />
      <button type="button" onClick={onCustomize} style={rowStyle} data-testid="mobile-more-customize">
        <SlidersHorizontal size={18} style={{ color: 'var(--text-secondary)' }} />
        Customize menu
      </button>
    </div>
  )
}

function BarPreview({ keys }) {
  return (
    <div className="flex items-center justify-evenly rounded-xl mx-5" aria-hidden="true"
      style={{ border: '1px solid var(--border)', background: 'var(--bg)', height: 52 }}>
      {[...keys.map(destinationByKey), { key: 'more', label: 'More', icon: MoreHorizontal }].map(({ key, label, icon: Icon }) => (
        <div key={key} className="flex flex-col items-center justify-center flex-1" style={{ gap: 2, color: 'var(--text-muted)' }}>
          <Icon size={16} />
          <span style={{ fontSize: 9 }}>{label}</span>
        </div>
      ))}
    </div>
  )
}

function CustomizeMenu({ picked, onBack, onSaved }) {
  const [draft, setDraft] = useState(picked)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const full = draft.length >= MAX_MOBILE_NAV
  const others = NAV_DESTINATIONS.filter(d => !draft.includes(d.key))
  const changed = draft.join(',') !== picked.join(',')
  const isDefault = draft.join(',') === DEFAULT_MOBILE_NAV.join(',')

  function move(index, delta) {
    const next = [...draft]
    const [k] = next.splice(index, 1)
    next.splice(index + delta, 0, k)
    setDraft(next)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const saved = await saveMobileNav(draft)
      onSaved(saved)
    } catch (err) {
      setError(err.message || 'Could not save your menu.')
      setSaving(false)
    }
  }

  return (
    <div style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }} data-testid="mobile-nav-customize">
      <div className="flex items-center gap-1 px-3 pb-3">
        <button type="button" onClick={onBack} style={iconButton(false)} aria-label="Back">
          <ChevronLeft size={18} />
        </button>
        <h2 className="text-base font-semibold" style={{ margin: 0, color: 'var(--text)' }}>Customize menu</h2>
      </div>

      <BarPreview keys={draft} />

      <p style={sectionLabel}>On your bar · {draft.length} of {MAX_MOBILE_NAV}</p>
      {draft.map((key, i) => {
        const { label, icon: Icon } = destinationByKey(key)
        return (
          <div key={key} className="flex items-center" style={{ padding: '2px 12px 2px 20px', gap: 4 }} data-testid={`mobile-nav-picked-${key}`}>
            <Icon size={18} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
            <span className="flex-1 min-w-0 truncate" style={{ fontSize: 15, color: 'var(--text)', marginLeft: 8 }}>{label}</span>
            <button type="button" onClick={() => move(i, -1)} disabled={i === 0} style={iconButton(i === 0)} aria-label={`Move ${label} up`}>
              <ChevronUp size={18} />
            </button>
            <button type="button" onClick={() => move(i, 1)} disabled={i === draft.length - 1} style={iconButton(i === draft.length - 1)} aria-label={`Move ${label} down`}>
              <ChevronDown size={18} />
            </button>
            <button type="button" onClick={() => setDraft(draft.filter(k => k !== key))} disabled={draft.length === 1}
              style={{ ...iconButton(draft.length === 1), color: draft.length === 1 ? 'var(--border-strong)' : 'var(--danger)' }}
              aria-label={`Remove ${label} from the bar`} data-testid={`mobile-nav-remove-${key}`}>
              <MinusCircle size={18} />
            </button>
          </div>
        )
      })}

      {others.length > 0 && (
        <>
          <p style={sectionLabel}>In More</p>
          {others.map(({ key, label, icon: Icon }) => (
            <div key={key} className="flex items-center" style={{ padding: '2px 12px 2px 20px', gap: 4 }}>
              <Icon size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <span className="flex-1 min-w-0 truncate" style={{ fontSize: 15, color: 'var(--text-secondary)', marginLeft: 8 }}>{label}</span>
              <button type="button" onClick={() => setDraft([...draft, key])} disabled={full}
                style={{ ...iconButton(full), color: full ? 'var(--border-strong)' : 'var(--accent)' }}
                aria-label={`Add ${label} to the bar`} data-testid={`mobile-nav-add-${key}`}>
                <PlusCircle size={18} />
              </button>
            </div>
          ))}
          {full && (
            <p className="text-xs" style={{ margin: '4px 20px 0', color: 'var(--text-muted)' }}>
              The bar holds {MAX_MOBILE_NAV} pages. Remove one to add another.
            </p>
          )}
        </>
      )}

      {error && (
        <p className="text-xs" style={{ margin: '12px 20px 0', color: 'var(--danger)' }}>{error}</p>
      )}

      <div className="flex items-center gap-2 px-5 pt-5">
        <button type="button" onClick={() => setDraft(DEFAULT_MOBILE_NAV)} disabled={isDefault}
          className="text-sm mr-auto"
          style={{ background: 'none', border: 'none', padding: 0, color: isDefault ? 'var(--text-muted)' : 'var(--text-secondary)', cursor: isDefault ? 'default' : 'pointer' }}>
          Reset to default
        </button>
        <button type="button" onClick={onBack} className="px-4 py-2 rounded-lg text-sm"
          style={{ background: 'var(--surface)', border: '1px solid var(--border-strong)', color: 'var(--text)', cursor: 'pointer' }}>
          Cancel
        </button>
        <button type="button" onClick={handleSave} disabled={!changed || saving} data-testid="mobile-nav-save"
          className="px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: 'var(--accent)', border: 'none', color: 'var(--accent-fg)', cursor: !changed || saving ? 'not-allowed' : 'pointer', opacity: !changed || saving ? 0.4 : 1 }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

// Rendered only while open (BottomSheet returns null when closed), so the
// menu/customize view and the draft reset every time it opens.
function SheetContent({ picked, onClose, onPickedChange }) {
  const [view, setView] = useState('menu')
  if (view === 'customize') {
    return (
      <CustomizeMenu picked={picked} onBack={() => setView('menu')}
        onSaved={keys => { onPickedChange(keys); onClose() }} />
    )
  }
  return <MoreMenu picked={picked} onNavigate={onClose} onCustomize={() => setView('customize')} />
}

export default function MobileMoreSheet({ open, onClose, picked, onPickedChange }) {
  return (
    <BottomSheet open={open} onClose={onClose}>
      <SheetContent picked={picked} onClose={onClose} onPickedChange={onPickedChange} />
    </BottomSheet>
  )
}
