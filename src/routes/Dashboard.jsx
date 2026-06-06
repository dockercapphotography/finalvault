import { useState, useEffect, useRef } from 'react'
import { useScrollLock } from '../hooks/useScrollLock.js'
import { useNavigate, useLocation } from 'react-router-dom'
import {Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Circle, Folder, FolderPlus, Home, Images, Plus, Search, Share2, SlidersHorizontal, Upload, X} from 'lucide-react'
import { getGalleries, getFolders, getTags, createFolder, moveGalleryToFolder } from '../utils/galleryApi.js'
import { getBookmarkedGalleryIds } from '../utils/bookmarkApi.js'
import { supabase } from '../supabaseClient.js'
import GalleryGrid from '../components/galleries/GalleryGrid.jsx'
import GalleryCard from '../components/galleries/GalleryCard.jsx'
import { DndContext, MouseSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core'
import { FolderContext } from '../contexts/FolderContext.jsx'
import FolderCard from '../components/galleries/FolderCard.jsx'
import Button from '../components/ui/Button.jsx'
import Toast from '../components/ui/Toast.jsx'

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

// ── Calendar range picker ─────────────────────────────────────────────────────

function CalendarRangePicker({ value, onChange }) {
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [hovering, setHovering] = useState(null)
  const [picker, setPicker] = useState(null)

  const from = value?.from || null
  const to = value?.to || null

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }
  function startOfDay(d) { const c = new Date(d); c.setHours(0,0,0,0); return c }

  function handleDayClick(date) {
    if (!from || (from && to)) onChange({ from: startOfDay(date), to: null })
    else if (date < from) onChange({ from: startOfDay(date), to: startOfDay(from) })
    else onChange({ from, to: startOfDay(date) })
  }

  function isInRange(date) {
    if (!from) return false
    const end = to || hovering
    if (!end) return false
    const lo = from < end ? from : end
    const hi = from < end ? end : from
    return date > lo && date < hi
  }

  function isSelected(date) {
    if (from && date.toDateString() === from.toDateString()) return true
    if (to && date.toDateString() === to.toDateString()) return true
    return false
  }

  const firstDay = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate()
  const cells = []
  for (let i = firstDay - 1; i >= 0; i--) {
    const pm = viewMonth === 0 ? 11 : viewMonth - 1
    const py = viewMonth === 0 ? viewYear - 1 : viewYear
    cells.push({ date: new Date(py, pm, daysInPrevMonth - i), faded: true })
  }
  for (let d = 1; d <= daysInMonth; d++) cells.push({ date: new Date(viewYear, viewMonth, d), faded: false })
  const totalCells = 42
  let nextD = 1
  while (cells.length < totalCells) {
    const nm = viewMonth === 11 ? 0 : viewMonth + 1
    const ny = viewMonth === 11 ? viewYear + 1 : viewYear
    cells.push({ date: new Date(ny, nm, nextD++), faded: true })
  }

  return (
    <div style={{ width: 300 }}>
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
          <ChevronLeft size={16} />
        </button>
        <div className="flex items-center gap-1">
          <button onClick={() => setPicker(p => p === 'month' ? null : 'month')}
            className="text-sm font-semibold px-1.5 py-0.5 rounded-md"
            style={{ background: picker === 'month' ? 'rgba(99,102,241,0.1)' : 'transparent', color: picker === 'month' ? '#6366f1' : 'var(--text)', border: 'none', cursor: 'pointer' }}>
            {MONTHS[viewMonth]}
          </button>
          <button onClick={() => setPicker(p => p === 'year' ? null : 'year')}
            className="text-sm font-semibold px-1.5 py-0.5 rounded-md"
            style={{ background: picker === 'year' ? 'rgba(99,102,241,0.1)' : 'transparent', color: picker === 'year' ? '#6366f1' : 'var(--text)', border: 'none', cursor: 'pointer' }}>
            {viewYear}
          </button>
        </div>
        <button onClick={nextMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
          <ChevronRight size={16} />
        </button>
      </div>

      {picker === 'month' && (
        <div className="grid grid-cols-3 gap-1">
          {MONTHS.map((m, i) => (
            <button key={i} onClick={() => { setViewMonth(i); setPicker(null) }}
              className="py-2 rounded-lg text-sm font-medium"
              style={{ background: i === viewMonth ? '#6366f1' : 'transparent', color: i === viewMonth ? '#fff' : 'var(--text)', border: 'none', cursor: 'pointer' }}
              onMouseEnter={e => { if (i !== viewMonth) e.currentTarget.style.background = 'var(--surface-raised)' }}
              onMouseLeave={e => { if (i !== viewMonth) e.currentTarget.style.background = 'transparent' }}>
              {m.slice(0, 3)}
            </button>
          ))}
        </div>
      )}

      {picker === 'year' && (
        <div className="grid grid-cols-3 gap-1 overflow-y-auto" style={{ maxHeight: 220 }}>
          {Array.from({ length: 20 }, (_, i) => today.getFullYear() - 5 + i).map(y => (
            <button key={y} onClick={() => { setViewYear(y); setPicker(null) }}
              className="py-2 rounded-lg text-sm font-medium"
              style={{ background: y === viewYear ? '#6366f1' : 'transparent', color: y === viewYear ? '#fff' : 'var(--text)', border: 'none', cursor: 'pointer' }}
              onMouseEnter={e => { if (y !== viewYear) e.currentTarget.style.background = 'var(--surface-raised)' }}
              onMouseLeave={e => { if (y !== viewYear) e.currentTarget.style.background = 'transparent' }}>
              {y}
            </button>
          ))}
        </div>
      )}

      {picker === null && (
        <>
          <div className="grid grid-cols-7 mb-1">
            {DAYS.map((d, i) => (
              <div key={i} className="text-center text-xs font-medium py-2" style={{ color: 'var(--text-muted)' }}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map(({ date, faded }, i) => {
              const sel = isSelected(date)
              const inRange = isInRange(date)
              const isToday = date.toDateString() === today.toDateString()
              return (
                <button key={i}
                  onClick={() => !faded && handleDayClick(date)}
                  onMouseEnter={() => { if (!faded && from && !to) setHovering(date) }}
                  onMouseLeave={() => setHovering(null)}
                  style={{
                    background: sel ? '#6366f1' : inRange ? 'rgba(99,102,241,0.12)' : 'transparent',
                    color: sel ? '#fff' : isToday ? '#6366f1' : 'var(--text)',
                    opacity: faded ? 0.25 : 1,
                    border: 'none', borderRadius: 6,
                    cursor: faded ? 'default' : 'pointer',
                    padding: '10px 0', fontSize: 12,
                    fontWeight: sel || isToday ? '600' : '400',
                  }}>
                  {date.getDate()}
                </button>
              )
            })}
          </div>
          {(from || to) && (
            <button onClick={() => onChange({ from: null, to: null })}
              className="w-full text-xs mt-3 py-1.5 rounded-lg"
              style={{ color: 'var(--text-muted)', background: 'var(--surface-raised)', border: 'none', cursor: 'pointer' }}>
              Clear dates
            </button>
          )}
        </>
      )}
      </div>
  )
}

function DateFilterPanel({ value, onChange, presets }) {
  return (
    <div className="flex gap-4 p-4" style={{ minWidth: 500 }}>
      <CalendarRangePicker
        value={value?.range || { from: null, to: null }}
        onChange={range => onChange({ type: 'range', range })}
      />
      <div style={{ width: 1, background: 'var(--border)', flexShrink: 0 }} />
      <div className="flex flex-col gap-0.5 overflow-y-auto" style={{ minWidth: 140, maxHeight: 300 }}>
        <p className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Quick Search</p>
        {presets.map(p => {
          const active = value?.type === 'preset' && value?.preset === p.value
          return (
            <button key={p.value} onClick={() => onChange({ type: 'preset', preset: p.value })}
              className="text-left px-2 py-1.5 rounded-lg text-sm"
              style={{ background: active ? 'rgba(99,102,241,0.08)' : 'transparent', color: active ? '#6366f1' : 'var(--text)', border: 'none', cursor: 'pointer', fontWeight: active ? '600' : '400' }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--surface-raised)' }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}>
              {p.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}


function TagsPill({ value, onChange, tags }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const active = value.length > 0

  useEffect(() => {
    if (!open) return
    const h = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  function toggleTag(id) {
    onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id])
  }

  const label = active
    ? value.length === 1
      ? tags.find(t => t.id === value[0])?.name || 'Tags'
      : `Tags · ${value.length}`
    : 'Tags'

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium"
        style={{ background: active ? 'rgba(99,102,241,0.1)' : 'var(--surface)', border: `1px solid ${active ? '#6366f1' : 'var(--border)'}`, color: active ? '#6366f1' : 'var(--text-muted)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
        <span className="truncate" style={{ maxWidth: 120 }}>{label}</span>
        {active
          ? <X size={12} onClick={e => { e.stopPropagation(); onChange([]) }} style={{ cursor: 'pointer', flexShrink: 0 }} />
          : <ChevronDown size={12} style={{ flexShrink: 0 }} />}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 rounded-xl shadow-lg z-30"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 180, maxHeight: 280, overflowY: 'auto' }}>
          {tags.map(tag => {
            const selected = value.includes(tag.id)
            return (
              <button key={tag.id} onClick={() => toggleTag(tag.id)}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left"
                style={{ background: selected ? 'rgba(99,102,241,0.06)' : 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text)' }}
                onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'var(--surface-raised)' }}
                onMouseLeave={e => { e.currentTarget.style.background = selected ? 'rgba(99,102,241,0.06)' : 'transparent' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: tag.color || '#6366f1', flexShrink: 0 }} />
                <span className="flex-1">{tag.name}</span>
                {selected && <Check size={13} style={{ color: '#6366f1', flexShrink: 0 }} />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatusPill({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const options = [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
    { value: 'expired', label: 'Expired' },
  ]
  const activeLabel = options.find(o => o.value === value)?.label

  useEffect(() => {
    if (!open) return
    const h = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium"
        style={{ background: value ? 'rgba(99,102,241,0.1)' : 'var(--surface)', border: `1px solid ${value ? '#6366f1' : 'var(--border)'}`, color: value ? '#6366f1' : 'var(--text-muted)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
        {value ? activeLabel : 'Status'}
        {value
          ? <X size={12} onClick={e => { e.stopPropagation(); onChange(null) }} style={{ cursor: 'pointer' }} />
          : <ChevronDown size={12} />}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 rounded-xl shadow-lg z-30 overflow-hidden"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 140 }}>
          {options.map(opt => (
            <button key={opt.value} onClick={() => { onChange(opt.value); setOpen(false) }}
              className="w-full px-4 py-2.5 text-sm text-left"
              style={{ background: value === opt.value ? 'rgba(99,102,241,0.08)' : 'transparent', color: value === opt.value ? '#6366f1' : 'var(--text)', border: 'none', cursor: 'pointer' }}
              onMouseEnter={e => { if (value !== opt.value) e.currentTarget.style.background = 'var(--surface-raised)' }}
              onMouseLeave={e => { if (value !== opt.value) e.currentTarget.style.background = 'transparent' }}>
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function DateRangePill({ label, value, onChange, presets }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const active = value !== null

  useEffect(() => {
    if (!open) return
    const h = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  function getLabel() {
    if (!value) return label
    if (value.type === 'preset') return presets.find(p => p.value === value.preset)?.label || label
    if (value.type === 'range' && value.range?.from) {
      const f = value.range.from.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      const t = value.range.to ? value.range.to.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '...'
      return `${f} – ${t}`
    }
    return label
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium"
        style={{ background: active ? 'rgba(99,102,241,0.1)' : 'var(--surface)', border: `1px solid ${active ? '#6366f1' : 'var(--border)'}`, color: active ? '#6366f1' : 'var(--text-muted)', cursor: 'pointer', maxWidth: 200 }}>
        <span className="truncate">{getLabel()}</span>
        {active
          ? <X size={12} onClick={e => { e.stopPropagation(); onChange(null); setOpen(false) }} style={{ cursor: 'pointer', flexShrink: 0 }} />
          : <ChevronDown size={12} style={{ flexShrink: 0 }} />}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 rounded-2xl shadow-xl z-30 overflow-hidden"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <DateFilterPanel
            value={value}
            onChange={v => { onChange(v); if (v?.type === 'preset') setOpen(false) }}
            presets={presets}
          />
        </div>
      )}
    </div>
  )
}

function MobileFilterSheet({ open, onClose, statusFilter, setStatusFilter, eventDateFilter, setEventDateFilter, expiryFilter, setExpiryFilter, tagFilter, setTagFilter, allTags, eventPresets, expiryPresets, hasFilters, onClear }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (open) requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
    else setVisible(false)
  }, [open])

  const statusOptions = [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
    { value: 'expired', label: 'Expired' },
  ]

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose} />
      <div className="fixed left-0 right-0 bottom-0 z-50 rounded-t-2xl"
        style={{
          background: 'var(--surface)',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
          maxHeight: '80vh', overflowY: 'auto',
        }}>
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border-strong)' }} />
        </div>
        <div className="px-5 py-4 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Filters</h3>
            {hasFilters && (
              <button onClick={onClear} className="text-xs" style={{ color: '#6366f1', cursor: 'pointer', background: 'none', border: 'none' }}>Clear all</button>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Status</p>
            <div className="flex flex-wrap gap-2">
              {statusOptions.map(opt => (
                <button key={opt.value} onClick={() => setStatusFilter(statusFilter === opt.value ? null : opt.value)}
                  className="px-3 py-1.5 rounded-full text-sm font-medium"
                  style={{ background: statusFilter === opt.value ? 'rgba(99,102,241,0.1)' : 'var(--surface-raised)', border: `1px solid ${statusFilter === opt.value ? '#6366f1' : 'var(--border)'}`, color: statusFilter === opt.value ? '#6366f1' : 'var(--text)', cursor: 'pointer' }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Event Date</p>
            <div className="flex flex-wrap gap-2">
              {eventPresets.map(p => {
                const active = eventDateFilter?.preset === p.value
                return (
                  <button key={p.value} onClick={() => setEventDateFilter(active ? null : { type: 'preset', preset: p.value })}
                    className="px-3 py-1.5 rounded-full text-sm font-medium"
                    style={{ background: active ? 'rgba(99,102,241,0.1)' : 'var(--surface-raised)', border: `1px solid ${active ? '#6366f1' : 'var(--border)'}`, color: active ? '#6366f1' : 'var(--text)', cursor: 'pointer' }}>
                    {p.label}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Expiry</p>
            <div className="flex flex-wrap gap-2">
              {expiryPresets.map(p => {
                const active = expiryFilter?.preset === p.value
                return (
                  <button key={p.value} onClick={() => setExpiryFilter(active ? null : { type: 'preset', preset: p.value })}
                    className="px-3 py-1.5 rounded-full text-sm font-medium"
                    style={{ background: active ? 'rgba(99,102,241,0.1)' : 'var(--surface-raised)', border: `1px solid ${active ? '#6366f1' : 'var(--border)'}`, color: active ? '#6366f1' : 'var(--text)', cursor: 'pointer' }}>
                    {p.label}
                  </button>
                )
              })}
            </div>
          </div>
          {allTags.length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Tags</p>
              <div className="flex flex-wrap gap-2">
                {allTags.map(tag => {
                  const active = tagFilter.includes(tag.id)
                  return (
                    <button key={tag.id} onClick={() => setTagFilter(active ? tagFilter.filter(id => id !== tag.id) : [...tagFilter, tag.id])}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium"
                      style={{ background: active ? (tag.color || '#6366f1') + '22' : 'var(--surface-raised)', border: `1px solid ${active ? (tag.color || '#6366f1') : 'var(--border)'}`, color: active ? (tag.color || '#6366f1') : 'var(--text-muted)', cursor: 'pointer' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: tag.color || '#6366f1', display: 'inline-block' }} />
                      {tag.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          <button onClick={onClose}
            className="w-full py-3 rounded-xl text-sm font-medium"
            style={{ background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer' }}>
            Done
          </button>
        </div>
      </div>
    </>
  )
}

// ── Setup Checklist ───────────────────────────────────────────────────────────

function SetupChecklist({ galleries, hasWatermark, hasShared, dismissed, onDismiss }) {
  const [expanded, setExpanded] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  const hasGallery = galleries.length > 0
  const hasImages = galleries.some(g => (g.image_count?.[0]?.count ?? 0) > 0)

  const steps = [
    {
      id: 'watermark',
      icon: Upload,
      label: 'Upload a watermark',
      desc: 'Add your logo or watermark to protect your preview images.',
      done: hasWatermark,
      action: () => navigate('/account?tab=watermarks'),
      cta: 'Add Watermark',
    },
    {
      id: 'gallery',
      icon: Images,
      label: 'Create your first gallery',
      desc: 'Set up a gallery with a title, client name, and photo sets.',
      done: hasGallery,
      action: () => navigate('/galleries/new'),
      cta: 'Create Gallery',
    },
    {
      id: 'upload',
      icon: Upload,
      label: 'Upload your images',
      desc: 'Add photos to your gallery — drag and drop or click to upload.',
      done: hasImages,
      action: () => hasGallery ? navigate(`/galleries/${galleries[0].id}`) : navigate('/galleries/new'),
      cta: 'Upload Images',
    },
    {
      id: 'share',
      icon: Share2,
      label: 'Share with your client',
      desc: 'Send a gallery link via email, direct link, or QR code.',
      done: hasShared,
      action: () => hasGallery ? navigate(`/galleries/${galleries[0].id}`) : navigate('/galleries/new'),
      cta: 'Go to Gallery',
    },
  ]

  const completedCount = steps.filter(s => s.done).length
  const allDone = completedCount === steps.length

  if (dismissed || allDone) return null

  const mobileBanner = (
    <div className="md:hidden rounded-xl overflow-hidden mb-2"
      style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3"
        style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {steps.map(s => (
              <div key={s.id} className="w-2 h-2 rounded-full"
                style={{ background: s.done ? '#22c55e' : 'var(--border-strong)' }} />
            ))}
          </div>
          <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
            Getting started · {completedCount} of {steps.length} complete
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div onClick={e => { e.stopPropagation(); onDismiss() }}
            style={{ color: 'var(--text-muted)', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}>
            <X size={14} />
          </div>
          {expanded ? <ChevronUp size={16} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} />}
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-4 space-y-3" style={{ borderTop: '1px solid var(--border)' }}>
          {steps.map((step, i) => (
            <div key={step.id} data-testid={`checklist-step-${step.id}`} className="flex items-start gap-3 pt-3">
              <div className="shrink-0 mt-0.5">
                {step.done
                  ? <CheckCircle2 size={18} style={{ color: '#22c55e' }} />
                  : <Circle size={18} style={{ color: 'var(--border-strong)' }} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium" style={{ color: step.done ? 'var(--text-muted)' : 'var(--text)', textDecoration: step.done ? 'line-through' : 'none' }}>
                  {step.label}
                </p>
                {!step.done && (
                  <>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{step.desc}</p>
                    <button onClick={step.action}
                      className="text-xs font-medium mt-2 px-3 py-1.5 rounded-lg"
                      style={{ background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer' }}>
                      {step.cta}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const desktopPanel = (
    <div data-testid="checklist-desktop-panel" className="hidden md:block fixed right-6 top-28 z-20 w-72"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
      }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Getting started</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{completedCount} of {steps.length} complete</p>
        </div>
        <button data-testid="checklist-dismiss-btn" onClick={onDismiss} style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
          <X size={16} />
        </button>
      </div>
      <div className="px-4 pt-3">
        <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-raised)' }}>
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${(completedCount / steps.length) * 100}%`, background: '#6366f1' }} />
        </div>
      </div>
      <div className="p-4 space-y-4">
        {steps.map(step => (
          <div key={step.id} data-testid={`checklist-step-${step.id}`} className="flex items-start gap-3">
            <div className="shrink-0 mt-0.5">
              {step.done
                ? <CheckCircle2 size={18} style={{ color: '#22c55e' }} />
                : <Circle size={18} style={{ color: 'var(--border-strong)' }} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium" style={{ color: step.done ? 'var(--text-muted)' : 'var(--text)', textDecoration: step.done ? 'line-through' : 'none' }}>
                {step.label}
              </p>
              {!step.done && (
                <>
                  <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>{step.desc}</p>
                  <button onClick={step.action}
                    className="text-xs font-medium mt-2 px-3 py-1.5 rounded-lg"
                    style={{ background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer' }}>
                    {step.cta}
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div data-testid="setup-checklist">
      {mobileBanner}
      {desktopPanel}
    </div>
  )
}

// ── Breadcrumb ────────────────────────────────────────────────────────────────

// folderPath is an array of { id, name } from root down to current folder.
// Shows "Galleries > … > Parent > Current" truncating the middle if > 3 deep.
function Breadcrumb({ folderPath, onNavigate }) {
  if (folderPath.length === 0) return null

  // Build full crumb list: root + each folder in path
  const crumbs = [
    { id: null, name: 'Galleries', icon: true },
    ...folderPath.map(f => ({ id: f.id, name: f.name, icon: false })),
  ]

  // Truncate middle if more than 4 crumbs total
  let displayed = crumbs
  if (crumbs.length > 4) {
    displayed = [
      crumbs[0],
      { id: '...', name: '…', icon: false, ellipsis: true },
      crumbs[crumbs.length - 2],
      crumbs[crumbs.length - 1],
    ]
  }

  return (
    <nav className="flex items-center gap-1 flex-wrap" style={{ minHeight: 28 }}>
      {displayed.map((crumb, i) => {
        const isLast = i === displayed.length - 1
        const isEllipsis = crumb.ellipsis
        return (
          <div key={crumb.id ?? i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
            {isEllipsis ? (
              <span className="text-sm px-1" style={{ color: 'var(--text-muted)' }}>…</span>
            ) : isLast ? (
              <span className="text-sm font-semibold truncate" style={{ color: 'var(--text)', maxWidth: 200 }}>
                {crumb.icon ? <span className="flex items-center gap-1"><Home size={13} />Galleries</span> : crumb.name}
              </span>
            ) : (
              <button
                onClick={() => onNavigate(crumb.id)}
                className="text-sm truncate"
                style={{ color: '#6366f1', cursor: 'pointer', background: 'none', border: 'none', maxWidth: 160 }}
                onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
              >
                {crumb.icon ? <span className="flex items-center gap-1"><Home size={13} />Galleries</span> : crumb.name}
              </button>
            )}
          </div>
        )
      })}
    </nav>
  )
}

// ── New Folder Modal ──────────────────────────────────────────────────────────

function NewFolderModal({ open, onClose, onCreated, parentFolderId }) {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (open) {
      setName('')
      setError(null)
      setLoading(false)
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setVisible(true)
        inputRef.current?.focus()
      }))
    } else {
      setVisible(false)
    }
  }, [open])

  async function handleCreate() {
    const trimmed = name.trim()
    if (!trimmed) return
    setLoading(true)
    setError(null)
    try {
      const folder = await createFolder(trimmed, parentFolderId)
      onCreated(folder)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
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
          maxWidth: 400,
          padding: '0 16px',
        }}
      >
        <div className="rounded-2xl overflow-hidden shadow-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2">
              <FolderPlus size={16} style={{ color: '#6366f1' }} />
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>New Folder</h2>
            </div>
          </div>
          <div className="px-5 py-4 space-y-4">
            <div>
              <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-muted)' }}>
                Folder name
              </label>
              <input
                ref={inputRef}
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') onClose() }}
                placeholder="e.g. Weddings 2026"
                className="w-full text-sm rounded-lg px-3 py-2.5 outline-none"
                style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)' }}
                onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
              />
              {error && <p className="text-xs mt-1.5" style={{ color: 'var(--danger)' }}>{error}</p>}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={!name.trim() || loading}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                style={{ background: '#6366f1', color: '#fff', border: 'none', cursor: !name.trim() || loading ? 'not-allowed' : 'pointer', opacity: !name.trim() || loading ? 0.6 : 1 }}>
                {loading ? 'Creating…' : 'Create Folder'}
              </button>
              <button
                onClick={onClose}
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl text-sm"
                style={{ background: 'var(--surface-raised)', color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Filtering logic ───────────────────────────────────────────────────────────

function getGalleryStatus(g) {
  if (!g.is_active) return 'inactive'
  if (g.expires_at && new Date(g.expires_at) < new Date()) return 'expired'
  return 'active'
}

function matchesDateFilter(dateStr, filter) {
  if (!filter) return true
  if (!dateStr) return false
  const d = new Date(dateStr)
  const now = new Date()
  if (filter.type === 'range') {
    const { from, to } = filter.range || {}
    if (!from) return true
    if (d < from) return false
    if (to && d > to) return false
    return true
  }
  if (filter.type === 'preset') {
    const p = filter.preset
    const c = new Date(now); c.setHours(0,0,0,0)
    const today = c
    const ms = 86400000
    if (p === 'last_week')     return d >= new Date(today - 7*ms) && d < today
    if (p === 'last_2_weeks')  return d >= new Date(today - 14*ms) && d < today
    if (p === 'last_month')    return d >= new Date(today - 30*ms) && d < today
    if (p === 'last_6_months') return d >= new Date(today - 180*ms) && d < today
    if (p === 'last_year')     return d >= new Date(today - 365*ms) && d < today
    if (p === 'next_week')     return d >= today && d < new Date(today.getTime() + 7*ms)
    if (p === 'next_2_weeks')  return d >= today && d < new Date(today.getTime() + 14*ms)
    if (p === 'next_month')    return d >= today && d < new Date(today.getTime() + 30*ms)
    if (p === 'upcoming')      return d >= today
    if (p === 'past')          return d < today
    if (p === 'soon')          return d >= today && d < new Date(today.getTime() + 30*ms)
    if (p === 'expired')       return d < today
  }
  return true
}

function applyFilters(galleries, { search, status, eventDate, expiry, tags }) {
  return galleries.filter(g => {
    if (search) {
      const q = search.toLowerCase()
      const tagMatch = (g.tags ?? []).some(t => t.name.includes(q))
      if (!g.title.toLowerCase().includes(q) && !g.client_name?.toLowerCase().includes(q) && !g.event_name?.toLowerCase().includes(q) && !tagMatch) return false
    }
    if (tags && tags.length > 0) {
      const galleryTagIds = new Set((g.tags ?? []).map(t => t.id))
      if (!tags.every(tagId => galleryTagIds.has(tagId))) return false
    }
    if (status && getGalleryStatus(g) !== status) return false
    if (eventDate && !matchesDateFilter(g.event_date, eventDate)) return false
    if (expiry) {
      if (expiry.type === 'preset' && expiry.preset === 'none') { if (g.expires_at) return false }
      else if (!matchesDateFilter(g.expires_at, expiry)) return false
    }
    return true
  })
}

const EVENT_PRESETS = [
  { value: 'last_week',     label: 'Last week' },
  { value: 'last_2_weeks',  label: 'Last 2 weeks' },
  { value: 'last_month',    label: 'Last month' },
  { value: 'last_6_months', label: 'Last 6 months' },
  { value: 'last_year',     label: 'Last year' },
  { value: 'next_week',     label: 'Next week' },
  { value: 'next_2_weeks',  label: 'Next 2 weeks' },
  { value: 'next_month',    label: 'Next month' },
  { value: 'upcoming',      label: 'Upcoming' },
  { value: 'past',          label: 'Past' },
]

const EXPIRY_PRESETS = [
  { value: 'soon',       label: 'Expiring soon' },
  { value: 'expired',    label: 'Already expired' },
  { value: 'next_week',  label: 'Next week' },
  { value: 'next_month', label: 'Next month' },
  { value: 'none',       label: 'No expiry set' },
]

// ── Derive cover URLs for folder stacks from the galleries array ──────────────
// Returns a map of folderId → array of up to 3 cover image URLs

function buildFolderCoverUrls(galleries, authToken) {
  if (!authToken) return {}
  const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL
  const map = {}
  for (const g of galleries) {
    if (!g.folder_id) continue
    if (!map[g.folder_id]) map[g.folder_id] = []
    if (map[g.folder_id].length < 3) {
      const key = g.gallery_images?.preview_r2_key
      if (key) {
        map[g.folder_id].push(`${WORKER_URL}/preview/${encodeURIComponent(key)}?token=${authToken}`)
      }
    }
  }
  return map
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  const [galleries, setGalleries] = useState([])
  const [folders, setFolders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState(null)
  const [tagFilter, setTagFilter] = useState([])
  const [allTags, setAllTags] = useState([])
  const [eventDateFilter, setEventDateFilter] = useState(null)
  const [expiryFilter, setExpiryFilter] = useState(null)
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false)
  useScrollLock(mobileFilterOpen)
  const [toast, setToast] = useState(null)
  const [bookmarkedIds, setBookmarkedIds] = useState(new Set())
  const [firstSharedAt, setFirstSharedAt] = useState(null)
  const [hasWatermark, setHasWatermark] = useState(false)
  const [checklistDismissed, setChecklistDismissed] = useState(
    () => localStorage.getItem('fv-onboarding-dismissed') === 'true'
  )
  const [authToken, setAuthToken] = useState(null)

  // Folder navigation state
  const [currentFolderId, setCurrentFolderId] = useState(null)   // null = root
  const [folderPath, setFolderPath] = useState([])               // [{ id, name }, ...]
  const [newFolderOpen, setNewFolderOpen] = useState(false)

  useEffect(() => {
    loadData().then(() => {
      const restore = location.state?.restoreFolderPath
      if (restore?.length) {
        setFolderPath(restore)
        setCurrentFolderId(restore[restore.length - 1].id)
      }
    })
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      const [galleriesData, foldersData, bIds, tagsData, { data: photog }, { data: watermarks }, { data: { session } }] = await Promise.all([
        getGalleries(),
        getFolders(),
        getBookmarkedGalleryIds(),
        getTags(),
        supabase.auth.getUser().then(({ data: { user } }) => supabase.from('photographers').select('first_shared_at').eq('id', user.id).single()),
        supabase.from('watermarks').select('id').limit(1),
        supabase.auth.getSession(),
      ])
      setGalleries(galleriesData)
      setAllTags(tagsData)
      setFolders(foldersData)
      setBookmarkedIds(bIds)
      setFirstSharedAt(photog?.first_shared_at || null)
      setHasWatermark((watermarks?.length ?? 0) > 0)
      setAuthToken(session?.access_token || null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleDismissChecklist() {
    localStorage.setItem('fv-onboarding-dismissed', 'true')
    setChecklistDismissed(true)
  }

  function handleCopyLink(shareToken) {
    navigator.clipboard.writeText(`${window.location.origin}/g/${shareToken}`)
    setToast({ message: 'Gallery link copied!', type: 'success' })
  }

  // Navigate into a folder
  function handleNavigateToFolder(folder) {
    setCurrentFolderId(folder.id)
    setFolderPath(prev => [...prev, { id: folder.id, name: folder.name }])
    setSearch('')
  }

  // Navigate to a breadcrumb target (null = root, or a folder ID partway up)
  function handleBreadcrumbNavigate(targetId) {
    if (targetId === null) {
      setCurrentFolderId(null)
      setFolderPath([])
    } else {
      const idx = folderPath.findIndex(f => f.id === targetId)
      if (idx !== -1) {
        setCurrentFolderId(targetId)
        setFolderPath(folderPath.slice(0, idx + 1))
      }
    }
    setSearch('')
  }

  // Called when a folder is renamed
  function handleFolderRenamed(updated) {
    setFolders(prev => prev.map(f => f.id === updated.id ? { ...f, name: updated.name } : f))
    // Also update the folderPath if this folder is in the current breadcrumb trail
    setFolderPath(prev => prev.map(f => f.id === updated.id ? { ...f, name: updated.name } : f))
  }

  // Called when a folder (and its subtree) is deleted.
  // Since the RPC deletes recursively server-side, we reload all data
  // and navigate back to root to avoid showing stale state.
  async function handleFolderDeleted(deletedRootId) {
    setCurrentFolderId(null)
    setFolderPath([])
    await loadData()
  }

  function handleFolderCoverChanged(folderId, coverR2Key, focusX = 0.5, focusY = 0.5) {
    setFolders(prev => prev.map(f => f.id === folderId ? { ...f, cover_r2_key: coverR2Key, cover_focus_x: focusX, cover_focus_y: focusY } : f))
  }

  // Called when a new folder is created
  function handleFolderCreated(folder) {
    setFolders(prev => [...prev, folder])
  }

  // Called when a gallery is moved to a different folder
  function handleGalleryMoved(galleryId, targetFolderId) {
    setGalleries(prev => prev.map(g =>
      g.id === galleryId ? { ...g, folder_id: targetFolderId } : g
    ))
  }

  // Called when a gallery is deleted from the card ⋮ menu
  function handleGalleryDeleted(galleryId) {
    setGalleries(prev => prev.filter(g => g.id !== galleryId))
  }

  const hasFilters = statusFilter || eventDateFilter || expiryFilter || tagFilter.length > 0
  const activeFilterCount = [statusFilter, eventDateFilter, expiryFilter].filter(Boolean).length + (tagFilter.length > 0 ? 1 : 0)

  // When searching, show all galleries regardless of folder
  const isSearching = search.trim().length > 0

  // Folders visible in the current view (direct children of currentFolderId)
  const visibleFolders = (isSearching || tagFilter.length > 0) ? [] : folders.filter(f =>
    currentFolderId === null ? f.parent_id === null : f.parent_id === currentFolderId
  )

  // Galleries visible in the current view
  const galleriesInView = (isSearching || tagFilter.length > 0)
    ? galleries  // search across all
    : galleries.filter(g => g.folder_id === currentFolderId)

  const filteredGalleries = applyFilters(galleriesInView, {
    search, status: statusFilter, eventDate: eventDateFilter, expiry: expiryFilter, tags: tagFilter,
  })

  function clearAllFilters() {
    setStatusFilter(null); setEventDateFilter(null); setExpiryFilter(null); setTagFilter([]); setSearch('')
  }

  const hasGallery = galleries.length > 0
  const hasImages = galleries.some(g => (g.image_count?.[0]?.count ?? 0) > 0)
  const hasShared = !!firstSharedAt
  const allDone = hasWatermark && hasGallery && hasImages && hasShared
  const showChecklist = !loading && !checklistDismissed && !allDone

  // Cover URL map for folder stacks
  const folderCoverUrls = buildFolderCoverUrls(galleries, authToken)

  // Gallery counts per folder (direct children only)
  const galleriesPerFolder = {}
  for (const g of galleries) {
    if (g.folder_id) {
      galleriesPerFolder[g.folder_id] = (galleriesPerFolder[g.folder_id] || 0) + 1
    }
  }

  // Subfolder counts per folder
  const subfoldersPerFolder = {}
  for (const f of folders) {
    if (f.parent_id) {
      subfoldersPerFolder[f.parent_id] = (subfoldersPerFolder[f.parent_id] || 0) + 1
    }
  }

  const nothingToShow = !loading && !error && visibleFolders.length === 0 && filteredGalleries.length === 0
  const emptyRoot = !loading && !error && galleries.length === 0 && folders.length === 0

  const [activeDragGallery, setActiveDragGallery] = useState(null)

  // dnd-kit — mouse only (no touch, avoids scroll conflicts on mobile)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  )

  function handleDragStart(event) {
    const gallery = galleries.find(g => g.id === event.active.id)
    setActiveDragGallery(gallery || null)
  }

  async function handleDragEnd(event) {
    const { active, over } = event
    if (!over || !active) return
    // active.id = gallery id, over.id = 'folder-{folderId}'
    if (!over.id.toString().startsWith('folder-')) return
    const folderId = over.id.toString().replace('folder-', '')
    const galleryId = active.id
    const gallery = galleries.find(g => g.id === galleryId)
    if (!gallery) return
    // Don't move if already in that folder
    if (gallery.folder_id === folderId) return
    try {
      await moveGalleryToFolder(galleryId, folderId)
      handleGalleryMoved(galleryId, folderId)
    } catch (err) {
      console.error('Drag move failed:', err)
    } finally {
      setActiveDragGallery(null)
    }
  }

  const folderContextValue = {
    folders,
    currentFolderId,
    folderPath,
    onGalleryMoved: handleGalleryMoved,
    onGalleryDeleted: handleGalleryDeleted,
    onCopyLink: handleCopyLink,
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
    <FolderContext.Provider value={folderContextValue}>
      <div className={`space-y-5 max-w-7xl ${showChecklist ? 'md:pr-80' : ''}`}>

      {!loading && (
        <SetupChecklist
          galleries={galleries}
          hasWatermark={hasWatermark}
          hasShared={hasShared}
          dismissed={checklistDismissed}
          onDismiss={handleDismissChecklist}
        />
      )}

      {/* Breadcrumb — only shown when inside a folder */}
      {folderPath.length > 0 && (
        <Breadcrumb folderPath={folderPath} onNavigate={handleBreadcrumbNavigate} />
      )}

      {/* ── Desktop: title + search + buttons ── */}
      <div className="hidden md:flex items-center gap-3">
        <div className="shrink-0">
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>
            {folderPath.length > 0 ? folderPath[folderPath.length - 1].name : 'Galleries'}
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {currentFolderId
              ? `${galleriesInView.length} ${galleriesInView.length === 1 ? 'gallery' : 'galleries'}`
              : `${galleries.length} ${galleries.length === 1 ? 'gallery' : 'galleries'} total`}
          </p>
        </div>
        {(galleries.length > 0 || folders.length > 0) && (
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search all galleries..."
              className="w-full text-sm pl-9 pr-4 py-2 rounded-lg outline-none"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
              onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'} />
          </div>
        )}
        <button
          onClick={() => setNewFolderOpen(true)}
          className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.color = 'var(--text)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          <FolderPlus size={15} />
          New Folder
        </button>
        <Button onClick={() => navigate('/galleries/new', { state: { folderId: currentFolderId } })} className="shrink-0">
          <Plus size={15} />New Gallery
        </Button>
      </div>

      {/* ── Desktop: filter pills ── */}
      {(galleries.length > 0 || folders.length > 0) && (
        <div className="hidden md:flex items-center gap-2 flex-wrap">
          <StatusPill value={statusFilter} onChange={setStatusFilter} />
          <DateRangePill label="Event Date" value={eventDateFilter} onChange={setEventDateFilter} presets={EVENT_PRESETS} />
          <DateRangePill label="Expiry Date" value={expiryFilter} onChange={setExpiryFilter} presets={EXPIRY_PRESETS} />
          {allTags.length > 0 && <TagsPill value={tagFilter} onChange={setTagFilter} tags={allTags} />}
          {hasFilters && (
            <button onClick={clearAllFilters} className="text-xs"
              style={{ color: 'var(--text-muted)', cursor: 'pointer', background: 'none', border: 'none' }}>
              Clear all
            </button>
          )}
        </div>
      )}

      {/* ── Mobile: title + actions ── */}
      <div className="flex items-center gap-2 md:hidden">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>
            {folderPath.length > 0 ? folderPath[folderPath.length - 1].name : 'Galleries'}
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {currentFolderId
              ? `${galleriesInView.length} ${galleriesInView.length === 1 ? 'gallery' : 'galleries'}`
              : `${galleries.length} ${galleries.length === 1 ? 'gallery' : 'galleries'} total`}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {(galleries.length > 0 || folders.length > 0) && (
            <button onClick={() => setMobileFilterOpen(true)}
              className="relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
              style={{ background: hasFilters ? 'rgba(99,102,241,0.1)' : 'var(--surface)', border: `1px solid ${hasFilters ? '#6366f1' : 'var(--border)'}`, color: hasFilters ? '#6366f1' : 'var(--text-muted)', cursor: 'pointer' }}>
              <SlidersHorizontal size={14} />
              Filters
              {activeFilterCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-white flex items-center justify-center"
                  style={{ background: '#6366f1', fontSize: 9, fontWeight: 700 }}>
                  {activeFilterCount}
                </span>
              )}
            </button>
          )}
          <button
            onClick={() => setNewFolderOpen(true)}
            className="flex items-center gap-1 px-2.5 py-2 rounded-lg text-sm"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <FolderPlus size={15} />
          </button>
          <Button onClick={() => navigate('/galleries/new', { state: { folderId: currentFolderId } })} className="shrink-0">
            <Plus size={15} />New
          </Button>
        </div>
      </div>

      {/* Mobile search */}
      {(galleries.length > 0 || folders.length > 0) && (
        <div className="relative md:hidden">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search all galleries..."
            className="w-full text-sm pl-9 pr-4 py-2 rounded-lg outline-none"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
            onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'} />
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-24">
          <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: 'var(--border-strong)', borderTopColor: 'transparent' }} />
        </div>
      )}

      {!loading && error && (
        <div className="px-4 py-3 rounded-xl text-sm"
          style={{ background: 'var(--danger-subtle)', color: 'var(--danger)', border: '1px solid var(--danger)' }}>
          Failed to load galleries: {error}
        </div>
      )}

      {/* Empty root state */}
      {emptyRoot && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'var(--surface-raised)' }}>
            <Plus size={22} style={{ color: 'var(--text-muted)' }} />
          </div>
          <h2 className="font-medium mb-1" style={{ color: 'var(--text)' }}>No galleries yet</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Create your first gallery to get started</p>
          <Button onClick={() => navigate('/galleries/new')}><Plus size={15} />Create Gallery</Button>
        </div>
      )}

      {/* Unified grid — folders and galleries sorted together by created_at */}
      {!loading && !error && (visibleFolders.length > 0 || filteredGalleries.length > 0) && (() => {
        const folderItems = (isSearching || tagFilter.length > 0) ? [] : visibleFolders.map(f => ({ ...f, _type: 'folder', _sortKey: f.created_at }))
        const galleryItems = filteredGalleries.map(g => ({ ...g, _type: 'gallery', _sortKey: g.created_at }))
        const allItems = [...folderItems, ...galleryItems].sort((a, b) => new Date(b._sortKey) - new Date(a._sortKey))
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {allItems.map(item => item._type === 'folder' ? (
              <FolderCard
                key={`folder-${item.id}`}
                folder={item}
                coverUrls={folderCoverUrls[item.id] || []}
                galleryCount={galleriesPerFolder[item.id] || 0}
                subfolderCount={subfoldersPerFolder[item.id] || 0}
                onNavigate={handleNavigateToFolder}
                onRenamed={handleFolderRenamed}
                onDeleted={handleFolderDeleted}
                onCoverChanged={handleFolderCoverChanged}
              />
            ) : (
              <GalleryCard
                key={`gallery-${item.id}`}
                gallery={item}
                coverUrl={(() => {
                  const key = item.gallery_images?.preview_r2_key
                  return key && authToken ? `${import.meta.env.VITE_R2_WORKER_URL}/preview/${encodeURIComponent(key)}?token=${authToken}` : null
                })()}
                onCopyLink={handleCopyLink}
                isBookmarked={bookmarkedIds.has(item.id)}
              />
            ))}
          </div>
        )
      })()}

      {/* No results from filters */}
      {!loading && !error && !emptyRoot && nothingToShow && (hasFilters || isSearching) && (
        <div className="py-16 text-center space-y-2">
          <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
            {isSearching ? 'No galleries match your search' : 'No galleries match your filters'}
          </p>
          <button onClick={clearAllFilters} className="text-sm"
            style={{ color: '#6366f1', cursor: 'pointer', background: 'none', border: 'none' }}>
            {isSearching ? 'Clear search' : 'Clear filters'}
          </button>
        </div>
      )}

      {/* Empty folder state */}
      {!loading && !error && !emptyRoot && nothingToShow && !hasFilters && !isSearching && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3" style={{ background: 'var(--surface-raised)' }}>
            <Folder size={20} style={{ color: 'var(--text-muted)' }} />
          </div>
          <h2 className="font-medium mb-1 text-sm" style={{ color: 'var(--text)' }}>This folder is empty</h2>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Add a gallery or create a subfolder</p>
          <div className="flex gap-2">
            <Button onClick={() => navigate('/galleries/new', { state: { folderId: currentFolderId } })}>
              <Plus size={14} />New Gallery
            </Button>
            <button
              onClick={() => setNewFolderOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              <FolderPlus size={14} />New Folder
            </button>
          </div>
        </div>
      )}

      <MobileFilterSheet
        open={mobileFilterOpen}
        onClose={() => setMobileFilterOpen(false)}
        statusFilter={statusFilter} setStatusFilter={setStatusFilter}
        eventDateFilter={eventDateFilter} setEventDateFilter={setEventDateFilter}
        expiryFilter={expiryFilter} setExpiryFilter={setExpiryFilter}
        tagFilter={tagFilter} setTagFilter={setTagFilter} allTags={allTags}
        eventPresets={EVENT_PRESETS} expiryPresets={EXPIRY_PRESETS}
        hasFilters={hasFilters} onClear={clearAllFilters}
      />

      <NewFolderModal
        open={newFolderOpen}
        onClose={() => setNewFolderOpen(false)}
        onCreated={handleFolderCreated}
        parentFolderId={currentFolderId}
      />

      {toast && (
        <div className="fixed bottom-6 right-6 z-50">
          <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
        </div>
      )}
    </div>
      <DragOverlay dropAnimation={null}>
        {activeDragGallery ? (
          <div style={{ opacity: 0.9, transform: 'scale(1.02)', boxShadow: '0 8px 32px rgba(0,0,0,0.18)', borderRadius: '0.75rem', overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--border)', width: '100%' }}>
            <div className="aspect-[4/3] relative overflow-hidden flex items-center justify-center" style={{ background: 'var(--surface-raised)' }}>
              {(() => {
                const key = activeDragGallery.gallery_images?.preview_r2_key
                const url = key && authToken ? `${import.meta.env.VITE_R2_WORKER_URL}/preview/${encodeURIComponent(key)}?token=${authToken}` : null
                return url ? <img src={url} alt={activeDragGallery.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null
              })()}
            </div>
            <div className="p-4">
              <h3 className="font-medium text-sm truncate" style={{ color: 'var(--text)' }}>{activeDragGallery.title}</h3>
              {activeDragGallery.client_name && <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>{activeDragGallery.client_name}</p>}
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </FolderContext.Provider>
    </DndContext>
  )
}
