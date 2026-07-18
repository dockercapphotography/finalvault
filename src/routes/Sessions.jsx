import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, CalendarDays, X, LayoutList, Columns,
  Users, Briefcase, Ticket, Home, GraduationCap, ScanFace, Baby, User, Trophy, Heart, BookHeart, SquareUser } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader.jsx'
import { supabase } from '../supabaseClient.js'
import {
  getSessions, createSession, updateSession, SESSION_TYPES, SESSION_STATUSES,
  getStatusConfig, getPaymentConfig, formatSessionDate, SESSION_TYPE_ICON,
} from '../utils/sessionApi.js'
import { getClients } from '../utils/crmApi.js'
import { getQuestionnaireTemplates } from '../utils/questionnaireApi.js'
import { setSessionQuestionnaires } from '../utils/sessionApi.js'
import PlaceAutocomplete from '../components/ui/PlaceAutocomplete.jsx'
import Button from '../components/ui/Button.jsx'
import Input from '../components/ui/Input.jsx'
import Toggle from '../components/ui/Toggle.jsx'
import KanbanBoard from '../components/ui/KanbanBoard.jsx'
import BottomSheet from '../components/layout/BottomSheet.jsx'
import Modal from '../components/ui/Modal.jsx'
import ClientPicker from '../components/ui/ClientPicker.jsx'


const SESSION_ICON_MAP = {
  BookHeart, SquareUser, Users, Briefcase, Ticket, Home, GraduationCap,
  ScanFace, Baby, User, Trophy, Heart, CalendarDays,
}

function SessionTypeIcon({ type, size = 18, color }) {
  const iconName = SESSION_TYPE_ICON[type] || 'CalendarDays'
  const Icon = SESSION_ICON_MAP[iconName] || CalendarDays
  return <Icon size={size} style={{ color }} />
}

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

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (!open || !listRef.current) return
    const selected = listRef.current.querySelector('[data-selected="true"]')
    if (selected) selected.scrollIntoView({ block: 'nearest' })
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {label && <label className="text-sm font-medium block mb-1" style={{ color: 'var(--text)' }}>{label}</label>}
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ width: '100%', background: 'var(--bg-subtle)', border: `1px solid ${open ? 'var(--border-strong)' : 'var(--border)'}`, color: selectedLabel ? 'var(--text)' : 'var(--text-muted)', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ flex: 1, textAlign: 'left' }}>{selectedLabel || '—'}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0, opacity: 0.4 }}><path d="M6 9l6 6 6-6"/></svg>
      </button>
      {open && (
        <div ref={listRef} style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflowY: 'auto', maxHeight: 220 }}>
          <div data-selected={!value ? 'true' : 'false'} onClick={() => { onChange(''); setOpen(false) }}
            style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', color: !value ? '#6366f1' : 'var(--text-muted)', background: !value ? 'rgba(99,102,241,0.06)' : 'transparent' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
            onMouseLeave={e => e.currentTarget.style.background = !value ? 'rgba(99,102,241,0.06)' : 'transparent'}>—</div>
          {TIME_OPTIONS.map(o => (
            <div key={o.value} data-selected={o.value === value ? 'true' : 'false'} onClick={() => { onChange(o.value); setOpen(false) }}
              style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', color: o.value === value ? '#6366f1' : 'var(--text)', background: o.value === value ? 'rgba(99,102,241,0.06)' : 'transparent', fontWeight: o.value === value ? '500' : '400' }}
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

function StatusBadge({ status }) {
  const cfg = getStatusConfig(status)
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: cfg.color + '18', color: cfg.color }}>{cfg.label}</span>
  )
}

function PaymentBadge({ status }) {
  if (!status || status === 'unpaid') return null
  const cfg = getPaymentConfig(status)
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: cfg.color + '18', color: cfg.color }}>{cfg.label}</span>
  )
}

function NewSessionWrapper({ onClose, stepper, children, footer }) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  if (isMobile) {
    return (
      <BottomSheet open onClose={onClose} maxHeight="92vh">
        <div className="flex items-center px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="font-semibold text-base" style={{ color: 'var(--text)' }}>New Session</h2>
        </div>
        {stepper && <div className="shrink-0">{stepper}</div>}
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
          <h2 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>New Session</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <X size={16} />
          </button>
        </div>
        {stepper && <div className="shrink-0">{stepper}</div>}
        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="shrink-0">{footer}</div>}
      </div>
    </div>
  )
}

function NewSessionModal({ onClose, onCreated }) {
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState('Portrait')
  const [mode, setMode] = useState('private')
  const [sessionDate, setSessionDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [internalNotes, setInternalNotes] = useState('')
  const [clientId, setClientId] = useState('')
  const [questionnaireIds, setQuestionnaireIds] = useState([])
  const [clients, setClients] = useState([])
  const [questionnaires, setQuestionnaires] = useState([])
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
        sessionDate: sessionDate || null, startTime: startTime || null, endTime: endTime || null,
        location: location || null, description: description || null, internalNotes: internalNotes || null,
        clientId: clientId || null, questionnaireId: null,
        sessionFee: sessionFee ? parseFloat(sessionFee) : null,
        retainerAmount: retainerAmount ? parseFloat(retainerAmount) : null,
        retainerPaid, balanceDue: balanceDue ? parseFloat(balanceDue) : null,
        balanceDueDate: balanceDueDate || null, paymentStatus,
      })
      if (questionnaireIds.length) await setSessionQuestionnaires(session.id, questionnaireIds)
      onCreated(session)
    } catch (err) { console.error(err) }
    finally { setSaving(false) }
  }

  const stepTitles = ['Basics', 'Details', mode === 'private' ? 'Financials' : null].filter(Boolean)
  const totalSteps = mode === 'private' ? 3 : 2

  const stepperEl = (
    <div className="flex items-center px-5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
      {stepTitles.map((label, i) => (
        <div key={label} className="flex items-center" style={{ flex: i < stepTitles.length - 1 ? 1 : 'none' }}>
          <div className="flex flex-col items-center" style={{ flexShrink: 0 }}>
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold"
              style={{ background: step === i + 1 ? '#6366f1' : step > i + 1 ? '#10b981' : 'var(--surface-raised)', color: step >= i + 1 ? '#fff' : 'var(--text-muted)' }}>
              {step > i + 1 ? '✓' : i + 1}
            </div>
            <span className="text-xs font-medium mt-0.5" style={{ color: step === i + 1 ? 'var(--text)' : 'var(--text-muted)' }}>{label}</span>
          </div>
          {i < stepTitles.length - 1 && (
            <div style={{ flex: 1, height: 1, background: step > i + 1 ? '#10b981' : 'var(--border)', opacity: step > i + 1 ? 0.4 : 1, margin: '0 8px', alignSelf: 'flex-start', marginTop: 12 }} />
          )}
        </div>
      ))}
    </div>
  )

  const footerEl = (
    <div className="flex items-center justify-between px-5 py-4" style={{ borderTop: '1px solid var(--border)' }}>
      <button onClick={step === 1 ? onClose : () => setStep(s => s - 1)} className="text-sm px-4 py-2 rounded-lg"
        style={{ background: 'var(--surface-raised)', color: 'var(--text-muted)', border: 'none', cursor: 'pointer' }}>
        {step === 1 ? 'Cancel' : '← Back'}
      </button>
      {step < totalSteps
        ? <Button onClick={() => setStep(s => s + 1)} disabled={step === 1 && !name.trim()}>Next →</Button>
        : <Button onClick={handleCreate} disabled={saving || !name.trim()}>{saving ? 'Creating...' : 'Create Session'}</Button>
      }
    </div>
  )

  return (
    <NewSessionWrapper onClose={onClose} stepper={stepperEl} footer={footerEl}>
      <div className="space-y-4">
        {step === 1 && (
          <>
            <Input label="Session name" value={name} onChange={setName} placeholder="e.g. Smith Family Portrait" required />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }}>Type</label>
                <select value={type} onChange={e => setType(e.target.value)}
                  style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none', cursor: 'pointer' }}>
                  {SESSION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <Input label="Date" value={sessionDate} onChange={setSessionDate} type="date" />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }}>Mode</label>
              <div className="flex gap-2">
                {[{ value: 'private', label: 'Private', desc: 'One client, booked session' }, { value: 'walkup', label: 'Walk-up', desc: 'Open QR form for events' }].map(opt => (
                  <button key={opt.value} onClick={() => setMode(opt.value)} className="flex-1 px-3 py-2.5 rounded-xl text-left"
                    style={{ border: mode === opt.value ? '2px solid #6366f1' : '2px solid var(--border)', background: mode === opt.value ? 'rgba(99,102,241,0.05)' : 'var(--surface)', cursor: 'pointer' }}>
                    <p className="text-sm font-medium" style={{ color: mode === opt.value ? '#6366f1' : 'var(--text)' }}>{opt.label}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <TimeSelect label="Start time" value={startTime} onChange={setStartTime} />
              <TimeSelect label={<>End time <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>(opt.)</span></>} value={endTime} onChange={setEndTime} />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }}>Location <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>(optional)</span></label>
              <PlaceAutocomplete value={location} onChange={setLocation} placeholder="Search for a venue or address..." />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            {mode === 'private' && (
              <div>
                <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }}>Link client <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>(optional)</span></label>
                <ClientPicker clients={clients} value={clientId} onChange={setClientId} placeholder="Link to a client..." />
              </div>
            )}
            <div style={{ height: 1, background: 'var(--border)' }} />
            <div>
              <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }}>Description <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>(client-facing, optional)</span></label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Shown in emails and submission forms..." rows={2}
                style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '10px 12px', fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6, boxSizing: 'border-box' }}
                onFocus={e => e.target.style.borderColor = 'var(--border-strong)'} onBlur={e => e.target.style.borderColor = 'var(--border)'} />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }}>Internal notes <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>(private)</span></label>
              <textarea value={internalNotes} onChange={e => setInternalNotes(e.target.value)} placeholder="Notes visible only to you..." rows={2}
                style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '10px 12px', fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6, boxSizing: 'border-box' }}
                onFocus={e => e.target.style.borderColor = 'var(--border-strong)'} onBlur={e => e.target.style.borderColor = 'var(--border)'} />
            </div>
            <div style={{ height: 1, background: 'var(--border)' }} />
            <div>
              <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }}>Questionnaires <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>(optional)</span></label>
              {questionnaires.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No questionnaire templates yet. Create one in Account → Questionnaires.</p>
              ) : (
                <div className="space-y-1.5">
                  {questionnaires.map(q => {
                    const selected = questionnaireIds.includes(q.id)
                    return (
                      <button key={q.id} type="button"
                        onClick={() => setQuestionnaireIds(prev => selected ? prev.filter(id => id !== q.id) : [...prev, q.id])}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left"
                        style={{ border: `1.5px solid ${selected ? '#6366f1' : 'var(--border)'}`, background: selected ? 'rgba(99,102,241,0.05)' : 'var(--surface)', cursor: 'pointer' }}>
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
          </>
        )}

        {step === 3 && mode === 'private' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium block mb-1" style={{ color: 'var(--text)' }}>Session fee</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--text-muted)' }}>$</span>
                  <input type="number" min="0" step="0.01" value={sessionFee} onChange={e => setSessionFee(e.target.value)} placeholder="0.00"
                    style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '9px 12px 9px 24px', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                    onFocus={e => e.target.style.borderColor = 'var(--border-strong)'} onBlur={e => e.target.style.borderColor = 'var(--border)'} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1" style={{ color: 'var(--text)' }}>Retainer</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--text-muted)' }}>$</span>
                  <input type="number" min="0" step="0.01" value={retainerAmount} onChange={e => setRetainerAmount(e.target.value)} placeholder="0.00"
                    style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '9px 12px 9px 24px', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                    onFocus={e => e.target.style.borderColor = 'var(--border-strong)'} onBlur={e => e.target.style.borderColor = 'var(--border)'} />
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
            <div style={{ height: 1, background: 'var(--border)' }} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium block mb-1" style={{ color: 'var(--text)' }}>Balance due</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--text-muted)' }}>$</span>
                  <input type="number" min="0" step="0.01" value={balanceDue} onChange={e => setBalanceDue(e.target.value)} placeholder="0.00"
                    style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '9px 12px 9px 24px', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                    onFocus={e => e.target.style.borderColor = 'var(--border-strong)'} onBlur={e => e.target.style.borderColor = 'var(--border)'} />
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
                {[{ value: 'unpaid', label: 'Unpaid' }, { value: 'partial', label: 'Partial' }, { value: 'paid', label: 'Paid' }].map(opt => (
                  <button key={opt.value} onClick={() => setPaymentStatus(opt.value)} className="flex-1 py-2 rounded-lg text-sm font-medium"
                    style={{ border: paymentStatus === opt.value ? '2px solid #6366f1' : '2px solid var(--border)', background: paymentStatus === opt.value ? 'rgba(99,102,241,0.08)' : 'var(--surface)', color: paymentStatus === opt.value ? '#6366f1' : 'var(--text-muted)', cursor: 'pointer' }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
      <div style={{display:'none'}}>
      </div>
    </NewSessionWrapper>
  )
}

function SessionCard({ session, onClick }) {
  const paymentCfg = session.payment_status && session.payment_status !== 'unpaid'
    ? { label: session.payment_status === 'paid' ? 'Paid' : 'Partial', color: session.payment_status === 'paid' ? '#10b981' : '#f97316' }
    : null

  const statusCfg = getStatusConfig(session.status)
  return (
    <div onClick={onClick} className="rounded-xl p-3 space-y-2"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer', userSelect: 'none' }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-strong)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: statusCfg.color + '18' }}>
          <SessionTypeIcon type={session.type} size={14} color={statusCfg.color} />
        </div>
        <p className="text-sm font-medium leading-snug" style={{ color: 'var(--text)' }}>{session.name}</p>
      </div>
      {session.clients && (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{session.clients.first_name} {session.clients.last_name}</p>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {session.type}{session.session_date ? ` · ${new Date(session.session_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
        </span>
        {paymentCfg && (
          <span className="text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0" style={{ background: paymentCfg.color + '18', color: paymentCfg.color }}>{paymentCfg.label}</span>
        )}
      </div>
      {session.mode === 'walkup' && (
        <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>Walk-up</span>
      )}
    </div>
  )
}

export default function Sessions() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState(null)
  const [filterMode, setFilterMode] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [view, setView] = useState(() => window.innerWidth >= 768 ? 'kanban' : 'list')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const data = await getSessions()
      setSessions(data)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  async function handleStatusChange(sessionId, newStatus) {
    try {
      await updateSession(sessionId, { status: newStatus })
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, status: newStatus } : s))
    } catch (err) { console.error(err) }
  }

  function handleCreated(session) {
    setShowNew(false)
    navigate(`/sessions/${session.id}`)
  }

  const filtered = sessions.filter(s => {
    const q = search.toLowerCase()
    const matchesSearch = !q || s.name.toLowerCase().includes(q) || (s.clients && `${s.clients.first_name} ${s.clients.last_name}`.toLowerCase().includes(q))
    const matchesStatus = !filterStatus || s.status === filterStatus
    const matchesMode = !filterMode || s.mode === filterMode
    return matchesSearch && matchesStatus && matchesMode
  })

  return (
    <div className="space-y-5">

      {/* Header — always full width */}
      <PageHeader
        title="Sessions"
        subtitle={`${sessions.length} ${sessions.length === 1 ? 'session' : 'sessions'}`}
        search={sessions.length > 0 ? { value: search, onChange: setSearch, placeholder: 'Search sessions or clients...' } : undefined}
        filterSections={sessions.length > 0 ? [
          {
            key: 'status', label: 'Status', type: 'select',
            value: filterStatus, onChange: setFilterStatus,
            options: SESSION_STATUSES.map(s => ({ value: s.value, label: s.label })),
          },
          {
            key: 'mode', label: 'Mode', type: 'select',
            value: filterMode, onChange: setFilterMode,
            options: [{ value: 'private', label: 'Private' }, { value: 'walkup', label: 'Walk-up' }],
          },
        ] : undefined}
        onClearAllFilters={() => { setFilterStatus(null); setFilterMode(null); setSearch('') }}
        primaryAction={{ label: 'New Session', icon: Plus, onClick: () => setShowNew(true) }}
        extra={
          <div className="flex items-center rounded-lg overflow-hidden flex-shrink-0" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
            <button onClick={() => setView('kanban')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium"
              style={{ background: view === 'kanban' ? 'var(--surface-raised)' : 'transparent', color: view === 'kanban' ? 'var(--text)' : 'var(--text-muted)', border: 'none', cursor: 'pointer' }}>
              <Columns size={13} />Board
            </button>
            <button onClick={() => setView('list')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium"
              style={{ background: view === 'list' ? 'var(--surface-raised)' : 'transparent', color: view === 'list' ? 'var(--text)' : 'var(--text-muted)', border: 'none', cursor: 'pointer' }}>
              <LayoutList size={13} />List
            </button>
          </div>
        }
      />

      {/* Loading spinner */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
        </div>
      )}

      {/* Kanban view */}
      {!loading && view === 'kanban' && (
        <KanbanBoard
          columns={SESSION_STATUSES}
          items={filtered}
          onStatusChange={handleStatusChange}
          renderCard={(session) => (
            <SessionCard session={session} onClick={() => navigate(`/sessions/${session.id}`)} />
          )}
        />
      )}

      {/* List view — constrained width */}
      {!loading && view === 'list' && (
        <div className="max-w-4xl">
          {filtered.length === 0 ? (
            <div className="py-20 text-center rounded-2xl" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
              <CalendarDays size={32} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
              <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{sessions.length === 0 ? 'No sessions yet' : 'No sessions match your filters'}</p>
              {sessions.length === 0 && <p className="text-xs mt-1 mb-4" style={{ color: 'var(--text-muted)' }}>Create your first session to get started</p>}
              {sessions.length === 0 && (
                <button onClick={() => setShowNew(true)} className="text-sm font-medium px-4 py-2 rounded-lg" style={{ background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer' }}>New Session</button>
              )}
            </div>
          ) : (
            <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              {filtered.map((session, i) => {
                const cfg = getStatusConfig(session.status)
                return (
                  <button key={session.id} onClick={() => navigate(`/sessions/${session.id}`)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
                    style={{ background: 'var(--surface)', borderTop: i > 0 ? '1px solid var(--border)' : 'none', borderRight: 'none', borderBottom: 'none', borderLeft: 'none', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}>
                    <div className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ background: cfg.color + '18' }}>
                      <SessionTypeIcon type={session.type} size={18} color={cfg.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{session.name}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {[
                            session.clients ? `${session.clients.first_name} ${session.clients.last_name}` : null,
                            session.type,
                            session.session_date ? new Date(session.session_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null,
                            session.mode === 'walkup' ? 'Walk-up' : null,
                          ].filter(Boolean).join(' · ')}
                        </p>
                        <div className="md:hidden"><StatusBadge status={session.status} /></div>
                      </div>
                    </div>
                    <div className="hidden md:flex items-center gap-2 shrink-0">
                      <StatusBadge status={session.status} />
                      <PaymentBadge status={session.payment_status} />
                    </div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-muted)', flexShrink: 0 }}><path d="M9 18l6-6-6-6"/></svg>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {showNew && <NewSessionModal onClose={() => setShowNew(false)} onCreated={handleCreated} />}
    </div>
  )
}
