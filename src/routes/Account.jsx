import { useState, useEffect, useRef } from 'react'
import { Upload, CheckCircle, Plus, Trash2, Pencil, X } from 'lucide-react'
import { supabase } from '../supabaseClient.js'
import {
  getWatermarks, uploadWatermark, updateWatermark,
  deleteWatermark, setActiveWatermark
} from '../utils/watermarkApi.js'
import WatermarkCard from '../components/watermarks/WatermarkCard.jsx'
import SettingsSection from '../components/ui/SettingsSection.jsx'
import Tabs from '../components/ui/Tabs.jsx'
import Input from '../components/ui/Input.jsx'
import Button from '../components/ui/Button.jsx'

const ACCOUNT_TABS = [
  { id: 'profile',    label: 'Profile' },
  { id: 'watermarks', label: 'Watermarks' },
  { id: 'templates',  label: 'Email Templates' },
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
      {icon && <CheckCircle size={14} />}
      {text}
    </div>
  )
}

// ── Inline Delete Confirm ─────────────────────────────────────────────────────

function DeleteConfirmRow({ label, onConfirm, onCancel }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
      style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)' }}>
      <p className="text-xs flex-1 font-medium" style={{ color: 'var(--danger)' }}>Delete {label}?</p>
      <button onClick={onConfirm}
        className="text-xs px-2.5 py-1 rounded-lg font-medium"
        style={{ background: 'var(--danger)', color: '#fff', cursor: 'pointer' }}>
        Delete
      </button>
      <button onClick={onCancel}
        className="text-xs px-2.5 py-1 rounded-lg font-medium"
        style={{ background: 'var(--surface-raised)', color: 'var(--text)', cursor: 'pointer' }}>
        Cancel
      </button>
    </div>
  )
}

// ── Profile Tab ───────────────────────────────────────────────────────────────

function ProfileTab({ user, onSaveState }) {
  const [displayName, setDisplayName] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!user) return
    supabase.from('photographers')
      .select('display_name, business_name')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        setDisplayName(data?.display_name || '')
        setBusinessName(data?.business_name || '')
        setLoaded(true)
      })
  }, [user])

  async function save() {
    try {
      const { error } = await supabase.from('photographers')
        .update({ display_name: displayName, business_name: businessName, updated_at: new Date().toISOString() })
        .eq('id', user.id)
      if (error) throw error
      onSaveState('saved')
    } catch {
      onSaveState('error')
    }
  }

  if (!loaded) return null

  return (
    <SettingsSection title="Personal Information">
      <div className="px-5 py-4 space-y-4" style={{ background: 'var(--surface)' }}>
        <Input
          label="Display name"
          value={displayName}
          onChange={setDisplayName}
          onBlur={save}
          placeholder="Your name"
        />
        <Input
          label="Business / Studio name"
          value={businessName}
          onChange={setBusinessName}
          onBlur={save}
          placeholder="e.g. Docker Cap Photography"
          hint="Used in gallery emails and client-facing communications"
        />
        <div>
          <label className="text-sm font-medium block" style={{ color: 'var(--text)' }}>Email</label>
          <p className="text-sm mt-1.5" style={{ color: 'var(--text-muted)' }}>{user?.email}</p>
        </div>
      </div>
    </SettingsSection>
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
    getWatermarks().then(wms => {
      setWatermarks(wms)
      setLoaded(true)
    })
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
      const wm = await uploadWatermark(file, file.name.replace(/\.[^.]+$/, ''))
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
          <Upload size={14} />
          {uploading ? 'Uploading…' : 'Upload watermark image'}
        </Button>
        <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>PNG with transparency recommended. Max 5 MB.</p>
      </div>
      {watermarks.length === 0 ? (
        <div className="px-5 py-8 text-center" style={{ background: 'var(--surface)' }}>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No watermarks yet. Upload one above.</p>
        </div>
      ) : (
        <div className="p-5 grid grid-cols-1 gap-4" style={{ background: 'var(--surface)' }}>
          {watermarks.map(wm => (
            <div key={wm.id} className="space-y-2">
              <WatermarkCard watermark={wm} isActive={wm.id === activeId}
                onSetActive={handleSetActive} onUpdate={handleUpdate}
                onDelete={() => setConfirmDeleteId(wm.id)} />
              {confirmDeleteId === wm.id && (
                <DeleteConfirmRow
                  label="this watermark"
                  onConfirm={() => handleDelete(wm.id)}
                  onCancel={() => setConfirmDeleteId(null)}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </SettingsSection>
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
  const bodyRef = useRef(null)

  useEffect(() => {
    supabase.from('email_templates').select('*').order('name')
      .then(({ data }) => { setTemplates(data || []); setLoaded(true) })
  }, [])

  function startNew() { setEditing({}); setName(''); setSubject(''); setBody('') }
  function startEdit(t) { setEditing(t); setName(t.name); setSubject(t.subject); setBody(t.body) }
  function cancelEdit() { setEditing(null) }

  function insertVariable(tag) {
    const el = bodyRef.current
    if (!el) { setBody(b => b + tag); return }
    const start = el.selectionStart
    const end = el.selectionEnd
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
        const { data } = await supabase.from('email_templates')
          .update({ name: name.trim(), subject: subject.trim(), body: body.trim() })
          .eq('id', editing.id).select().single()
        setTemplates(prev => prev.map(t => t.id === editing.id ? data : t))
      } else {
        const { data } = await supabase.from('email_templates')
          .insert({ photographer_id: user.id, name: name.trim(), subject: subject.trim(), body: body.trim() })
          .select().single()
        setTemplates(prev => [...prev, data])
      }
      setEditing(null)
      onSaveState('saved')
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
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-sm" style={{ color: 'var(--text)' }}>
            {editing?.id ? 'Edit Template' : 'New Template'}
          </h3>
          <button onClick={cancelEdit} className="text-sm" style={{ color: 'var(--text-muted)', cursor: 'pointer' }}>Cancel</button>
        </div>

        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <div className="px-5 py-4 space-y-4" style={{ background: 'var(--surface)' }}>
            <Input label="Template Name" value={name} onChange={setName} placeholder="e.g. Wedding Delivery" />
            <Input label="Subject" value={subject} onChange={setSubject} placeholder="Your photos are ready!" />
            <div>
              <label className="text-sm font-medium block mb-1" style={{ color: 'var(--text)' }}>Message Body</label>
              <textarea
                ref={bodyRef}
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={8}
                placeholder={`Hi {{client_name}},\n\nYour gallery is ready to view!\n\n{{gallery_url}}`}
                className="w-full text-sm rounded-xl px-3 py-2.5 resize-none"
                style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none', fontFamily: 'inherit' }}
              />
            </div>

            <div>
              <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Insert variable</p>
              <div className="flex flex-wrap gap-1.5">
                {TEMPLATE_VARIABLES.map(v => (
                  <button key={v.tag} onClick={() => insertVariable(v.tag)}
                    title={v.desc}
                    className="text-xs px-2.5 py-1 rounded-lg font-mono"
                    style={{ background: 'rgba(99,102,241,0.08)', color: '#6366f1', border: '1px solid rgba(99,102,241,0.2)', cursor: 'pointer' }}>
                    {v.tag}
                  </button>
                ))}
              </div>
              <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                Click a variable to insert it at your cursor position. These are replaced with real values when the email is sent.
              </p>
            </div>

            <button onClick={handleSave} disabled={!name.trim() || !subject.trim() || saving}
              className="w-full py-2.5 rounded-xl text-sm font-medium"
              style={{ background: '#6366f1', color: '#fff', opacity: !name.trim() || saving ? 0.5 : 1, cursor: !name.trim() || saving ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Saving…' : 'Save Template'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Save message templates to reuse when sharing galleries. Use variables like <code className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(99,102,241,0.08)', color: '#6366f1' }}>{'{{client_name}}'}</code> to personalize automatically.
          </p>
        </div>
        <button onClick={startNew}
          className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg shrink-0 ml-4"
          style={{ background: '#6366f1', color: '#fff', cursor: 'pointer' }}>
          <Plus size={14} />New Template
        </button>
      </div>

      {!loaded ? null : templates.length === 0 ? (
        <div className="py-12 text-center rounded-xl" style={{ border: '2px dashed var(--border)' }}>
          <p className="text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>No templates yet</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Create your first template to save time when sharing galleries</p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          {templates.map((t, i) => (
            <div key={t.id}>
              <div className="flex items-center justify-between px-5 py-4"
                style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none', background: 'var(--surface)' }}>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{t.name}</p>
                  <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{t.subject}</p>
                </div>
                <div className="flex items-center gap-2 ml-4 shrink-0">
                  <button onClick={() => startEdit(t)}
                    className="p-1.5 rounded-lg"
                    style={{ background: 'var(--surface-raised)', cursor: 'pointer' }}>
                    <Pencil size={13} style={{ color: 'var(--text-muted)' }} />
                  </button>
                  <button onClick={() => setConfirmDeleteId(confirmDeleteId === t.id ? null : t.id)}
                    className="p-1.5 rounded-lg"
                    style={{ background: confirmDeleteId === t.id ? 'var(--danger-subtle)' : 'var(--surface-raised)', cursor: 'pointer' }}
                    onMouseEnter={e => { if (confirmDeleteId !== t.id) e.currentTarget.style.background = 'var(--danger-subtle)' }}
                    onMouseLeave={e => { if (confirmDeleteId !== t.id) e.currentTarget.style.background = 'var(--surface-raised)' }}>
                    <Trash2 size={13} style={{ color: confirmDeleteId === t.id ? 'var(--danger)' : 'var(--text-muted)' }} />
                  </button>
                </div>
              </div>
              {confirmDeleteId === t.id && (
                <div className="px-5 pb-4" style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
                  <DeleteConfirmRow
                    label={`"${t.name}"`}
                    onConfirm={() => handleDelete(t.id)}
                    onCancel={() => setConfirmDeleteId(null)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Account ──────────────────────────────────────────────────────────────

export default function Account() {
  const [user, setUser] = useState(null)
  const [activeTab, setActiveTab] = useState('profile')
  const [saveState, setSaveState] = useState('idle')
  const dismissTimer = useRef(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user))
  }, [])

  useEffect(() => {
    if (saveState === 'saved') {
      clearTimeout(dismissTimer.current)
      dismissTimer.current = setTimeout(() => setSaveState('idle'), 2500)
    }
    return () => clearTimeout(dismissTimer.current)
  }, [saveState])

  if (!user) return null

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Account</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{user?.email}</p>
      </div>

      <Tabs tabs={ACCOUNT_TABS} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'profile' && <ProfileTab user={user} onSaveState={setSaveState} />}
      {activeTab === 'watermarks' && <WatermarksTab onSaveState={setSaveState} />}
      {activeTab === 'templates' && <EmailTemplatesTab onSaveState={setSaveState} />}

      <SaveIndicator state={saveState} />
    </div>
  )
}
