import { useState, useEffect } from 'react'
import { X, ChevronRight, ChevronLeft, Send, FileText, Eye, Pencil, Search } from 'lucide-react'
import {
  getContractTemplates, createContractDraft, updateContract,
  resolveTemplateVariables, sha256
} from '../utils/crmApi.js'
import { supabase } from '../supabaseClient.js'
import Button from './ui/Button.jsx'

const STEPS = ['pick', 'preview', 'send']

/**
 * SendContractModal
 *
 * Props:
 *   client    : { id, first_name, last_name, email } — required
 *   gallery   : { id, title, event_name, event_date } | null — optional
 *   onClose   : () => void
 *   onSent    : (contract) => void — called after successful send
 */
export default function SendContractModal({ client, gallery = null, onClose, onSent }) {
  const [step, setStep] = useState('pick')
  const [templateSearch, setTemplateSearch] = useState('')    // pick | preview | send
  const [templates, setTemplates] = useState([])
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [photographer, setPhotographer] = useState(null)
  const [resolvedBody, setResolvedBody] = useState('')
  const [editedBody, setEditedBody] = useState('')
  const [editing, setEditing] = useState(false)
  const [contractTitle, setContractTitle] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      const [tmpls, { data: { user } }] = await Promise.all([
        getContractTemplates(),
        supabase.auth.getUser(),
      ])
      setTemplates(tmpls)
      if (user) {
        const { data: ph } = await supabase
          .from('photographers')
          .select('display_name, business_name')
          .eq('id', user.id)
          .single()
        setPhotographer(ph)
      }
    }
    load()
  }, [])
  // Lock body scroll while modal is open
  useEffect(() => {
    const scrollY = window.scrollY
    const body = document.body
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = '0'
    body.style.right = '0'
    body.style.overflow = 'hidden'
    return () => {
      body.style.position = ''
      body.style.top = ''
      body.style.left = ''
      body.style.right = ''
      body.style.overflow = ''
      window.scrollTo(0, scrollY)
    }
  }, [])


  function handleSelectTemplate(template) {
    setSelectedTemplate(template)
    const resolved = resolveTemplateVariables(template.body, { photographer, client, gallery })
    setResolvedBody(resolved)
    setEditedBody(resolved)
    setContractTitle(template.name)
    setEditing(false)
    setStep('preview')
  }

  async function handleSend() {
    if (!client.email) {
      setError('This client has no email address. Please add one before sending a contract.')
      return
    }
    setSending(true)
    setError(null)
    try {
      const finalBody = editing ? editedBody : resolvedBody
      const bodyHash = await sha256(finalBody)
      const signToken = crypto.randomUUID().replace(/-/g, '')

      // Create the contract record
      const contract = await createContractDraft({
        clientId: client.id,
        galleryId: gallery?.id || null,
        templateId: selectedTemplate?.id || null,
        title: contractTitle,
        body: finalBody,
        bodyHash,
      })

      // Set sign_token on the contract
      await updateContract(contract.id, { sign_token: signToken })

      // Call the Edge Function to send the email and mark status = sent
      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-contract`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ contractId: contract.id }),
        }
      )
      const result = await resp.json()
      if (!result.ok) throw new Error(result.error || 'Send failed')

      onSent({ ...contract, sign_token: signToken, status: 'sent' })
    } catch (err) {
      setError(err.message)
      setSending(false)
    }
  }

  const overlayStyle = {
    position: 'fixed', inset: 0, zIndex: 40,
    background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)',
  }
  const modalStyle = {
    position: 'fixed', left: '50%', top: '50%', zIndex: 50,
    transform: 'translate(-50%, -50%)',
    width: '100%', maxWidth: step === 'preview' ? 680 : 480,
    padding: '0 16px',
  }
  const innerStyle = {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 16, overflowX: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
  }

  // ── Step 1: Pick template ─────────────────────────────────────────────────
  if (step === 'pick') {
    return (
      <>
        <div style={overlayStyle} onClick={onClose} />
        <div style={modalStyle}>
          <div style={innerStyle}>
            <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
              <div>
                <h2 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Send Contract</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  To: {client.first_name} {client.last_name}{client.email ? ` · ${client.email}` : ''}
                </p>
              </div>
              <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                <X size={18} />
              </button>
            </div>

            {/* Search */}
            <div className="px-4 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
                style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)' }}>
                <Search size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <input
                  value={templateSearch}
                  onChange={e => setTemplateSearch(e.target.value)}
                  placeholder="Search templates..."
                  style={{ border: 'none', background: 'transparent', outline: 'none',
                    fontSize: 13, color: 'var(--text)', width: '100%' }}
                />
              </div>
            </div>

            {/* Template list */}
            <div>
              {!client.email && (
                <div className="mx-4 mt-3 px-4 py-3 rounded-xl text-sm" style={{ background: 'var(--warning-subtle)', color: 'var(--warning)', border: '1px solid var(--warning)' }}>
                  This client has no email address. Please add one before sending a contract.
                </div>
              )}
              {templates.length === 0 ? (
                <div className="py-8 text-center px-6">
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No contract templates yet.</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Create templates in Account → Templates first.</p>
                </div>
              ) : (
                <>
                  {templates
                    .filter(t => t.name.toLowerCase().includes(templateSearch.toLowerCase()))
                    .map((t, i, arr) => (
                      <button key={t.id} onClick={() => handleSelectTemplate(t)}
                        disabled={!client.email}
                        className="w-full flex items-center gap-3 px-5 py-3 text-left"
                        style={{
                          background: 'transparent', border: 'none',
                          borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
                          cursor: client.email ? 'pointer' : 'not-allowed',
                          opacity: client.email ? 1 : 0.5,
                          display: 'flex',
                        }}
                        onMouseEnter={e => { if (client.email) e.currentTarget.style.background = 'var(--surface-raised)' }}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <FileText size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                        <p className="flex-1 text-sm min-w-0 truncate" style={{ color: 'var(--text)', margin: 0 }}>{t.name}</p>
                        <ChevronRight size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                      </button>
                    ))}
                  {templateSearch && templates.filter(t => t.name.toLowerCase().includes(templateSearch.toLowerCase())).length === 0 && (
                    <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>No templates match "{templateSearch}"</p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </>
    )
  }


  // ── Step 2: Preview / Edit ────────────────────────────────────────────────
  if (step === 'preview') {
    return (
      <>
        <div style={overlayStyle} onClick={onClose} />
        <div style={{ ...modalStyle, maxWidth: 680 }}>
          <div style={{ ...innerStyle, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            <div className="px-6 py-4 flex items-center gap-3 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
              <button onClick={() => setStep('pick')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                <ChevronLeft size={18} />
              </button>
              <div className="flex-1">
                <h2 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Review Contract</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{selectedTemplate?.name}</p>
              </div>
              <button onClick={() => setEditing(e => !e)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
                style={{ background: editing ? 'rgba(99,102,241,0.1)' : 'var(--surface-raised)', color: editing ? '#6366f1' : 'var(--text-muted)', border: 'none', cursor: 'pointer' }}>
                {editing ? <Eye size={12} /> : <Pencil size={12} />}
                {editing ? 'Preview' : 'Edit'}
              </button>
              <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                <X size={18} />
              </button>
            </div>

            {/* Contract title */}
            <div className="px-6 py-3 shrink-0" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
              <input
                value={contractTitle}
                onChange={e => setContractTitle(e.target.value)}
                placeholder="Contract title"
                style={{
                  width: '100%', background: 'transparent', border: 'none',
                  color: 'var(--text)', fontSize: 14, fontWeight: 600, outline: 'none',
                }}
              />
            </div>

            {/* Body */}
            <div className="flex-1 px-6 py-4">
              {editing ? (
                <textarea
                  value={editedBody}
                  onChange={e => setEditedBody(e.target.value)}
                  style={{
                    width: '100%', minHeight: 400, background: 'var(--bg-subtle)',
                    border: '1px solid var(--border)', color: 'var(--text)',
                    borderRadius: 8, padding: '12px 14px', fontSize: 13,
                    fontFamily: 'ui-monospace, monospace', lineHeight: 1.7,
                    outline: 'none', resize: 'vertical',
                  }}
                  onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}
                />
              ) : (
                <pre style={{
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  fontSize: 13, lineHeight: 1.8, color: 'var(--text)',
                  fontFamily: 'inherit', margin: 0,
                }}>
                  {editing ? editedBody : resolvedBody}
                </pre>
              )}
            </div>

            <div className="px-6 py-4 flex flex-col gap-2 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Variables have been filled in. Review before sending.
              </p>
              <div className="flex items-center justify-end gap-2">
                <Button variant="secondary" onClick={() => setStep('pick')}>Back</Button>
                <Button onClick={() => setStep('send')} disabled={!contractTitle.trim()}>
                  Continue <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </>
    )
  }

  // ── Step 3: Confirm & Send ────────────────────────────────────────────────
  return (
    <>
      <div style={overlayStyle} onClick={onClose} />
      <div style={modalStyle}>
        <div style={innerStyle}>
          <div className="px-6 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <button onClick={() => setStep('preview')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
              <ChevronLeft size={18} />
            </button>
            <div className="flex-1">
              <h2 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Send Contract</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Confirm and send for signature</p>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
              <X size={18} />
            </button>
          </div>

          <div className="px-6 py-5 space-y-4">
            {error && (
              <div className="px-4 py-3 rounded-xl text-sm" style={{ background: 'var(--danger-subtle)', color: 'var(--danger)', border: '1px solid var(--danger)' }}>
                {error}
              </div>
            )}

            {/* Summary */}
            <div className="space-y-3">
              <div className="flex items-start gap-3 px-4 py-3 rounded-xl" style={{ background: 'var(--surface-raised)' }}>
                <FileText size={16} style={{ color: '#6366f1', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Contract</p>
                  <p className="text-sm font-medium mt-0.5" style={{ color: 'var(--text)' }}>{contractTitle}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 px-4 py-3 rounded-xl" style={{ background: 'var(--surface-raised)' }}>
                <Send size={16} style={{ color: '#6366f1', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Sending to</p>
                  <p className="text-sm font-medium mt-0.5" style={{ color: 'var(--text)' }}>
                    {client.first_name} {client.last_name}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{client.email}</p>
                </div>
              </div>
            </div>

            <p className="text-xs" style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
              The client will receive an email with a link to review and sign the contract. Their typed signature is legally binding under US ESIGN/UETA. You will be notified to counter-sign once they complete it.
            </p>
          </div>

          <div className="px-6 py-4 flex items-center justify-end gap-3" style={{ borderTop: '1px solid var(--border)' }}>
            <Button variant="secondary" onClick={() => setStep('preview')}>Back</Button>
            <Button onClick={handleSend} disabled={sending}>
              <Send size={14} />
              {sending ? 'Sending...' : 'Send Contract'}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
