import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import {CheckCircle, Copy, Eye, Pencil, Plus, Shield, Tag, Trash2, Upload, X} from 'lucide-react'
import Cropper from 'react-easy-crop'
import { supabase } from '../supabaseClient.js'
import {
  getWatermarks, uploadWatermark, updateWatermark,
  deleteWatermark, setActiveWatermark
} from '../utils/watermarkApi.js'
import {
  getGalleryTemplates, createGalleryTemplate, updateGalleryTemplate,
  deleteGalleryTemplate, duplicateGalleryTemplate
} from '../utils/galleryTemplateApi.js'
import { getTags, createTag, updateTag, deleteTag } from '../utils/galleryApi.js'
import {
  getContractTemplates, createContractTemplate, updateContractTemplate,
  deleteContractTemplate, duplicateContractTemplate
} from '../utils/crmApi.js'
import { THEMES, getTheme } from '../utils/themes.js'
import Toggle from '../components/ui/Toggle.jsx'
import WatermarkCard from '../components/watermarks/WatermarkCard.jsx'
import SettingsSection from '../components/ui/SettingsSection.jsx'
import Tabs from '../components/ui/Tabs.jsx'
import Input from '../components/ui/Input.jsx'
import Button from '../components/ui/Button.jsx'
import Admin from './Admin.jsx'

async function getCroppedImg(imageSrc, croppedAreaPixels) {
  const image = await new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = imageSrc
  })
  const canvas = document.createElement('canvas')
  const size = 400
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.drawImage(image, croppedAreaPixels.x, croppedAreaPixels.y, croppedAreaPixels.width, croppedAreaPixels.height, 0, 0, size, size)
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92))
}

async function svgToPngBlob(svgFile, targetWidth = 2000) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(svgFile)
    const img = new Image()
    img.onload = () => {
      const naturalW = img.naturalWidth || targetWidth
      const naturalH = img.naturalHeight || targetWidth
      const targetHeight = Math.round((naturalH / naturalW) * targetWidth)
      const canvas = document.createElement('canvas')
      canvas.width = targetWidth
      canvas.height = targetHeight
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, targetWidth, targetHeight)
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight)
      URL.revokeObjectURL(url)
      canvas.toBlob(blob => { if (blob) resolve(blob); else reject(new Error('SVG rasterization failed')) }, 'image/png')
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load SVG')) }
    img.src = url
  })
}

function AvatarCropModal({ imageSrc, onSave, onCancel, saving }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
  const onCropComplete = useCallback((_, cap) => setCroppedAreaPixels(cap), [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Crop profile photo</h2>
          <button onClick={onCancel} style={{ cursor: 'pointer', color: 'var(--text-muted)', background: 'none', border: 'none' }}><X size={16} /></button>
        </div>
        <div style={{ position: 'relative', width: '100%', height: 300, background: '#000' }}>
          <Cropper image={imageSrc} crop={crop} zoom={zoom} aspect={1} cropShape="round" showGrid={false}
            onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={onCropComplete} />
          <p style={{ position: 'absolute', bottom: 10, left: 0, right: 0, textAlign: 'center', fontSize: '12px', color: 'rgba(255,255,255,0.6)', pointerEvents: 'none' }}>Drag to reposition</p>
        </div>
        <div className="px-5 py-3 space-y-1.5" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Zoom</p>
          <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={e => setZoom(Number(e.target.value))} style={{ width: '100%', cursor: 'pointer' }} />
        </div>
        <div className="flex gap-2 px-5 py-4" style={{ borderTop: '1px solid var(--border)' }}>
          <Button variant="secondary" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSave(croppedAreaPixels)} disabled={saving || !croppedAreaPixels}>{saving ? 'Saving...' : 'Save photo'}</Button>
        </div>
      </div>
    </div>
  )
}


// ── Tags Tab ──────────────────────────────────────────────────────────────────

const TAG_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#6b7280',
]

function TagsTab({ onSaveState }) {
  const [tags, setTags] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(TAG_COLORS[0])
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const data = await getTags()
      setTags(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoaded(true)
    }
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)
    try {
      const tag = await createTag({ name: newName.trim(), color: newColor })
      setTags(prev => [...prev, { ...tag, usage_count: 0 }].sort((a, b) => a.name.localeCompare(b.name)))
      setNewName('')
      setNewColor(TAG_COLORS[0])
      onSaveState('saved')
    } catch (err) {
      console.error(err)
      onSaveState('error')
    } finally {
      setCreating(false)
    }
  }

  function startEdit(tag) {
    setEditingId(tag.id)
    setEditName(tag.name)
    setEditColor(tag.color || TAG_COLORS[0])
    setDeletingId(null)
  }

  async function handleUpdate(id) {
    if (!editName.trim()) return
    try {
      const updated = await updateTag(id, { name: editName.trim(), color: editColor })
      setTags(prev => prev.map(t => t.id === id ? { ...t, ...updated } : t).sort((a, b) => a.name.localeCompare(b.name)))
      setEditingId(null)
      onSaveState('saved')
    } catch (err) {
      console.error(err)
      onSaveState('error')
    }
  }

  async function handleDelete(id) {
    try {
      await deleteTag(id)
      setTags(prev => prev.filter(t => t.id !== id))
      setDeletingId(null)
      onSaveState('saved')
    } catch (err) {
      console.error(err)
      onSaveState('error')
    }
  }

  if (!loaded) return (
    <div className="flex items-center justify-center py-16">
      <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
        style={{ borderColor: 'var(--border-strong)', borderTopColor: 'transparent' }} />
    </div>
  )

  return (
    <div className="space-y-4">
      <SettingsSection title="Gallery Tags" description="Create tags to categorize your galleries. Tags can be assigned per gallery and filtered on your dashboard.">

        {/* Create new tag */}
        <div className="px-5 py-4 space-y-3" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
          <p className="text-xs font-medium" style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>New tag</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            {TAG_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                style={{
                  width: 20, height: 20, borderRadius: '50%', background: c, cursor: 'pointer',
                  border: newColor === c ? '2px solid var(--text)' : '2px solid transparent',
                  flexShrink: 0,
                }}
                aria-label={c}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate(e) }}
              placeholder="Tag name (e.g. convention, wedding, portrait)"
              className="flex-1 text-sm rounded-lg px-3 py-2 outline-none"
              style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)' }}
              onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
            <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
              <Plus size={14} />
              {creating ? 'Creating...' : 'Create'}
            </Button>
          </div>
        </div>

        {/* Tag list */}
        {tags.length === 0 ? (
          <div className="px-5 py-10 text-center" style={{ background: 'var(--surface)' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-3"
              style={{ background: 'var(--surface-raised)' }}>
              <Tag size={18} style={{ color: 'var(--text-muted)' }} />
            </div>
            <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>No tags yet</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Create your first tag above to start categorizing galleries</p>
          </div>
        ) : (
          <div style={{ background: 'var(--surface)' }}>
            {tags.map((tag, i) => (
              <div key={tag.id}>
                {i > 0 && <div style={{ borderTop: '1px solid var(--border)' }} />}

                {editingId === tag.id ? (
                  <div className="px-5 py-3 space-y-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {TAG_COLORS.map(c => (
                        <button
                          key={c}
                          onClick={() => setEditColor(c)}
                          style={{
                            width: 20, height: 20, borderRadius: '50%', background: c, cursor: 'pointer',
                            border: editColor === c ? '2px solid var(--text)' : '2px solid transparent',
                            flexShrink: 0,
                          }}
                          aria-label={c}
                        />
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleUpdate(tag.id); if (e.key === 'Escape') setEditingId(null) }}
                        autoFocus
                        className="flex-1 text-sm rounded-lg px-3 py-2 outline-none"
                        style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-strong)', color: 'var(--text)' }}
                      />
                      <Button onClick={() => handleUpdate(tag.id)}>Save</Button>
                      <button onClick={() => setEditingId(null)} className="text-sm px-3 py-1.5 rounded-lg"
                        style={{ background: 'var(--surface-raised)', color: 'var(--text-muted)', cursor: 'pointer', border: 'none' }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : deletingId === tag.id ? (
                  <div className="px-5 py-3">
                    <DeleteConfirmRow
                      label={`"${tag.name}"` + (tag.usage_count > 0 ? ` (used in ${tag.usage_count} ${tag.usage_count === 1 ? 'gallery' : 'galleries'})` : '')}
                      onConfirm={() => handleDelete(tag.id)}
                      onCancel={() => setDeletingId(null)}
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-3 px-5 py-3">
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: tag.color || '#6366f1', flexShrink: 0 }} />
                    <span className="text-sm flex-1" style={{ color: 'var(--text)' }}>{tag.name}</span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {tag.usage_count} {tag.usage_count === 1 ? 'gallery' : 'galleries'}
                    </span>
                    <button onClick={() => startEdit(tag)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => { setDeletingId(tag.id); setEditingId(null) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                      <X size={13} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </SettingsSection>
    </div>
  )
}


// ── Contract Templates Tab ────────────────────────────────────────────────────

const CONTRACT_TEMPLATE_VARIABLES = [
  { tag: '{{client_name}}',       desc: 'Full client name' },
  { tag: '{{client_first_name}}', desc: 'Client first name' },
  { tag: '{{client_email}}',      desc: 'Client email address' },
  { tag: '{{photographer_name}}', desc: 'Your display name' },
  { tag: '{{studio_name}}',       desc: 'Your business name' },
  { tag: '{{gallery_title}}',     desc: 'Gallery title' },
  { tag: '{{event_name}}',        desc: 'Event name' },
  { tag: '{{event_date}}',        desc: 'Event date' },
  { tag: '{{today_date}}',        desc: 'Date contract is sent' },
  { tag: '{{sign_date}}',         desc: 'Date client signs' },
]

function ContractTemplatesTab({ onSaveState }) {
  const [templates, setTemplates] = useState([])
  const [editing, setEditing] = useState(null)
  const [editName, setEditName] = useState('')
  const [editBody, setEditBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [showVars, setShowVars] = useState(false)
  const [previewContract, setPreviewContract] = useState(false)
  const bodyRef = useRef(null)

  useEffect(() => {
    getContractTemplates()
      .then(data => { setTemplates(data); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [])

  function startNew() { setEditing({}); setEditName(''); setEditBody(''); setShowVars(false) }
  function startEdit(t) { setEditing(t); setEditName(t.name); setEditBody(t.body); setShowVars(false) }
  function cancelEdit() { setEditing(null) }

  function insertVariable(tag) {
    const el = bodyRef.current
    if (!el) { setEditBody(b => b + tag); return }
    const start = el.selectionStart
    const end = el.selectionEnd
    const newBody = editBody.slice(0, start) + tag + editBody.slice(end)
    setEditBody(newBody)
    setTimeout(() => { el.selectionStart = el.selectionEnd = start + tag.length; el.focus() }, 0)
  }

  async function handleSave() {
    if (!editName.trim() || !editBody.trim()) return
    setSaving(true)
    try {
      if (editing?.id) {
        const updated = await updateContractTemplate(editing.id, { name: editName.trim(), body: editBody.trim() })
        setTemplates(prev => prev.map(t => t.id === editing.id ? updated : t))
      } else {
        const created = await createContractTemplate({ name: editName.trim(), body: editBody.trim() })
        setTemplates(prev => [...prev, created])
      }
      setEditing(null)
      onSaveState('saved')
    } catch { onSaveState('error') }
    finally { setSaving(false) }
  }

  async function handleDuplicate(t) {
    try {
      const copy = await duplicateContractTemplate(t)
      setTemplates(prev => [...prev, copy])
      onSaveState('saved')
    } catch { onSaveState('error') }
  }

  async function handleDelete(id) {
    try {
      await deleteContractTemplate(id)
      setTemplates(prev => prev.filter(t => t.id !== id))
      setConfirmDeleteId(null)
      onSaveState('saved')
    } catch { onSaveState('error') }
  }

  if (editing !== null) {
    return (
      <SettingsSection
        title={editing?.id ? 'Edit Contract Template' : 'New Contract Template'}
        description="Use {{variable}} placeholders — they are filled in automatically when sending."
      >
        <div className="px-5 py-5 space-y-4" style={{ background: 'var(--surface)' }}>
          <Input label="Template name" value={editName} onChange={setEditName}
            placeholder="e.g. Portrait Session Agreement" required />

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                Contract body <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <button onClick={() => setPreviewContract(p => !p)}
                className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg"
                style={{ background: previewContract ? 'rgba(99,102,241,0.1)' : 'var(--surface-raised)', color: previewContract ? '#6366f1' : 'var(--text-muted)', border: 'none', cursor: 'pointer' }}>
                {previewContract ? <Pencil size={11} /> : <Eye size={11} />}
                {previewContract ? 'Edit' : 'Preview'}
              </button>
            </div>
            {previewContract ? (
              <div style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)',
                color: 'var(--text)', borderRadius: 8, padding: '10px 12px', fontSize: 13,
                fontFamily: 'inherit', lineHeight: 1.6, whiteSpace: 'pre-wrap', minHeight: 300 }}>
                {fillPreview(editBody) || <span style={{ color: 'var(--text-muted)' }}>(empty)</span>}
              </div>
            ) : (
              <textarea ref={bodyRef} value={editBody} onChange={e => setEditBody(e.target.value)}
                placeholder="Enter your contract text. Use {{variable}} placeholders where values should be filled automatically."
                rows={20}
                style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)',
                  color: 'var(--text)', borderRadius: 8, padding: '10px 12px', fontSize: 13, outline: 'none',
                  resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
                onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'} />
            )}
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Plain text. Use blank lines to separate paragraphs.</p>
          </div>
          <div>
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Insert variable</p>
            <div className="flex flex-wrap gap-1.5">
              {CONTRACT_TEMPLATE_VARIABLES.map(v => (
                <button key={v.tag} onClick={() => insertVariable(v.tag)} title={v.desc}
                  className="text-xs px-2.5 py-1 rounded-lg font-mono"
                  style={{ background: 'rgba(99,102,241,0.08)', color: '#6366f1', border: '1px solid rgba(99,102,241,0.2)', cursor: 'pointer' }}>
                  {v.tag}
                </button>
              ))}
            </div>
            <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>Click a variable to insert it at your cursor position.</p>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <Button onClick={handleSave} disabled={saving || !editName.trim() || !editBody.trim()}>
              {saving ? 'Saving...' : 'Save Template'}
            </Button>
            <Button variant="secondary" onClick={cancelEdit}>Cancel</Button>
          </div>
        </div>
      </SettingsSection>
    )
  }

  return (
    <SettingsSection
      title="Contract Templates"
      description="Reusable contract templates with auto-filled variables. Sent to clients for digital signature."
      action={
        <button onClick={startNew} className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg"
          style={{ background: '#6366f1', color: '#fff', cursor: 'pointer', border: 'none' }}>
          <Plus size={14} />New Template
        </button>
      }>
      {!loaded ? null : templates.length === 0 ? (
        <div className="py-12 text-center" style={{ background: 'var(--surface)' }}>
          <p className="text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>No contract templates yet</p>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Create templates to quickly send contracts to clients for signature.</p>
          <button onClick={startNew} className="text-sm font-medium px-4 py-2 rounded-lg"
            style={{ background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer' }}>
            Create your first template
          </button>
        </div>
      ) : (
        <div style={{ background: 'var(--surface)' }}>
          {templates.map((t, i) => (
            <div key={t.id}>
              <div className="flex items-center justify-between px-5 py-4"
                style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{t.name}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {t.body.split('\n').filter(Boolean).length} lines
                    {' · '}Updated {new Date(t.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-4 shrink-0">
                  <button onClick={() => handleDuplicate(t)} title="Duplicate" className="p-1.5 rounded-lg"
                    style={{ background: 'var(--surface-raised)', cursor: 'pointer', border: 'none' }}>
                    <Copy size={13} style={{ color: 'var(--text-muted)' }} />
                  </button>
                  <button onClick={() => startEdit(t)} title="Edit" className="p-1.5 rounded-lg"
                    style={{ background: 'var(--surface-raised)', cursor: 'pointer', border: 'none' }}>
                    <Pencil size={13} style={{ color: 'var(--text-muted)' }} />
                  </button>
                  <button onClick={() => setConfirmDeleteId(confirmDeleteId === t.id ? null : t.id)} title="Delete"
                    className="p-1.5 rounded-lg"
                    style={{ background: confirmDeleteId === t.id ? 'var(--danger-subtle)' : 'var(--surface-raised)', cursor: 'pointer', border: 'none' }}>
                    <Trash2 size={13} style={{ color: confirmDeleteId === t.id ? 'var(--danger)' : 'var(--text-muted)' }} />
                  </button>
                </div>
              </div>
              {confirmDeleteId === t.id && (
                <div className="px-5 pb-4" style={{ borderTop: '1px solid var(--border)' }}>
                  <DeleteConfirmRow label={`"${t.name}"`} onConfirm={() => handleDelete(t.id)} onCancel={() => setConfirmDeleteId(null)} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </SettingsSection>
  )
}

const BASE_ACCOUNT_TABS = [
  { id: 'profile',       label: 'Profile' },
  { id: 'watermarks',    label: 'Watermarks' },
  { id: 'templates',     label: 'Templates' },
  { id: 'social',        label: 'Social' },
  { id: 'payment',       label: 'Payment' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'tags',          label: 'Tags' },
]

const TEMPLATE_VARIABLES = [
  { tag: '{{gallery_name}}',  desc: 'Gallery title' },
  { tag: '{{client_name}}',   desc: 'Client name' },
  { tag: '{{event_date}}',    desc: 'Event date' },
  { tag: '{{my_name}}',       desc: 'Your display name' },
  { tag: '{{business_name}}', desc: 'Your business name' },
  { tag: '{{gallery_url}}',   desc: 'Gallery link' },
  { tag: '{{password}}',      desc: 'Gallery password' },
  { tag: '{{download_pin}}',  desc: 'Download PIN' },
  { tag: '{{event_name}}',    desc: 'Event name' },
  { tag: '{{expiry_date}}',   desc: 'Gallery expiry date' },
]

function SaveIndicator({ state }) {
  if (state === 'idle') return null
  const config = {
    saved: { text: 'Changes saved', color: 'var(--success)', bg: 'var(--success-subtle)', border: 'var(--success)', icon: true },
    error: { text: 'Failed to save', color: 'var(--danger)', bg: 'var(--danger-subtle)', border: 'var(--danger)' },
  }
  const { text, color, bg, border, icon } = config[state]
  return (
    <div className="fixed bottom-6 right-6 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg z-50"
      style={{ background: bg, color, border: `1px solid ${border}40` }}>
      {icon && <CheckCircle size={14} />}{text}
    </div>
  )
}

function DeleteConfirmRow({ label, onConfirm, onCancel }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)' }}>
      <p className="text-xs flex-1 font-medium" style={{ color: 'var(--danger)' }}>Delete {label}?</p>
      <button onClick={onConfirm} className="text-xs px-2.5 py-1 rounded-lg font-medium" style={{ background: 'var(--danger)', color: '#fff', cursor: 'pointer' }}>Delete</button>
      <button onClick={onCancel} className="text-xs px-2.5 py-1 rounded-lg font-medium" style={{ background: 'var(--surface-raised)', color: 'var(--text)', cursor: 'pointer' }}>Cancel</button>
    </div>
  )
}

// ── Profile Tab ───────────────────────────────────────────────────────────────

function ProfileTab({ user, onSaveState }) {
  const [displayName, setDisplayName] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [securityMsg, setSecurityMsg] = useState(null)
  const [savingSecurity, setSavingSecurity] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [storageInfo, setStorageInfo] = useState(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [cropSrc, setCropSrc] = useState(null)
  const avatarInputRef = useRef(null)
  const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL

  useEffect(() => {
    if (!user) return
    Promise.all([
      supabase.from('photographers').select('display_name, business_name, avatar_r2_key').eq('id', user.id).single(),
      supabase.from('photographer_storage').select('*, storage_tiers(name, storage_gb)').eq('photographer_id', user.id).single(),
      supabase.from('galleries').select('id').eq('photographer_id', user.id),
    ]).then(async ([{ data }, { data: storageRow }, { data: galleries }]) => {
      if (storageRow) {
        const galleryIds = (galleries || []).map(g => g.id)
        let bytesUsed = storageRow.bytes_used || 0
        if (galleryIds.length > 0) {
          const { data: imgs } = await supabase.from('gallery_images').select('file_size, preview_size').in('gallery_id', galleryIds).is('deleted_at', null)
          // Only count original file sizes — previews and web files are system infrastructure
          bytesUsed = (imgs || []).reduce((sum, img) => sum + (img.file_size || 0), 0)
        }
        setStorageInfo({ bytesUsed, tier: storageRow.storage_tiers })
      }
        setDisplayName(data?.display_name || '')
        setBusinessName(data?.business_name || '')
        if (data?.avatar_r2_key) {
          const { data: { session } } = await supabase.auth.getSession()
          const resp = await fetch(`${WORKER_URL}/watermark/${encodeURIComponent(data.avatar_r2_key)}`, { headers: { Authorization: `Bearer ${session.access_token}` } })
          if (resp.ok) { const blob = await resp.blob(); setAvatarUrl(URL.createObjectURL(blob)) }
        }
        setLoaded(true)
    })
  }, [user])

  function formatBytes(bytes) {
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  function handleFileSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setCropSrc(reader.result)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  async function handleCropSave(croppedAreaPixels) {
    setUploadingAvatar(true)
    try {
      const croppedBlob = await getCroppedImg(cropSrc, croppedAreaPixels)
      const { data: { session } } = await supabase.auth.getSession()
      const { data: existing } = await supabase.from('photographers').select('avatar_r2_key').eq('id', user.id).single()
      if (existing?.avatar_r2_key) {
        await fetch(`${WORKER_URL}/delete/${encodeURIComponent(existing.avatar_r2_key)}`, {
          method: 'DELETE', headers: { Authorization: `Bearer ${session.access_token}` }
        }).catch(() => {})
      }
      const r2Key = `photographers/${user.id}/watermarks/avatar-${crypto.randomUUID()}.jpg`
      const formData = new FormData()
      formData.append('file', new File([croppedBlob], 'avatar.jpg', { type: 'image/jpeg' }))
      formData.append('key', r2Key)
      const resp = await fetch(`${WORKER_URL}/watermark-upload`, { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` }, body: formData })
      const result = await resp.json()
      if (!result.ok) throw new Error(result.error || 'Upload failed')
      await supabase.from('photographers').update({ avatar_r2_key: r2Key, updated_at: new Date().toISOString() }).eq('id', user.id)
      setAvatarUrl(URL.createObjectURL(croppedBlob))
      setCropSrc(null)
      window.dispatchEvent(new CustomEvent('fv-avatar-updated'))
      onSaveState('saved')
    } catch { onSaveState('error') }
    finally { setUploadingAvatar(false) }
  }

  async function save() {
    try {
      const { error } = await supabase.from('photographers').update({ display_name: displayName, business_name: businessName, updated_at: new Date().toISOString() }).eq('id', user.id)
      if (error) throw error
      onSaveState('saved')
    } catch { onSaveState('error') }
  }

  async function handleEmailChange() {
    if (!newEmail.trim()) return
    setSavingSecurity(true); setSecurityMsg(null)
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail.trim() })
      if (error) throw error
      setSecurityMsg({ ok: true, text: 'Confirmation email sent. Check your inbox to confirm the new address.' })
      setNewEmail('')
    } catch (err) { setSecurityMsg({ ok: false, text: err.message }) }
    finally { setSavingSecurity(false) }
  }

  async function handlePasswordChange() {
    if (!newPassword || newPassword !== confirmPassword) { setSecurityMsg({ ok: false, text: 'Passwords do not match.' }); return }
    if (newPassword.length < 8) { setSecurityMsg({ ok: false, text: 'Password must be at least 8 characters.' }); return }
    setSavingSecurity(true); setSecurityMsg(null)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setSecurityMsg({ ok: true, text: 'Password updated successfully.' })
      setNewPassword(''); setConfirmPassword('')
    } catch (err) { setSecurityMsg({ ok: false, text: err.message }) }
    finally { setSavingSecurity(false) }
  }

  if (!loaded) return null
  const initials = (displayName || user?.email || '?')[0].toUpperCase()

  return (
    <div className="space-y-4">
      <SettingsSection title="Personal Information" description="Your name, photo, and business details.">
        <div className="px-5 py-4 space-y-4" style={{ background: 'var(--surface)' }}>
          <div className="flex items-center gap-4">
            <button onClick={() => avatarInputRef.current?.click()} style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0, position: 'relative' }} title="Change profile photo">
              <div className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center text-lg font-medium" style={{ background: 'var(--surface-raised)', color: 'var(--text)', flexShrink: 0 }}>
                {avatarUrl ? <img src={avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
              </div>
              {uploadingAvatar && (
                <div className="absolute inset-0 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
                  <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#fff', borderTopColor: 'transparent' }} />
                </div>
              )}
            </button>
            <div>
              <button onClick={() => avatarInputRef.current?.click()} className="text-sm font-medium" style={{ color: 'var(--accent)', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}>
                {avatarUrl ? 'Change photo' : 'Upload photo'}
              </button>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>JPG or PNG, shown in the app header</p>
            </div>
            <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handleFileSelect} />
          </div>
          {cropSrc && <AvatarCropModal imageSrc={cropSrc} onSave={handleCropSave} onCancel={() => setCropSrc(null)} saving={uploadingAvatar} />}
          <Input label="Display name" value={displayName} onChange={setDisplayName} onBlur={save} placeholder="Your name" />
          <Input label="Business / Studio name" value={businessName} onChange={setBusinessName} onBlur={save} placeholder="e.g. Docker Cap Photography" hint="Used in gallery emails and client-facing communications" />
          <div>
            <label className="text-sm font-medium block mb-1" style={{ color: 'var(--text)' }}>Email</label>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{user?.email}</p>
          </div>
        </div>
      </SettingsSection>

      {storageInfo && (
        <SettingsSection title="Storage" description="Your current storage usage and plan.">
          <div className="px-5 py-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: 'var(--text)' }}>{formatBytes(storageInfo.bytesUsed)} used</span>
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{storageInfo.tier?.name || 'Free'} · {storageInfo.tier?.storage_gb ? `${storageInfo.tier.storage_gb} GB` : '—'}</span>
            </div>
            <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-raised)' }}>
              <div className="h-full rounded-full transition-all" style={{
                width: storageInfo.tier?.storage_gb
                  ? `${Math.min((storageInfo.bytesUsed / (storageInfo.tier.storage_gb * 1024 * 1024 * 1024)) * 100, 100)}%`
                  : '0%',
                background: 'var(--accent)'
              }} />
            </div>
          </div>
        </SettingsSection>
      )}

      <SettingsSection title="Security" description="Update your email address and password.">
        <div className="px-5 py-4 space-y-4" style={{ background: 'var(--surface)' }}>
          <div className="space-y-2">
            <Input label="New email address" value={newEmail} onChange={setNewEmail} placeholder={user?.email} hint="A confirmation link will be sent to the new address." />
            <Button variant="secondary" onClick={handleEmailChange} disabled={!newEmail.trim() || savingSecurity}>Update Email</Button>
          </div>
          <div style={{ borderTop: '1px solid var(--border)' }} />
          <div className="space-y-2">
            <Input label="New password" value={newPassword} onChange={setNewPassword} type="password" placeholder="Min. 8 characters" />
            <Input label="Confirm new password" value={confirmPassword} onChange={setConfirmPassword} type="password" placeholder="Re-enter new password" />
            <Button variant="secondary" onClick={handlePasswordChange} disabled={!newPassword || !confirmPassword || savingSecurity}>Update Password</Button>
          </div>
          {securityMsg && <p className="text-sm" style={{ color: securityMsg.ok ? 'var(--success)' : 'var(--danger)' }}>{securityMsg.text}</p>}
        </div>
      </SettingsSection>
    </div>
  )
}

// ── Watermarks Tab ────────────────────────────────────────────────────────────

function WatermarksTab({ onSaveState }) {
  const [watermarks, setWatermarks] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    getWatermarks().then(wms => { setWatermarks(wms); setLoaded(true) })
    supabase.auth.getUser().then(({ data: { user } }) => {
      supabase.from('photographers').select('active_watermark_id').eq('id', user.id).single()
        .then(({ data }) => setActiveId(data?.active_watermark_id || null))
    })
  }, [])

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      setUploading(true)
      const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')
      let uploadFile = file
      let label = file.name.replace(/\.[^.]+$/, '')
      if (isSvg) {
        const pngBlob = await svgToPngBlob(file, 2000)
        uploadFile = new File([pngBlob], label + '.png', { type: 'image/png' })
      }
      const wm = await uploadWatermark(uploadFile, label)
      setWatermarks(prev => [wm, ...prev])
      if (watermarks.length === 0) { await setActiveWatermark(wm.id); setActiveId(wm.id) }
      onSaveState('saved')
    } catch { onSaveState('error') }
    finally { setUploading(false); e.target.value = '' }
  }

  async function handleSetActive(id) {
    try { await setActiveWatermark(id); setActiveId(id); onSaveState('saved') }
    catch { onSaveState('error') }
  }

  async function handleUpdate(id, updates) {
    try {
      const updated = await updateWatermark(id, updates)
      setWatermarks(prev => prev.map(w => w.id === id ? updated : w))
      onSaveState('saved')
    } catch { onSaveState('error') }
  }

  async function handleDelete(id) {
    try {
      await deleteWatermark(id)
      setWatermarks(prev => prev.filter(w => w.id !== id))
      if (activeId === id) { await setActiveWatermark(null); setActiveId(null) }
      setConfirmDeleteId(null)
      onSaveState('saved')
    } catch { onSaveState('error') }
  }

  return (
    <SettingsSection title="Watermarks" description="Watermarks are applied to image previews. The active watermark is used for new uploads.">
      <div className="px-5 py-4" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="sr-only" />
        <Button variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          <Upload size={14} />{uploading ? 'Uploading…' : 'Upload watermark image'}
        </Button>
        <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>PNG or SVG with transparency recommended. Max 5 MB. SVGs are automatically converted to PNG.</p>
      </div>
      {watermarks.length === 0 ? (
        <div className="px-5 py-8 text-center" style={{ background: 'var(--surface)' }}>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No watermarks yet. Upload one above.</p>
        </div>
      ) : (
        <div className="p-5 grid grid-cols-1 gap-4" style={{ background: 'var(--surface)' }}>
          {watermarks.map(wm => (
            <div key={wm.id} className="space-y-2">
              <WatermarkCard watermark={wm} isActive={wm.id === activeId} onSetActive={handleSetActive} onUpdate={handleUpdate} onDelete={() => setConfirmDeleteId(wm.id)} />
              {confirmDeleteId === wm.id && <DeleteConfirmRow label="this watermark" onConfirm={() => handleDelete(wm.id)} onCancel={() => setConfirmDeleteId(null)} />}
            </div>
          ))}
        </div>
      )}
    </SettingsSection>
  )
}

// ── Gallery Templates Tab ─────────────────────────────────────────────────────

function GalleryTemplatesTab({ onSaveState }) {
  const [templates, setTemplates] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [editing, setEditing] = useState(null)
  const [editName, setEditName] = useState('')
  const [editTheme, setEditTheme] = useState('light')
  const [editGridSize, setEditGridSize] = useState('medium')
  const [editGridSpacing, setEditGridSpacing] = useState('tight')
  const [editSets, setEditSets] = useState([''])
  const [editAllowDownloads, setEditAllowDownloads] = useState(true)
  const [editDownloadWatermarked, setEditDownloadWatermarked] = useState(false)
  const [editAllowHiresDownload, setEditAllowHiresDownload] = useState(false)
  const [editAllowFavorites, setEditAllowFavorites] = useState(true)
  const [editAllowComments, setEditAllowComments] = useState(true)
  const [editRequirePassword, setEditRequirePassword] = useState(false)
  const [editRequireDownloadPin, setEditRequireDownloadPin] = useState(false)
  const [editWatermarkId, setEditWatermarkId] = useState(null)
  const [availableWatermarks, setAvailableWatermarks] = useState([])
  const [saving, setSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)

  useEffect(() => {
    getGalleryTemplates().then(data => { setTemplates(data); setLoaded(true) })
    getWatermarks().then(setAvailableWatermarks).catch(() => {})
  }, [])

  function startNew() {
    setEditing({})
    setEditName(''); setEditTheme('light'); setEditGridSize('medium'); setEditGridSpacing('tight')
    setEditSets(['']); setEditAllowDownloads(true); setEditDownloadWatermarked(false)
    setEditAllowHiresDownload(false); setEditAllowFavorites(true); setEditAllowComments(true)
    setEditRequirePassword(false); setEditRequireDownloadPin(false); setEditWatermarkId(null)
  }

  function startEdit(t) {
    setEditing(t); setEditName(t.name); setEditTheme(t.theme_color); setEditGridSize(t.grid_size)
    setEditGridSpacing(t.grid_spacing); setEditSets([...t.sets])
    setEditAllowDownloads(t.allow_downloads ?? true); setEditDownloadWatermarked(t.download_watermarked ?? false)
    setEditAllowHiresDownload(t.allow_hires_download ?? false); setEditAllowFavorites(t.allow_favorites ?? true)
    setEditAllowComments(t.allow_comments ?? true); setEditRequirePassword(t.require_password ?? false)
    setEditRequireDownloadPin(t.require_download_pin ?? false); setEditWatermarkId(t.watermark_id || null)
  }

  async function handleDuplicate(t) {
    try { const duped = await duplicateGalleryTemplate(t); setTemplates(prev => [...prev, duped]); onSaveState('saved') }
    catch { onSaveState('error') }
  }

  async function handleSave() {
    const validSets = editSets.filter(s => s.trim())
    if (!editName.trim() || !validSets.length) return
    setSaving(true)
    try {
      const payload = { name: editName, themeColor: editTheme, gridSize: editGridSize, gridSpacing: editGridSpacing, sets: validSets, allowDownloads: editAllowDownloads, downloadWatermarked: editDownloadWatermarked, allowHiresDownload: editAllowHiresDownload, allowFavorites: editAllowFavorites, allowComments: editAllowComments, requirePassword: editRequirePassword, requireDownloadPin: editRequireDownloadPin, watermarkId: editWatermarkId }
      if (editing?.id) {
        const updated = await updateGalleryTemplate(editing.id, payload)
        setTemplates(prev => prev.map(t => t.id === editing.id ? updated : t))
      } else {
        const created = await createGalleryTemplate(payload)
        setTemplates(prev => [...prev, created])
      }
      setEditing(null); onSaveState('saved')
    } catch { onSaveState('error') }
    finally { setSaving(false) }
  }

  async function handleDelete(id) {
    try { await deleteGalleryTemplate(id); setTemplates(prev => prev.filter(t => t.id !== id)); setConfirmDeleteId(null); onSaveState('saved') }
    catch { onSaveState('error') }
  }

  if (editing !== null) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-sm" style={{ color: 'var(--text)' }}>{editing?.id ? 'Edit Template' : 'New Gallery Template'}</h3>
          <button onClick={() => setEditing(null)} className="text-sm" style={{ color: 'var(--text-muted)', cursor: 'pointer' }}>Cancel</button>
        </div>
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <div className="px-5 py-4 space-y-4" style={{ background: 'var(--surface)' }}>
            <Input label="Template name" value={editName} onChange={setEditName} placeholder="e.g. Wedding Delivery" />
            <div>
              <label className="text-sm font-medium block mb-2" style={{ color: 'var(--text)' }}>Theme</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {THEMES.map(t => (
                  <button key={t.id} onClick={() => setEditTheme(t.id)} className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl"
                    style={{ background: editTheme === t.id ? 'rgba(99,102,241,0.05)' : 'var(--surface-raised)', border: editTheme === t.id ? '2px solid #6366f1' : '2px solid var(--border)', cursor: 'pointer' }}>
                    <div className="flex gap-1">
                      <div className="w-3.5 h-3.5 rounded-full border" style={{ background: t.bg, borderColor: 'var(--border)' }} />
                      <div className="w-3.5 h-3.5 rounded-full border" style={{ background: t.surface, borderColor: 'var(--border)' }} />
                      <div className="w-3.5 h-3.5 rounded-full border" style={{ background: t.accent, borderColor: 'var(--border)' }} />
                    </div>
                    <span className="text-xs font-medium" style={{ color: editTheme === t.id ? '#6366f1' : 'var(--text)' }}>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium block mb-2" style={{ color: 'var(--text)' }}>Grid size</label>
              <div className="flex gap-2">
                {['medium', 'large'].map(v => (
                  <button key={v} onClick={() => setEditGridSize(v)} className="px-3 py-1.5 rounded-lg text-sm capitalize"
                    style={{ background: editGridSize === v ? 'rgba(99,102,241,0.1)' : 'var(--surface-raised)', border: editGridSize === v ? '1px solid #6366f1' : '1px solid var(--border)', color: editGridSize === v ? '#6366f1' : 'var(--text)', cursor: 'pointer' }}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium block mb-2" style={{ color: 'var(--text)' }}>Grid spacing</label>
              <div className="flex gap-2">
                {['tight', 'large'].map(v => (
                  <button key={v} onClick={() => setEditGridSpacing(v)} className="px-3 py-1.5 rounded-lg text-sm capitalize"
                    style={{ background: editGridSpacing === v ? 'rgba(99,102,241,0.1)' : 'var(--surface-raised)', border: editGridSpacing === v ? '1px solid #6366f1' : '1px solid var(--border)', color: editGridSpacing === v ? '#6366f1' : 'var(--text)', cursor: 'pointer' }}>
                    {v === 'tight' ? 'Tight' : 'Spacious'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium block mb-2" style={{ color: 'var(--text)' }}>Default sets</label>
              <div className="space-y-2">
                {editSets.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="text" value={s} onChange={e => setEditSets(prev => prev.map((v, idx) => idx === i ? e.target.value : v))} placeholder="Set name" className="flex-1 text-sm rounded-lg px-3 py-2"
                      style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none' }} />
                    <button onClick={() => { if (editSets.length > 1) setEditSets(prev => prev.filter((_, idx) => idx !== i)) }} disabled={editSets.length === 1}
                      style={{ color: editSets.length === 1 ? 'var(--border)' : 'var(--text-muted)', cursor: editSets.length === 1 ? 'not-allowed' : 'pointer' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <button onClick={() => setEditSets(prev => [...prev, ''])} className="flex items-center gap-1.5 text-sm font-medium mt-2" style={{ color: '#6366f1', cursor: 'pointer' }}>
                <Plus size={13} />Add set
              </button>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1" style={{ color: 'var(--text)' }}>Default watermark</label>
              <select value={editWatermarkId || ''} onChange={e => setEditWatermarkId(e.target.value || null)}
                style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '8px', padding: '9px 12px', fontSize: '14px', outline: 'none', cursor: 'pointer', appearance: 'none' }}>
                <option value="">No watermark</option>
                {availableWatermarks.map(wm => <option key={wm.id} value={wm.id}>{wm.label}</option>)}
              </select>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Applied to new image uploads in galleries created from this template.</p>
            </div>
            <div>
              <label className="text-sm font-medium block mb-2" style={{ color: 'var(--text)' }}>Default access settings</label>
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                {[
                  { label: 'Require password', desc: 'Gallery requires a password to view', value: editRequirePassword, setter: setEditRequirePassword },
                  { label: 'Require download PIN', desc: 'Downloads require a PIN', value: editRequireDownloadPin, setter: setEditRequireDownloadPin },
                  { label: 'Allow downloads', desc: 'Clients can download images', value: editAllowDownloads, setter: setEditAllowDownloads },
                  { label: 'Web size downloads', desc: 'Allow watermarked web-size downloads', value: editDownloadWatermarked, setter: setEditDownloadWatermarked },
                  { label: 'High-res downloads', desc: 'Allow full-resolution downloads', value: editAllowHiresDownload, setter: setEditAllowHiresDownload },
                  { label: 'Allow favorites', desc: 'Clients can heart images', value: editAllowFavorites, setter: setEditAllowFavorites },
                  { label: 'Allow comments', desc: 'Clients can leave comments', value: editAllowComments, setter: setEditAllowComments },
                ].map((row, i) => (
                  <div key={row.label} className="flex items-center justify-between px-4 py-3"
                    style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none', background: 'var(--surface)' }}>
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{row.label}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{row.desc}</p>
                    </div>
                    <Toggle checked={row.value} onChange={row.setter} />
                  </div>
                ))}
              </div>
            </div>
            <button onClick={handleSave} disabled={!editName.trim() || !editSets.some(s => s.trim()) || saving} className="w-full py-2.5 rounded-xl text-sm font-medium"
              style={{ background: '#6366f1', color: '#fff', opacity: !editName.trim() || saving ? 0.5 : 1, cursor: !editName.trim() || saving ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Saving…' : 'Save Template'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <SettingsSection
      title="Gallery Templates"
      description="Pre-fill display settings and sets when creating a new gallery."
      action={
        <button onClick={startNew} className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg"
          style={{ background: '#6366f1', color: '#fff', cursor: 'pointer', border: 'none' }}>
          <Plus size={14} />New
        </button>
      }>
      {!loaded ? null : templates.length === 0 ? (
        <div className="py-12 text-center" style={{ background: 'var(--surface)' }}>
          <p className="text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>No templates yet</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Create your first template to speed up gallery creation</p>
        </div>
      ) : (
        <div style={{ background: 'var(--surface)' }}>
          {templates.map((t, i) => {
            const theme = getTheme(t.theme_color)
            return (
              <div key={t.id}>
                <div className="flex items-center gap-4 px-5 py-4" style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none', background: 'var(--surface)' }}>
                  <div className="shrink-0 flex gap-1 items-center">
                    <div className="w-3.5 h-3.5 rounded-full border" style={{ background: theme.bg, borderColor: 'var(--border)' }} />
                    <div className="w-3.5 h-3.5 rounded-full border" style={{ background: theme.surface, borderColor: 'var(--border)' }} />
                    <div className="w-3.5 h-3.5 rounded-full border" style={{ background: theme.accent, borderColor: 'var(--border)' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{t.name}</p>
                      {t.is_builtin && <span className="text-xs px-1.5 py-0.5 rounded shrink-0" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}>Built-in</span>}
                    </div>
                    <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{theme.label} · {t.sets.join(', ')}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => handleDuplicate(t)} title="Duplicate" className="p-1.5 rounded-lg" style={{ background: 'var(--surface-raised)', cursor: 'pointer' }}><Copy size={13} style={{ color: 'var(--text-muted)' }} /></button>
                    <button onClick={() => startEdit(t)} title="Edit" className="p-1.5 rounded-lg" style={{ background: 'var(--surface-raised)', cursor: 'pointer' }}><Pencil size={13} style={{ color: 'var(--text-muted)' }} /></button>
                    <button onClick={() => setConfirmDeleteId(confirmDeleteId === t.id ? null : t.id)} title="Delete" className="p-1.5 rounded-lg"
                      style={{ background: confirmDeleteId === t.id ? 'var(--danger-subtle)' : 'var(--surface-raised)', cursor: 'pointer' }}>
                      <Trash2 size={13} style={{ color: confirmDeleteId === t.id ? 'var(--danger)' : 'var(--text-muted)' }} />
                    </button>
                  </div>
                </div>
                {confirmDeleteId === t.id && (
                  <div className="px-5 pb-4" style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
                    <DeleteConfirmRow label={`"${t.name}"`} onConfirm={() => handleDelete(t.id)} onCancel={() => setConfirmDeleteId(null)} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </SettingsSection>
  )
}


// ── Template preview helpers ──────────────────────────────────────────────────

const PREVIEW_DATA = {
  '{{client_name}}':       'Jane Smith',
  '{{client_first_name}}': 'Jane',
  '{{client_email}}':      'jane.smith@example.com',
  '{{gallery_name}}':      'Spring Portrait Session',
  '{{gallery_title}}':     'Spring Portrait Session',
  '{{gallery_url}}':       'https://finalvault.dockercapphotography.com/g/example',
  '{{photographer_name}}': 'Nick Porterfield',
  '{{my_name}}':           'Nick Porterfield',
  '{{business_name}}':     'Docker Cap Photography',
  '{{studio_name}}':       'Docker Cap Photography',
  '{{event_name}}':        'Spring Portrait Session',
  '{{event_date}}':        'June 15, 2026',
  '{{today_date}}':        new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
  '{{sign_date}}':         new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
  '{{password}}':          'gallery123',
  '{{download_pin}}':      '1234',
  '{{expiry_date}}':       'December 31, 2026',
}

function fillPreview(text) {
  if (!text) return ''
  return Object.entries(PREVIEW_DATA).reduce(
    (t, [key, val]) => t.replaceAll(key, val),
    text
  )
}

// ── Email Templates Tab ───────────────────────────────────────────────────────

function EmailTemplatesTab({ onSaveState }) {
  const [templates, setTemplates] = useState([])
  const [editing, setEditing] = useState(null)
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [previewEmail, setPreviewEmail] = useState(false)
  const bodyRef = useRef(null)

  useEffect(() => {
    supabase.from('email_templates').select('*').order('name').then(({ data }) => { setTemplates(data || []); setLoaded(true) })
  }, [])

  function startNew() { setEditing({}); setName(''); setSubject(''); setBody('') }
  function startEdit(t) { setEditing(t); setName(t.name); setSubject(t.subject); setBody(t.body) }
  function cancelEdit() { setEditing(null) }

  function insertVariable(tag) {
    const el = bodyRef.current
    if (!el) { setBody(b => b + tag); return }
    const start = el.selectionStart; const end = el.selectionEnd
    const newBody = body.slice(0, start) + tag + body.slice(end)
    setBody(newBody)
    setTimeout(() => { el.selectionStart = el.selectionEnd = start + tag.length; el.focus() }, 0)
  }

  async function handleSave() {
    if (!name.trim() || !subject.trim()) return
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (editing?.id) {
        const { data } = await supabase.from('email_templates').update({ name: name.trim(), subject: subject.trim(), body: body.trim() }).eq('id', editing.id).select().single()
        setTemplates(prev => prev.map(t => t.id === editing.id ? data : t))
      } else {
        const { data } = await supabase.from('email_templates').insert({ photographer_id: user.id, name: name.trim(), subject: subject.trim(), body: body.trim() }).select().single()
        setTemplates(prev => [...prev, data])
      }
      setEditing(null); onSaveState('saved')
    } catch { onSaveState('error') }
    finally { setSaving(false) }
  }

  async function handleDelete(id) {
    await supabase.from('email_templates').delete().eq('id', id)
    setTemplates(prev => prev.filter(t => t.id !== id))
    setConfirmDeleteId(null)
  }

  if (editing !== null) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="font-medium text-sm" style={{ color: 'var(--text)' }}>{editing?.id ? 'Edit Template' : 'New Email Template'}</h3>
        </div>
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <div className="px-5 py-4 space-y-4" style={{ background: 'var(--surface)' }}>
            <Input label="Template Name" value={name} onChange={setName} placeholder="e.g. Wedding Delivery" />
            <Input label="Subject" value={subject} onChange={setSubject} placeholder="Your photos are ready!" />
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>Message Body</label>
                <button onClick={() => setPreviewEmail(p => !p)}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg"
                  style={{ background: previewEmail ? 'rgba(99,102,241,0.1)' : 'var(--surface-raised)', color: previewEmail ? '#6366f1' : 'var(--text-muted)', border: 'none', cursor: 'pointer' }}>
                  {previewEmail ? <Pencil size={11} /> : <Eye size={11} />}
                  {previewEmail ? 'Edit' : 'Preview'}
                </button>
              </div>
              {previewEmail ? (
                <div className="w-full text-sm rounded-xl px-3 py-2.5 min-h-[160px]"
                  style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                  <p className="text-xs font-medium mb-2 pb-2" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                    Subject: {fillPreview(subject) || '(no subject)'}
                  </p>
                  {fillPreview(body) || <span style={{ color: 'var(--text-muted)' }}>(empty)</span>}
                </div>
              ) : (
                <textarea ref={bodyRef} value={body} onChange={e => setBody(e.target.value)} rows={8}
                  placeholder={`Hi {{client_name}},\n\nYour gallery is ready to view!\n\n{{gallery_url}}`}
                  className="w-full text-sm rounded-xl px-3 py-2.5 resize-none"
                  style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none', fontFamily: 'inherit' }} />
              )}
            </div>
            <div>
              <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Insert variable</p>
              <div className="flex flex-wrap gap-1.5">
                {TEMPLATE_VARIABLES.map(v => (
                  <button key={v.tag} onClick={() => insertVariable(v.tag)} title={v.desc} className="text-xs px-2.5 py-1 rounded-lg font-mono"
                    style={{ background: 'rgba(99,102,241,0.08)', color: '#6366f1', border: '1px solid rgba(99,102,241,0.2)', cursor: 'pointer' }}>
                    {v.tag}
                  </button>
                ))}
              </div>
              <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>Click a variable to insert it at your cursor position.</p>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <Button onClick={handleSave} disabled={!name.trim() || !subject.trim() || saving}>
                {saving ? 'Saving…' : 'Save Template'}
              </Button>
              <Button variant="secondary" onClick={cancelEdit}>Cancel</Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <SettingsSection
      title="Email Templates"
      description="Save message templates to reuse when sharing galleries."
      action={
        <button onClick={startNew} className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg"
          style={{ background: '#6366f1', color: '#fff', cursor: 'pointer', border: 'none' }}>
          <Plus size={14} />New Template
        </button>
      }>
      {!loaded ? null : templates.length === 0 ? (
        <div className="py-12 text-center" style={{ background: 'var(--surface)' }}>
          <p className="text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>No templates yet</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Create your first template to save time when sharing galleries</p>
        </div>
      ) : (
        <div style={{ background: 'var(--surface)' }}>
          {templates.map((t, i) => (
            <div key={t.id}>
              <div className="flex items-center justify-between px-5 py-4" style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none', background: 'var(--surface)' }}>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{t.name}</p>
                  <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{t.subject}</p>
                </div>
                <div className="flex items-center gap-2 ml-4 shrink-0">
                  <button onClick={() => startEdit(t)} className="p-1.5 rounded-lg" style={{ background: 'var(--surface-raised)', cursor: 'pointer' }}><Pencil size={13} style={{ color: 'var(--text-muted)' }} /></button>
                  <button onClick={() => setConfirmDeleteId(confirmDeleteId === t.id ? null : t.id)} className="p-1.5 rounded-lg"
                    style={{ background: confirmDeleteId === t.id ? 'var(--danger-subtle)' : 'var(--surface-raised)', cursor: 'pointer' }}>
                    <Trash2 size={13} style={{ color: confirmDeleteId === t.id ? 'var(--danger)' : 'var(--text-muted)' }} />
                  </button>
                </div>
              </div>
              {confirmDeleteId === t.id && (
                <div className="px-5 pb-4" style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
                  <DeleteConfirmRow label={`"${t.name}"`} onConfirm={() => handleDelete(t.id)} onCancel={() => setConfirmDeleteId(null)} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </SettingsSection>
  )
}

// ── Brand Icons ───────────────────────────────────────────────────────────────

const BASE_ICON_URL = 'https://finalvault.dockercapphotography.com/brand-icons'
const BRAND_ICONS = {
  instagram: <img src={`${BASE_ICON_URL}/instagram.png`} alt="Instagram" width="36" height="36" style={{ borderRadius: 8, display: 'block' }} />,
  facebook:  <img src={`${BASE_ICON_URL}/facebook.png`}  alt="Facebook"  width="36" height="36" style={{ borderRadius: 8, display: 'block' }} />,
  tiktok:    <img src={`${BASE_ICON_URL}/tiktok.png`}    alt="TikTok"    width="36" height="36" style={{ borderRadius: 8, display: 'block' }} />,
  x:         <img src={`${BASE_ICON_URL}/x.png`}         alt="X"         width="36" height="36" style={{ borderRadius: 8, display: 'block' }} />,
  youtube:   <img src={`${BASE_ICON_URL}/youtube.png`}   alt="YouTube"   width="36" height="36" style={{ borderRadius: 8, display: 'block' }} />,
  pinterest: <img src={`${BASE_ICON_URL}/pinterest.png`} alt="Pinterest" width="36" height="36" style={{ borderRadius: 8, display: 'block' }} />,
  venmo:     <img src={`${BASE_ICON_URL}/venmo.png`}     alt="Venmo"     width="36" height="36" style={{ borderRadius: 8, display: 'block' }} />,
  paypal:    <img src={`${BASE_ICON_URL}/paypal.png`}    alt="PayPal"    width="36" height="36" style={{ borderRadius: 8, display: 'block' }} />,
  kofi:      <img src={`${BASE_ICON_URL}/kofi.png`}      alt="Ko-Fi"     width="36" height="36" style={{ borderRadius: 8, display: 'block' }} />,
  cashapp:   <img src={`${BASE_ICON_URL}/cashapp.png`}   alt="Cash App"  width="36" height="36" style={{ borderRadius: 8, display: 'block' }} />,
}

const SOCIAL_PLATFORMS = [
  { id: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/yourhandle' },
  { id: 'facebook',  label: 'Facebook',  placeholder: 'https://facebook.com/yourpage' },
  { id: 'tiktok',    label: 'TikTok',    placeholder: 'https://tiktok.com/@yourhandle' },
  { id: 'x',         label: 'X',         placeholder: 'https://x.com/yourhandle' },
  { id: 'youtube',   label: 'YouTube',   placeholder: 'https://youtube.com/@yourchannel' },
  { id: 'pinterest', label: 'Pinterest', placeholder: 'https://pinterest.com/yourhandle' },
]

const PAYMENT_PLATFORMS = [
  { id: 'venmo',   label: 'Venmo',    placeholder: 'https://venmo.com/yourhandle' },
  { id: 'paypal',  label: 'PayPal',   placeholder: 'https://paypal.me/yourhandle' },
  { id: 'kofi',    label: 'Ko-Fi',    placeholder: 'https://ko-fi.com/yourhandle' },
  { id: 'cashapp', label: 'Cash App', placeholder: 'https://cash.app/$yourhandle' },
]

function LinksTab({ platforms, dbColumn, onSaveState }) {
  const [links, setLinks] = useState({})
  const [loaded, setLoaded] = useState(false)
  const [userId, setUserId] = useState(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setUserId(user.id)
      supabase.from('photographers').select(dbColumn).eq('id', user.id).single()
        .then(({ data }) => { setLinks(data?.[dbColumn] || {}); setLoaded(true) })
    })
  }, [dbColumn])

  async function handleSave(platformId, value) {
    const updated = { ...links, [platformId]: value }
    if (!value.trim()) delete updated[platformId]
    setLinks(updated)
    try {
      await supabase.from('photographers').update({ [dbColumn]: updated }).eq('id', userId)
      onSaveState('saved')
    } catch { onSaveState('error') }
  }

  if (!loaded) return null

  return (
    <div className="space-y-3">
      {platforms.map(platform => (
        <div key={platform.id} className="flex items-center gap-4 px-4 py-3 rounded-xl"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="shrink-0 rounded-lg overflow-hidden" style={{ width: 36, height: 36 }}>{BRAND_ICONS[platform.id]}</div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>{platform.label}</p>
            <input type="url" defaultValue={links[platform.id] || ''} placeholder={platform.placeholder}
              onBlur={e => handleSave(platform.id, e.target.value.trim())}
              className="w-full text-sm rounded-lg px-3 py-2"
              style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none' }}
              onFocus={e => e.target.style.borderColor = 'var(--border-strong)'} />
          </div>
          {links[platform.id] && <div className="shrink-0 w-2 h-2 rounded-full" style={{ background: 'var(--success)' }} />}
        </div>
      ))}
    </div>
  )
}

// ── Notifications Tab ─────────────────────────────────────────────────────────

function NotificationsTab({ user, onSaveState }) {
  const [prefs, setPrefs] = useState(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!user) return
    supabase
      .from('notification_preferences')
      .select('notify_favorites, notify_comments, notify_downloads')
      .eq('photographer_id', user.id)
      .single()
      .then(({ data }) => {
        setPrefs(data || { notify_favorites: true, notify_comments: true, notify_downloads: true })
        setLoaded(true)
      })
  }, [user])

  async function handleToggle(field, value) {
    const updated = { ...prefs, [field]: value }
    setPrefs(updated)
    try {
      const { error } = await supabase
        .from('notification_preferences')
        .update({ [field]: value, updated_at: new Date().toISOString() })
        .eq('photographer_id', user.id)
      if (error) throw error
      onSaveState('saved')
    } catch { onSaveState('error') }
  }

  if (!loaded) return null

  const rows = [
    { field: 'notify_favorites', label: 'Client favorites an image',   desc: 'Get notified when a client hearts a photo' },
    { field: 'notify_comments',  label: 'Client leaves a comment',     desc: 'Get notified when a client writes a comment' },
    { field: 'notify_downloads',  label: 'Client downloads an image',        desc: 'Get notified when a client downloads a photo or full gallery' },
  ]

  return (
    <div className="space-y-4">
      <SettingsSection
        title="Activity Digest"
        description="Receive a daily email summary of client activity across your galleries. Only sent when there is new activity since the last digest.">
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          {rows.map((row, i) => (
            <div key={row.field} className="flex items-center justify-between px-5 py-4"
              style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none', background: 'var(--surface)' }}>
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{row.label}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{row.desc}</p>
              </div>
              <Toggle
                checked={prefs[row.field]}
                onChange={val => handleToggle(row.field, val)}
              />
            </div>
          ))}
        </div>
        <div className="px-5 py-3" style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {(() => {
              const utc8 = new Date()
              utc8.setUTCHours(8, 0, 0, 0)
              const localTime = utc8.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
              return <>Digests are sent daily at {localTime} to <span style={{ color: 'var(--text)' }}>{user?.email}</span>.</>
            })()}
          </p>
        </div>
      </SettingsSection>
    </div>
  )
}

// ── Main Account ──────────────────────────────────────────────────────────────

export default function Account() {
  const [user, setUser] = useState(null)
  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'profile')
  const [isAdmin, setIsAdmin] = useState(false)
  const [saveState, setSaveState] = useState('idle')
  const dismissTimer = useRef(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      if (user) {
        supabase.from('photographers').select('is_admin').eq('id', user.id).single()
          .then(({ data }) => setIsAdmin(data?.is_admin || false))
      }
    })
  }, [])

  useEffect(() => {
    if (saveState === 'saved') {
      clearTimeout(dismissTimer.current)
      dismissTimer.current = setTimeout(() => setSaveState('idle'), 2500)
    }
    return () => clearTimeout(dismissTimer.current)
  }, [saveState])

  if (!user) return null

  const ACCOUNT_TABS = isAdmin ? [...BASE_ACCOUNT_TABS, { id: 'admin', label: 'Admin' }] : BASE_ACCOUNT_TABS

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Account</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{user?.email}</p>
      </div>

      {/* Mobile dropdown */}
      <div className="md:hidden">
        <select value={activeTab} onChange={e => setActiveTab(e.target.value)}
          style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '8px', padding: '9px 12px', fontSize: '14px', outline: 'none', cursor: 'pointer', appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: '36px' }}>
          {ACCOUNT_TABS.map(tab => <option key={tab.id} value={tab.id}>{tab.label}</option>)}
        </select>
      </div>

      {/* Desktop tabs */}
      <div className="hidden md:block">
        <Tabs tabs={ACCOUNT_TABS} active={activeTab} onChange={setActiveTab} />
      </div>

      {activeTab === 'profile'       && <ProfileTab user={user} onSaveState={setSaveState} />}
      {activeTab === 'watermarks'    && <WatermarksTab onSaveState={setSaveState} />}
      {activeTab === 'templates'     && (
        <div className="space-y-6">
          <GalleryTemplatesTab onSaveState={setSaveState} />
          <EmailTemplatesTab onSaveState={setSaveState} />
          <ContractTemplatesTab onSaveState={setSaveState} />
        </div>
      )}
      {activeTab === 'social' && (
        <SettingsSection title="Social Links" description="Links shown in the footer of gallery emails.">
          <div className="px-5 py-4" style={{ background: 'var(--surface)' }}>
            <LinksTab platforms={SOCIAL_PLATFORMS} dbColumn="social_links" onSaveState={setSaveState} />
          </div>
        </SettingsSection>
      )}
      {activeTab === 'payment' && (
        <SettingsSection title="Payment Links" description="Payment links shown in the footer of gallery emails.">
          <div className="px-5 py-4" style={{ background: 'var(--surface)' }}>
            <LinksTab platforms={PAYMENT_PLATFORMS} dbColumn="payment_links" onSaveState={setSaveState} />
          </div>
        </SettingsSection>
      )}
      {activeTab === 'notifications' && <NotificationsTab user={user} onSaveState={setSaveState} />}
      {activeTab === 'tags'          && <TagsTab onSaveState={setSaveState} />}
      {activeTab === 'admin'         && isAdmin && <Admin />}

      <SaveIndicator state={saveState} />
    </div>
  )
}
