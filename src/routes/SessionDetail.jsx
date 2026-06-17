import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  CalendarDays, MapPin, Clock, User, ChevronRight,
  FileText, ClipboardList, Edit2, Trash2, Check, X,
  Download, Users, ChevronDown, UserPlus, Mail,
  Briefcase, Ticket, Home, GraduationCap, ScanFace, Baby, Trophy, Heart, BookHeart, SquareUser,
} from 'lucide-react'
import {
  getSession, updateSession, deleteSession,
  SESSION_TYPES, SESSION_STATUSES, PAYMENT_STATUSES,
  getStatusConfig, getPaymentConfig, formatSessionDate, SESSION_TYPE_ICON,
  getSubmissions, getSessionQuestionnaires, setSessionQuestionnaires,
  deleteSubmission,
} from '../utils/sessionApi.js'
import { getContracts, createClient } from '../utils/crmApi.js'
import { getGalleries } from '../utils/galleryApi.js'
import { getQuestionnaireTemplates } from '../utils/questionnaireApi.js'
import { getClients } from '../utils/crmApi.js'
import PageBreadcrumb from '../components/ui/PageBreadcrumb.jsx'
import { supabase } from '../supabaseClient.js'
import SendContractModal from '../components/SendContractModal.jsx'
import Button from '../components/ui/Button.jsx'
import Input from '../components/ui/Input.jsx'
import Toggle from '../components/ui/Toggle.jsx'
import PlaceAutocomplete from '../components/ui/PlaceAutocomplete.jsx'
import BottomSheet from '../components/layout/BottomSheet.jsx'
import GalleryPicker from '../components/ui/GalleryPicker.jsx'
import ClientPicker from '../components/ui/ClientPicker.jsx'
import * as XLSX from 'xlsx'

// ── Time options (15-min increments) ─────────────────────────────────────────
const TIME_OPTIONS = (() => {
  const opts = []
  for (let h = 0; h < 24; h++) {
    for (let m of [0, 15, 30, 45]) {
      const hh = String(h).padStart(2, '0')
      const mm = String(m).padStart(2, '0')
      const value = `${hh}:${mm}`
      const hour12 = h % 12 || 12
      const ampm = h < 12 ? 'AM' : 'PM'
      const label = `${hour12}:${mm} ${ampm}`
      opts.push({ value, label })
    }
  }
  return opts
})()

function TimeSelect({ label, value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const listRef = useRef(null)
  const selectedLabel = value ? TIME_OPTIONS.find(o => o.value === value)?.label : null

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Scroll selected item into view when opening
  useEffect(() => {
    if (!open || !listRef.current) return
    const selected = listRef.current.querySelector('[data-selected="true"]')
    if (selected) selected.scrollIntoView({ block: 'nearest' })
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {label && <label className="text-sm font-medium block mb-1" style={{ color: 'var(--text)' }}>{label}</label>}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', background: 'var(--bg-subtle)', border: `1px solid ${open ? 'var(--border-strong)' : 'var(--border)'}`,
          color: selectedLabel ? 'var(--text)' : 'var(--text-muted)', borderRadius: 8,
          padding: '9px 12px', fontSize: 14, outline: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
        <span style={{ flex: 1, textAlign: 'left' }}>{selectedLabel || '—'}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0, opacity: 0.4 }}><path d="M6 9l6 6 6-6"/></svg>
      </button>
      {open && (
        <div ref={listRef} style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflowY: 'auto', maxHeight: 220,
        }}>
          <div
            data-selected={!value ? 'true' : 'false'}
            onClick={() => { onChange(''); setOpen(false) }}
            style={{
              padding: '8px 12px', fontSize: 13, cursor: 'pointer',
              color: !value ? '#6366f1' : 'var(--text-muted)',
              background: !value ? 'rgba(99,102,241,0.06)' : 'transparent',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
            onMouseLeave={e => e.currentTarget.style.background = !value ? 'rgba(99,102,241,0.06)' : 'transparent'}>
            —
          </div>
          {TIME_OPTIONS.map(o => (
            <div
              key={o.value}
              data-selected={o.value === value ? 'true' : 'false'}
              onClick={() => { onChange(o.value); setOpen(false) }}
              style={{
                padding: '8px 12px', fontSize: 13, cursor: 'pointer',
                color: o.value === value ? '#6366f1' : 'var(--text)',
                background: o.value === value ? 'rgba(99,102,241,0.06)' : 'transparent',
                fontWeight: o.value === value ? '500' : '400',
              }}
              onMouseEnter={e => { if (o.value !== value) e.currentTarget.style.background = 'var(--surface-raised)' }}
              onMouseLeave={e => { e.currentTarget.style.background = o.value === value ? 'rgba(99,102,241,0.06)' : 'transparent' }}>
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


// ── Helpers ───────────────────────────────────────────────────────────────────

const SESSION_ICON_MAP_DETAIL = {
  BookHeart, SquareUser, Users, Briefcase, Ticket, Home, GraduationCap,
  ScanFace, Baby, User, Trophy, Heart, CalendarDays,
}

function SessionTypeIconDetail({ type, size = 22, color }) {
  const iconName = SESSION_TYPE_ICON[type] || 'CalendarDays'
  const Icon = SESSION_ICON_MAP_DETAIL[iconName] || CalendarDays
  return <Icon size={size} style={{ color }} />
}

function StatusBadge({ status, large }) {
  const cfg = getStatusConfig(status)
  return (
    <span className={`font-medium rounded-full ${large ? 'text-sm px-3 py-1' : 'text-xs px-2 py-0.5'}`}
      style={{ background: cfg.color + '18', color: cfg.color }}>
      {cfg.label}
    </span>
  )
}

function PaymentBadge({ status }) {
  const cfg = getPaymentConfig(status)
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ background: cfg.color + '18', color: cfg.color }}>
      {cfg.label}
    </span>
  )
}

function SectionCard({ title, action, children }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between px-5 py-3.5"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{title}</h2>
        {action}
      </div>
      <div style={{ background: 'var(--surface)' }}>{children}</div>
    </div>
  )
}

function InfoRow({ label, value, mono }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-4 px-5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
      <span className="text-xs font-medium w-28 shrink-0 mt-0.5" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="text-sm flex-1" style={{ color: 'var(--text)', fontFamily: mono ? 'monospace' : 'inherit' }}>{value}</span>
    </div>
  )
}

// ── Edit Session Modal ────────────────────────────────────────────────────────

function EditSessionWrapper({ onClose, footer, children }) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  if (isMobile) {
    return (
      <BottomSheet open onClose={onClose} maxHeight="92vh">
        <div className="flex items-center px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="font-semibold text-base" style={{ color: 'var(--text)' }}>Edit Session</h2>
        </div>
        <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="shrink-0">{footer}</div>}
      </BottomSheet>
    )
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg flex flex-col rounded-2xl shadow-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '90vh' }}>
        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Edit Session</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <X size={16} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="shrink-0">{footer}</div>}
      </div>
    </div>
  )
}

function EditSessionModal({ session, clients, questionnaires, onClose, onSaved }) {
  const [name, setName] = useState(session.name)
  const [type, setType] = useState(session.type)
  const [status, setStatus] = useState(session.status)
  const [sessionDate, setSessionDate] = useState(session.session_date || '')
  const [startTime, setStartTime] = useState(session.start_time ? session.start_time.slice(0, 5) : '')
  const [endTime, setEndTime] = useState(session.end_time ? session.end_time.slice(0, 5) : '')
  const [location, setLocation] = useState(session.location || '')
  const [description, setDescription] = useState(session.description || '')
  const [internalNotes, setInternalNotes] = useState(session.internal_notes || '')
  const [clientId, setClientId] = useState(session.client_id || '')
  const [questionnaireIds, setQuestionnaireIds] = useState([])
  const [loadingQIds, setLoadingQIds] = useState(true)
  const [sessionFee, setSessionFee] = useState(session.session_fee ?? '')
  const [retainerAmount, setRetainerAmount] = useState(session.retainer_amount ?? '')
  const [retainerPaid, setRetainerPaid] = useState(session.retainer_paid || false)
  const [balanceDue, setBalanceDue] = useState(session.balance_due ?? '')
  const [balanceDueDate, setBalanceDueDate] = useState(session.balance_due_date || '')
  const [paymentStatus, setPaymentStatus] = useState(session.payment_status || 'unpaid')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getSessionQuestionnaires(session.id).then(rows => {
      setQuestionnaireIds(rows.map(r => r.questionnaire_id))
      setLoadingQIds(false)
    }).catch(() => setLoadingQIds(false))
  }, [session.id])

  useEffect(() => {
    const fee = parseFloat(sessionFee) || 0
    const retainer = parseFloat(retainerAmount) || 0
    if (fee > 0) setBalanceDue((fee - retainer).toFixed(2))
  }, [sessionFee, retainerAmount])

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    try {
      const updated = await updateSession(session.id, {
        name, type, status,
        sessionDate: sessionDate || null,
        startTime: startTime || null,
        endTime: endTime || null,
        location: location || null,
        description: description || null,
        internalNotes: internalNotes || null,
        clientId: clientId || null,
        questionnaireId: null,
        sessionFee: sessionFee !== '' ? parseFloat(sessionFee) : null,
        retainerAmount: retainerAmount !== '' ? parseFloat(retainerAmount) : null,
        retainerPaid,
        balanceDue: balanceDue !== '' ? parseFloat(balanceDue) : null,
        balanceDueDate: balanceDueDate || null,
        paymentStatus,
      })
      await setSessionQuestionnaires(session.id, questionnaireIds)
      onSaved(updated)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const footerEl = (
    <div className="flex items-center justify-between px-5 py-4" style={{ borderTop: '1px solid var(--border)' }}>
      <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg"
        style={{ background: 'var(--surface-raised)', color: 'var(--text-muted)', border: 'none', cursor: 'pointer' }}>
        Cancel
      </button>
      <Button onClick={handleSave} disabled={saving || !name.trim()}>
        {saving ? 'Saving...' : 'Save Changes'}
      </Button>
    </div>
  )

  return (
    <EditSessionWrapper onClose={onClose} footer={footerEl}>
      <div className="space-y-4">
          <Input label="Session name" value={name} onChange={setName} required />

          <div>
            <label className="text-sm font-medium block mb-1" style={{ color: 'var(--text)' }}>Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)}
              style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none', cursor: 'pointer' }}>
              {SESSION_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium block mb-1" style={{ color: 'var(--text)' }}>Type</label>
              <select value={type} onChange={e => setType(e.target.value)}
                style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none', cursor: 'pointer' }}>
                {SESSION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <Input label="Date" value={sessionDate} onChange={setSessionDate} type="date" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <TimeSelect label="Start time" value={startTime} onChange={setStartTime} />
            <TimeSelect label={<>End time <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>(opt.)</span></>} value={endTime} onChange={setEndTime} />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }}>Location</label>
            <PlaceAutocomplete value={location} onChange={setLocation} placeholder="Search for a venue or address..." />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1" style={{ color: 'var(--text)' }}>Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
              style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '10px 12px', fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6, boxSizing: 'border-box' }}
              onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'} />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1" style={{ color: 'var(--text)' }}>Internal notes</label>
            <textarea value={internalNotes} onChange={e => setInternalNotes(e.target.value)} rows={2}
              style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '10px 12px', fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6, boxSizing: 'border-box' }}
              onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'} />
          </div>

          {session.mode === 'private' && (
            <div>
              <label className="text-sm font-medium block mb-1" style={{ color: 'var(--text)' }}>Client</label>
              <ClientPicker clients={clients} value={clientId} onChange={setClientId} placeholder="Link to a client..." />
            </div>
          )}

          <div>
            <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }}>Questionnaires</label>
            {loadingQIds ? (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading...</p>
            ) : questionnaires.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No questionnaire templates yet.</p>
            ) : (
              <div className="space-y-1.5">
                {questionnaires.map(q => {
                  const selected = questionnaireIds.includes(q.id)
                  return (
                    <button key={q.id} type="button"
                      onClick={() => setQuestionnaireIds(prev =>
                        selected ? prev.filter(id => id !== q.id) : [...prev, q.id]
                      )}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left"
                      style={{
                        border: `1.5px solid ${selected ? '#6366f1' : 'var(--border)'}`,
                        background: selected ? 'rgba(99,102,241,0.05)' : 'var(--surface)',
                        cursor: 'pointer',
                      }}>
                      <div className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                        style={{ background: selected ? '#6366f1' : 'var(--surface-raised)', border: selected ? 'none' : '1.5px solid var(--border)' }}>
                        {selected && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </div>
                      <span className="text-sm truncate" style={{ color: selected ? '#6366f1' : 'var(--text)', fontWeight: selected ? '500' : '400' }}>{q.name}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {session.mode === 'private' && (
            <>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--text-muted)' }}>Financials</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium block mb-1" style={{ color: 'var(--text)' }}>Session fee</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--text-muted)' }}>$</span>
                    <input type="number" min="0" step="0.01" value={sessionFee} onChange={e => setSessionFee(e.target.value)}
                      placeholder="0.00"
                      style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '9px 12px 9px 24px', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1" style={{ color: 'var(--text)' }}>Retainer</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--text-muted)' }}>$</span>
                    <input type="number" min="0" step="0.01" value={retainerAmount} onChange={e => setRetainerAmount(e.target.value)}
                      placeholder="0.00"
                      style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '9px 12px 9px 24px', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between py-2 px-3 rounded-xl" style={{ background: 'var(--surface-raised)' }}>
                <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>Retainer paid</p>
                <Toggle checked={retainerPaid} onChange={setRetainerPaid} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium block mb-1" style={{ color: 'var(--text)' }}>Balance due</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--text-muted)' }}>$</span>
                    <input type="number" min="0" step="0.01" value={balanceDue} onChange={e => setBalanceDue(e.target.value)}
                      placeholder="0.00"
                      style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '9px 12px 9px 24px', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1" style={{ color: 'var(--text)' }}>Due date <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>(opt.)</span></label>
                  <input type="date" value={balanceDueDate} onChange={e => setBalanceDueDate(e.target.value)}
                    style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                    onFocus={e => e.target.style.borderColor = 'var(--border-strong)'} onBlur={e => e.target.style.borderColor = 'var(--border)'} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }}>Payment status</label>
                <div className="flex gap-2">
                  {PAYMENT_STATUSES.map(opt => (
                    <button key={opt.value} onClick={() => setPaymentStatus(opt.value)}
                      className="flex-1 py-2 rounded-lg text-sm font-medium"
                      style={{
                        border: paymentStatus === opt.value ? `2px solid ${opt.color}` : '2px solid var(--border)',
                        background: paymentStatus === opt.value ? opt.color + '15' : 'var(--surface)',
                        color: paymentStatus === opt.value ? opt.color : 'var(--text-muted)',
                        cursor: 'pointer',
                      }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
    </EditSessionWrapper>
  )
}


// ── Submissions Section ───────────────────────────────────────────────────────

const PAGE_SIZE = 50

function SubmissionsSection({ sessionId, session, questionnaires = [] }) {
  const [submissions, setSubmissions] = useState([])
  const [deletingSubmissionId, setDeletingSubmissionId] = useState(null)
  const [confirmDeleteSubmissionId, setConfirmDeleteSubmissionId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [expandedId, setExpandedId] = useState(null)
  const [creatingClientId, setCreatingClientId] = useState(null)

  useEffect(() => {
    getSubmissions(sessionId).then(data => {
      setSubmissions(data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [sessionId])

  function formatAnswer(value) {
    if (!value) return '—'
    if (Array.isArray(value)) return value.join(', ')
    return String(value)
  }

  function getContactParts(submission) {
    // Returns { name, email, fallback }
    const name = submission.credit_handle || ''
    const email = submission.email || ''
    if (name || email) return { name, email, fallback: false }
    const firstVal = Object.values(submission.answers || {}).find(v => v && String(v).trim())
    return { name: '', email: '', fallback: firstVal ? formatAnswer(firstVal) : '—' }
  }

  const filtered = submissions.filter(s => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    const answerText = [
      s.credit_handle || '',
      s.email || '',
      ...Object.values(s.answers || {}).map(v => formatAnswer(v)),
    ].join(' ').toLowerCase()
    return answerText.includes(q)
  })

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  useEffect(() => { setPage(0) }, [search])

  async function handleExportCSV() {
    if (!submissions.length) return
    const questions = submissions[0].questions || []
    const headers = ['Submitted At', 'Name', 'Email', 'Agreed to Terms', ...questions.map(q => q.label)]
    const rows = submissions.map(s => {
      const base = [
        new Date(s.submitted_at).toLocaleString('en-US'),
        s.credit_handle || '',
        s.email || '',
        s.agreed_to_terms ? 'Yes' : 'No',
      ]
      const answers = questions.map(q => formatAnswer(s.answers?.[q.id]))
      return [...base, ...answers]
    })
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Submissions')
    XLSX.writeFile(wb, `${session.name} Submissions.xlsx`)
  }

  async function handleDeleteSubmission(submissionId) {
    setDeletingSubmissionId(submissionId)
    try {
      await deleteSubmission(submissionId)
      setSubmissions(prev => prev.filter(s => s.id !== submissionId))
      setConfirmDeleteSubmissionId(null)
      if (expandedId === submissionId) setExpandedId(null)
    } catch (err) {
      console.error(err)
    } finally {
      setDeletingSubmissionId(null)
    }
  }

  async function handleCreateClient(submission) {
    setCreatingClientId(submission.id)
    try {
      const questions = submission.questions || []
      const answers = submission.answers || {}
      let email = '', firstName = '', lastName = ''
      for (const q of questions) {
        const val = answers[q.id] || ''
        const label = q.label.toLowerCase()
        if (label.includes('email') && !email) email = val
        if ((label.includes('name') || label.includes('credit') || label.includes('handle')) && !firstName) {
          const parts = val.split(' ')
          firstName = parts[0] || val
          lastName = parts.slice(1).join(' ') || ''
        }
      }
      if (!firstName) firstName = email.split('@')[0] || 'Unknown'
      const client = await createClient({
        firstName, lastName, email: email || null,
        phone: null, address: null, city: null, state: null, zip: null,
        notes: `Created from walk-up submission for ${session.name}`,
        tags: null, pronouns: null,
      })
      const { supabase } = await import('../supabaseClient.js')
      await supabase.from('session_submissions').update({ client_id: client.id }).eq('id', submission.id)
      setSubmissions(prev => prev.map(s => s.id === submission.id ? { ...s, client_id: client.id } : s))
    } catch (err) {
      console.error(err)
    } finally {
      setCreatingClientId(null)
    }
  }

  return (
    <SectionCard
      title={`Submissions${submissions.length > 0 ? ` (${submissions.length})` : ''}`}
      action={
        submissions.length > 0 && (
          <button onClick={handleExportCSV}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg font-medium"
            style={{ background: 'var(--surface-raised)', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <Download size={12} />Export CSV
          </button>
        )
      }>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
        </div>
      ) : submissions.length === 0 ? (
        <div className="px-5 py-6 text-center">
          <Users size={24} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No submissions yet.</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Share the form link to start collecting responses.</p>
        </div>
      ) : (
        <>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder={`Search ${submissions.length} submissions...`}
              style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '7px 12px', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'} />
          </div>
          {filtered.length === 0 ? (
            <div className="px-5 py-5 text-center">
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No submissions match your search.</p>
            </div>
          ) : (() => {
            // Group by questionnaire_id
            const groups = []
            const seen = new Set()

            // First pass: add groups in questionnaire order
            questionnaires.forEach(sq => {
              const qid = sq.questionnaire_id
              const qname = sq.questionnaire_templates?.name || 'Questionnaire'
              const groupSubs = paginated.filter(s => s.questionnaire_id === qid)
              if (groupSubs.length > 0) {
                groups.push({ qid, qname, subs: groupSubs })
                seen.add(qid)
              }
            })

            // Second pass: add ungrouped (no questionnaire_id or unknown)
            const ungrouped = paginated.filter(s => !s.questionnaire_id || !seen.has(s.questionnaire_id))
            if (ungrouped.length > 0) {
              groups.push({ qid: null, qname: 'Other', subs: ungrouped })
            }

            return (
              <>
                {groups.map((group, gi) => (
                  <div key={group.qid || 'other'}>
                    {(groups.length > 1) && (
                      <div className="px-5 py-2 text-xs font-semibold sticky top-0"
                        style={{ background: 'var(--surface-raised)', color: 'var(--text-muted)', borderTop: gi > 0 ? '1px solid var(--border)' : 'none', borderBottom: '1px solid var(--border)' }}>
                        {group.qname} · {group.subs.length} {group.subs.length === 1 ? 'response' : 'responses'}
                      </div>
                    )}
                    {group.subs.map((submission, i) => {
                      const isExpanded = expandedId === submission.id
                      const questions = submission.questions || []
                      const answers = submission.answers || {}
                      const { name, email: subEmail, fallback } = getContactParts(submission)
                      const time = new Date(submission.submitted_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                      const qLabel = questionnaires.find(sq => sq.questionnaire_id === submission.questionnaire_id)?.questionnaire_templates?.name || null
                      return (
                        <div key={submission.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : submission.id)}
                            className="w-full flex items-center justify-between px-5 py-3 text-left"
                            style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-baseline gap-2">
                                  {fallback ? (
                                    <span className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{fallback}</span>
                                  ) : (
                                    <>
                                      {name && <span className="text-sm font-medium shrink-0" style={{ color: 'var(--text)' }}>{name}</span>}
                                      {subEmail && <span className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{subEmail}</span>}
                                    </>
                                  )}
                                </div>
                                {qLabel && (
                                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{qLabel}</p>
                                )}
                              </div>
                              <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>{time}</span>
                              {submission.client_id && (
                                <span className="text-xs px-1.5 py-0.5 rounded shrink-0" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>Client</span>
                              )}
                            </div>
                            <ChevronDown size={13} style={{ color: 'var(--text-muted)', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0, marginLeft: 8 }} />
                          </button>
                          {isExpanded && (
                            <div className="px-5 pb-4 space-y-3" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
                              <div className="pt-3 space-y-2">
                                {questions.map(q => (
                                  <div key={q.id}>
                                    <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{q.label}</p>
                                    <p className="text-sm mt-0.5" style={{ color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{formatAnswer(answers[q.id])}</p>
                                  </div>
                                ))}
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                {!submission.client_id && (
                                  <button onClick={() => handleCreateClient(submission)} disabled={creatingClientId === submission.id}
                                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium"
                                    style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1', border: 'none', cursor: 'pointer' }}>
                                    <UserPlus size={12} />
                                    {creatingClientId === submission.id ? 'Creating...' : 'Create client record'}
                                  </button>
                                )}
                                {confirmDeleteSubmissionId === submission.id ? (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Delete this submission?</span>
                                    <button onClick={() => handleDeleteSubmission(submission.id)} disabled={deletingSubmissionId === submission.id}
                                      className="text-xs px-3 py-1.5 rounded-lg font-medium"
                                      style={{ background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer' }}>
                                      {deletingSubmissionId === submission.id ? 'Deleting...' : 'Confirm'}
                                    </button>
                                    <button onClick={() => setConfirmDeleteSubmissionId(null)}
                                      className="text-xs px-3 py-1.5 rounded-lg font-medium"
                                      style={{ background: 'var(--surface-raised)', color: 'var(--text)', border: 'none', cursor: 'pointer' }}>
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button onClick={() => setConfirmDeleteSubmissionId(submission.id)}
                                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium"
                                    style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: 'none', cursor: 'pointer' }}>
                                    <Trash2 size={12} />
                                    Delete
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: '1px solid var(--border)' }}>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
                    </span>
                    <div className="flex gap-2">
                      <button onClick={() => setPage(p => p - 1)} disabled={page === 0}
                        className="text-xs px-3 py-1.5 rounded-lg"
                        style={{ background: 'var(--surface-raised)', border: 'none', cursor: page === 0 ? 'not-allowed' : 'pointer', color: 'var(--text)', opacity: page === 0 ? 0.4 : 1 }}>
                        ← Prev
                      </button>
                      <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}
                        className="text-xs px-3 py-1.5 rounded-lg"
                        style={{ background: 'var(--surface-raised)', border: 'none', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', color: 'var(--text)', opacity: page >= totalPages - 1 ? 0.4 : 1 }}>
                        Next →
                      </button>
                    </div>
                  </div>
                )}
              </>
            )
          })()}
        </>
      )}
    </SectionCard>
  )
}

// ── Session Detail ────────────────────────────────────────────────────────────

export default function SessionDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [session, setSession] = useState(null)
  const [allGalleries, setAllGalleries] = useState([])
  const [linkingGallery, setLinkingGallery] = useState(false)
  const [contracts, setContracts] = useState([])
  const [clients, setClients] = useState([])
  const [questionnaires, setQuestionnaires] = useState([])
  const [loading, setLoading] = useState(true)
  const [showEdit, setShowEdit] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [sessionQuestionnaires, setSessionQuestionnaires] = useState([])
  const [showSendContract, setShowSendContract] = useState(false)
  const [sendingForm, setSendingForm] = useState(null)
  const [sentForm, setSentForm] = useState(null)
  const [submissionCounts, setSubmissionCounts] = useState({})
  const [copiedQ, setCopiedQ] = useState(null)

  useEffect(() => { load() }, [id])

  async function load() {
    setLoading(true)
    try {
      const [s, cs, qs, sq, gs] = await Promise.all([
        getSession(id),
        getClients(),
        getQuestionnaireTemplates(),
        getSessionQuestionnaires(id),
        getGalleries(),
      ])
      setAllGalleries(gs || [])
      setSession(s)
      setClients(cs)
      setQuestionnaires(qs)
      setSessionQuestionnaires(sq)
      // Load contracts linked to this session
      getContracts({ sessionId: id }).then(setContracts).catch(() => {})
      // Load submission counts per questionnaire
      const { supabase: sb } = await import('../supabaseClient.js').catch(() => ({ supabase }))
      supabase.from('session_submissions')
        .select('questionnaire_id')
        .eq('session_id', id)
        .then(({ data }) => {
          if (!data) return
          const counts = {}
          data.forEach(r => {
            const qid = r.questionnaire_id || '__none__'
            counts[qid] = (counts[qid] || 0) + 1
          })
          setSubmissionCounts(counts)
        }).catch(() => {})
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteSession(id)
      navigate('/sessions')
    } catch (err) {
      console.error(err)
      setDeleting(false)
    }
  }

  async function handleStatusChange(newStatus) {
    const updated = await updateSession(id, { status: newStatus })
    setSession(prev => ({ ...prev, ...updated }))
  }

  async function handlePaymentStatusChange(newStatus) {
    const updated = await updateSession(id, { paymentStatus: newStatus })
    setSession(prev => ({ ...prev, ...updated }))
  }

  async function handleSendQuestionnaire(questionnaireId) {
    if (!session.clients?.email) return
    setSendingForm(questionnaireId)
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession()
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-questionnaire-email`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authSession.access_token}`,
          },
          body: JSON.stringify({ sessionId: id, questionnaireId }),
        }
      )
      const result = await resp.json()
      if (!result.ok) throw new Error(result.error || 'Send failed')
      setSentForm(questionnaireId)
      setTimeout(() => setSentForm(null), 3000)
    } catch (err) {
      console.error(err)
    } finally {
      setSendingForm(null)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
        style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
    </div>
  )

  if (!session) return (
    <div className="py-20 text-center">
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Session not found.</p>
    </div>
  )

  const dateString = formatSessionDate(session.session_date, session.start_time, session.end_time)
  const clientName = session.clients ? `${session.clients.first_name} ${session.clients.last_name}` : null

  return (
    <div className="max-w-2xl space-y-5">
      <PageBreadcrumb crumbs={[{ label: 'Sessions', to: '/sessions' }, { label: session.name }]} />

      {/* Header card */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {/* Top section — icon + name + edit + pills */}
        <div className="px-4 py-3">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: getStatusConfig(session.status).color + '18' }}>
              <SessionTypeIconDetail type={session.type} size={18} color={getStatusConfig(session.status).color} />
            </div>
            <h1 className="text-base font-semibold flex-1 min-w-0 leading-snug" style={{ color: 'var(--text)' }}>{session.name}</h1>
            <button onClick={() => setShowEdit(true)}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-medium flex-shrink-0"
              style={{ background: 'var(--surface-raised)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer' }}>
              <Edit2 size={12} />Edit
            </button>
          </div>
          {/* Status pills — horizontal scroll */}
          <div style={{ overflowX: 'auto', whiteSpace: 'nowrap', paddingBottom: 2 }}>
            <div style={{ display: 'inline-flex', gap: 6 }}>
              {SESSION_STATUSES.map(s => (
                <button key={s.value} onClick={() => handleStatusChange(s.value)}
                  className="text-xs px-2.5 py-1 rounded-full font-medium"
                  style={{
                    background: session.status === s.value ? s.color + '20' : 'var(--surface-raised)',
                    color: session.status === s.value ? s.color : 'var(--text-muted)',
                    border: session.status === s.value ? `1px solid ${s.color}40` : '1px solid transparent',
                    cursor: 'pointer', whiteSpace: 'nowrap',
                  }}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Info rows */}
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3 px-4 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
            <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)', width: 64, display: 'flex', alignItems: 'center', gap: 4 }}>
              <FileText size={11} />Type
            </span>
            <span className="text-xs" style={{ color: 'var(--text)' }}>{session.type}</span>
          </div>
          {dateString && (
            <div className="flex items-center gap-3 px-4 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
              <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)', width: 64, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Clock size={11} />Date
              </span>
              <span className="text-xs" style={{ color: 'var(--text)' }}>{dateString}</span>
            </div>
          )}
          {session.location && (
            <div className="flex items-start gap-3 px-4 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
              <span className="text-xs flex-shrink-0 mt-0.5" style={{ color: 'var(--text-muted)', width: 64, display: 'flex', alignItems: 'center', gap: 4 }}>
                <MapPin size={11} />Location
              </span>
              <span className="text-xs" style={{ color: 'var(--text)' }}>{session.location}</span>
            </div>
          )}
          {clientName && (
            <div className="flex items-center gap-3 px-4 py-2.5"
              style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', textDecoration: 'none', display: 'flex' }}
              onClick={() => navigate(`/clients/${session.client_id}`)}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)', width: 64, display: 'flex', alignItems: 'center', gap: 4 }}>
                <User size={11} />Client
              </span>
              <span className="text-xs truncate" style={{ color: '#6366f1' }}>{clientName}</span>
              <ChevronRight size={11} style={{ color: 'var(--text-muted)', marginLeft: 'auto', flexShrink: 0 }} />
            </div>
          )}
          {session.mode === 'walkup' && (
            <div className="flex items-center gap-3 px-4 py-2.5">
              <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)', width: 64, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Users size={11} />Mode
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981' }}>Walk-up</span>
            </div>
          )}
        </div>
      </div>

      {/* Overview */}
      <SectionCard title="Overview">
        {session.description && (
          <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Description</p>
            <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text)', lineHeight: 1.6 }}>{session.description}</p>
          </div>
        )}
        {session.internal_notes && (
          <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Internal notes</p>
            <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text)', lineHeight: 1.6 }}>{session.internal_notes}</p>
          </div>
        )}

        {session.galleries && !linkingGallery && (
          <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid var(--border)' }}>
            <Link to={`/galleries/${session.gallery_id}`}
              className="flex items-center gap-2 flex-1"
              style={{ textDecoration: 'none' }}>
              <FileText size={13} style={{ color: 'var(--text-muted)' }} />
              <span className="text-sm" style={{ color: 'var(--text)' }}>{session.galleries.title}</span>
            </Link>
            <button onClick={async () => {
              await updateSession(session.id, { galleryId: null })
              const refreshed = await getSession(session.id)
              setSession(refreshed)
            }} className="text-xs ml-3" style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              Unlink
            </button>
          </div>
        )}
        {!session.galleries && !linkingGallery && (
          <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <button onClick={() => setLinkingGallery(true)} className="text-sm" style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              + Link gallery
            </button>
          </div>
        )}
        {linkingGallery && (
          <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <GalleryPicker
              galleries={allGalleries}
              value={session.gallery_id}
              allowNone={false}
              placeholder="Search galleries..."
              onChange={async (galleryId) => {
                await updateSession(session.id, { galleryId: galleryId || null })
                const refreshed = await getSession(session.id)
                setSession(refreshed)
                setLinkingGallery(false)
              }}
            />
            <button onClick={() => setLinkingGallery(false)} className="text-xs mt-2 block" style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              Cancel
            </button>
          </div>
        )}
        {!session.description && !session.internal_notes && !clientName && !session.galleries && (
          <div className="px-5 py-6 text-center">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No details yet. Edit the session to add more info.</p>
          </div>
        )}
      </SectionCard>

      {/* Financials — private only */}
      {session.mode === 'private' && (
        <SectionCard title="Financials"
          action={<PaymentBadge status={session.payment_status} />}>
          <InfoRow label="Session fee" value={session.session_fee != null ? `$${parseFloat(session.session_fee).toFixed(2)}` : null} />
          <InfoRow label="Retainer" value={session.retainer_amount != null ? `$${parseFloat(session.retainer_amount).toFixed(2)}` : null} />
          <InfoRow label="Retainer paid" value={session.retainer_amount != null ? (session.retainer_paid ? 'Yes' : 'No') : null} />
          <InfoRow label="Balance due" value={session.balance_due != null ? `$${parseFloat(session.balance_due).toFixed(2)}` : null} />
          <InfoRow label="Due date" value={session.balance_due_date
            ? new Date(session.balance_due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
            : null} />

          {/* Quick payment actions */}
          {session.payment_status !== 'paid' && (
            <div className="px-5 py-3 flex flex-wrap gap-2" style={{ borderTop: '1px solid var(--border)' }}>
              {session.payment_status === 'unpaid' && session.retainer_amount && !session.retainer_paid && (
                <button onClick={async () => {
                  const u = await updateSession(id, { retainerPaid: true, paymentStatus: 'partial' })
                  setSession(prev => ({ ...prev, ...u }))
                }}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium"
                  style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1', border: 'none', cursor: 'pointer' }}>
                  Mark retainer paid
                </button>
              )}
              <button onClick={() => handlePaymentStatusChange('paid')}
                className="text-xs px-3 py-1.5 rounded-lg font-medium"
                style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', border: 'none', cursor: 'pointer' }}>
                Mark paid in full
              </button>
            </div>
          )}

          {(!session.session_fee && !session.retainer_amount && !session.balance_due) && (
            <div className="px-5 py-5 text-center">
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No financial details set. Edit the session to add fees.</p>
            </div>
          )}
        </SectionCard>
      )}

      {/* Contracts */}
      <SectionCard title="Contracts"
        action={session.clients && (
          <button onClick={() => setShowSendContract(true)}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg font-medium"
            style={{ background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer' }}>
            <FileText size={12} />Send Contract
          </button>
        )}>
        {contracts.length === 0 ? (
          <div className="px-5 py-5 text-center">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No contracts yet.</p>
            {!session.clients && (
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Link a client to this session to send contracts.</p>
            )}
          </div>
        ) : (
          contracts.map((c, i) => (
            <Link key={c.id} to={`/contracts/${c.id}`}
              className="flex items-center justify-between px-5 py-3.5"
              style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none', textDecoration: 'none', display: 'flex' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{c.title}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {c.status === 'signed' ? 'Signed' : c.status === 'pending_client' ? 'Awaiting client' : c.status}
                  {c.signed_at ? ` · ${new Date(c.signed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
                </p>
              </div>
              <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
            </Link>
          ))
        )}
      </SectionCard>

      {/* Questionnaire */}
      <SectionCard title="Questionnaires">
        {sessionQuestionnaires.length === 0 ? (
          <div className="px-5 py-5 text-center">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No questionnaires attached. Edit the session to add one.</p>
          </div>
        ) : (
          sessionQuestionnaires.map((sq, i) => {
            const qid = sq.questionnaire_id
            const qname = sq.questionnaire_templates?.name || 'Unknown template'
            const count = submissionCounts[qid] || 0
            const formUrl = `${window.location.origin}/submit/${session.submit_token}?q=${qid}`
            const isSending = sendingForm === qid
            const isSent = sentForm === qid
            const isCopied = copiedQ === qid
            return (
              <div key={sq.id} className="px-5 py-3.5 flex items-center gap-3"
                style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                <ClipboardList size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{qname}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {count} {count === 1 ? 'response' : 'responses'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Copy link */}
                  <button onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(formUrl)
                      setCopiedQ(qid)
                      setTimeout(() => setCopiedQ(null), 2000)
                    } catch {
                      window.prompt('Copy this link:', formUrl)
                    }
                  }}
                    className="text-xs px-2.5 py-1.5 rounded-lg"
                    style={{ background: isCopied ? 'rgba(16,185,129,0.1)' : 'var(--surface-raised)', border: 'none', cursor: 'pointer', color: isCopied ? '#10b981' : 'var(--text-muted)', transition: 'all 0.15s' }}>
                    {isCopied ? '✓ Copied' : 'Copy link'}
                  </button>
                  {/* Send to client — private sessions with linked client email only */}
                  {session.mode === 'private' && session.clients?.email && session.submit_token && (
                    <button onClick={() => handleSendQuestionnaire(qid)} disabled={!!sendingForm}
                      className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg font-medium"
                      style={{ background: isSent ? 'rgba(16,185,129,0.1)' : 'rgba(99,102,241,0.1)', color: isSent ? '#10b981' : '#6366f1', border: 'none', cursor: 'pointer', transition: 'all 0.15s' }}>
                      <Mail size={11} />
                      {isSent ? '✓ Sent!' : isSending ? 'Sending...' : 'Send'}
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </SectionCard>

      {/* Submissions */}
      <SubmissionsSection sessionId={id} session={session} questionnaires={sessionQuestionnaires} />

      {/* Danger zone */}
      <div className="rounded-2xl px-5 py-4" style={{ border: '1px solid var(--danger)', background: 'var(--danger-subtle)' }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--danger)' }}>Delete session</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--danger)', opacity: 0.7 }}>This action cannot be undone.</p>
          </div>
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)}
              className="text-xs px-3 py-1.5 rounded-lg font-medium"
              style={{ background: 'var(--danger)', color: '#fff', border: 'none', cursor: 'pointer' }}>
              Delete
            </button>
          ) : (
            <div className="flex gap-2">
              <button onClick={handleDelete} disabled={deleting}
                className="text-xs px-3 py-1.5 rounded-lg font-medium"
                style={{ background: 'var(--danger)', color: '#fff', border: 'none', cursor: 'pointer' }}>
                {deleting ? 'Deleting...' : 'Confirm delete'}
              </button>
              <button onClick={() => setConfirmDelete(false)}
                className="text-xs px-3 py-1.5 rounded-lg font-medium"
                style={{ background: 'var(--surface-raised)', color: 'var(--text)', border: 'none', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {showSendContract && session.clients && (
        <SendContractModal
          client={session.clients}
          galleries={session.galleries ? [session.galleries] : []}
          sessionData={session}
          onClose={() => setShowSendContract(false)}
          onSent={contract => {
            setContracts(prev => [contract, ...prev])
            setShowSendContract(false)
          }}
        />
      )}

      {showEdit && (
        <EditSessionModal
          session={session}
          clients={clients}
          questionnaires={questionnaires}
          onClose={() => setShowEdit(false)}
          onSaved={async updated => { setSession(prev => ({ ...prev, ...updated })); const sq = await getSessionQuestionnaires(id); setSessionQuestionnaires(sq); setShowEdit(false) }}
        />
      )}
    </div>
  )
}
