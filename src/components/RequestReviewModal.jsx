import { useState, useEffect } from 'react'
import { X, Send, Link2 } from 'lucide-react'
import TemplatePicker from './ui/TemplatePicker.jsx'
import Button from './ui/Button.jsx'
import Input from './ui/Input.jsx'
import { supabase } from '../supabaseClient.js'
import { getPublicBaseUrl } from '../utils/publicBaseUrl.js'
import {
  getReviewRequestTemplates, resolveReviewTemplate, defaultReviewName,
  sendReviewRequest, reviewLink, BUILT_IN_REVIEW_REQUEST,
} from '../utils/reviewApi.js'

/**
 * RequestReviewModal (v1.5.17)
 *
 * Same shell as SendContractModal -- fixed centered overlay, 16px side
 * padding, body scroll lock -- since it opens from the same Session
 * Detail page right next to Send Contract.
 *
 * The default review-request template (Account -> Templates) is
 * pre-selected and its variables are resolved before anything is shown,
 * so what the photographer reads here is exactly what's emailed. Edits
 * to subject/message apply to this email only.
 *
 * "Copy link instead" creates the link without emailing it (for texting
 * a client). Both paths go through send_testimonial_request, which reuses
 * the session's one existing link.
 *
 * Props:
 *   client       : { id, first_name, last_name, email }  -- required
 *   session      : the full session row (name, type, session_date, ...)
 *   existing     : the session's current request row, or null
 *   onClose      : () => void
 *   onDone       : ({ emailed: boolean }) => void
 */
export default function RequestReviewModal({ client, session, existing, onClose, onDone }) {
  const [templates, setTemplates] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [photographer, setPhotographer] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [displayName, setDisplayName] = useState(existing?.display_name || defaultReviewName(client))
  const [busy, setBusy] = useState(null) // 'send' | 'copy' | null
  const [error, setError] = useState(null)

  function applyTemplate(template, ph) {
    const ctx = { photographer: ph, client, session }
    setSubject(resolveReviewTemplate(template.subject, ctx))
    setBody(resolveReviewTemplate(template.body, ctx))
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [tmpls, { data: { user } }] = await Promise.all([
        getReviewRequestTemplates().catch(() => []),
        supabase.auth.getUser(),
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

  async function handleSend() {
    setBusy('send')
    setError(null)
    try {
      await sendReviewRequest({
        sessionId: session.id, displayName: displayName.trim(),
        subject: subject.trim(), body, sendEmail: true,
      })
      onDone({ emailed: true })
    } catch (err) {
      setError(err.message)
      setBusy(null)
    }
  }

  async function handleCopyLink() {
    setBusy('copy')
    setError(null)
    try {
      const result = await sendReviewRequest({
        sessionId: session.id, displayName: displayName.trim(), sendEmail: false,
      })
      const url = reviewLink(await getPublicBaseUrl(), result.token)
      try {
        await navigator.clipboard.writeText(url)
      } catch {
        window.prompt('Copy this link:', url)
      }
      onDone({ emailed: false })
    } catch (err) {
      setError(err.message)
      setBusy(null)
    }
  }

  const canSend = loaded && !!client.email && subject.trim() && body.trim() && displayName.trim() && !busy

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

  return (
    <>
      <div style={overlayStyle} onClick={busy ? undefined : onClose} />
      <div style={modalStyle}>
        <div style={innerStyle}>
          <div className="px-6 py-4 flex items-center justify-between shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="min-w-0">
              <h2 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>
                {existing?.last_sent_at ? 'Resend review request' : 'Request a review'}
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
                This client has no email address. Use Copy link to send it another way.
              </div>
            )}

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

            <Input label="Name shown on the review" value={displayName} onChange={setDisplayName}
              hint={`Pre-filled for ${client.first_name || 'the client'}. They can change it.`} />

            {error && (
              <p className="text-xs" style={{ color: 'var(--danger)' }}>{error}</p>
            )}
          </div>

          <div className="px-6 py-4 flex items-center justify-end gap-3 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
            <Button variant="secondary" onClick={handleCopyLink} disabled={!loaded || !!busy || !displayName.trim()}>
              <Link2 size={14} />{busy === 'copy' ? 'Copying…' : 'Copy link instead'}
            </Button>
            <Button onClick={handleSend} disabled={!canSend}>
              <Send size={14} />{busy === 'send' ? 'Sending…' : 'Send request'}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
