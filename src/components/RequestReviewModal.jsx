import { useState, useEffect } from 'react'
import { X, Send, Link2, Check } from 'lucide-react'
import TemplatePicker from './ui/TemplatePicker.jsx'
import Button from './ui/Button.jsx'
import Input from './ui/Input.jsx'
import GalleryPickThumb from './microsite/GalleryPickThumb.jsx'
import { supabase } from '../supabaseClient.js'
import { getPublicBaseUrl } from '../utils/publicBaseUrl.js'
import {
  getReviewRequestTemplates, resolveReviewTemplate, defaultReviewName,
  sendReviewRequest, reviewLink, getSessionPhotos, BUILT_IN_REVIEW_REQUEST,
} from '../utils/reviewApi.js'

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL

/**
 * RequestReviewModal (v1.5.17)
 *
 * Same shell as SendContractModal -- fixed centered overlay, 16px side
 * padding, body scroll lock -- since it opens from the same Session
 * Detail page right next to Send Contract.
 *
 * Two modes:
 *   new  (no existing request) -> Copy link instead | Send request
 *   edit (existing request)    -> Save | Save & resend
 *
 * Name and suggested photo are saved on the request; subject and message
 * only go into the email (the default Review Request Template is
 * pre-selected and resolved, so what's shown is exactly what's sent).
 * Every action goes through send_testimonial_request; p_send_email=false
 * is the Save / Copy link path.
 *
 * The suggested photo is pre-selected on the client's review page; they
 * can pick another or none. The tile is the Website editor's own
 * GalleryPickThumb (X removes).
 *
 * Props:
 *   client   : { id, first_name, last_name, email }  -- required
 *   session  : the full session row
 *   existing : the session's current request row, or null
 *   onClose  : () => void
 *   onDone   : ({ action: 'sent' | 'copied' | 'saved' }) => void
 */
export default function RequestReviewModal({ client, session, existing, onClose, onDone }) {
  const isEdit = !!existing
  const [templates, setTemplates] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [photographer, setPhotographer] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [displayName, setDisplayName] = useState(existing?.display_name || defaultReviewName(client))
  const [photoKey, setPhotoKey] = useState(existing?.suggested_photo_key || null)
  const [photos, setPhotos] = useState(null) // null = loading
  const [showPhotoGrid, setShowPhotoGrid] = useState(false)
  const [token, setToken] = useState(null)
  const [busy, setBusy] = useState(null) // 'send' | 'copy' | 'save' | null
  const [error, setError] = useState(null)

  function applyTemplate(template, ph) {
    const ctx = { photographer: ph, client, session }
    setSubject(resolveReviewTemplate(template.subject, ctx))
    setBody(resolveReviewTemplate(template.body, ctx))
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [tmpls, { data: { user } }, { data: { session: authSession } }, sessionPhotos] = await Promise.all([
        getReviewRequestTemplates().catch(() => []),
        supabase.auth.getUser(),
        supabase.auth.getSession(),
        getSessionPhotos(session).catch(() => []),
      ])
      let ph = null
      if (user) {
        const { data } = await supabase
          .from('photographers')
          .select('display_name, business_name')
          .eq('id', user.id)
          .single()
        ph = data
      }
      if (cancelled) return
      setTemplates(tmpls)
      setPhotographer(ph)
      setPhotos(sessionPhotos)
      setToken(authSession?.access_token || null)
      const initial = tmpls.find(t => t.is_default) || tmpls[0] || null
      const source = initial || BUILT_IN_REVIEW_REQUEST
      const ctx = { photographer: ph, client, session }
      setSelectedId(initial?.id ?? null)
      setSubject(resolveReviewTemplate(source.subject, ctx))
      setBody(resolveReviewTemplate(source.body, ctx))
      setLoaded(true)
    }
    load()
    return () => { cancelled = true }
    // Runs once on open -- client/session are fixed for the modal's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Lock body scroll while open -- identical to SendContractModal.
  useEffect(() => {
    const scrollY = window.scrollY
    const b = document.body
    b.style.position = 'fixed'
    b.style.top = `-${scrollY}px`
    b.style.left = '0'
    b.style.right = '0'
    b.style.overflow = 'hidden'
    return () => {
      b.style.position = ''
      b.style.top = ''
      b.style.left = ''
      b.style.right = ''
      b.style.overflow = ''
      window.scrollTo(0, scrollY)
    }
  }, [])

  async function run(kind, sendEmail) {
    setBusy(kind)
    setError(null)
    try {
      const result = await sendReviewRequest({
        sessionId: session.id,
        displayName: displayName.trim(),
        subject: sendEmail ? subject.trim() : null,
        body: sendEmail ? body : null,
        sendEmail,
        suggestedPhotoKey: photoKey,
      })
      if (kind === 'copy') {
        const url = reviewLink(await getPublicBaseUrl(), result.token)
        try {
          await navigator.clipboard.writeText(url)
        } catch {
          window.prompt('Copy this link:', url)
        }
      }
      onDone({ action: kind === 'send' ? 'sent' : kind === 'copy' ? 'copied' : 'saved' })
    } catch (err) {
      setError(err.message)
      setBusy(null)
    }
  }

  const nameOk = !!displayName.trim()
  const canEmail = loaded && !!client.email && subject.trim() && body.trim() && nameOk && !busy
  const canSave = loaded && nameOk && !busy
  const sentBefore = !!existing?.last_sent_at

  const overlayStyle = { position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }
  const modalStyle = { position: 'fixed', left: '50%', top: '50%', zIndex: 50, transform: 'translate(-50%, -50%)', width: '100%', maxWidth: 520, padding: '0 16px' }
  const innerStyle = {
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16,
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
  }
  const textareaStyle = {
    width: '100%', minHeight: 150, resize: 'vertical', fontSize: 14, lineHeight: 1.6,
    padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)',
    background: 'var(--surface)', color: 'var(--text)', outline: 'none', fontFamily: 'inherit',
  }
  // Same dashed secondary button the Website editor uses for photo actions.
  const dashedBtn = {
    background: 'var(--surface-raised)', color: 'var(--text)', border: '1px dashed var(--border)', cursor: 'pointer',
  }
  const sectionLabel = { fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)' }

  return (
    <>
      <div style={overlayStyle} onClick={busy ? undefined : onClose} />
      <div style={modalStyle}>
        <div style={innerStyle}>
          <div className="px-6 py-4 flex items-center justify-between shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="min-w-0">
              <h2 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>
                {isEdit ? 'Edit review request' : 'Request a review'}
              </h2>
              <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                To: {client.first_name} {client.last_name}{client.email ? ` · ${client.email}` : ''}
              </p>
            </div>
            <button onClick={onClose} disabled={!!busy} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
              <X size={18} />
            </button>
          </div>

          <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
            {!client.email && (
              <div className="px-4 py-3 rounded-xl text-sm" style={{ background: 'var(--warning-subtle)', color: 'var(--warning)', border: '1px solid var(--warning)' }}>
                This client has no email address. {isEdit ? 'Save changes and share the link another way.' : 'Use Copy link to send it another way.'}
              </div>
            )}

            <Input label="Name shown on the review" value={displayName} onChange={setDisplayName}
              hint={`Pre-filled for ${client.first_name || 'the client'}. They can change it.`} />

            {/* Suggested photo */}
            <div>
              <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }}>
                Suggested photo <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>(optional)</span>
              </label>
              {photos === null ? (
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading photos…</p>
              ) : photos.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Link a gallery to this session to suggest a photo.</p>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    {photoKey ? (
                      <div style={{ width: 60 }}>
                        <GalleryPickThumb r2Key={photoKey} onRemove={() => setPhotoKey(null)} />
                      </div>
                    ) : (
                      <div style={{ width: 60, height: 60, borderRadius: 8, background: 'var(--surface-raised)', flexShrink: 0 }} />
                    )}
                    <button onClick={() => setShowPhotoGrid(s => !s)} className="text-sm font-medium px-3 py-1.5 rounded-lg" style={dashedBtn}>
                      {showPhotoGrid ? 'Hide photos' : photoKey ? 'Change photo' : 'Choose from session photos'}
                    </button>
                  </div>
                  {showPhotoGrid && (
                    <div className="grid grid-cols-5 gap-2 mt-3 p-2 rounded-lg overflow-y-auto" style={{ maxHeight: 220, border: '1px solid var(--border)' }}>
                      {photos.map(img => {
                        const isSelected = img.preview_r2_key === photoKey
                        const src = token ? `${WORKER_URL}/preview/${encodeURIComponent(img.preview_r2_key)}?token=${token}` : null
                        return (
                          <button key={img.id} onClick={() => { setPhotoKey(img.preview_r2_key); setShowPhotoGrid(false) }}
                            className="relative aspect-square rounded-lg overflow-hidden"
                            style={{
                              background: 'var(--surface-raised)', padding: 0, border: 'none', cursor: 'pointer',
                              outline: isSelected ? '2px solid #6366f1' : '2px solid transparent', outlineOffset: 2,
                            }}>
                            {src && <img src={src} alt="" loading="lazy" className="w-full h-full object-cover" />}
                            {isSelected && (
                              <div className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: '#6366f1' }}>
                                <Check size={12} color="#fff" />
                              </div>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
                    Pre-selected on the review page. {client.first_name || 'The client'} can choose a different photo or none.
                  </p>
                </>
              )}
            </div>

            {/* Email */}
            <div className="pt-1" style={{ borderTop: '1px solid var(--border)' }}>
              <p className="mt-3" style={sectionLabel}>Email</p>
              {isEdit && (
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Only sent if you choose {sentBefore ? 'Save & resend' : 'Save & send'}.</p>
              )}
            </div>

            {templates.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Template</p>
                <TemplatePicker
                  templates={templates}
                  value={selectedId}
                  onChange={template => { setSelectedId(template.id); applyTemplate(template, photographer) }}
                  placeholder="Select a template..."
                />
              </div>
            )}

            <Input label="Subject" value={subject} onChange={setSubject} />

            <div>
              <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }}>Message</label>
              <textarea value={body} onChange={e => setBody(e.target.value)} style={textareaStyle}
                onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'} />
              <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
                {templates.length > 0
                  ? 'Filled in from the template. Edits here apply to this email only. A "Write a review" button is added below it.'
                  : 'Save your own wording in Account → Templates. A "Write a review" button is added below the message.'}
              </p>
            </div>

            {error && (
              <p className="text-xs" style={{ color: 'var(--danger)' }}>{error}</p>
            )}
          </div>

          <div className="px-6 py-4 flex items-center justify-end gap-3 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
            {isEdit ? (
              <>
                <Button variant="secondary" onClick={() => run('save', false)} disabled={!canSave}>
                  {busy === 'save' ? 'Saving…' : 'Save'}
                </Button>
                <Button onClick={() => run('send', true)} disabled={!canEmail}>
                  <Send size={14} />{busy === 'send' ? 'Sending…' : sentBefore ? 'Save & resend' : 'Save & send'}
                </Button>
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={() => run('copy', false)} disabled={!canSave}>
                  <Link2 size={14} />{busy === 'copy' ? 'Copying…' : 'Copy link instead'}
                </Button>
                <Button onClick={() => run('send', true)} disabled={!canEmail}>
                  <Send size={14} />{busy === 'send' ? 'Sending…' : 'Send request'}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
