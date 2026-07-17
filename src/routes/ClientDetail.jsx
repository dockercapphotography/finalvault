import { useState, useEffect, useCallback, useRef } from 'react'
import Cropper from 'react-easy-crop'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, Mail, Phone, MapPin, Tag, FileText, ChevronRight, Camera,
  Pencil, Trash2, X, Plus, Clock, CheckCircle, Images,
  AlertCircle, Ban, CalendarDays, Link2, Copy, RefreshCw, Check, Search
} from 'lucide-react'
import TagInput from '../components/ui/TagInput.jsx'
import AddressAutocomplete from '../components/ui/AddressAutocomplete.jsx'
import BottomSheet from '../components/layout/BottomSheet.jsx'
import { getClient, updateClient, deleteClient, getClientGalleries, getContracts, deleteContract, uploadClientAvatar, getClientAvatarUrl, getAllTags, getOrCreatePortalToken, regeneratePortalToken } from '../utils/crmApi.js'
import { getUnlinkedGalleries, linkGalleriesToClient, unlinkGalleryFromClient } from '../utils/galleryApi.js'
import { supabase } from '../supabaseClient.js'
import { getSessions, getStatusConfig } from '../utils/sessionApi.js'
import { formatDate, formatPhone } from '../utils/formatters.js'
import Button from '../components/ui/Button.jsx'
import Badge from '../components/ui/Badge.jsx'
import Toast from '../components/ui/Toast.jsx'
import PageBreadcrumb from '../components/ui/PageBreadcrumb.jsx'

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL

const CONTRACT_STATUS_CONFIG = {
  draft:                { label: 'Draft',              variant: 'default',  Icon: FileText },
  sent:                 { label: 'Awaiting Signature', variant: 'warning',  Icon: Clock },
  pending_photographer: { label: 'Needs Counter-Sign', variant: 'warning',  Icon: AlertCircle },
  signed:               { label: 'Signed',             variant: 'success',  Icon: CheckCircle },
  void:                 { label: 'Void',               variant: 'danger',   Icon: Ban },
}


async function getCroppedImg(imageSrc, croppedAreaPixels) {
  const image = await new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = imageSrc
  })
  const canvas = document.createElement('canvas')
  canvas.width = 400
  canvas.height = 400
  const ctx = canvas.getContext('2d')
  ctx.drawImage(
    image,
    croppedAreaPixels.x, croppedAreaPixels.y,
    croppedAreaPixels.width, croppedAreaPixels.height,
    0, 0, 400, 400
  )
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92))
}

function ClientAvatarCropModal({ imageSrc, onSave, onCancel, saving }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
  const onCropComplete = useCallback((_, cap) => setCroppedAreaPixels(cap), [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Crop client photo</h2>
          <button onClick={onCancel}
            style={{ cursor: 'pointer', color: 'var(--text-muted)', background: 'none', border: 'none' }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ position: 'relative', width: '100%', height: 300, background: '#000' }}>
          <Cropper image={imageSrc} crop={crop} zoom={zoom} aspect={1} cropShape="round"
            showGrid={false} onCropChange={setCrop} onZoomChange={setZoom}
            onCropComplete={onCropComplete} />
          <p style={{ position: 'absolute', bottom: 10, left: 0, right: 0, textAlign: 'center',
            fontSize: 12, color: 'rgba(255,255,255,0.6)', pointerEvents: 'none' }}>
            Drag to reposition
          </p>
        </div>
        <div className="px-5 py-3 space-y-1.5" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Zoom</p>
          <input type="range" min={1} max={3} step={0.01} value={zoom}
            onChange={e => setZoom(Number(e.target.value))}
            style={{ width: '100%', cursor: 'pointer' }} />
        </div>
        <div className="flex gap-2 px-5 py-4" style={{ borderTop: '1px solid var(--border)' }}>
          <button onClick={onCancel} disabled={saving}
            className="flex-1 py-2 rounded-lg text-sm font-medium"
            style={{ background: 'var(--surface-raised)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={() => onSave(croppedAreaPixels)} disabled={saving || !croppedAreaPixels}
            className="flex-1 py-2 rounded-lg text-sm font-medium"
            style={{ background: '#6366f1', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving...' : 'Save photo'}
          </button>
        </div>
      </div>
    </div>
  )
}



function EditClientWrapper({ onClose, footer, children }) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  if (isMobile) {
    return (
      <BottomSheet open onClose={onClose} maxHeight="92vh">
        <div className="flex items-center px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="font-semibold text-base" style={{ color: 'var(--text)' }}>Edit Client</h2>
        </div>
        <div className="px-5 py-4 space-y-3 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="shrink-0">{footer}</div>}
      </BottomSheet>
    )
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg flex flex-col rounded-2xl shadow-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '90vh' }}>
        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Edit Client</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <X size={16} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-3 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="shrink-0">{footer}</div>}
      </div>
    </div>
  )
}

function EditClientModal({ client, avatarUrl, uploadingAvatar, onAvatarUpload, onClose, onSaved, allTags = [] }) {
  const [form, setForm] = useState({
    firstName: client.first_name,
    lastName: client.last_name,
    email: client.email || '',
    phone: client.phone || '',
    address: client.address || '',
    city: client.city || '',
    state: client.state || '',
    zip: client.zip || '',
    notes: client.notes || '',
    tags: client.tags ?? [],
    pronouns: client.pronouns || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit() {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError('First and last name are required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const tags = Array.isArray(form.tags) ? form.tags : form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : []
      const updated = await updateClient(client.id, { ...form, tags, pronouns: form.pronouns || null })
      onSaved(updated)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  const inputStyle = {
    width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)',
    color: 'var(--text)', borderRadius: '8px', padding: '9px 12px',
    fontSize: '14px', outline: 'none',
  }
  const focus = e => e.target.style.borderColor = 'var(--border-strong)'
  const blur  = e => e.target.style.borderColor = 'var(--border)'

  const footerEl = (
    <div className="flex items-center justify-between px-6 py-4" style={{ borderTop: '1px solid var(--border)' }}>
      <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg"
        style={{ background: 'var(--surface-raised)', color: 'var(--text-muted)', border: 'none', cursor: 'pointer' }}>
        Cancel
      </button>
      <Button onClick={handleSubmit} disabled={saving || !form.firstName.trim() || !form.lastName.trim()}>
        {saving ? 'Saving...' : 'Save Changes'}
      </Button>
    </div>
  )

  return (
    <EditClientWrapper onClose={onClose} footer={footerEl}>
      <div>
            {error && (
              <div className="px-3 py-2 rounded-xl text-sm" style={{ background: 'var(--danger-subtle)', color: 'var(--danger)' }}>
                {error}
              </div>
            )}

            {/* Avatar + name row */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex-shrink-0 overflow-hidden" style={{ background: 'var(--accent)' }}>
                {avatarUrl
                  ? <img src={avatarUrl} alt="" className="w-10 h-10 object-cover" />
                  : <div className="w-10 h-10 flex items-center justify-center text-sm font-bold" style={{ color: 'var(--accent-fg)' }}>
                      {client.first_name[0]}{client.last_name[0]}
                    </div>}
              </div>
              <label className="text-xs font-medium px-2.5 py-1.5 rounded-lg cursor-pointer flex-shrink-0"
                style={{ background: 'var(--surface-raised)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                <input type="file" accept="image/*" className="hidden" onChange={onAvatarUpload} disabled={uploadingAvatar} />
                {uploadingAvatar ? 'Uploading...' : 'Change photo'}
              </label>
            </div>

            {/* First + Last name */}
            <div className="flex flex-col gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium" style={{ color: 'var(--text)' }}>First name <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} style={inputStyle} onFocus={focus} onBlur={blur} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium" style={{ color: 'var(--text)' }}>Last name <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} style={inputStyle} onFocus={focus} onBlur={blur} />
              </div>
            </div>

            {/* Pronouns */}
            <div className="space-y-1">
              <label className="text-xs font-medium" style={{ color: "var(--text)" }}>Pronouns</label>
              <select value={form.pronouns || ""} onChange={e => setForm(f => ({ ...f, pronouns: e.target.value }))}
                style={{ ...inputStyle, cursor: "pointer" }}>
                <option value="">Select pronouns (optional)</option>
                <option value="she/her">she/her</option>
                <option value="he/him">he/him</option>
                <option value="they/them">they/them</option>
                <option value="she/they">she/they</option>
                <option value="he/they">he/they</option>
                <option value="ze/hir">ze/hir</option>
                <option value="xe/xem">xe/xem</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
            </div>

            {/* Email + Phone */}
            <div className="flex flex-col gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium" style={{ color: 'var(--text)' }}>Email</label>
                <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} type="email" style={inputStyle} onFocus={focus} onBlur={blur} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium" style={{ color: 'var(--text)' }}>Phone</label>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} style={inputStyle} onFocus={focus} onBlur={blur} />
              </div>
            </div>

            {/* Address */}
            <div className="space-y-1">
              <label className="text-xs font-medium" style={{ color: 'var(--text)' }}>Address</label>
              <AddressAutocomplete
                value={form.address}
                onChange={val => setForm(f => ({ ...f, address: val }))}
                onSelect={({ address, city, state, zip }) => setForm(f => ({
                  ...f,
                  address,
                  city: city || f.city,
                  state: state || f.state,
                  zip: zip || f.zip,
                }))}
                style={inputStyle}
                onFocus={focus}
                onBlur={blur}
              />
            </div>

            {/* City + State + ZIP */}
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1 col-span-1">
                <label className="text-xs font-medium" style={{ color: 'var(--text)' }}>City</label>
                <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} style={inputStyle} onFocus={focus} onBlur={blur} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium" style={{ color: 'var(--text)' }}>State</label>
                <input value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} maxLength={2} style={inputStyle} onFocus={focus} onBlur={blur} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium" style={{ color: 'var(--text)' }}>ZIP</label>
                <input value={form.zip} onChange={e => setForm(f => ({ ...f, zip: e.target.value }))} style={inputStyle} onFocus={focus} onBlur={blur} />
              </div>
            </div>

            {/* Tags */}
            <div className="space-y-1">
              <label className="text-xs font-medium" style={{ color: 'var(--text)' }}>Tags</label>
              <TagInput
                value={Array.isArray(form.tags) ? form.tags : form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : []}
                onChange={tags => setForm(f => ({ ...f, tags }))}
                allTags={allTags}
              />
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <label className="text-xs font-medium" style={{ color: 'var(--text)' }}>Notes</label>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={2} style={{ ...inputStyle, resize: 'vertical' }} onFocus={focus} onBlur={blur} />
            </div>

          </div>
    </EditClientWrapper>
  )
}

function GalleryRow({ gallery, onUnlink }) {
  const coverKey = gallery.cover_r2_key || gallery.gallery_images?.preview_r2_key
  const isActive = gallery.is_active
  return (
    <Link
      to={`/galleries/${gallery.id}`}
      className="flex items-center gap-3 px-4 py-3 transition-colors"
      style={{ textDecoration: 'none' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {/* Thumbnail */}
      <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0"
        style={{ background: 'var(--surface-raised)' }}>
        {coverKey ? (
          <img
            src={`${WORKER_URL}/preview/${encodeURIComponent(coverKey)}?share_token=${gallery.share_token}`}
            alt={gallery.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <FileText size={14} style={{ color: 'var(--text-muted)' }} />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{gallery.title}</p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {gallery.event_date ? formatDate(gallery.event_date) : formatDate(gallery.created_at)}
          {gallery.event_name && ` · ${gallery.event_name}`}
        </p>
      </div>
      <Badge variant={isActive ? 'success' : 'default'}>{isActive ? 'Active' : 'Inactive'}</Badge>
      <button
        onClick={e => { e.preventDefault(); e.stopPropagation(); onUnlink(gallery.id) }}
        style={{ cursor: 'pointer', color: 'var(--text-muted)', background: 'none', border: 'none', flexShrink: 0, display: 'flex', padding: 2 }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--danger)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
        title="Remove from client"
      >
        <X size={14} />
      </button>
      <ChevronRight size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
    </Link>
  )
}

function ContractRow({ contract }) {
  const cfg = CONTRACT_STATUS_CONFIG[contract.status] || CONTRACT_STATUS_CONFIG.draft
  const { Icon } = cfg
  return (
    <a
      href={`/contracts/${contract.id}`}
      className="flex items-center gap-3 px-4 py-3 transition-colors"
      style={{ textDecoration: 'none', display: 'flex' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: 'var(--surface-raised)' }}>
        <Icon size={14} style={{ color: 'var(--text-muted)' }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{contract.title}</p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {contract.sent_at ? `Sent ${formatDate(contract.sent_at)}` : `Created ${formatDate(contract.created_at)}`}
          {contract.galleries?.title && ` · ${contract.galleries.title}`}
        </p>
      </div>
      <Badge variant={cfg.variant}>{cfg.label}</Badge>
    </a>
  )
}

function AttachGalleryModal({ clientId, onClose, onAttached }) {
  const [galleries, setGalleries] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [attaching, setAttaching] = useState(false)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    getUnlinkedGalleries(clientId)
      .then(setGalleries)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  function toggleSelected(galleryId) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(galleryId)) next.delete(galleryId)
      else next.add(galleryId)
      return next
    })
  }

  async function handleAttach() {
    if (selectedIds.size === 0) return
    setAttaching(true)
    setError(null)
    try {
      await onAttached(Array.from(selectedIds))
    } catch (err) {
      setError(err.message)
      setAttaching(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={() => !attaching && onClose()}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Attach Gallery</h2>
          {!attaching && (
            <button onClick={onClose}
              style={{ cursor: 'pointer', color: 'var(--text-muted)', background: 'none', border: 'none' }}>
              <X size={16} />
            </button>
          )}
        </div>
        <div className="px-5 py-4 space-y-3">
          {error && (
            <div className="px-3 py-2 rounded-xl text-sm" style={{ background: 'var(--danger-subtle)', color: 'var(--danger)' }}>
              {error}
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
            </div>
          ) : galleries.length === 0 ? (
            <div className="text-center py-4">
              <Images size={20} style={{ color: 'var(--text-muted)', margin: '0 auto 8px' }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No unlinked galleries available.</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Every gallery is already linked to a client, or none exist yet.</p>
            </div>
          ) : (
            <div>
              <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-muted)' }}>
                Select one or more galleries{selectedIds.size > 0 ? ` (${selectedIds.size} selected)` : ''}
              </label>
              <div className="relative mb-2">
                <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search galleries..."
                  autoFocus
                  style={{
                    width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)',
                    color: 'var(--text)', borderRadius: 8, padding: '7px 10px 7px 30px', fontSize: 13,
                    outline: 'none', boxSizing: 'border-box',
                  }}
                  onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}
                />
              </div>
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', maxHeight: 280, overflowY: 'auto' }}>
                {galleries.filter(gallery => {
                  if (!query.trim()) return true
                  const q = query.toLowerCase()
                  return gallery.title.toLowerCase().includes(q) || gallery.event_name?.toLowerCase().includes(q)
                }).length === 0 && (
                  <div className="text-center py-4">
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No galleries match "{query}"</p>
                  </div>
                )}
                {galleries.filter(gallery => {
                  if (!query.trim()) return true
                  const q = query.toLowerCase()
                  return gallery.title.toLowerCase().includes(q) || gallery.event_name?.toLowerCase().includes(q)
                }).map(gallery => {
                  const isSelected = selectedIds.has(gallery.id)
                  const sub = [gallery.event_name, gallery.event_date ? new Date(gallery.event_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null].filter(Boolean).join(' · ')
                  return (
                    <button
                      key={gallery.id}
                      type="button"
                      onClick={() => toggleSelected(gallery.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
                      style={{ background: isSelected ? 'rgba(99,102,241,0.08)' : 'transparent', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--surface-raised)' }}
                      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                    >
                      <span
                        className="flex items-center justify-center flex-shrink-0"
                        style={{
                          width: 18, height: 18, borderRadius: 5,
                          background: isSelected ? '#6366f1' : 'transparent',
                          border: isSelected ? 'none' : '1.5px solid var(--border-strong)',
                        }}
                      >
                        {isSelected && <Check size={12} style={{ color: '#fff' }} />}
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span className="text-sm block truncate" style={{ color: 'var(--text)', fontWeight: isSelected ? 500 : 400 }}>
                          {gallery.title}
                        </span>
                        {sub && <span className="text-xs block truncate" style={{ color: 'var(--text-muted)' }}>{sub}</span>}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-2 px-5 py-4" style={{ borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose} disabled={attaching}
            className="flex-1 py-2 rounded-lg text-sm font-medium"
            style={{ background: 'var(--surface-raised)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={handleAttach} disabled={attaching || selectedIds.size === 0}
            className="flex-1 py-2 rounded-lg text-sm font-medium"
            style={{ background: '#6366f1', color: '#fff', border: 'none', cursor: (attaching || selectedIds.size === 0) ? 'not-allowed' : 'pointer', opacity: (attaching || selectedIds.size === 0) ? 0.6 : 1 }}>
            {attaching ? 'Attaching...' : selectedIds.size > 1 ? `Attach ${selectedIds.size} Galleries` : 'Attach Gallery'}
          </button>
        </div>
      </div>
    </div>
  )
}

function PortalLinkCard({ client, onToast, onTokenChange }) {
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirmRegen, setConfirmRegen] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  const portalUrl = client.portal_token
    ? `${window.location.origin}/client/${client.portal_token}`
    : null

  async function handleGenerate() {
    setLoading(true)
    try {
      const token = await getOrCreatePortalToken(client.id)
      onTokenChange(token)
    } catch (err) {
      onToast({ message: err.message, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy() {
    if (!portalUrl) return
    await navigator.clipboard.writeText(portalUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleRegenerate() {
    setRegenerating(true)
    try {
      const token = await regeneratePortalToken(client.id)
      onTokenChange(token)
      setConfirmRegen(false)
      onToast({ message: 'Portal link regenerated — the old link no longer works', type: 'success' })
    } catch (err) {
      onToast({ message: err.message, type: 'error' })
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
      <div className="px-5 py-4" style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
        <h3 className="font-medium text-sm" style={{ color: 'var(--text)' }}>Client portal</h3>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          One link showing all galleries, contracts, and outstanding questionnaires for this client.
        </p>
      </div>
      <div className="px-5 py-4" style={{ background: 'var(--surface)' }}>
        {!portalUrl ? (
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No portal link generated yet.</p>
            <Button variant="secondary" size="sm" onClick={handleGenerate} disabled={loading}>
              <Link2 size={13} />{loading ? 'Generating...' : 'Generate link'}
            </Button>
          </div>
        ) : !confirmRegen ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0 px-3 py-2 rounded-lg text-xs truncate"
              style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              {portalUrl}
            </div>
            <button onClick={handleCopy}
              className="flex items-center gap-1 text-xs px-2.5 py-2 rounded-lg font-medium flex-shrink-0"
              style={{ background: 'var(--surface-raised)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer' }}>
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button onClick={() => setConfirmRegen(true)}
              className="flex items-center gap-1 text-xs px-2.5 py-2 rounded-lg font-medium flex-shrink-0"
              style={{ background: 'var(--surface-raised)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer' }}>
              <RefreshCw size={12} />Regenerate
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)' }}>
            <p className="text-sm flex-1 font-medium" style={{ color: 'var(--danger)' }}>
              Regenerate? The current link will stop working immediately.
            </p>
            <Button variant="danger" size="sm" onClick={handleRegenerate} disabled={regenerating}>
              {regenerating ? 'Regenerating...' : 'Confirm'}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setConfirmRegen(false)}>Cancel</Button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ClientDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [client, setClient] = useState(null)
  const [galleries, setGalleries] = useState([])
  const [sessions, setSessions] = useState([])
  const [contracts, setContracts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showEdit, setShowEdit] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [cropSrc, setCropSrc] = useState(null)
  const [allTags, setAllTags] = useState([])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [toast, setToast] = useState(null)
  const [showAttachGallery, setShowAttachGallery] = useState(false)

  useEffect(() => {
    load()
  }, [id])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [c, g, sx, cx] = await Promise.all([
        getClient(id),
        getClientGalleries(id),
        getSessions({ clientId: id }).catch(() => []),
        getContracts({ clientId: id }),
      ])
      setClient(c)
      setGalleries(g)
      setSessions(sx)
      setContracts(cx)
      supabase.auth.getUser().then(({ data: { user: u } }) => { if (u) getAllTags(u.id).then(tags => setAllTags(tags || [])).catch(() => {}) })
      if (c?.avatar_r2_key) {
        const { data: { session } } = await supabase.auth.getSession()
        getClientAvatarUrl(c.avatar_r2_key, session?.access_token).then(setAvatarUrl)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }


  function handleAvatarUpload(e) {
    const file = e.target.files?.[0]
    if (!file || !client) return
    const reader = new FileReader()
    reader.onload = () => setCropSrc(reader.result)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  async function handleCropSave(croppedAreaPixels) {
    setUploadingAvatar(true)
    try {
      const croppedBlob = await getCroppedImg(cropSrc, croppedAreaPixels)
      const { data: { user } } = await supabase.auth.getUser()
      const croppedFile = new File([croppedBlob], 'avatar.jpg', { type: 'image/jpeg' })
      const updated = await uploadClientAvatar(client.id, user.id, croppedFile)
      setClient(prev => ({ ...prev, avatar_r2_key: updated.avatar_r2_key }))
      setAvatarUrl(URL.createObjectURL(croppedBlob))
      setCropSrc(null)
      setToast({ message: 'Photo updated', type: 'success' })
    } catch (err) {
      setToast({ message: err.message, type: 'error' })
    } finally {
      setUploadingAvatar(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteClient(id)
      navigate('/clients')
    } catch (err) {
      setToast({ message: err.message, type: 'error' })
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  async function handleAttachGallery(galleryIds) {
    await linkGalleriesToClient(galleryIds, id)
    const fresh = await getClientGalleries(id)
    setGalleries(fresh)
    setShowAttachGallery(false)
    setToast({ message: galleryIds.length > 1 ? `${galleryIds.length} galleries attached` : 'Gallery attached', type: 'success' })
  }

  async function handleUnlinkGallery(galleryId) {
    setGalleries(prev => prev.filter(g => g.id !== galleryId))
    try {
      await unlinkGalleryFromClient(galleryId, id)
      setToast({ message: 'Gallery removed from client', type: 'success' })
    } catch (err) {
      // Roll back the optimistic removal if the request actually failed
      const fresh = await getClientGalleries(id)
      setGalleries(fresh)
      setToast({ message: 'Failed to remove gallery', type: 'error' })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  if (error || !client) {
    return (
      <div className="max-w-2xl space-y-4">
        <button onClick={() => navigate('/clients')} className="flex items-center gap-2 text-sm"
          style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
          <ArrowLeft size={16} />Back to Clients
        </button>
        <div className="px-4 py-3 rounded-xl text-sm"
          style={{ background: 'var(--danger-subtle)', color: 'var(--danger)', border: '1px solid var(--danger)' }}>
          {error || 'Client not found.'}
        </div>
      </div>
    )
  }

  const fullName = `${client.first_name} ${client.last_name}`
  const location = [client.city, client.state].filter(Boolean).join(', ')

  return (
    <div className="max-w-3xl space-y-4">
      {/* Breadcrumb — desktop */}
      <div className="hidden md:block">
        <PageBreadcrumb crumbs={[
          { label: 'Clients', to: '/clients' },
          { label: fullName },
        ]} />
      </div>

      {/* Mobile back button */}
      <button onClick={() => navigate('/clients')}
        className="flex items-center gap-2 text-sm md:hidden"
        style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
        <ArrowLeft size={16} />Clients
      </button>

      {/* Header card */}
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
        {/* Name + avatar + edit */}
        <div className="px-4 py-3 flex items-center gap-3">
          <label className="relative w-10 h-10 rounded-full flex-shrink-0 cursor-pointer group" style={{ display: 'block' }}>
            <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploadingAvatar} />
            {avatarUrl ? (
              <img src={avatarUrl} alt={client.first_name} className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}>
                {client.first_name[0]}{client.last_name[0]}
              </div>
            )}
            <div className="absolute inset-0 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: 'rgba(0,0,0,0.45)' }}>
              {uploadingAvatar
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Camera size={14} style={{ color: '#fff' }} />}
            </div>
          </label>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base font-semibold" style={{ color: 'var(--text)' }}>{fullName}</h1>
              {client.pronouns && client.pronouns !== 'Prefer not to say' && (
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{client.pronouns}</span>
              )}
            </div>
              <button onClick={() => setShowEdit(true)}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-medium flex-shrink-0"
                style={{ background: 'var(--surface-raised)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                <Pencil size={12} />Edit
              </button>
            </div>
            {client.tags?.length > 0 && (
              <div className="flex items-center gap-1 mt-1 flex-wrap">
                {client.tags.map(tag => (
                  <span key={tag} className="px-2 py-0.5 rounded-md text-xs"
                    style={{ background: 'var(--surface-raised)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Contact detail rows */}
        {(client.email || client.phone || client.address || client.city || client.notes) && (
          <div style={{ borderTop: '1px solid var(--border)' }}>
            {client.email && (
              <a href={`mailto:${client.email}`}
                className="flex items-center gap-3 px-4 py-2.5"
                style={{ borderBottom: '1px solid var(--border)', textDecoration: 'none', display: 'flex' }}>
                <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)', width: 64, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Mail size={11} />Email
                </span>
                <span className="text-xs truncate" style={{ color: '#6366f1' }}>{client.email}</span>
              </a>
            )}
            {client.phone && (
              <a href={`tel:${client.phone}`}
                className="flex items-center gap-3 px-4 py-2.5"
                style={{ borderBottom: (client.address || client.city || client.notes) ? '1px solid var(--border)' : 'none', textDecoration: 'none', display: 'flex' }}>
                <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)', width: 64, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Phone size={11} />Phone
                </span>
                <span className="text-xs" style={{ color: 'var(--text)' }}>{formatPhone(client.phone)}</span>
              </a>
            )}
            {(client.address || client.city) && (
              <div className="flex items-start gap-3 px-4 py-2.5"
                style={{ borderBottom: client.notes ? '1px solid var(--border)' : 'none' }}>
                <span className="text-xs flex-shrink-0 pt-px" style={{ color: 'var(--text-muted)', width: 64, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <MapPin size={11} />Address
                </span>
                <span className="text-xs" style={{ color: 'var(--text)', lineHeight: 1.5 }}>
                  {[client.address, client.city, client.state, client.zip].filter(Boolean).join(', ')}
                </span>
              </div>
            )}
            {client.notes && (
              <div className="flex items-start gap-3 px-4 py-2.5">
                <span className="text-xs flex-shrink-0 pt-px" style={{ color: 'var(--text-muted)', width: 64, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <FileText size={11} />Notes
                </span>
                <span className="text-xs" style={{ color: 'var(--text)', lineHeight: 1.5 }}>{client.notes}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Client portal link */}
      <PortalLinkCard
        client={client}
        onToast={setToast}
        onTokenChange={token => setClient(prev => ({ ...prev, portal_token: token }))}
      />

      {/* Galleries */}
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
          <div>
            <h3 className="font-medium text-sm" style={{ color: 'var(--text)' }}>Galleries</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {galleries.length} {galleries.length === 1 ? 'gallery' : 'galleries'} linked to this client
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setShowAttachGallery(true)}>
              <Images size={13} />Attach Gallery
            </Button>
            <Button variant="secondary" size="sm" onClick={() => navigate('/galleries/new')}>
              <Plus size={13} />New Gallery
            </Button>
          </div>
        </div>

        {galleries.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No galleries linked yet.</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Attach an existing gallery above, or create a new one.
            </p>
          </div>
        ) : (
          <div style={{ background: 'var(--surface)' }}>
            {galleries.map((g, i) => (
              <div key={g.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                <GalleryRow gallery={g} onUnlink={handleUnlinkGallery} />
              </div>
            ))}
          </div>
        )}
      </div>


      {/* Sessions */}
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
          <div>
            <h3 className="font-medium text-sm" style={{ color: 'var(--text)' }}>Sessions</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => navigate('/sessions')}>
            <CalendarDays size={13} />View All
          </Button>
        </div>
        {sessions.length === 0 ? (
          <div className="px-5 py-8 text-center" style={{ background: 'var(--surface)' }}>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No sessions linked yet.</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Link this client from a session to see it here.</p>
          </div>
        ) : (
          <div style={{ background: 'var(--surface)' }}>
            {sessions.map((s, i) => {
              const cfg = getStatusConfig(s.status)
              return (
                <button key={s.id} onClick={() => navigate(`/sessions/${s.id}`)}
                  className="w-full flex items-center gap-3 px-5 py-3.5 text-left"
                  style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none', background: 'none', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(99,102,241,0.1)' }}>
                    <CalendarDays size={14} style={{ color: '#6366f1' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{s.name}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {s.type}
                      {s.session_date ? ` · ${new Date(s.session_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: cfg.color + '18', color: cfg.color }}>
                      {cfg.label}
                    </span>
                    <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Contracts */}
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
          <div>
            <h3 className="font-medium text-sm" style={{ color: 'var(--text)' }}>Contracts</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {contracts.length} {contracts.length === 1 ? 'contract' : 'contracts'}
            </p>
          </div>

        </div>

        {contracts.length === 0 ? (
          <div className="px-5 py-8 text-center" style={{ background: 'var(--surface)' }}>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No contracts yet.</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Send a contract to get a legally binding signature from this client.
            </p>
          </div>
        ) : (
          <div style={{ background: 'var(--surface)' }}>
            {contracts.map((c, i) => (
              <div key={c.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                <ContractRow contract={c} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Danger zone */}
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <div className="px-5 py-4" style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
          <h3 className="font-medium text-sm" style={{ color: 'var(--text)' }}>Danger Zone</h3>
        </div>
        <div className="px-5 py-4" style={{ background: 'var(--surface)' }}>
          {!confirmDelete ? (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>Delete client</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  Permanently removes this client record. Linked galleries and contracts are not deleted.
                </p>
              </div>
              <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={13} />Delete
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)' }}>
              <p className="text-sm flex-1 font-medium" style={{ color: 'var(--danger)' }}>
                Delete {fullName}? This cannot be undone.
              </p>
              <Button variant="danger" size="sm" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting...' : 'Confirm Delete'}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            </div>
          )}
        </div>
      </div>

      {showEdit && (
        <EditClientModal
          client={client}
          avatarUrl={avatarUrl}
          uploadingAvatar={uploadingAvatar}
          onAvatarUpload={handleAvatarUpload}
          onClose={() => setShowEdit(false)}
          allTags={allTags}
          onSaved={updated => {
            setClient(updated)
            setShowEdit(false)
            setToast({ message: 'Client updated', type: 'success' })
          }}
        />
      )}



      {cropSrc && (
        <ClientAvatarCropModal
          imageSrc={cropSrc}
          onSave={handleCropSave}
          onCancel={() => setCropSrc(null)}
          saving={uploadingAvatar}
        />
      )}

      {showAttachGallery && (
        <AttachGalleryModal
          clientId={id}
          onClose={() => setShowAttachGallery(false)}
          onAttached={handleAttachGallery}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50">
          <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
        </div>
      )}
    </div>
  )
}
