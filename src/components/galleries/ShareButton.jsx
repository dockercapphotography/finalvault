import { useState, useEffect, useRef } from 'react'
import { X, Copy, Mail, Link, QrCode, Check, ChevronDown, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../../supabaseClient.js'
import QRCode from 'https://esm.sh/qrcode@1.5.3'

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseEmails(raw) {
  return [...new Set(
    raw.split(/[\s,;]+/)
      .map(e => e.trim().toLowerCase())
      .filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
  )]
}

function CopyField({ label, value }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div>
      {label && <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>{label}</p>}
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
        style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}>
        <span className="flex-1 text-sm font-mono truncate" style={{ color: 'var(--text)' }}>{value}</span>
        <button onClick={copy}
          className="flex items-center gap-1 text-xs font-medium shrink-0"
          style={{ color: copied ? '#22c55e' : '#6366f1', cursor: 'pointer' }}>
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

// ── Direct Link Modal ─────────────────────────────────────────────────────────

function DirectLinkModal({ gallery, onClose }) {
  const galleryUrl = `${window.location.origin}/g/${gallery.share_token}`
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl p-6 space-y-4"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm uppercase tracking-wider" style={{ color: 'var(--text)' }}>Get Direct Link</h3>
          <button onClick={onClose} style={{ color: 'var(--text-muted)', cursor: 'pointer' }}><X size={16} /></button>
        </div>

        <CopyField label="Gallery URL" value={galleryUrl} />
        {gallery.require_password && gallery.plain_password && (
          <div>
            <CopyField label="Gallery Password" value={gallery.plain_password} />
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Password is case-sensitive.</p>
          </div>
        )}
        {gallery.require_download_pin && gallery.plain_download_pin && (
          <div>
            <CopyField label="Download PIN" value={gallery.plain_download_pin} />
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Share this PIN with your client to allow downloads.</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── QR Code Modal ─────────────────────────────────────────────────────────────

function QRCodeModal({ gallery, onClose }) {
  const canvasRef = useRef(null)
  const galleryUrl = `${window.location.origin}/g/${gallery.share_token}`

  useEffect(() => {
    if (!canvasRef.current) return
    import('https://esm.sh/qrcode@1.5.3').then(QRCode => {
      QRCode.default.toCanvas(canvasRef.current, galleryUrl, {
        width: 280, margin: 2,
        color: { dark: '#111111', light: '#ffffff' }
      })
    })
  }, [galleryUrl])

  function handleDownload() {
    const canvas = canvasRef.current
    if (!canvas) return
    const link = document.createElement('a')
    link.download = `${gallery.title}-qrcode.png`
    link.href = canvas.toDataURL()
    link.click()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <div className="w-full max-w-xs rounded-2xl p-6 space-y-4"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm uppercase tracking-wider" style={{ color: 'var(--text)' }}>QR Code</h3>
          <button onClick={onClose} style={{ color: 'var(--text-muted)', cursor: 'pointer' }}><X size={16} /></button>
        </div>
        <div className="flex justify-center p-4 rounded-xl" style={{ background: '#fff' }}>
          <canvas ref={canvasRef} />
        </div>
        <p className="text-xs text-center break-all" style={{ color: 'var(--text-muted)' }}>{galleryUrl}</p>
        <div className="flex gap-2">
          <button onClick={handleDownload}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: '#6366f1', color: '#fff', cursor: 'pointer' }}>
            Download
          </button>
          <button onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm"
            style={{ background: 'var(--surface-raised)', color: 'var(--text)', cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Email Composer Modal ──────────────────────────────────────────────────────

function EmailComposerModal({ gallery, onClose }) {
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState(`Your gallery is ready — ${gallery.title}`)
  const [message, setMessage] = useState('')
  const [includePassword, setIncludePassword] = useState(!!gallery.require_password)
  const [includePin, setIncludePin] = useState(!!gallery.require_download_pin)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)
  const [templates, setTemplates] = useState([])
  const [showTemplates, setShowTemplates] = useState(false)
  const [showTemplateManager, setShowTemplateManager] = useState(false)

  const galleryUrl = `${window.location.origin}/g/${gallery.share_token}`
  const emails = parseEmails(to)

  useEffect(() => { loadTemplates() }, [])

  async function loadTemplates() {
    const { data } = await supabase.from('email_templates').select('*').order('name')
    setTemplates(data || [])
  }

  async function handleSend() {
    if (!emails.length) return
    setSending(true)
    setResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-gallery-email`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            galleryId: gallery.id,
            recipients: emails.map(e => ({ email: e })),
            subject,
            message,
            includePassword,
            includePin,
          }),
        }
      )
      const data = await resp.json()
      if (data.ok) {
        const failed = data.results?.filter(r => !r.ok) || []
        setResult({ ok: true, sent: emails.length - failed.length, failed: failed.length })
      } else {
        setResult({ ok: false, error: data.error || 'Send failed' })
      }
    } catch (err) {
      setResult({ ok: false, error: err.message })
    } finally {
      setSending(false)
    }
  }

  function applyTemplate(t) {
    setSubject(t.subject)
    setMessage(t.body)
    setShowTemplates(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl overflow-hidden"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <h3 className="font-semibold" style={{ color: 'var(--text)' }}>Share by Email</h3>
          <button onClick={onClose} style={{ color: 'var(--text-muted)', cursor: 'pointer' }}><X size={16} /></button>
        </div>

        <div className="overflow-y-auto flex-1">
          {showTemplateManager ? (
            <TemplateManager templates={templates} onClose={() => { setShowTemplateManager(false); loadTemplates() }} />
          ) : (
            <div className="p-6 space-y-4">
              {/* To */}
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>
                  To <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>— paste or type email addresses (comma, space, or newline separated)</span>
                </label>
                <textarea
                  value={to}
                  onChange={e => setTo(e.target.value)}
                  placeholder="client@email.com, another@email.com"
                  rows={3}
                  className="w-full text-sm rounded-xl px-3 py-2.5 resize-none"
                  style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none' }}
                />
                {emails.length > 0 && (
                  <p className="text-xs mt-1" style={{ color: '#6366f1' }}>{emails.length} recipient{emails.length !== 1 ? 's' : ''} detected</p>
                )}
              </div>

              {/* Subject */}
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Subject</label>
                <input type="text" value={subject} onChange={e => setSubject(e.target.value)}
                  className="w-full text-sm rounded-xl px-3 py-2.5"
                  style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none' }}
                />
              </div>

              {/* Message + template picker */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Message</label>
                  <div className="relative">
                    <button onClick={() => setShowTemplates(!showTemplates)}
                      className="flex items-center gap-1 text-xs font-medium"
                      style={{ color: '#6366f1', cursor: 'pointer' }}>
                      Insert template <ChevronDown size={12} />
                    </button>
                    {showTemplates && (
                      <div className="absolute right-0 top-full mt-1 rounded-xl shadow-lg overflow-hidden z-10 w-52"
                        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                        {templates.length === 0 && (
                          <p className="px-3 py-2 text-xs" style={{ color: 'var(--text-muted)' }}>No templates yet</p>
                        )}
                        {templates.map(t => (
                          <button key={t.id} onClick={() => applyTemplate(t)}
                            className="w-full text-left px-3 py-2 text-sm"
                            style={{ color: 'var(--text)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            {t.name}
                          </button>
                        ))}
                        <div style={{ borderTop: '1px solid var(--border)' }}>
                          <button onClick={() => { setShowTemplates(false); setShowTemplateManager(true) }}
                            className="w-full text-left px-3 py-2 text-xs font-medium"
                            style={{ color: '#6366f1', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                            Manage templates →
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <textarea value={message} onChange={e => setMessage(e.target.value)}
                  placeholder="Add a personal message (optional)"
                  rows={5}
                  className="w-full text-sm rounded-xl px-3 py-2.5 resize-none"
                  style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none' }}
                />
              </div>

              {/* Include info checkboxes */}
              <div className="space-y-2">
                <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Include in email</p>
                <div className="flex items-center gap-4">
                  {gallery.require_password && (
                    <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text)' }}>
                      <input type="checkbox" checked={includePassword} onChange={e => setIncludePassword(e.target.checked)} />
                      Gallery Password
                    </label>
                  )}
                  {gallery.require_download_pin && (
                    <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text)' }}>
                      <input type="checkbox" checked={includePin} onChange={e => setIncludePin(e.target.checked)} />
                      Download PIN
                    </label>
                  )}
                  {!gallery.require_password && !gallery.require_download_pin && (
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No password or PIN set for this gallery</p>
                  )}
                </div>
              </div>

              {/* Result */}
              {result && (
                <div className="px-4 py-3 rounded-xl text-sm"
                  style={{ background: result.ok ? 'var(--success-subtle)' : 'var(--danger-subtle)', color: result.ok ? 'var(--success)' : 'var(--danger)' }}>
                  {result.ok
                    ? `✓ Sent to ${result.sent} recipient${result.sent !== 1 ? 's' : ''}${result.failed ? ` · ${result.failed} failed` : ''}`
                    : `Error: ${result.error}`}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!showTemplateManager && (
          <div className="flex items-center justify-between px-6 py-4" style={{ borderTop: '1px solid var(--border)' }}>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {emails.length > 0 ? `Sending to ${emails.length} recipient${emails.length !== 1 ? 's' : ''}` : 'No recipients yet'}
            </p>
            <div className="flex gap-2">
              <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm"
                style={{ background: 'var(--surface-raised)', color: 'var(--text)', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleSend}
                disabled={!emails.length || sending}
                className="px-5 py-2 rounded-xl text-sm font-medium"
                style={{ background: '#6366f1', color: '#fff', opacity: !emails.length || sending ? 0.5 : 1, cursor: !emails.length || sending ? 'not-allowed' : 'pointer' }}>
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Template Manager ──────────────────────────────────────────────────────────

function TemplateManager({ templates: initial, onClose }) {
  const [templates, setTemplates] = useState(initial)
  const [editing, setEditing] = useState(null) // null | {} | template
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)

  function startNew() { setEditing({}); setName(''); setSubject(''); setBody('') }
  function startEdit(t) { setEditing(t); setName(t.name); setSubject(t.subject); setBody(t.body) }

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
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    await supabase.from('email_templates').delete().eq('id', id)
    setTemplates(prev => prev.filter(t => t.id !== id))
  }

  if (editing !== null) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <button onClick={() => setEditing(null)} className="text-sm" style={{ color: '#6366f1', cursor: 'pointer' }}>← Back</button>
          <h4 className="font-medium text-sm" style={{ color: 'var(--text)' }}>{editing?.id ? 'Edit Template' : 'New Template'}</h4>
        </div>
        {[
          { label: 'Template Name', value: name, onChange: setName, placeholder: 'e.g. Wedding Delivery' },
          { label: 'Subject', value: subject, onChange: setSubject, placeholder: 'Your photos are ready!' },
        ].map(f => (
          <div key={f.label}>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>{f.label}</label>
            <input type="text" value={f.value} onChange={e => f.onChange(e.target.value)} placeholder={f.placeholder}
              className="w-full text-sm rounded-xl px-3 py-2.5"
              style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none' }} />
          </div>
        ))}
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Message Body</label>
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={6}
            placeholder="Your gallery message..."
            className="w-full text-sm rounded-xl px-3 py-2.5 resize-none"
            style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none' }} />
        </div>
        <button onClick={handleSave} disabled={!name.trim() || !subject.trim() || saving}
          className="w-full py-2.5 rounded-xl text-sm font-medium"
          style={{ background: '#6366f1', color: '#fff', opacity: !name.trim() || saving ? 0.5 : 1, cursor: !name.trim() || saving ? 'not-allowed' : 'pointer' }}>
          {saving ? 'Saving…' : 'Save Template'}
        </button>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="text-sm" style={{ color: '#6366f1', cursor: 'pointer' }}>← Back to email</button>
        </div>
        <button onClick={startNew}
          className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg"
          style={{ background: '#6366f1', color: '#fff', cursor: 'pointer' }}>
          <Plus size={14} />New Template
        </button>
      </div>

      {templates.length === 0 ? (
        <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>No templates yet. Create one to save time.</p>
      ) : (
        <div className="space-y-2">
          {templates.map(t => (
            <div key={t.id} className="flex items-center justify-between p-3 rounded-xl"
              style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}>
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{t.name}</p>
                <p className="text-xs mt-0.5 truncate max-w-xs" style={{ color: 'var(--text-muted)' }}>{t.subject}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => startEdit(t)} className="text-xs px-2.5 py-1.5 rounded-lg"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer' }}>
                  Edit
                </button>
                <button onClick={() => handleDelete(t.id)}
                  style={{ color: 'var(--text-muted)', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--danger)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Share Button ──────────────────────────────────────────────────────────────

export default function ShareButton({ gallery }) {
  const [open, setOpen] = useState(false)
  const [modal, setModal] = useState(null) // 'email' | 'link' | 'qr'
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function open_(m) { setOpen(false); setModal(m) }

  return (
    <>
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-xl"
          style={{ background: '#6366f1', color: '#fff', cursor: 'pointer' }}>
          Share
          <ChevronDown size={14} />
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-1 rounded-xl shadow-lg overflow-hidden z-40 w-48"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            {[
              { id: 'email', icon: Mail, label: 'Share by email' },
              { id: 'link', icon: Link, label: 'Get direct link' },
              { id: 'qr', icon: QrCode, label: 'Get QR code' },
            ].map(item => (
              <button key={item.id} onClick={() => open_(item.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left"
                style={{ color: 'var(--text)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <item.icon size={16} style={{ color: 'var(--text-muted)' }} />
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {modal === 'email' && <EmailComposerModal gallery={gallery} onClose={() => setModal(null)} />}
      {modal === 'link' && <DirectLinkModal gallery={gallery} onClose={() => setModal(null)} />}
      {modal === 'qr' && <QRCodeModal gallery={gallery} onClose={() => setModal(null)} />}
    </>
  )
}
