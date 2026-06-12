import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, CalendarDays, X } from 'lucide-react'
import { supabase } from '../supabaseClient.js'
import {
  getSessions, createSession, SESSION_TYPES, SESSION_STATUSES,
  getStatusConfig, getPaymentConfig, formatSessionDate,
} from '../utils/sessionApi.js'
import { getClients } from '../utils/crmApi.js'
import { getQuestionnaireTemplates } from '../utils/questionnaireApi.js'
import PlaceAutocomplete from '../components/ui/PlaceAutocomplete.jsx'
import Button from '../components/ui/Button.jsx'
import Input from '../components/ui/Input.jsx'
import Toggle from '../components/ui/Toggle.jsx'
import Modal from '../components/ui/Modal.jsx'

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


// ── Status Badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const cfg = getStatusConfig(status)
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ background: cfg.color + '18', color: cfg.color }}>
      {cfg.label}
    </span>
  )
}

function PaymentBadge({ status }) {
  if (!status || status === 'unpaid') return null
  const cfg = getPaymentConfig(status)
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ background: cfg.color + '18', color: cfg.color }}>
      {cfg.label}
    </span>
  )
}

// ── New Session Modal ─────────────────────────────────────────────────────────

function NewSessionModal({ onClose, onCreated }) {
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)

  // Step 1 — Basic Info
  const [name, setName] = useState('')
  const [type, setType] = useState('Portrait')
  const [mode, setMode] = useState('private')
  const [sessionDate, setSessionDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [location, setLocation] = useState('')

  // Step 2 — Details
  const [description, setDescription] = useState('')
  const [internalNotes, setInternalNotes] = useState('')
  const [clientId, setClientId] = useState('')
  const [questionnaireId, setQuestionnaireId] = useState('')
  const [clients, setClients] = useState([])
  const [questionnaires, setQuestionnaires] = useState([])

  // Step 3 — Financials
  const [sessionFee, setSessionFee] = useState('')
  const [retainerAmount, setRetainerAmount] = useState('')
  const [retainerPaid, setRetainerPaid] = useState(false)
  const [balanceDue, setBalanceDue] = useState('')
  const [balanceDueDate, setBalanceDueDate] = useState('')
  const [paymentStatus, setPaymentStatus] = useState('unpaid')

  useEffect(() => {
    getClients().then(setClients).catch(() => {})
    getQuestionnaireTemplates().then(setQuestionnaires).catch(() => {})
  }, [])

  // Auto-calculate balance due
  useEffect(() => {
    const fee = parseFloat(sessionFee) || 0
    const retainer = parseFloat(retainerAmount) || 0
    if (fee > 0) setBalanceDue((fee - retainer).toFixed(2))
  }, [sessionFee, retainerAmount])

  async function handleCreate() {
    if (!name.trim()) return
    setSaving(true)
    try {
      const session = await createSession({
        name, type, mode, status: 'inquiry',
        sessionDate: sessionDate || null,
        startTime: startTime || null,
        endTime: endTime || null,
        location: location || null,
        description: description || null,
        internalNotes: internalNotes || null,
        clientId: clientId || null,
        questionnaireId: questionnaireId || null,
        sessionFee: sessionFee ? parseFloat(sessionFee) : null,
        retainerAmount: retainerAmount ? parseFloat(retainerAmount) : null,
        retainerPaid,
        balanceDue: balanceDue ? parseFloat(balanceDue) : null,
        balanceDueDate: balanceDueDate || null,
        paymentStatus,
      })
      onCreated(session)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const stepTitles = ['Basic Info', 'Details', mode === 'private' ? 'Financials' : null].filter(Boolean)
  const totalSteps = mode === 'private' ? 3 : 2

  return (
    <Modal onClose={onClose} title="New Session" maxWidth={540}>
      {/* Step indicator */}
      <div className="flex items-center gap-2 px-6 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        {stepTitles.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            {i > 0 && <div className="w-8 h-px" style={{ background: 'var(--border)' }} />}
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold"
                style={{
                  background: step === i + 1 ? '#6366f1' : step > i + 1 ? '#10b981' : 'var(--surface-raised)',
                  color: step >= i + 1 ? '#fff' : 'var(--text-muted)',
                }}>
                {step > i + 1 ? '✓' : i + 1}
              </div>
              <span className="text-xs font-medium hidden sm:block"
                style={{ color: step === i + 1 ? 'var(--text)' : 'var(--text-muted)' }}>
                {label}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="px-6 py-5 space-y-4 overflow-y-auto" style={{ maxHeight: '60vh' }}>

        {/* ── Step 1 ── */}
        {step === 1 && (
          <>
            <Input label="Session name" value={name} onChange={setName} placeholder="e.g. Smith Family Portrait" required />

            <div>
              <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }}>Session type</label>
              <select value={type} onChange={e => setType(e.target.value)}
                style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none', cursor: 'pointer' }}>
                {SESSION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }}>Mode</label>
              <div className="flex gap-2">
                {[
                  { value: 'private', label: 'Private', desc: 'One client, booked session' },
                  { value: 'walkup', label: 'Walk-up', desc: 'Open QR form for events' },
                ].map(opt => (
                  <button key={opt.value} onClick={() => setMode(opt.value)}
                    className="flex-1 px-3 py-2.5 rounded-xl text-left"
                    style={{
                      border: mode === opt.value ? '2px solid #6366f1' : '2px solid var(--border)',
                      background: mode === opt.value ? 'rgba(99,102,241,0.05)' : 'var(--surface)',
                      cursor: 'pointer',
                    }}>
                    <p className="text-sm font-medium" style={{ color: mode === opt.value ? '#6366f1' : 'var(--text)' }}>{opt.label}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input label="Date" value={sessionDate} onChange={setSessionDate} type="date" />
              <div />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <TimeSelect label="Start time" value={startTime} onChange={setStartTime} />
              <TimeSelect label="End time (optional)" value={endTime} onChange={setEndTime} />
            </div>

            <div>
              <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }}>Location <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>(optional)</span></label>
              <PlaceAutocomplete
                value={location}
                onChange={setLocation}
                placeholder="Search for a venue or address..."
               
              />
            </div>
          </>
        )}

        {/* ── Step 2 ── */}
        {step === 2 && (
          <>
            <div>
              <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }}>
                Description <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>(client-facing, optional)</span>
              </label>
              <textarea value={description} onChange={e => setDescription(e.target.value)}
                placeholder="Shown in emails and submission forms..."
                rows={4}
                style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '10px 12px', fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6, boxSizing: 'border-box' }}
                onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'} />
            </div>

            <div>
              <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }}>
                Internal notes <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>(private)</span>
              </label>
              <textarea value={internalNotes} onChange={e => setInternalNotes(e.target.value)}
                placeholder="Notes visible only to you..."
                rows={3}
                style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '10px 12px', fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6, boxSizing: 'border-box' }}
                onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'} />
            </div>

            {mode === 'private' && (
              <div>
                <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }}>Link client <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>(optional)</span></label>
                <select value={clientId} onChange={e => setClientId(e.target.value)}
                  style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none', cursor: 'pointer' }}>
                  <option value="">No client linked</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }}>Questionnaire template <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>(optional)</span></label>
              <select value={questionnaireId} onChange={e => setQuestionnaireId(e.target.value)}
                style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none', cursor: 'pointer' }}>
                <option value="">No questionnaire</option>
                {questionnaires.map(q => (
                  <option key={q.id} value={q.id}>{q.name}</option>
                ))}
              </select>
            </div>
          </>
        )}

        {/* ── Step 3 — Financials (private only) ── */}
        {step === 3 && mode === 'private' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium block mb-1" style={{ color: 'var(--text)' }}>Session fee</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--text-muted)' }}>$</span>
                  <input type="number" min="0" step="0.01" value={sessionFee} onChange={e => setSessionFee(e.target.value)}
                    placeholder="0.00"
                    style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '9px 12px 9px 24px', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                    onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1" style={{ color: 'var(--text)' }}>Retainer</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--text-muted)' }}>$</span>
                  <input type="number" min="0" step="0.01" value={retainerAmount} onChange={e => setRetainerAmount(e.target.value)}
                    placeholder="0.00"
                    style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '9px 12px 9px 24px', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                    onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'} />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between py-2 px-3 rounded-xl" style={{ background: 'var(--surface-raised)' }}>
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>Retainer paid</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Mark retainer as received</p>
              </div>
              <Toggle checked={retainerPaid} onChange={setRetainerPaid} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium block mb-1" style={{ color: 'var(--text)' }}>Balance due</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--text-muted)' }}>$</span>
                  <input type="number" min="0" step="0.01" value={balanceDue} onChange={e => setBalanceDue(e.target.value)}
                    placeholder="0.00"
                    style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '9px 12px 9px 24px', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                    onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'} />
                </div>
              </div>
              <Input label="Balance due date" value={balanceDueDate} onChange={setBalanceDueDate} type="date" />
            </div>

            <div>
              <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }}>Payment status</label>
              <div className="flex gap-2">
                {[
                  { value: 'unpaid', label: 'Unpaid' },
                  { value: 'partial', label: 'Partial' },
                  { value: 'paid', label: 'Paid' },
                ].map(opt => (
                  <button key={opt.value} onClick={() => setPaymentStatus(opt.value)}
                    className="flex-1 py-2 rounded-lg text-sm font-medium"
                    style={{
                      border: paymentStatus === opt.value ? '2px solid #6366f1' : '2px solid var(--border)',
                      background: paymentStatus === opt.value ? 'rgba(99,102,241,0.08)' : 'var(--surface)',
                      color: paymentStatus === opt.value ? '#6366f1' : 'var(--text-muted)',
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

      {/* Footer */}
      <div className="flex items-center justify-between px-6 py-4" style={{ borderTop: '1px solid var(--border)' }}>
        <button onClick={step === 1 ? onClose : () => setStep(s => s - 1)}
          className="text-sm px-4 py-2 rounded-lg"
          style={{ background: 'var(--surface-raised)', color: 'var(--text-muted)', border: 'none', cursor: 'pointer' }}>
          {step === 1 ? 'Cancel' : '← Back'}
        </button>
        {step < totalSteps ? (
          <Button onClick={() => setStep(s => s + 1)} disabled={step === 1 && !name.trim()}>
            Next →
          </Button>
        ) : (
          <Button onClick={handleCreate} disabled={saving || !name.trim()}>
            {saving ? 'Creating...' : 'Create Session'}
          </Button>
        )}
      </div>
    </Modal>
  )
}

// ── Sessions List ─────────────────────────────────────────────────────────────

export default function Sessions() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterMode, setFilterMode] = useState('')
  const [showNew, setShowNew] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const data = await getSessions()
      setSessions(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  function handleCreated(session) {
    setShowNew(false)
    navigate(`/sessions/${session.id}`)
  }

  const filtered = sessions.filter(s => {
    const q = search.toLowerCase()
    const matchesSearch = !q ||
      s.name.toLowerCase().includes(q) ||
      (s.clients && `${s.clients.first_name} ${s.clients.last_name}`.toLowerCase().includes(q))
    const matchesStatus = !filterStatus || s.status === filterStatus
    const matchesMode = !filterMode || s.mode === filterMode
    return matchesSearch && matchesStatus && matchesMode
  })

  return (
    <div className="max-w-4xl space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Sessions</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}
          </p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg"
          style={{ background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer' }}>
          <Plus size={15} />New Session
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search sessions or clients..."
            style={{ width: '100%', paddingLeft: 34, paddingRight: 12, paddingTop: 8, paddingBottom: 8, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }}
            onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'} />
        </div>

        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: filterStatus ? 'var(--text)' : 'var(--text-muted)', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', cursor: 'pointer' }}>
          <option value="">All statuses</option>
          {SESSION_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>

        <select value={filterMode} onChange={e => setFilterMode(e.target.value)}
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: filterMode ? 'var(--text)' : 'var(--text-muted)', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', cursor: 'pointer' }}>
          <option value="">All modes</option>
          <option value="private">Private</option>
          <option value="walkup">Walk-up</option>
        </select>

        {(filterStatus || filterMode || search) && (
          <button onClick={() => { setFilterStatus(''); setFilterMode(''); setSearch('') }}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg"
            style={{ background: 'var(--surface-raised)', color: 'var(--text-muted)', border: 'none', cursor: 'pointer' }}>
            <X size={12} />Clear
          </button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center rounded-2xl" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
          <CalendarDays size={32} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
            {sessions.length === 0 ? 'No sessions yet' : 'No sessions match your filters'}
          </p>
          {sessions.length === 0 && (
            <p className="text-xs mt-1 mb-4" style={{ color: 'var(--text-muted)' }}>
              Create your first session to get started
            </p>
          )}
          {sessions.length === 0 && (
            <button onClick={() => setShowNew(true)}
              className="text-sm font-medium px-4 py-2 rounded-lg"
              style={{ background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer' }}>
              New Session
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          {filtered.map((session, i) => (
            <button key={session.id}
              onClick={() => navigate(`/sessions/${session.id}`)}
              className="w-full flex items-center gap-4 px-5 py-4 text-left transition-colors"
              style={{
                background: 'var(--surface)',
                borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                border: 'none',
                cursor: 'pointer',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}>

              {/* Icon */}
              <div className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: session.mode === 'walkup' ? 'rgba(16,185,129,0.1)' : 'rgba(99,102,241,0.1)' }}>
                <CalendarDays size={16} style={{ color: session.mode === 'walkup' ? '#10b981' : '#6366f1' }} />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{session.name}</p>
                  <StatusBadge status={session.status} />
                  <PaymentBadge status={session.payment_status} />
                </div>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {session.clients
                    ? `${session.clients.first_name} ${session.clients.last_name} · `
                    : ''}
                  {session.type}
                  {session.session_date
                    ? ` · ${new Date(session.session_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                    : ''}
                  {session.mode === 'walkup' ? ' · Walk-up' : ''}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {showNew && <NewSessionModal onClose={() => setShowNew(false)} onCreated={handleCreated} />}
    </div>
  )
}
