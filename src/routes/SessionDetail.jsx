import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  CalendarDays, MapPin, Clock, User, ChevronRight,
  FileText, ClipboardList, Edit2, Trash2, Check, X,
} from 'lucide-react'
import {
  getSession, updateSession, deleteSession,
  SESSION_TYPES, SESSION_STATUSES, PAYMENT_STATUSES,
  getStatusConfig, getPaymentConfig, formatSessionDate,
} from '../utils/sessionApi.js'
import { getContracts } from '../utils/crmApi.js'
import { getQuestionnaireTemplates } from '../utils/questionnaireApi.js'
import { getClients } from '../utils/crmApi.js'
import PageBreadcrumb from '../components/ui/PageBreadcrumb.jsx'
import Button from '../components/ui/Button.jsx'
import Input from '../components/ui/Input.jsx'
import Toggle from '../components/ui/Toggle.jsx'
import PlaceAutocomplete from '../components/ui/PlaceAutocomplete.jsx'

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
  const [questionnaireId, setQuestionnaireId] = useState(session.questionnaire_id || '')
  const [sessionFee, setSessionFee] = useState(session.session_fee ?? '')
  const [retainerAmount, setRetainerAmount] = useState(session.retainer_amount ?? '')
  const [retainerPaid, setRetainerPaid] = useState(session.retainer_paid || false)
  const [balanceDue, setBalanceDue] = useState(session.balance_due ?? '')
  const [balanceDueDate, setBalanceDueDate] = useState(session.balance_due_date || '')
  const [paymentStatus, setPaymentStatus] = useState(session.payment_status || 'unpaid')
  const [saving, setSaving] = useState(false)

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
        questionnaireId: questionnaireId || null,
        sessionFee: sessionFee !== '' ? parseFloat(sessionFee) : null,
        retainerAmount: retainerAmount !== '' ? parseFloat(retainerAmount) : null,
        retainerPaid,
        balanceDue: balanceDue !== '' ? parseFloat(balanceDue) : null,
        balanceDueDate: balanceDueDate || null,
        paymentStatus,
      })
      onSaved(updated)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}>
      <div className="w-full rounded-2xl overflow-hidden flex flex-col" style={{ maxWidth: 560, maxHeight: '90vh', background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Edit Session</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={16} /></button>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-4">
          <Input label="Session name" value={name} onChange={setName} required />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium block mb-1" style={{ color: 'var(--text)' }}>Type</label>
              <select value={type} onChange={e => setType(e.target.value)}
                style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none', cursor: 'pointer' }}>
                {SESSION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1" style={{ color: 'var(--text)' }}>Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)}
                style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none', cursor: 'pointer' }}>
                {SESSION_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input label="Date" value={sessionDate} onChange={setSessionDate} type="date" />
            <div />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TimeSelect label="Start time" value={startTime} onChange={setStartTime} />
            <TimeSelect label="End time" value={endTime} onChange={setEndTime} />
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
              <select value={clientId} onChange={e => setClientId(e.target.value)}
                style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none', cursor: 'pointer' }}>
                <option value="">No client linked</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="text-sm font-medium block mb-1" style={{ color: 'var(--text)' }}>Questionnaire</label>
            <select value={questionnaireId} onChange={e => setQuestionnaireId(e.target.value)}
              style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none', cursor: 'pointer' }}>
              <option value="">No questionnaire</option>
              {questionnaires.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
            </select>
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
                <Input label="Balance due date" value={balanceDueDate} onChange={setBalanceDueDate} type="date" />
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

        <div className="flex gap-3 px-6 py-4 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  )
}

// ── Session Detail ────────────────────────────────────────────────────────────

export default function SessionDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [session, setSession] = useState(null)
  const [contracts, setContracts] = useState([])
  const [clients, setClients] = useState([])
  const [questionnaires, setQuestionnaires] = useState([])
  const [loading, setLoading] = useState(true)
  const [showEdit, setShowEdit] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => { load() }, [id])

  async function load() {
    setLoading(true)
    try {
      const [s, cs, qs] = await Promise.all([
        getSession(id),
        getClients(),
        getQuestionnaireTemplates(),
      ])
      setSession(s)
      setClients(cs)
      setQuestionnaires(qs)
      // Load contracts linked to this session's client
      if (s?.client_id) {
        getContracts({ clientId: s.client_id }).then(setContracts).catch(() => {})
      }
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
      <PageBreadcrumb items={[{ label: 'Sessions', to: '/sessions' }, { label: session.name }]} />

      {/* Header card */}
      <div className="rounded-2xl px-5 py-5 space-y-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{session.name}</h1>
              <StatusBadge status={session.status} large />
              {session.mode === 'walkup' && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981' }}>Walk-up</span>
              )}
            </div>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{session.type}</p>
          </div>
          <button onClick={() => setShowEdit(true)}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg shrink-0"
            style={{ background: 'var(--surface-raised)', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <Edit2 size={13} />Edit
          </button>
        </div>

        {dateString && (
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            <Clock size={13} />
            <span>{dateString}</span>
          </div>
        )}

        {session.location && (
          <div className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            <MapPin size={13} style={{ marginTop: 2, flexShrink: 0 }} />
            <span>{session.location}</span>
          </div>
        )}

        {/* Status quick-change */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {SESSION_STATUSES.map(s => (
            <button key={s.value} onClick={() => handleStatusChange(s.value)}
              className="text-xs px-2.5 py-1 rounded-full font-medium transition-all"
              style={{
                background: session.status === s.value ? s.color + '20' : 'var(--surface-raised)',
                color: session.status === s.value ? s.color : 'var(--text-muted)',
                border: session.status === s.value ? `1px solid ${s.color}40` : '1px solid transparent',
                cursor: 'pointer',
              }}>
              {s.label}
            </button>
          ))}
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
        {clientName && (
          <Link to={`/clients/${session.client_id}`}
            className="flex items-center justify-between px-5 py-3.5 transition-colors"
            style={{ borderBottom: '1px solid var(--border)', textDecoration: 'none', display: 'flex' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <div className="flex items-center gap-2">
              <User size={13} style={{ color: 'var(--text-muted)' }} />
              <span className="text-sm" style={{ color: 'var(--text)' }}>{clientName}</span>
            </div>
            <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
          </Link>
        )}
        {session.galleries && (
          <Link to={`/galleries/${session.gallery_id}`}
            className="flex items-center justify-between px-5 py-3.5 transition-colors"
            style={{ textDecoration: 'none', display: 'flex' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <div className="flex items-center gap-2">
              <FileText size={13} style={{ color: 'var(--text-muted)' }} />
              <span className="text-sm" style={{ color: 'var(--text)' }}>{session.galleries.title}</span>
            </div>
            <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
          </Link>
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
      <SectionCard title="Contracts">
        {contracts.length === 0 ? (
          <div className="px-5 py-5 text-center">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No contracts yet.</p>
            {session.clients && (
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                Send a contract from the <Link to={`/clients/${session.client_id}`} style={{ color: '#6366f1' }}>client detail page</Link>.
              </p>
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
      <SectionCard title="Questionnaire">
        {session.questionnaire_templates ? (
          <div className="px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList size={14} style={{ color: 'var(--text-muted)' }} />
              <span className="text-sm" style={{ color: 'var(--text)' }}>{session.questionnaire_templates.name}</span>
            </div>
            {session.mode === 'walkup' && session.submit_token && (
              <button onClick={() => {
                const url = `${window.location.origin}/submit/${session.submit_token}`
                navigator.clipboard.writeText(url)
              }}
                className="text-xs px-2.5 py-1 rounded-lg"
                style={{ background: 'var(--surface-raised)', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                Copy form link
              </button>
            )}
          </div>
        ) : (
          <div className="px-5 py-5 text-center">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No questionnaire attached. Edit the session to add one.</p>
          </div>
        )}
      </SectionCard>

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

      {showEdit && (
        <EditSessionModal
          session={session}
          clients={clients}
          questionnaires={questionnaires}
          onClose={() => setShowEdit(false)}
          onSaved={updated => { setSession(prev => ({ ...prev, ...updated })); setShowEdit(false) }}
        />
      )}
    </div>
  )
}
