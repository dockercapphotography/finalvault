import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, ImageIcon, X, Crosshair, MoreVertical, Pencil, Check, Eye, FileText, Palette, ExternalLink } from 'lucide-react'
import { getMyMicrosite, updateMyMicrosite } from '../utils/micrositeApi.js'
import { callManageCustomDomain } from '../components/account/CustomDomainSection.jsx'
import { getGalleries } from '../utils/galleryApi.js'
import { supabase } from '../supabaseClient.js'
import MicrositeImagePicker from '../components/microsite/MicrositeImagePicker.jsx'
import PortalMenu from '../components/ui/PortalMenu.jsx'
import MobileBottomNav from '../components/layout/MobileBottomNav.jsx'
import { getSignupPages } from '../utils/signupApi.js'
import MicrositeGalleryImagesPicker from '../components/microsite/MicrositeGalleryImagesPicker.jsx'
import MicrositeFocalPointModal from '../components/microsite/MicrositeFocalPointModal.jsx'
import SettingsSection from '../components/ui/SettingsSection.jsx'
import Input from '../components/ui/Input.jsx'
import Toggle from '../components/ui/Toggle.jsx'
import Button from '../components/ui/Button.jsx'
import GalleryPicker from '../components/ui/GalleryPicker.jsx'
import { createPortal } from 'react-dom'
import Tabs from '../components/ui/Tabs.jsx'
import BottomSheet from '../components/layout/BottomSheet.jsx'
import { useMediaQuery } from '../hooks/useMediaQuery.js'
import {
  ACCENT_SWATCHES, ACCENT_SWATCHES_DARK, FONT_PAIRINGS, DEFAULT_FONT_PAIRING,
  RADIUS_OPTIONS, DEFAULT_RADIUS, HERO_VARIANT_OPTIONS, GALLERY_VARIANT_OPTIONS,
  ABOUT_VARIANT_OPTIONS, PRICING_VARIANT_OPTIONS, CONTACT_VARIANT_OPTIONS,
  TESTIMONIAL_VARIANT_OPTIONS, ALL_FONTS_HREF,
  DISPLAY_FONT_OPTIONS, BODY_FONT_OPTIONS, DEFAULT_CUSTOM_DISPLAY, DEFAULT_CUSTOM_BODY,
  THEME_OPTIONS, DEFAULT_THEME, MOBILE_MENU_VARIANT_OPTIONS, FOOTER_VARIANT_OPTIONS,
} from '../utils/micrositeThemeOptions.js'

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL

async function fetchAuthedBlob(r2Key) {
  const { data: { session } } = await supabase.auth.getSession()
  const resp = await fetch(`${WORKER_URL}/preview/${encodeURIComponent(r2Key)}`, {
    headers: { Authorization: `Bearer ${session.access_token}` }
  })
  if (!resp.ok) throw new Error('Failed to fetch preview')
  return URL.createObjectURL(await resp.blob())
}

function FontOptionRow({ active, onClick, pairing }) {
  return (
    <button onClick={onClick} className="w-full flex items-center justify-between px-3 py-3 rounded-lg text-left"
      style={{
        background: active ? 'rgba(99,102,241,0.08)' : 'var(--surface-raised)',
        border: active ? '1px solid #6366f1' : '1px solid var(--border)',
        cursor: 'pointer',
      }}>
      <div>
        <div style={{ fontFamily: pairing.display, fontSize: 21, color: 'var(--text)', lineHeight: 1.2 }}>
          Aa Studio Name
        </div>
        <div style={{ fontFamily: pairing.body, fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
          {pairing.name} — the quick brown fox jumps
        </div>
      </div>
      {active && <span style={{ color: '#6366f1', fontWeight: 600, flexShrink: 0, marginLeft: 12 }}>✓</span>}
    </button>
  )
}

// A single row (label + current value). Desktop: click opens a small
// popover anchored to the row via real screen coordinates. Mobile: click
// opens the shared BottomSheet. Same interaction the app already uses
// for filters/sort (FilterSortControl.jsx) -- reused here rather than
// inventing a third pattern.
function SectionPicker({ label, options, value, fallback, onChange, renderOption, isLast }) {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const rowRef = useRef(null)
  const popoverRef = useRef(null)
  const activeId = value || fallback
  const current = options.find(o => o.id === activeId)

  function handleRowClick() {
    if (isDesktop && rowRef.current) {
      const rect = rowRef.current.getBoundingClientRect()
      const popWidth = 300
      const popMaxHeight = 360
      const padding = 16
      const spaceBelow = window.innerHeight - rect.bottom - padding
      const left = Math.min(rect.left, window.innerWidth - popWidth - padding)

      if (spaceBelow < popMaxHeight && rect.top > popMaxHeight) {
        // Not enough room below, plenty above -> flip up. Anchored via
        // `bottom` (not `top`) so the popover grows upward from the row
        // instead of downward off the screen.
        setPos({ top: 'auto', bottom: window.innerHeight - rect.top + 6, left })
      } else {
        setPos({ top: rect.bottom + 6, bottom: 'auto', left })
      }
    }
    setOpen(true)
  }

  function handleSelect(id) {
    onChange(id)
    setOpen(false)
  }

  useEffect(() => {
    if (!isDesktop || !open) return
    function handleOutside(e) {
      if (popoverRef.current?.contains(e.target)) return
      if (rowRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [isDesktop, open])

  const defaultRenderOption = (opt, isActive) => (
    <>
      <div className="text-sm font-semibold" style={{ color: isActive ? '#6366f1' : 'var(--text)' }}>
        {isActive ? '✓ ' : ''}{opt.name}
      </div>
      {opt.desc && <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{opt.desc}</div>}
    </>
  )
  const renderOpt = renderOption || defaultRenderOption

  const optionButtons = options.map(opt => (
    <button key={opt.id} onClick={() => handleSelect(opt.id)}
      className="w-full text-left px-4 py-3"
      style={{
        background: opt.id === activeId ? 'rgba(99,102,241,0.08)' : 'none',
        border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer',
      }}>
      {renderOpt(opt, opt.id === activeId)}
    </button>
  ))

  return (
    <>
      <button ref={rowRef} onClick={handleRowClick}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
        style={{ background: 'var(--surface)', border: 'none', borderBottom: isLast ? 'none' : '1px solid var(--border)', cursor: 'pointer' }}>
        <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{label}</span>
        <span className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{current?.name}</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>›</span>
        </span>
      </button>

      {isDesktop && open && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div ref={popoverRef} className="fixed z-50 rounded-xl overflow-hidden"
            style={{
              top: pos.top, bottom: pos.bottom, left: pos.left, width: 300, maxHeight: 360, overflowY: 'auto',
              background: 'var(--surface)', border: '1px solid var(--border)',
              boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)',
            }}>
            {optionButtons}
          </div>
        </>,
        document.body
      )}

      {!isDesktop && (
        <BottomSheet open={open} onClose={() => setOpen(false)}>
          <div style={{ padding: '4px 20px 14px', borderBottom: '1px solid var(--border)' }}>
            <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{label}</p>
          </div>
          {optionButtons}
        </BottomSheet>
      )}
    </>
  )
}

function OptionRow({ active, onClick, label, sub }) {
  return (
    <button onClick={onClick} className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm text-left"
      style={{
        background: active ? 'rgba(99,102,241,0.08)' : 'var(--surface-raised)',
        border: active ? '1px solid #6366f1' : '1px solid var(--border)',
        cursor: 'pointer',
      }}>
      <span>
        <span style={{ color: 'var(--text)', fontWeight: active ? 600 : 400 }}>{label}</span>
        {sub && <span className="block text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</span>}
      </span>
      {active && <span style={{ color: '#6366f1', fontWeight: 600 }}>✓</span>}
    </button>
  )
}

function SaveIndicator({ state }) {
  if (state === 'idle') return null
  const config = {
    saving: { text: 'Saving…', color: 'var(--text-muted)' },
    saved: { text: 'Changes saved', color: 'var(--success)' },
    error: { text: 'Failed to save', color: 'var(--danger)' },
  }[state]
  if (!config) return null
  return <p className="text-xs" style={{ color: config.color }}>{config.text}</p>
}

function LogoPreview({ r2Key }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    if (!r2Key) { setUrl(null); return }
    let cancelled = false
    let blobUrl = null
    fetchAuthedBlob(r2Key).then(u => {
      if (cancelled) { URL.revokeObjectURL(u); return }
      blobUrl = u
      setUrl(u)
    }).catch(() => {})
    return () => { cancelled = true; if (blobUrl) URL.revokeObjectURL(blobUrl) }
  }, [r2Key])

  return (
    <div className="w-24 h-16 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--surface-raised)' }}>
      {url
        ? <img src={url} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', padding: 8 }} />
        : <ImageIcon size={18} style={{ color: 'var(--text-muted)' }} />}
    </div>
  )
}

function GalleryPickThumb({ r2Key, onRemove, onAdjustFocus }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let cancelled = false
    let blobUrl = null
    fetchAuthedBlob(r2Key).then(u => {
      if (cancelled) { URL.revokeObjectURL(u); return }
      blobUrl = u
      setUrl(u)
    }).catch(() => {})
    return () => { cancelled = true; if (blobUrl) URL.revokeObjectURL(blobUrl) }
  }, [r2Key])

  return (
    <div className="relative aspect-square rounded-lg overflow-hidden" style={{ background: 'var(--surface-raised)' }}>
      {url && <img src={url} alt="" className="w-full h-full object-cover" />}
      {onRemove && (
        <button onClick={onRemove} className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.6)', border: 'none', cursor: 'pointer' }}>
          <X size={12} color="#fff" />
        </button>
      )}
      {onAdjustFocus && (
        <button onClick={onAdjustFocus} title="Adjust focus point" className="absolute bottom-1 right-1 w-5 h-5 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.6)', border: 'none', cursor: 'pointer' }}>
          <Crosshair size={12} color="#fff" />
        </button>
      )}
    </div>
  )
}

function HeroThumbnail({ r2Key }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    if (!r2Key) { setUrl(null); return }
    let cancelled = false
    let blobUrl = null
    fetchAuthedBlob(r2Key).then(u => {
      if (cancelled) { URL.revokeObjectURL(u); return }
      blobUrl = u
      setUrl(u)
    }).catch(() => {})
    return () => { cancelled = true; if (blobUrl) URL.revokeObjectURL(blobUrl) }
  }, [r2Key])

  if (!r2Key) {
    return (
      <div className="w-24 h-24 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--surface-raised)' }}>
        <ImageIcon size={20} style={{ color: 'var(--text-muted)' }} />
      </div>
    )
  }
  return (
    <div className="w-24 h-24 rounded-lg overflow-hidden flex-shrink-0" style={{ background: 'var(--surface-raised)' }}>
      {url && <img src={url} alt="" className="w-full h-full object-cover" />}
    </div>
  )
}

// ── About stats ─────────────────────────────────────────────────
function SavedRowMenu({ onEdit, onRemove, removeLabel = 'this item' }) {
  return (
    <PortalMenu
      trigger={<MoreVertical size={13} />}
      triggerClassName="flex items-center justify-center rounded-md"
      triggerStyle={{ width: 22, height: 22, color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0 }}
      items={[
        { label: 'Edit', icon: <Pencil size={13} />, onClick: onEdit },
        {
          label: 'Remove', icon: <Trash2 size={13} />, danger: true,
          confirm: { title: `Remove ${removeLabel}?`, message: "This can't be undone.", confirmLabel: 'Remove', onConfirm: onRemove },
        },
      ]}
    />
  )
}

function EntryDoneButton({ isComplete, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={!isComplete}
      className="text-sm font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5"
      style={{
        background: isComplete ? '#6366f1' : 'var(--surface-raised)',
        color: isComplete ? '#fff' : 'var(--text-muted)',
        border: 'none', cursor: isComplete ? 'pointer' : 'not-allowed',
      }}
    >
      <Check size={13} />Done
    </button>
  )
}

function StatsEditor({ stats, onChange }) {
  const [editingIndex, setEditingIndex] = useState(null)

  function update(i, field, value) {
    const next = [...stats]
    next[i] = { ...next[i], [field]: value }
    onChange(next)
  }
  function remove(i) {
    onChange(stats.filter((_, idx) => idx !== i))
    if (editingIndex === i) setEditingIndex(null)
  }
  function add() {
    onChange([...stats, { value: '', label: '' }])
    setEditingIndex(stats.length)
  }

  return (
    <div className="space-y-2">
      {stats.map((s, i) => {
        const isComplete = !!(s.value && s.label)
        const isOpen = editingIndex === i || !isComplete
        if (!isOpen) {
          return (
            <div key={i} className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
              <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#16a34a' }}>
                <Check size={9} color="#fff" strokeWidth={3} />
              </div>
              <div className="flex-1 text-sm" style={{ color: 'var(--text)' }}><b style={{ fontWeight: 600 }}>{s.value}</b> — {s.label}</div>
              <SavedRowMenu onEdit={() => setEditingIndex(i)} onRemove={() => remove(i)} removeLabel="this stat" />
            </div>
          )
        }
        return (
          <div key={i} className="rounded-lg p-3" style={{ border: '1px solid #C7CDF5', background: '#F5F6FF' }}>
            <div className="text-xs font-semibold uppercase mb-2" style={{ color: '#6366f1', letterSpacing: '0.04em' }}>
              {isComplete ? 'Editing stat' : 'New stat'}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input label="Value" value={s.value || ''} onChange={v => update(i, 'value', v)} placeholder="e.g. 200+" />
              <Input label="Label" value={s.label || ''} onChange={v => update(i, 'label', v)} placeholder="e.g. Sessions Shot" />
            </div>
            <div className="mt-2.5">
              <EntryDoneButton isComplete={isComplete} onClick={() => setEditingIndex(null)} />
            </div>
          </div>
        )
      })}
      <button onClick={add} className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg"
        style={{ background: 'var(--surface-raised)', color: 'var(--text)', border: '1px dashed var(--border)', cursor: 'pointer' }}>
        <Plus size={14} />Add stat
      </button>
    </div>
  )
}

// ── Packages (Sessions & Pricing) ────────────────────────────────────────────
function PackagesEditor({ packages, onChange }) {
  const [editingIndex, setEditingIndex] = useState(null)

  function update(i, field, value) {
    const next = [...packages]
    next[i] = { ...next[i], [field]: value }
    onChange(next)
  }
  function remove(i) {
    onChange(packages.filter((_, idx) => idx !== i))
    if (editingIndex === i) setEditingIndex(null)
  }
  function add() {
    onChange([...packages, { name: '', price: '', description: '' }])
    setEditingIndex(packages.length)
  }

  return (
    <div className="space-y-2">
      {packages.map((pkg, i) => {
        const isComplete = !!(pkg.name && pkg.price)
        const isOpen = editingIndex === i || !isComplete
        if (!isOpen) {
          return (
            <div key={i} className="rounded-lg p-3 relative" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
              <div className="flex justify-between items-baseline pr-6">
                <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{pkg.name}</span>
                <span className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>{pkg.price}</span>
              </div>
              {pkg.description && <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{pkg.description}</p>}
              <div className="absolute top-2.5 right-2.5">
                <SavedRowMenu onEdit={() => setEditingIndex(i)} onRemove={() => remove(i)} removeLabel={pkg.name || 'this package'} />
              </div>
            </div>
          )
        }
        return (
          <div key={i} className="rounded-lg p-3" style={{ border: '1px solid #C7CDF5', background: '#F5F6FF' }}>
            <div className="text-xs font-semibold uppercase mb-2" style={{ color: '#6366f1', letterSpacing: '0.04em' }}>
              {isComplete ? 'Editing package' : 'New package'}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input label="Name" value={pkg.name || ''} onChange={v => update(i, 'name', v)} placeholder="e.g. Studio Session" />
              <Input label="Price" value={pkg.price || ''} onChange={v => update(i, 'price', v)} placeholder="e.g. $275" />
            </div>
            <div className="mt-2">
              <Input label="Description" value={pkg.description || ''} onChange={v => update(i, 'description', v)} placeholder="e.g. 60 minutes, studio lighting, two changes." />
            </div>
            <div className="mt-2.5">
              <EntryDoneButton isComplete={isComplete} onClick={() => setEditingIndex(null)} />
            </div>
          </div>
        )
      })}
      <button onClick={add} className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg"
        style={{ background: 'var(--surface-raised)', color: 'var(--text)', border: '1px dashed var(--border)', cursor: 'pointer' }}>
        <Plus size={14} />Add package
      </button>
    </div>
  )
}

// ── Testimonials ──────────────────────────────────────────────────────────
function LayoutHint({ options, value, fallback }) {
  const current = options.find(o => o.id === (value || fallback)) || options[0]
  if (!current) return null
  return (
    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
      Layout: {current.name} — change in Design tab
    </p>
  )
}

function TestimonialsEditor({ testimonials, onChange, onEditPhoto, onAdjustFocus }) {
  const [editingIndex, setEditingIndex] = useState(null)

  function update(i, field, value) {
    const next = [...testimonials]
    next[i] = { ...next[i], [field]: value }
    onChange(next)
  }
  function remove(i) {
    onChange(testimonials.filter((_, idx) => idx !== i))
    if (editingIndex === i) setEditingIndex(null)
  }
  function add() {
    onChange([...testimonials, { quote: '', name: '', session_type: '' }])
    setEditingIndex(testimonials.length)
  }
  function cancel(i) {
    const t = testimonials[i]
    // A never-finished entry (started via "Add testimonial", still
    // missing a quote or name) has nothing worth keeping -- Cancel
    // removes it outright, same as if it'd never been added. A
    // previously-saved entry reopened for editing just closes back up;
    // whatever's already there stays as it was.
    if (!(t?.quote && t?.name)) {
      remove(i)
    } else {
      setEditingIndex(null)
    }
  }
  function removePhoto(i) {
    update(i, 'photo_gallery_image_key', null)
  }

  return (
    <div className="space-y-2">
      {testimonials.map((t, i) => {
        const isComplete = !!(t.quote && t.name)
        const isOpen = editingIndex === i || !isComplete
        if (!isOpen) {
          return (
            <div key={i} className="rounded-lg p-3 relative flex gap-3 items-start" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
              <div style={{ width: 34, height: 34, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: 'var(--surface-raised)' }}>
                {t.photo_gallery_image_key && <GalleryPickThumb r2Key={t.photo_gallery_image_key} />}
              </div>
              <div className="flex-1 pr-6">
                <p className="text-sm italic" style={{ color: 'var(--text)' }}>&ldquo;{t.quote}&rdquo;</p>
                <p className="text-xs font-semibold mt-1" style={{ color: 'var(--accent)' }}>{t.name}{t.session_type ? ` — ${t.session_type}` : ''}</p>
              </div>
              <div className="absolute top-2.5 right-2.5">
                <SavedRowMenu onEdit={() => setEditingIndex(i)} onRemove={() => remove(i)} removeLabel="this testimonial" />
              </div>
            </div>
          )
        }
        return (
          <div key={i} className="rounded-lg p-3 space-y-2" style={{ border: '1px solid #C7CDF5', background: '#F5F6FF' }}>
            <div className="text-xs font-semibold uppercase" style={{ color: '#6366f1', letterSpacing: '0.04em' }}>
              {isComplete ? 'Editing testimonial' : 'New testimonial'}
            </div>
            <Input label="Quote" value={t.quote || ''} onChange={v => update(i, 'quote', v)} type="textarea" placeholder="What the client said" />
            <div className="grid grid-cols-2 gap-2">
              <Input label="Client name" value={t.name || ''} onChange={v => update(i, 'name', v)} placeholder="e.g. Jordan M." />
              <Input label="Session type" value={t.session_type || ''} onChange={v => update(i, 'session_type', v)} placeholder="e.g. Studio Session" />
            </div>
            <div className="flex items-center gap-3">
              {t.photo_gallery_image_key ? (
                <div style={{ width: 60 }}>
                  <GalleryPickThumb
                    r2Key={t.photo_gallery_image_key}
                    onRemove={() => removePhoto(i)}
                    onAdjustFocus={() => onAdjustFocus(i)}
                  />
                </div>
              ) : (
                <button onClick={() => onEditPhoto(i)} className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg"
                  style={{ background: 'var(--surface-raised)', color: 'var(--text)', border: '1px dashed var(--border)', cursor: 'pointer' }}>
                  <Plus size={14} />Add photo
                </button>
              )}
              {t.photo_gallery_image_key && (
                <button onClick={() => onEditPhoto(i)} className="text-sm" style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
                  Change
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <EntryDoneButton isComplete={isComplete} onClick={() => setEditingIndex(null)} />
              <button onClick={() => cancel(i)} className="text-sm font-medium px-3 py-1.5 rounded-lg"
                style={{ background: 'none', color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        )
      })}
      <button onClick={add} className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg"
        style={{ background: 'var(--surface-raised)', color: 'var(--text)', border: '1px dashed var(--border)', cursor: 'pointer' }}>
        <Plus size={14} />Add testimonial
      </button>
    </div>
  )
}

export default function MicrositeEditor() {
  const [site, setSite] = useState(null)
  const [galleries, setGalleries] = useState([])
  const [signupPages, setSignupPages] = useState([])
  const [saveState, setSaveState] = useState('idle')
  const [showImagePicker, setShowImagePicker] = useState(false)
  const [showGalleryImagesPicker, setShowGalleryImagesPicker] = useState(false)
  const [showAboutImagePicker, setShowAboutImagePicker] = useState(false)
  const [showHeroFocalModal, setShowHeroFocalModal] = useState(false)
  const [showHeroCyclePicker, setShowHeroCyclePicker] = useState(false)
  const [showHeroMosaicPicker, setShowHeroMosaicPicker] = useState(false)
  const [focalEditTarget, setFocalEditTarget] = useState(null) // { field: 'cycle' | 'mosaic' | 'gallery', key }
  const [galleryPreviewKeys, setGalleryPreviewKeys] = useState([])
  const [testimonialPhotoEditIndex, setTestimonialPhotoEditIndex] = useState(null)
  const [testimonialFocalIndex, setTestimonialFocalIndex] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function loadGalleryPreview() {
      if (!site) { setGalleryPreviewKeys([]); return }
      if (site.gallery_source_type === 'manual') {
        setGalleryPreviewKeys(Array.isArray(site.gallery_source_image_keys) ? site.gallery_source_image_keys.filter(Boolean) : [])
        return
      }
      if ((site.gallery_source_type || 'gallery') === 'gallery' && site.gallery_source_gallery_id) {
        const { data, error } = await supabase
          .from('gallery_images')
          .select('preview_r2_key')
          .eq('gallery_id', site.gallery_source_gallery_id)
          .is('deleted_at', null)
          .order('sort_order', { ascending: true })
        if (!cancelled && !error && data) setGalleryPreviewKeys(data.map(r => r.preview_r2_key))
        return
      }
      setGalleryPreviewKeys([])
    }
    loadGalleryPreview()
    return () => { cancelled = true }
  }, [site?.gallery_source_type, site?.gallery_source_gallery_id, site?.gallery_source_image_keys])
  const [showAboutFocalModal, setShowAboutFocalModal] = useState(false)
  const [accountLogoKey, setAccountLogoKey] = useState(null)
  const [accountAllSessionsToken, setAccountAllSessionsToken] = useState(null)
  const [liveDomain, setLiveDomain] = useState(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingLogoDark, setUploadingLogoDark] = useState(false)
  const [showDarkLogoSection, setShowDarkLogoSection] = useState(false)
  const [uploadingFavicon, setUploadingFavicon] = useState(false)
  const [showFaviconSection, setShowFaviconSection] = useState(false)
  const saveTimeoutRef = useRef(null)
  const logoInputRef = useRef(null)
  const logoDarkInputRef = useRef(null)
  const faviconInputRef = useRef(null)
  const savedSnapshotRef = useRef(null)
  const navigate = useNavigate()
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [uploadingAboutPhoto, setUploadingAboutPhoto] = useState(false)
  const aboutPhotoInputRef = useRef(null)
  const previewIframeRef = useRef(null)
  const [activeTab, setActiveTab] = useState('content')
  const [previewDevice, setPreviewDevice] = useState('desktop')
  const [showMobilePreview, setShowMobilePreview] = useState(false)
  const [previewReloadKey, setPreviewReloadKey] = useState(0)

  useEffect(() => {
    async function load() {
      try {
        const [micrositeData, { data: { user } }] = await Promise.all([
          getMyMicrosite(),
          supabase.auth.getUser(),
        ])
        let merged = micrositeData
        if (user) {
          const { data: photographer } = await supabase
            .from('photographers').select('logo_r2_key, social_links, all_sessions_token').eq('id', user.id).maybeSingle()
          setAccountLogoKey(photographer?.logo_r2_key || null)
          setAccountAllSessionsToken(photographer?.all_sessions_token || null)
          // social_links is read-only here -- lives on photographers, not
          // microsites, merged in for display/preview only. Safe: handleSave's
          // explicit field list never includes it, so it can't get written back.
          merged = { ...micrositeData, social_links: photographer?.social_links || {} }
        }
        setSite(merged)
        savedSnapshotRef.current = JSON.stringify(merged)
      } catch (err) {
        console.error('Failed to load microsite:', err)
      }
    }
    load()
    getGalleries().then(setGalleries).catch(() => setGalleries([]))
    getSignupPages().then(setSignupPages).catch(() => setSignupPages([]))
    // Only used to decide whether "View live site" has anywhere to link
    // to -- a missing/pending domain just hides the affordance below.
    callManageCustomDomain('GET').then(setLiveDomain).catch(() => setLiveDomain(null))
  }, [])

  // Load every curated pairing's fonts once, so each option below can
  // render a live preview in its own actual typeface.
  useEffect(() => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = ALL_FONTS_HREF
    document.head.appendChild(link)
    return () => { document.head.removeChild(link) }
  }, [])

  async function handleLogoSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploadingLogo(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { data: { user } } = await supabase.auth.getUser()
      // Clean up the previous override file, if any, before uploading the new one.
      if (site.logo_r2_key) {
        await fetch(`${WORKER_URL}/delete/${encodeURIComponent(site.logo_r2_key)}`, {
          method: 'DELETE', headers: { Authorization: `Bearer ${session.access_token}` }
        }).catch(() => {})
      }
      const ext = file.name.split('.').pop()
      const r2Key = `photographers/${user.id}/logos/microsite-logo-${crypto.randomUUID()}.${ext}`
      const formData = new FormData()
      formData.append('file', file)
      formData.append('key', r2Key)
      const resp = await fetch(`${WORKER_URL}/watermark-upload`, {
        method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` }, body: formData
      })
      const result = await resp.json()
      if (!result.ok) throw new Error(result.error || 'Upload failed')
      patch({ logo_r2_key: r2Key })
    } catch (err) {
      console.error('Logo upload error:', err)
    } finally {
      setUploadingLogo(false)
    }
  }

  async function handleLogoRemove() {
    if (!site.logo_r2_key) return
    setUploadingLogo(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await fetch(`${WORKER_URL}/delete/${encodeURIComponent(site.logo_r2_key)}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${session.access_token}` }
      }).catch(() => {})
      patch({ logo_r2_key: null })
    } finally {
      setUploadingLogo(false)
    }
  }

  async function handleLogoDarkSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploadingLogoDark(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { data: { user } } = await supabase.auth.getUser()
      if (site.logo_dark_r2_key) {
        await fetch(`${WORKER_URL}/delete/${encodeURIComponent(site.logo_dark_r2_key)}`, {
          method: 'DELETE', headers: { Authorization: `Bearer ${session.access_token}` }
        }).catch(() => {})
      }
      const ext = file.name.split('.').pop()
      const r2Key = `photographers/${user.id}/logos/microsite-logo-dark-${crypto.randomUUID()}.${ext}`
      const formData = new FormData()
      formData.append('file', file)
      formData.append('key', r2Key)
      const resp = await fetch(`${WORKER_URL}/watermark-upload`, {
        method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` }, body: formData
      })
      const result = await resp.json()
      if (!result.ok) throw new Error(result.error || 'Upload failed')
      patch({ logo_dark_r2_key: r2Key })
    } catch (err) {
      console.error('Dark logo upload error:', err)
    } finally {
      setUploadingLogoDark(false)
    }
  }

  async function handleLogoDarkRemove() {
    if (!site.logo_dark_r2_key) return
    setUploadingLogoDark(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await fetch(`${WORKER_URL}/delete/${encodeURIComponent(site.logo_dark_r2_key)}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${session.access_token}` }
      }).catch(() => {})
      patch({ logo_dark_r2_key: null })
    } finally {
      setUploadingLogoDark(false)
    }
  }

  async function handleFaviconSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploadingFavicon(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { data: { user } } = await supabase.auth.getUser()
      // Clean up the previous favicon file, if any, before uploading the new one.
      if (site.favicon_r2_key) {
        await fetch(`${WORKER_URL}/delete/${encodeURIComponent(site.favicon_r2_key)}`, {
          method: 'DELETE', headers: { Authorization: `Bearer ${session.access_token}` }
        }).catch(() => {})
      }
      const ext = file.name.split('.').pop()
      // Same photographers/{id}/logos/ prefix as the logo/dark logo overrides --
      // that's what makes this servable via the existing public /logo/:key
      // worker route with no worker changes.
      const r2Key = `photographers/${user.id}/logos/microsite-favicon-${crypto.randomUUID()}.${ext}`
      const formData = new FormData()
      formData.append('file', file)
      formData.append('key', r2Key)
      const resp = await fetch(`${WORKER_URL}/watermark-upload`, {
        method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` }, body: formData
      })
      const result = await resp.json()
      if (!result.ok) throw new Error(result.error || 'Upload failed')
      patch({ favicon_r2_key: r2Key })
    } catch (err) {
      console.error('Favicon upload error:', err)
    } finally {
      setUploadingFavicon(false)
    }
  }

  async function handleFaviconRemove() {
    if (!site.favicon_r2_key) return
    setUploadingFavicon(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await fetch(`${WORKER_URL}/delete/${encodeURIComponent(site.favicon_r2_key)}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${session.access_token}` }
      }).catch(() => {})
      patch({ favicon_r2_key: null })
    } finally {
      setUploadingFavicon(false)
    }
  }

  async function handleAboutPhotoSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploadingAboutPhoto(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { data: { user } } = await supabase.auth.getUser()
      // Only clean up the previous file if it was a direct upload, not a
      // gallery-picked key -- a gallery key belongs to a real client
      // photo and must never be deleted from here. Absence of
      // '/galleries/' in the path is the signal, not a specific folder
      // name, since direct uploads share the /logos/ path with the
      // studio logo (the worker's upload endpoint only allows keys
      // containing /watermarks/ or /logos/).
      if (site.about_photo_key && !site.about_photo_key.includes('/galleries/')) {
        await fetch(`${WORKER_URL}/delete/${encodeURIComponent(site.about_photo_key)}`, {
          method: 'DELETE', headers: { Authorization: `Bearer ${session.access_token}` }
        }).catch(() => {})
      }
      const ext = file.name.split('.').pop()
      const r2Key = `photographers/${user.id}/logos/about-photo-${crypto.randomUUID()}.${ext}`
      const formData = new FormData()
      formData.append('file', file)
      formData.append('key', r2Key)
      const resp = await fetch(`${WORKER_URL}/watermark-upload`, {
        method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` }, body: formData
      })
      const result = await resp.json()
      if (!result.ok) throw new Error(result.error || 'Upload failed')
      patch({ about_photo_key: r2Key })
    } catch (err) {
      console.error('About photo upload error:', err)
    } finally {
      setUploadingAboutPhoto(false)
    }
  }

  async function handleAboutPhotoRemove() {
    if (!site.about_photo_key) return
    setUploadingAboutPhoto(true)
    try {
      // Same rule as above: only delete the underlying file for a direct
      // upload (no /galleries/ in the path), never for a gallery-sourced key.
      if (!site.about_photo_key.includes('/galleries/')) {
        const { data: { session } } = await supabase.auth.getSession()
        await fetch(`${WORKER_URL}/delete/${encodeURIComponent(site.about_photo_key)}`, {
          method: 'DELETE', headers: { Authorization: `Bearer ${session.access_token}` }
        }).catch(() => {})
      }
      patch({ about_photo_key: null })
    } finally {
      setUploadingAboutPhoto(false)
    }
  }

  function patch(fields) {
    setSite(prev => ({ ...prev, ...fields }))
  }

  async function handleSave() {
    if (!site) return
    setSaveState('saving')
    try {
      const {
        studio_name, tagline, bio, hero_image_key, contact_email,
        contact_phone, contact_address, contact_hours,
        gallery_source_type, gallery_source_gallery_id, gallery_source_image_keys,
        show_pricing, packages, pricing_note,
        testimonials, enabled, logo_r2_key,
        accent_color, theme, font_pairing, radius, section_variants,
        custom_display_font, custom_body_font,
        about_heading, about_photo_key, about_stats,
        hero_focus_x, hero_focus_y, about_focus_x, about_focus_y,
        hero_heading, hero_subheading, hero_cycle_image_keys, hero_mosaic_image_keys,
        hero_cycle_image_focus, hero_mosaic_image_focus,
        hero_show_primary_btn, hero_show_secondary_btn,
        about_title, about_subheading, gallery_title, gallery_subheading,
        pricing_title, pricing_subheading, testimonials_title, testimonials_subheading,
        contact_title, contact_subheading, logo_dark_r2_key, favicon_r2_key,
        gallery_image_focus, show_about, show_gallery, show_testimonials, show_contact,
        booking_signup_page_id,
        booking_show_all_sessions,
      } = site
      // Same completeness rule (quote AND name) the public renderer
      // already applies when deciding what to show -- an entry left
      // half-filled in the editor (started, never finished, never
      // explicitly removed) shouldn't get persisted at all, not just
      // hidden on render.
      const completeTestimonials = (testimonials || []).filter(t => t && t.quote && t.name)
      const saved = await updateMyMicrosite({
        studio_name, tagline, bio, hero_image_key, contact_email,
        contact_phone, contact_address, contact_hours,
        gallery_source_type, gallery_source_gallery_id, gallery_source_image_keys,
        show_pricing, packages, pricing_note,
        testimonials: completeTestimonials, enabled, logo_r2_key,
        accent_color, theme, font_pairing, radius, section_variants,
        custom_display_font, custom_body_font,
        about_heading, about_photo_key, about_stats,
        hero_focus_x, hero_focus_y, about_focus_x, about_focus_y,
        hero_heading, hero_subheading, hero_cycle_image_keys, hero_mosaic_image_keys,
        hero_cycle_image_focus, hero_mosaic_image_focus,
        hero_show_primary_btn, hero_show_secondary_btn,
        about_title, about_subheading, gallery_title, gallery_subheading,
        pricing_title, pricing_subheading, testimonials_title, testimonials_subheading,
        contact_title, contact_subheading, logo_dark_r2_key, favicon_r2_key,
        gallery_image_focus, show_about, show_gallery, show_testimonials, show_contact,
        booking_signup_page_id,
        booking_show_all_sessions,
      })
      setSite(saved)
      savedSnapshotRef.current = JSON.stringify(saved)
      setSaveState('saved')
      setPreviewReloadKey(k => k + 1)
      clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = setTimeout(() => setSaveState('idle'), 2000)
    } catch (err) {
      console.error('Failed to save microsite:', err)
      setSaveState('error')
    }
  }

  const isDirty = site && savedSnapshotRef.current !== null && JSON.stringify(site) !== savedSnapshotRef.current

  useEffect(() => {
    function handleBeforeUnload(e) {
      if (!isDirty) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  function handleBack() {
    if (isDirty) { setShowLeaveConfirm(true); return }
    navigate('/account')
  }

  useEffect(() => {
    if (!site) return
    // Resolve the account-logo fallback only for what the preview
    // iframe sees -- never mutate `site` itself, or a Save would bake
    // the account logo in as a permanent per-site override that goes
    // stale the next time the account logo changes.
    const previewPayload = { ...site, logo_r2_key: site.logo_r2_key || accountLogoKey, all_sessions_token: accountAllSessionsToken }
    previewIframeRef.current?.contentWindow?.postMessage(
      { type: 'microsite-preview-update', site: previewPayload },
      window.location.origin
    )
  }, [site, accountLogoKey, accountAllSessionsToken])

  if (!site) return null

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)', paddingTop: 64 }}>
      <div className="flex items-center justify-between px-6" style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 64, zIndex: 50, borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div className="flex items-center gap-3">
          <button onClick={handleBack} style={{ color: 'var(--text-muted)', display: 'flex', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Website</h1>
          {liveDomain?.status === 'active' && site.enabled && (
            <a href={`https://${liveDomain.domain}`} target="_blank" rel="noopener noreferrer" title="View live site"
              style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)', flexShrink: 0 }}>
              <ExternalLink size={15} />
            </a>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isDirty && saveState !== 'saving' && (
            <p className="text-xs" style={{ color: 'var(--warning)' }}>Unsaved changes</p>
          )}
          <SaveIndicator state={saveState} />
          <Button onClick={handleSave} disabled={saveState === 'saving' || !isDirty}>
            {saveState === 'saving' ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>

      <div>
      <div data-testid="desktop-tabs" className="hidden lg:block fixed z-30 w-full lg:w-[736px] px-6 pt-4 pb-3" style={{ top: 64, left: 0, background: 'var(--bg)' }}>
        <Tabs
          tabs={[{ id: 'content', label: 'Content' }, { id: 'design', label: 'Design' }]}
          active={activeTab}
          onChange={setActiveTab}
        />
      </div>
      <div className="max-w-2xl mx-auto px-6 pt-4 pb-24 space-y-6 lg:max-w-none lg:mx-0 lg:w-[736px] lg:pb-8 lg:pt-[84px]">
        {activeTab === 'content' && (
        <>
        <SettingsSection title="Status" description="Turn your website on or off at your custom domain.">
          <div className="px-5 py-4" style={{ background: 'var(--surface)' }}>
            <Toggle
              testId="microsite-enabled-toggle"
              checked={!!site.enabled}
              onChange={v => patch({ enabled: v })}
              label="Website enabled"
              description="When off, visitors to your custom domain see a basic placeholder instead."
            />
          </div>
        </SettingsSection>

        <SettingsSection title="Branding" description="The logo shown on your website. Defaults to your studio logo from Account → Profile unless you upload a different one here.">
          <div className="px-5 py-4 flex items-center gap-4" style={{ background: 'var(--surface)' }}>
            <LogoPreview r2Key={site.logo_r2_key || accountLogoKey} />
            <div className="flex flex-col gap-2">
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {site.logo_r2_key
                  ? 'Using a website-specific logo'
                  : accountLogoKey
                    ? 'Using your studio logo (Account → Profile)'
                    : 'No logo set'}
              </p>
              <button onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo} className="self-start text-sm font-medium px-3 py-1.5 rounded-lg text-left"
                style={{ background: 'var(--surface-raised)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                {uploadingLogo ? 'Uploading…' : site.logo_r2_key ? 'Replace' : 'Upload a different logo'}
              </button>
              {site.logo_r2_key && (
                <button onClick={handleLogoRemove} disabled={uploadingLogo} className="text-sm text-left" style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  Remove override
                </button>
              )}
              <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={handleLogoSelect} />
            </div>
          </div>
          {(site.logo_dark_r2_key || showDarkLogoSection) ? (
            <div className="px-5 py-4 flex items-center gap-4" style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
              <LogoPreview r2Key={site.logo_dark_r2_key} />
              <div className="flex flex-col gap-2">
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {site.logo_dark_r2_key ? 'Dark logo set' : 'Optional — for light backgrounds (scrolled nav / footer on light themes)'}
                </p>
                <button onClick={() => logoDarkInputRef.current?.click()} disabled={uploadingLogoDark} className="self-start text-sm font-medium px-3 py-1.5 rounded-lg text-left"
                  style={{ background: 'var(--surface-raised)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                  {uploadingLogoDark ? 'Uploading…' : site.logo_dark_r2_key ? 'Replace' : 'Upload a dark logo'}
                </button>
                {site.logo_dark_r2_key && (
                  <button onClick={handleLogoDarkRemove} disabled={uploadingLogoDark} className="text-sm text-left" style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    Remove
                  </button>
                )}
                <input ref={logoDarkInputRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={handleLogoDarkSelect} />
              </div>
            </div>
          ) : (
            <div className="px-5 py-3" style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setShowDarkLogoSection(true)} className="text-sm font-medium" style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                + Add a dark logo variant
              </button>
            </div>
          )}
          {(site.favicon_r2_key || showFaviconSection) ? (
            <div className="px-5 py-4 flex items-center gap-4" style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
              <LogoPreview r2Key={site.favicon_r2_key} />
              <div className="flex flex-col gap-2">
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {site.favicon_r2_key ? 'Favicon set' : 'Optional — shown in the browser tab on your custom domain. Square works best. Falls back to the FinalVault icon if not set.'}
                </p>
                <button onClick={() => faviconInputRef.current?.click()} disabled={uploadingFavicon} className="self-start text-sm font-medium px-3 py-1.5 rounded-lg text-left"
                  style={{ background: 'var(--surface-raised)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                  {uploadingFavicon ? 'Uploading…' : site.favicon_r2_key ? 'Replace' : 'Upload a favicon'}
                </button>
                {site.favicon_r2_key && (
                  <button onClick={handleFaviconRemove} disabled={uploadingFavicon} className="text-sm text-left" style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    Remove
                  </button>
                )}
                <input ref={faviconInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/x-icon,image/vnd.microsoft.icon" style={{ display: 'none' }} onChange={handleFaviconSelect} />
              </div>
            </div>
          ) : (
            <div className="px-5 py-3" style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setShowFaviconSection(true)} className="text-sm font-medium" style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                + Add a favicon
              </button>
            </div>
          )}
        </SettingsSection>

        <SettingsSection title="Hero" description="The headline and main photo shown at the top of your site.">
          <div className="px-5 py-4 space-y-4" style={{ background: 'var(--surface)' }}>
            <Input label="Studio name" value={site.studio_name || ''} onChange={v => patch({ studio_name: v })} placeholder="e.g. Docker Cap Photography" />
            <Input label="Tagline" value={site.tagline || ''} onChange={v => patch({ tagline: v })} placeholder="e.g. Portrait & Convention Photography" />
            <div>
              <Input label="Hero Heading" value={site.hero_heading || ''} onChange={v => patch({ hero_heading: v })} placeholder={site.studio_name || 'e.g. Docker Cap Photography'} />
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Falls back to Studio name above if left blank.</p>
            </div>
            <Input label="Hero Subheading" value={site.hero_subheading || ''} onChange={v => patch({ hero_subheading: v })} placeholder="e.g. Every session is about telling your story, not just taking a photo." />
            <LayoutHint options={HERO_VARIANT_OPTIONS} value={site.section_variants?.hero} fallback="fullbleed" />
            {(!site.section_variants?.hero || site.section_variants.hero === 'single' || site.section_variants.hero === 'zoom') && (
              <div className="flex items-center gap-4">
                <HeroThumbnail r2Key={site.hero_image_key} />
                <div className="flex flex-col gap-2">
                  <button onClick={() => setShowImagePicker(true)} className="text-sm font-medium px-3 py-1.5 rounded-lg"
                    style={{ background: 'var(--surface-raised)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                    {site.hero_image_key ? 'Change image' : 'Choose image'}
                  </button>
                  {site.hero_image_key && (
                    <>
                      <button onClick={() => setShowHeroFocalModal(true)} className="text-sm text-left" style={{ color: 'var(--text)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                        Adjust focus point
                      </button>
                      <button onClick={() => patch({ hero_image_key: null })} className="text-sm text-left" style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                        Remove
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {site.section_variants?.hero === 'cycle' && (
            <div className="px-5 py-4" style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
              <label className="text-sm font-medium block mb-2" style={{ color: 'var(--text)' }}>Cycle images</label>
              {(site.hero_cycle_image_keys || []).length > 0 ? (
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {(site.hero_cycle_image_keys || []).map(key => (
                    <GalleryPickThumb
                      key={key}
                      r2Key={key}
                      onRemove={() => patch({ hero_cycle_image_keys: (site.hero_cycle_image_keys || []).filter(k => k !== key) })}
                      onAdjustFocus={() => setFocalEditTarget({ field: 'cycle', key })}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>No photos selected yet — pick a few for the slideshow to cycle through.</p>
              )}
              <button onClick={() => setShowHeroCyclePicker(true)} className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg"
                style={{ background: 'var(--surface-raised)', color: 'var(--text)', border: '1px dashed var(--border)', cursor: 'pointer' }}>
                <Plus size={14} />{(site.hero_cycle_image_keys || []).length > 0 ? 'Edit selection' : 'Choose photos'}
              </button>
            </div>
          )}

          {site.section_variants?.hero === 'mosaic' && (
            <div className="px-5 py-4" style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
              <label className="text-sm font-medium block mb-2" style={{ color: 'var(--text)' }}>Mosaic images</label>
              {(site.hero_mosaic_image_keys || []).length > 0 ? (
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {(site.hero_mosaic_image_keys || []).map(key => (
                    <GalleryPickThumb
                      key={key}
                      r2Key={key}
                      onRemove={() => patch({ hero_mosaic_image_keys: (site.hero_mosaic_image_keys || []).filter(k => k !== key) })}
                      onAdjustFocus={() => setFocalEditTarget({ field: 'mosaic', key })}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>No photos selected yet — pick several for the background grid.</p>
              )}
              <button onClick={() => setShowHeroMosaicPicker(true)} className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg"
                style={{ background: 'var(--surface-raised)', color: 'var(--text)', border: '1px dashed var(--border)', cursor: 'pointer' }}>
                <Plus size={14} />{(site.hero_mosaic_image_keys || []).length > 0 ? 'Edit selection' : 'Choose photos'}
              </button>
            </div>
          )}

          <div className="px-5 py-4 space-y-3" style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
            <Toggle checked={site.hero_show_primary_btn !== false} onChange={v => patch({ hero_show_primary_btn: v })} label='Show "Book a Shoot" button' />
            {site.hero_show_primary_btn !== false && (
              <div className="pl-1">
                <label className="text-xs block mb-1" style={{ color: 'var(--text-muted)' }}>Links to</label>
                <select
                  value={site.booking_show_all_sessions ? '__all__' : (site.booking_signup_page_id || '')}
                  onChange={e => {
                    const v = e.target.value
                    if (v === '__all__') {
                      patch({ booking_signup_page_id: null, booking_show_all_sessions: true })
                    } else {
                      patch({ booking_signup_page_id: v || null, booking_show_all_sessions: false })
                    }
                  }}
                  style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}
                >
                  <option value="">Contact section (default)</option>
                  <option value="__all__">All active sessions</option>
                  {signupPages.map(p => (
                    <option key={p.id} value={p.id}>{p.title}{p.is_active === false ? ' (inactive)' : ''}</option>
                  ))}
                </select>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  {site.booking_show_all_sessions
                    ? 'Links to a page listing every active session — jumps straight to it instead if only one is active.'
                    : signupPages.length === 0
                      ? 'No signup pages yet — create one under Sessions to link here.'
                      : "Links straight to that signup page's public booking link instead of scrolling to Contact."}
                </p>
              </div>
            )}
            <Toggle checked={site.hero_show_secondary_btn !== false} onChange={v => patch({ hero_show_secondary_btn: v })} label='Show "View Gallery" button' />
          </div>
        </SettingsSection>

        <SettingsSection title="About" description="A dedicated section introducing you — photo, heading, bio, and a few stats."
          action={<Toggle checked={site.show_about !== false} onChange={v => patch({ show_about: v })} />}>
          {site.show_about !== false && (
            <div className="px-5 py-4 space-y-4" style={{ background: 'var(--surface)' }}>
              <Input label="Section title" value={site.about_title || ''} onChange={v => patch({ about_title: v })} placeholder="About" />
              <Input label="Section subheading" value={site.about_subheading || ''} onChange={v => patch({ about_subheading: v })} placeholder="The Story Behind The Lens" />
              <LayoutHint options={ABOUT_VARIANT_OPTIONS} value={site.section_variants?.about} fallback="split" />
              <Input label="Heading" value={site.about_heading || ''} onChange={v => patch({ about_heading: v })} placeholder="e.g. Hi, I'm Nick" />
              <Input label="Bio" value={site.bio || ''} onChange={v => patch({ bio: v })} type="textarea" placeholder="A few sentences about you and your work." />
              <div>
                <label className="text-sm font-medium block mb-2" style={{ color: 'var(--text)' }}>Photo</label>
                <div className="flex items-center gap-4">
                  {site.about_photo_key ? (
                    <div style={{ width: 80 }}>
                      <GalleryPickThumb
                        r2Key={site.about_photo_key}
                        onRemove={handleAboutPhotoRemove}
                        onAdjustFocus={() => setShowAboutFocalModal(true)}
                      />
                    </div>
                  ) : (
                    <HeroThumbnail r2Key={null} />
                  )}
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <button onClick={() => setShowAboutImagePicker(true)} className="text-sm font-medium px-3 py-1.5 rounded-lg"
                        style={{ background: 'var(--surface-raised)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                        Choose from gallery
                      </button>
                      <button onClick={() => aboutPhotoInputRef.current?.click()} disabled={uploadingAboutPhoto} className="text-sm font-medium px-3 py-1.5 rounded-lg"
                        style={{ background: 'var(--surface-raised)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                        {uploadingAboutPhoto ? 'Uploading…' : 'Upload photo'}
                      </button>
                    </div>
                    <input ref={aboutPhotoInputRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={handleAboutPhotoSelect} />
                  </div>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium block mb-2" style={{ color: 'var(--text)' }}>Stats</label>
                <StatsEditor stats={site.about_stats || []} onChange={v => patch({ about_stats: v })} />
              </div>
            </div>
          )}
        </SettingsSection>

        <SettingsSection title="Gallery" description="Which photos appear in your site's gallery section."
          action={<Toggle checked={site.show_gallery !== false} onChange={v => patch({ show_gallery: v })} />}>
          {site.show_gallery !== false && (
            <div className="px-5 py-4 space-y-4" style={{ background: 'var(--surface)' }}>
              <Input label="Section title" value={site.gallery_title || ''} onChange={v => patch({ gallery_title: v })} placeholder="Gallery" />
              <Input label="Section subheading" value={site.gallery_subheading || ''} onChange={v => patch({ gallery_subheading: v })} placeholder="A Glimpse Of My Best Work" />
              <LayoutHint options={GALLERY_VARIANT_OPTIONS} value={site.section_variants?.gallery} fallback="grid" />
              <div className="flex gap-2">
                <button
                  onClick={() => patch({ gallery_source_type: 'gallery', gallery_source_image_keys: null })}
                  className="flex-1 text-sm font-medium px-3 py-2 rounded-lg"
                  style={{
                    background: (site.gallery_source_type || 'gallery') === 'gallery' ? 'var(--accent)' : 'var(--surface-raised)',
                    color: (site.gallery_source_type || 'gallery') === 'gallery' ? 'var(--accent-fg)' : 'var(--text)',
                    border: '1px solid var(--border)', cursor: 'pointer',
                  }}
                >
                  Whole gallery
                </button>
                <button
                  onClick={() => patch({ gallery_source_type: 'manual', gallery_source_gallery_id: null })}
                  className="flex-1 text-sm font-medium px-3 py-2 rounded-lg"
                  style={{
                    background: site.gallery_source_type === 'manual' ? 'var(--accent)' : 'var(--surface-raised)',
                    color: site.gallery_source_type === 'manual' ? 'var(--accent-fg)' : 'var(--text)',
                    border: '1px solid var(--border)', cursor: 'pointer',
                  }}
                >
                  Hand-picked photos
                </button>
              </div>

              {(site.gallery_source_type || 'gallery') === 'gallery' ? (
                <GalleryPicker
                  galleries={galleries}
                  value={site.gallery_source_gallery_id}
                  onChange={id => patch({ gallery_source_gallery_id: id })}
                  allowNone
                  noneLabel="No gallery selected"
                  noneSubLabel="The gallery section will be hidden"
                />
              ) : (
                <div>
                  {(site.gallery_source_image_keys || []).length > 0 ? (
                    <div className="grid grid-cols-4 gap-2 mb-3">
                      {(site.gallery_source_image_keys || []).map(key => (
                        <GalleryPickThumb
                          key={key}
                          r2Key={key}
                          onRemove={() => patch({ gallery_source_image_keys: (site.gallery_source_image_keys || []).filter(k => k !== key) })}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>No photos selected yet.</p>
                  )}
                  <button onClick={() => setShowGalleryImagesPicker(true)} className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg"
                    style={{ background: 'var(--surface-raised)', color: 'var(--text)', border: '1px dashed var(--border)', cursor: 'pointer' }}>
                    <Plus size={14} />{(site.gallery_source_image_keys || []).length > 0 ? 'Edit selection' : 'Choose photos'}
                  </button>
                </div>
              )}

              {galleryPreviewKeys.length > 0 && (
                <div>
                  <label className="text-sm font-medium block mb-1" style={{ color: 'var(--text)' }}>Photo focus points</label>
                  <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Adjust how any photo is cropped in the gallery grid. Applies whether you're using the whole gallery or hand-picked photos.</p>
                  <div className="grid grid-cols-4 gap-2">
                    {galleryPreviewKeys.map(key => (
                      <GalleryPickThumb
                        key={key}
                        r2Key={key}
                        onAdjustFocus={() => setFocalEditTarget({ field: 'gallery', key })}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </SettingsSection>

        <SettingsSection
          title="Sessions & pricing"
          description="Optional — show your session packages and pricing."
          action={<Toggle checked={site.show_pricing !== false} onChange={v => patch({ show_pricing: v })} />}
        >
          {site.show_pricing !== false && (
            <div className="px-5 py-4 space-y-4" style={{ background: 'var(--surface)' }}>
              <Input label="Section title" value={site.pricing_title || ''} onChange={v => patch({ pricing_title: v })} placeholder="Pricing" />
              <Input label="Section subheading" value={site.pricing_subheading || ''} onChange={v => patch({ pricing_subheading: v })} placeholder="Sessions & Packages" />
              <LayoutHint options={PRICING_VARIANT_OPTIONS} value={site.section_variants?.pricing} fallback="list" />
              <PackagesEditor packages={site.packages || []} onChange={v => patch({ packages: v })} />
              <Input label="Note" value={site.pricing_note || ''} onChange={v => patch({ pricing_note: v })} placeholder="e.g. Custom quotes available on request." />
            </div>
          )}
        </SettingsSection>

        <SettingsSection title="Testimonials" description="Quotes from past clients, shown on your site."
          action={<Toggle testId="show-testimonials-toggle" checked={site.show_testimonials !== false} onChange={v => patch({ show_testimonials: v })} />}>
          {site.show_testimonials !== false && (
            <div className="px-5 py-4 space-y-4" style={{ background: 'var(--surface)' }}>
              <Input label="Section title" value={site.testimonials_title || ''} onChange={v => patch({ testimonials_title: v })} placeholder="Reviews" />
              <Input label="Section subheading" value={site.testimonials_subheading || ''} onChange={v => patch({ testimonials_subheading: v })} placeholder="What Clients Are Saying" />
              <LayoutHint options={TESTIMONIAL_VARIANT_OPTIONS} value={site.section_variants?.testimonials} fallback="stack" />
              <TestimonialsEditor
                testimonials={site.testimonials || []}
                onChange={v => patch({ testimonials: v })}
                onEditPhoto={i => setTestimonialPhotoEditIndex(i)}
                onAdjustFocus={i => setTestimonialFocalIndex(i)}
              />
            </div>
          )}
        </SettingsSection>

        <SettingsSection title="Contact" description="How visitors can reach you."
          action={<Toggle checked={site.show_contact !== false} onChange={v => patch({ show_contact: v })} />}>
          {site.show_contact !== false && (
            <div className="px-5 py-4 space-y-4" style={{ background: 'var(--surface)' }}>
              <Input label="Section title" value={site.contact_title || ''} onChange={v => patch({ contact_title: v })} placeholder="Contact" />
              <Input label="Section subheading" value={site.contact_subheading || ''} onChange={v => patch({ contact_subheading: v })} placeholder="Let's Create Something Beautiful Together" />
              <LayoutHint options={CONTACT_VARIANT_OPTIONS} value={site.section_variants?.contact} fallback="simple" />
              <Input label="Contact email" value={site.contact_email || ''} onChange={v => patch({ contact_email: v })} type="email" placeholder="hello@yourstudio.com" />
              <Input label="Phone" value={site.contact_phone || ''} onChange={v => patch({ contact_phone: v })} placeholder="(614) 555-0123" />
              <Input label="Address" value={site.contact_address || ''} onChange={v => patch({ contact_address: v })} placeholder="Studio address or general area" />
              <Input label="Hours" value={site.contact_hours || ''} onChange={v => patch({ contact_hours: v })} type="textarea" placeholder="e.g. Mon–Fri: 9am–6pm" />
            </div>
          )}
        </SettingsSection>
        </>
        )}

        {activeTab === 'design' && (
        <>
        <SettingsSection title="Theme" description="The overall color mode for your site — accent color stays independent of this.">
          <div className="px-5 py-4" style={{ background: 'var(--surface)' }}>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-3">
              {THEME_OPTIONS.map(t => {
                const isActive = (site.theme || DEFAULT_THEME) === t.id
                return (
                  <button key={t.id} onClick={() => patch({ theme: t.id })} title={t.name}
                    className="flex flex-col items-center gap-1.5"
                    style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                    <div style={{
                      display: 'flex', width: 44, height: 32, borderRadius: 8, overflow: 'hidden',
                      boxShadow: isActive ? '0 0 0 2px var(--surface), 0 0 0 4px #6366f1' : '0 0 0 1px var(--border)',
                    }}>
                      <div style={{ flex: 1, background: t.bg }} />
                      <div style={{ flex: 1, background: t.ink }} />
                    </div>
                    <span className="text-xs" style={{ color: isActive ? 'var(--text)' : 'var(--text-muted)', fontWeight: isActive ? 600 : 400 }}>{t.name}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </SettingsSection>

        <SettingsSection title="Colors" description="Accent color used for buttons, links, and highlights.">
          <div className="px-5 py-4" style={{ background: 'var(--surface)' }}>
            {(() => {
              const currentTheme = THEME_OPTIONS.find(t => t.id === (site.theme || DEFAULT_THEME)) || THEME_OPTIONS[0]
              const swatchList = currentTheme.dark ? ACCENT_SWATCHES_DARK : ACCENT_SWATCHES
              return (
                <div className="flex gap-3 flex-wrap">
                  {swatchList.map(s => {
                    const isActive = (site.accent_color || '#B5651D') === s.hex
                    return (
                      <button key={s.hex} onClick={() => patch({ accent_color: s.hex })} title={s.name}
                        className="w-8 h-8 rounded-full"
                        style={{
                          background: s.hex, cursor: 'pointer',
                          boxShadow: isActive ? '0 0 0 2px var(--surface), 0 0 0 4px var(--text)' : 'none',
                        }} />
                    )
                  })}
                  <div className="relative w-8 h-8" title="Custom color">
                    <input
                      type="color"
                      value={site.accent_color || '#B5651D'}
                      onChange={e => patch({ accent_color: e.target.value })}
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', border: 'none', padding: 0 }}
                    />
                    <div
                      className="w-8 h-8 rounded-full pointer-events-none"
                      style={{
                        background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)',
                        boxShadow: !swatchList.some(s => s.hex === (site.accent_color || '#B5651D'))
                          ? '0 0 0 2px var(--surface), 0 0 0 4px var(--text)'
                          : 'none',
                      }}
                    />
                  </div>
                </div>
              )
            })()}
          </div>
        </SettingsSection>

        <SettingsSection title="Typography & Shape" description="Fonts and button shape used across the whole site.">
          <div>
            <SectionPicker
              label="Fonts"
              options={[
                ...Object.entries(FONT_PAIRINGS).map(([id, pairing]) => ({ id, name: pairing.name, pairing })),
                {
                  id: 'custom', name: 'Custom',
                  pairing: {
                    display: (DISPLAY_FONT_OPTIONS.find(f => f.id === (site.custom_display_font || DEFAULT_CUSTOM_DISPLAY)) || {}).family,
                    body: (BODY_FONT_OPTIONS.find(f => f.id === (site.custom_body_font || DEFAULT_CUSTOM_BODY)) || {}).family,
                  },
                },
              ]}
              value={site.font_pairing} fallback={DEFAULT_FONT_PAIRING}
              onChange={id => patch({ font_pairing: id })}
              renderOption={(opt, isActive) => (
                <>
                  <div style={{ fontFamily: opt.pairing.display, fontSize: 18, color: 'var(--text)' }}>{isActive ? '✓ ' : ''}Aa {opt.name}</div>
                  <div style={{ fontFamily: opt.pairing.body, fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>the quick brown fox</div>
                </>
              )} />
            {site.font_pairing === 'custom' && (
              <>
                <SectionPicker label="Display font" options={DISPLAY_FONT_OPTIONS} value={site.custom_display_font} fallback={DEFAULT_CUSTOM_DISPLAY}
                  onChange={id => patch({ custom_display_font: id })}
                  renderOption={(opt, isActive) => (
                    <div style={{ fontFamily: opt.family, fontSize: 17, color: isActive ? '#6366f1' : 'var(--text)' }}>
                      {isActive ? '✓ ' : ''}{opt.name}
                    </div>
                  )} />
                <SectionPicker label="Body font" options={BODY_FONT_OPTIONS} value={site.custom_body_font} fallback={DEFAULT_CUSTOM_BODY}
                  onChange={id => patch({ custom_body_font: id })}
                  renderOption={(opt, isActive) => (
                    <div style={{ fontFamily: opt.family, fontSize: 17, color: isActive ? '#6366f1' : 'var(--text)' }}>
                      {isActive ? '✓ ' : ''}{opt.name}
                    </div>
                  )} />
              </>
            )}
            <SectionPicker label="Button Shape" options={RADIUS_OPTIONS} value={site.radius} fallback={DEFAULT_RADIUS}
              onChange={id => patch({ radius: id })} isLast />
          </div>
        </SettingsSection>

        <SettingsSection title="Section Styles" description="Layout variant for each section of your site.">
          <div>
            <SectionPicker label="Hero style" options={HERO_VARIANT_OPTIONS} value={site.section_variants?.hero} fallback="fullbleed"
              onChange={id => patch({ section_variants: { ...(site.section_variants || {}), hero: id } })} />
            <SectionPicker label="Mobile Menu style" options={MOBILE_MENU_VARIANT_OPTIONS} value={site.section_variants?.mobileMenu} fallback="drawer"
              onChange={id => patch({ section_variants: { ...(site.section_variants || {}), mobileMenu: id } })} />
            <SectionPicker label="About style" options={ABOUT_VARIANT_OPTIONS} value={site.section_variants?.about} fallback="split"
              onChange={id => patch({ section_variants: { ...(site.section_variants || {}), about: id } })} />
            <SectionPicker label="Gallery style" options={GALLERY_VARIANT_OPTIONS} value={site.section_variants?.gallery} fallback="grid"
              onChange={id => patch({ section_variants: { ...(site.section_variants || {}), gallery: id } })} />
            <SectionPicker label="Pricing style" options={PRICING_VARIANT_OPTIONS} value={site.section_variants?.pricing} fallback="list"
              onChange={id => patch({ section_variants: { ...(site.section_variants || {}), pricing: id } })} />
            <SectionPicker label="Testimonials style" options={TESTIMONIAL_VARIANT_OPTIONS} value={site.section_variants?.testimonials} fallback="stack"
              onChange={id => patch({ section_variants: { ...(site.section_variants || {}), testimonials: id } })} />
            <SectionPicker label="Contact style" options={CONTACT_VARIANT_OPTIONS} value={site.section_variants?.contact} fallback="simple"
              onChange={id => patch({ section_variants: { ...(site.section_variants || {}), contact: id } })} />
            <SectionPicker label="Footer style" options={FOOTER_VARIANT_OPTIONS} value={site.section_variants?.footer} fallback="accented"
              onChange={id => patch({ section_variants: { ...(site.section_variants || {}), footer: id } })} isLast />
          </div>
        </SettingsSection>
        </>
        )}
      </div>

      <div className="hidden lg:flex flex-col p-6" style={{
        borderLeft: '1px solid var(--border)', background: 'var(--surface-raised)',
        position: 'fixed', top: 64, left: 736, right: 0, bottom: 0,
      }}>
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>Preview</p>
          <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--surface)' }}>
            <button onClick={() => setPreviewDevice('desktop')} className="px-3 py-1 rounded-md text-xs font-medium"
              style={{ background: previewDevice === 'desktop' ? 'var(--surface-raised)' : 'transparent', color: 'var(--text)', border: 'none', cursor: 'pointer' }}>
              Desktop
            </button>
            <button onClick={() => setPreviewDevice('mobile')} className="px-3 py-1 rounded-md text-xs font-medium"
              style={{ background: previewDevice === 'mobile' ? 'var(--surface-raised)' : 'transparent', color: 'var(--text)', border: 'none', cursor: 'pointer' }}>
              Mobile
            </button>
          </div>
        </div>
        <div className="flex-1 rounded-xl overflow-hidden" style={{
          border: '1px solid var(--border)', background: '#fff',
          width: previewDevice === 'mobile' ? 390 : '100%', maxWidth: '100%',
          margin: previewDevice === 'mobile' ? '0 auto' : 0,
        }}>
          <iframe ref={previewIframeRef} key={previewReloadKey} src="/website/preview" title="Website preview" style={{ width: '100%', height: '100%', border: 'none' }} />
        </div>
        <p className="text-xs mt-3 flex-shrink-0" style={{ color: 'var(--text-muted)' }}>Updates automatically after you save.</p>
      </div>
      </div>

      <MobileBottomNav
        breakpoint="lg"
        items={[
          { onClick: () => { setActiveTab('content'); setShowMobilePreview(false) }, label: 'Content', icon: FileText, active: activeTab === 'content' && !showMobilePreview, testId: 'mobile-nav-content' },
          { onClick: () => { setActiveTab('design'); setShowMobilePreview(false) }, label: 'Design', icon: Palette, active: activeTab === 'design' && !showMobilePreview, testId: 'mobile-nav-design' },
          { onClick: () => setShowMobilePreview(true), label: 'Preview', icon: Eye, active: showMobilePreview, testId: 'mobile-nav-preview' },
        ]}
      />

      {showMobilePreview && (
        <div data-testid="mobile-preview-overlay" className="lg:hidden fixed left-0 right-0 top-0 z-30 flex flex-col" style={{ background: '#fff', bottom: 'calc(60px + env(safe-area-inset-bottom))' }}>
          <div className="flex items-center justify-between px-4 flex-shrink-0" style={{ height: 56, borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
            <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>Preview</p>
            <button onClick={() => setShowMobilePreview(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}>
              <X size={20} />
            </button>
          </div>
          <iframe src="/website/preview" title="Website preview" style={{ flex: 1, width: '100%', border: 'none' }} />
        </div>
      )}

      {showImagePicker && (
        <MicrositeImagePicker
          onSelect={key => patch({ hero_image_key: key })}
          onClose={() => setShowImagePicker(false)}
        />
      )}

      {testimonialPhotoEditIndex !== null && (
        <MicrositeImagePicker
          onSelect={key => {
            const next = [...(site.testimonials || [])]
            next[testimonialPhotoEditIndex] = { ...next[testimonialPhotoEditIndex], photo_gallery_image_key: key }
            patch({ testimonials: next })
            setTestimonialPhotoEditIndex(null)
          }}
          onClose={() => setTestimonialPhotoEditIndex(null)}
        />
      )}

      {testimonialFocalIndex !== null && (
        <MicrositeFocalPointModal
          r2Key={site.testimonials[testimonialFocalIndex]?.photo_gallery_image_key}
          initialFocusX={site.testimonials[testimonialFocalIndex]?.photo_focus_x ?? 0.5}
          initialFocusY={site.testimonials[testimonialFocalIndex]?.photo_focus_y ?? 0.5}
          onSave={(x, y) => {
            const next = [...(site.testimonials || [])]
            next[testimonialFocalIndex] = { ...next[testimonialFocalIndex], photo_focus_x: x, photo_focus_y: y }
            patch({ testimonials: next })
            setTestimonialFocalIndex(null)
          }}
          onClose={() => setTestimonialFocalIndex(null)}
        />
      )}

      {showAboutImagePicker && (
        <MicrositeImagePicker
          onSelect={key => patch({ about_photo_key: key })}
          onClose={() => setShowAboutImagePicker(false)}
        />
      )}

      {showHeroFocalModal && (
        <MicrositeFocalPointModal
          r2Key={site.hero_image_key}
          initialFocusX={site.hero_focus_x ?? 0.5}
          initialFocusY={site.hero_focus_y ?? 0.5}
          onSave={(x, y) => { patch({ hero_focus_x: x, hero_focus_y: y }); setShowHeroFocalModal(false) }}
          onClose={() => setShowHeroFocalModal(false)}
        />
      )}

      {showAboutFocalModal && (
        <MicrositeFocalPointModal
          r2Key={site.about_photo_key}
          initialFocusX={site.about_focus_x ?? 0.5}
          initialFocusY={site.about_focus_y ?? 0.5}
          onSave={(x, y) => { patch({ about_focus_x: x, about_focus_y: y }); setShowAboutFocalModal(false) }}
          onClose={() => setShowAboutFocalModal(false)}
        />
      )}

      {focalEditTarget && (() => {
        const focusFieldMap = { cycle: 'hero_cycle_image_focus', mosaic: 'hero_mosaic_image_focus', gallery: 'gallery_image_focus' }
        const fieldName = focusFieldMap[focalEditTarget.field]
        return (
          <MicrositeFocalPointModal
            r2Key={focalEditTarget.key}
            initialFocusX={(site[fieldName]?.[focalEditTarget.key])?.x ?? 0.5}
            initialFocusY={(site[fieldName]?.[focalEditTarget.key])?.y ?? 0.5}
            onSave={(x, y) => {
              patch({ [fieldName]: { ...(site[fieldName] || {}), [focalEditTarget.key]: { x, y } } })
              setFocalEditTarget(null)
            }}
            onClose={() => setFocalEditTarget(null)}
          />
        )
      })()}

      {showGalleryImagesPicker && (
        <MicrositeGalleryImagesPicker
          initialKeys={site.gallery_source_image_keys || []}
          onDone={keys => { patch({ gallery_source_image_keys: keys }); setShowGalleryImagesPicker(false) }}
          onClose={() => setShowGalleryImagesPicker(false)}
        />
      )}

      {showHeroCyclePicker && (
        <MicrositeGalleryImagesPicker
          initialKeys={site.hero_cycle_image_keys || []}
          onDone={keys => { patch({ hero_cycle_image_keys: keys }); setShowHeroCyclePicker(false) }}
          onClose={() => setShowHeroCyclePicker(false)}
        />
      )}

      {showHeroMosaicPicker && (
        <MicrositeGalleryImagesPicker
          initialKeys={site.hero_mosaic_image_keys || []}
          onDone={keys => { patch({ hero_mosaic_image_keys: keys }); setShowHeroMosaicPicker(false) }}
          onClose={() => setShowHeroMosaicPicker(false)}
        />
      )}

      {showLeaveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowLeaveConfirm(false)}>
          <div className="w-full max-w-sm rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4">
              <h3 className="text-sm font-semibold mb-1.5" style={{ color: 'var(--text)' }}>Unsaved changes</h3>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>You have changes that haven't been saved yet.</p>
            </div>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderTop: '1px solid var(--border)' }}>
              <Button variant="secondary" onClick={() => setShowLeaveConfirm(false)}>Cancel</Button>
              <Button variant="danger" onClick={() => navigate('/account')}>Leave without saving</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
