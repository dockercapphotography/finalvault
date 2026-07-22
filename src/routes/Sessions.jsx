import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link as RouterLink } from 'react-router-dom'
import { Plus, CalendarDays, X, LayoutList, Columns, Link2, Copy, Check, Trash2, MapPin, Ticket as TicketIcon, Camera,
  Users, Briefcase, Ticket, Home, GraduationCap, ScanFace, Baby, User, Trophy, Heart, BookHeart, SquareUser } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader.jsx'
import { supabase } from '../supabaseClient.js'
import {
  getSessions, createSession, updateSession, SESSION_TYPES, SESSION_STATUSES,
  getStatusConfig, getPaymentConfig, PAYMENT_STATUSES, formatSessionDate, SESSION_TYPE_ICON,
} from '../utils/sessionApi.js'
import { getClients } from '../utils/crmApi.js'
import { getQuestionnaireTemplates } from '../utils/questionnaireApi.js'
import { setSessionQuestionnaires } from '../utils/sessionApi.js'
import {
  getSignupPages, getSignupPage, createSignupPage, updateSignupPage, deleteSignupPage,
  createShootType, updateShootType, deleteShootType, generateSlots, getSlots, deleteSlot,
  createManualSlot, deleteAllOpenSlots, getShootTypeQuestionnaires, setShootTypeQuestionnaires,
} from '../utils/signupApi.js'
import { COMMON_TIMEZONES } from '../utils/timezoneApi.js'
import AddressAutocomplete from '../components/ui/AddressAutocomplete.jsx'
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

// ── Sign-ups ─────────────────────────────────────────────────────────────────

function SignupPageCard({ page, onOpen }) {
  const pct = page.slot_total > 0 ? Math.round((page.slot_claimed / page.slot_total) * 100) : 0
  const active = page.is_active
  return (
    <button onClick={onOpen} className="w-full text-left rounded-2xl p-4 transition-colors"
      style={{ border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
      onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}>
      <div className="flex items-start gap-3 mb-3.5">
        <div className="flex items-center justify-center rounded-lg flex-shrink-0"
          style={{ width: 40, height: 40, background: active ? 'rgba(99,102,241,0.1)' : 'var(--surface-raised)' }}>
          <TicketIcon size={19} style={{ color: active ? '#6366f1' : 'var(--text-muted)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{page.title}</p>
          <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{page.venue_address || 'No venue set yet'}</p>
        </div>
        <span className="text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0"
          style={{
            background: active ? 'var(--success-subtle)' : 'var(--surface-raised)',
            color: active ? 'var(--success)' : 'var(--text-muted)',
          }}>
          {active ? 'Active' : 'Inactive'}
        </span>
      </div>

      {page.slot_total > 0 && (
        <>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{page.slot_claimed} of {page.slot_total} slots claimed</span>
            <span className="text-xs font-medium" style={{ color: active ? '#6366f1' : 'var(--text-muted)' }}>{pct}%</span>
          </div>
          <div className="rounded-full overflow-hidden" style={{ height: 6, background: 'var(--surface-raised)' }}>
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: active ? '#6366f1' : 'var(--text-muted)' }} />
          </div>
        </>
      )}

      <div className="flex items-center gap-4 mt-3 pt-3 text-xs" style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
        <span className="flex items-center gap-1"><Camera size={13} />{page.shoot_type_count} shoot type{page.shoot_type_count === 1 ? '' : 's'}</span>
        {page.day_count > 0 && <span className="flex items-center gap-1"><CalendarDays size={13} />{page.day_count} day{page.day_count === 1 ? '' : 's'}</span>}
      </div>
    </button>
  )
}

function NewSignupPageModal({ onClose, onCreated }) {
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleCreate() {
    if (!title.trim()) return
    setSaving(true)
    try {
      const page = await createSignupPage({ title })
      onCreated(page)
    } catch (err) {
      console.error(err)
      setSaving(false)
    }
  }

  return (
    <Modal title="New signup page" onClose={onClose}>
      <div className="space-y-4">
        <Input label="Title" value={title} onChange={setTitle} placeholder="GenCon 2026 Photo Sessions" required />
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>You'll set the venue, shoot types, and time slots next.</p>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleCreate} disabled={!title.trim() || saving}>
            {saving ? 'Creating...' : 'Create'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function ShootTypeRow({ shootType, allQuestionnaires, onUpdated, onDeleted }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(shootType.name)
  const [duration, setDuration] = useState(String(shootType.duration_minutes))
  const [sessionType, setSessionType] = useState(shootType.session_type)
  const [questionnaireIds, setQuestionnaireIds] = useState([])
  const [loadingQuestionnaires, setLoadingQuestionnaires] = useState(false)
  const [saving, setSaving] = useState(false)

  async function startEditing() {
    setEditing(true)
    setLoadingQuestionnaires(true)
    try {
      setQuestionnaireIds(await getShootTypeQuestionnaires(shootType.id))
    } catch (err) { console.error(err) }
    finally { setLoadingQuestionnaires(false) }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const updated = await updateShootType(shootType.id, {
        name, durationMinutes: parseInt(duration, 10) || shootType.duration_minutes, sessionType,
      })
      await setShootTypeQuestionnaires(shootType.id, questionnaireIds)
      onUpdated(updated)
      setEditing(false)
    } catch (err) { console.error(err) }
    finally { setSaving(false) }
  }

  if (editing) {
    return (
      <div className="px-4 py-3 space-y-2.5" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <input value={name} onChange={e => setName(e.target.value)}
            style={{ flex: 2, background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '7px 10px', fontSize: 13 }} />
          <input type="number" min="5" step="5" value={duration} onChange={e => setDuration(e.target.value)}
            style={{ width: 64, background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '7px 10px', fontSize: 13 }} />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>min</span>
          <select value={sessionType} onChange={e => setSessionType(e.target.value)}
            style={{ flex: 1, background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '7px 10px', fontSize: 13 }}>
            {SESSION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div>
          <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Questionnaires assigned automatically when someone books this shoot type</p>
          {loadingQuestionnaires ? (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading...</p>
          ) : allQuestionnaires.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No questionnaire templates yet. Create one in Account → Questionnaires.</p>
          ) : (
            <div className="space-y-1">
              {allQuestionnaires.map(q => {
                const selected = questionnaireIds.includes(q.id)
                return (
                  <button key={q.id} type="button"
                    onClick={() => setQuestionnaireIds(prev => selected ? prev.filter(id => id !== q.id) : [...prev, q.id])}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left"
                    style={{ border: `1.5px solid ${selected ? '#6366f1' : 'var(--border)'}`, background: selected ? 'rgba(99,102,241,0.05)' : 'var(--surface)', cursor: 'pointer' }}>
                    <div className="w-3.5 h-3.5 rounded flex items-center justify-center shrink-0"
                      style={{ background: selected ? '#6366f1' : 'var(--surface-raised)', border: selected ? 'none' : '1.5px solid var(--border)' }}>
                      {selected && <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                    <span className="text-xs truncate" style={{ color: selected ? '#6366f1' : 'var(--text)', fontWeight: selected ? '500' : '400' }}>{q.name}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={handleSave} disabled={saving} className="text-xs font-medium px-2.5 py-1.5 rounded-lg"
            style={{ background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer' }}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button onClick={() => setEditing(false)} className="text-xs font-medium px-2.5 py-1.5 rounded-lg"
            style={{ background: 'var(--surface-raised)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid var(--border)' }}>
      <button onClick={startEditing} className="text-left flex-1 min-w-0" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
        <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{shootType.name}</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{shootType.duration_minutes} min · {shootType.session_type}</p>
      </button>
      <button onClick={() => onDeleted(shootType.id)} aria-label={`Delete ${shootType.name}`} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 4 }}>
        <Trash2 size={14} />
      </button>
    </div>
  )
}

function GenerateSlotsForm({ page, shootTypes, onGenerated }) {
  const [shootTypeId, setShootTypeId] = useState(shootTypes[0]?.id || '')
  const [date, setDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [startTime, setStartTime] = useState('10:00')
  const [endTime, setEndTime] = useState('18:00')
  const [buffer, setBuffer] = useState('5')
  const [generating, setGenerating] = useState(false)
  const [lastCount, setLastCount] = useState(null)
  const [formError, setFormError] = useState(null)

  useEffect(() => {
    if (shootTypes.length > 0 && !shootTypes.some(t => t.id === shootTypeId)) {
      setShootTypeId(shootTypes[0].id)
    }
  }, [shootTypes, shootTypeId])

  const selectedType = shootTypes.find(t => t.id === shootTypeId)

  async function handleGenerate() {
    if (!shootTypeId || !selectedType) {
      setFormError('Pick a shoot type first.')
      return
    }
    if (!date) {
      setFormError('Pick a start date first.')
      return
    }
    if (endDate && endDate < date) {
      setFormError('End date is before the start date.')
      return
    }
    setFormError(null)
    setGenerating(true)
    setLastCount(null)
    try {
      const dates = []
      let cursor = date
      while (cursor <= (endDate || date)) {
        dates.push(cursor)
        const [y, m, d] = cursor.split('-').map(Number)
        cursor = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
      }

      let total = 0
      for (const d of dates) {
        const created = await generateSlots({
          signupPageId: page.id, shootTypeId, date: d, startTime, endTime,
          durationMinutes: selectedType.duration_minutes,
          bufferMinutes: parseInt(buffer, 10) || 0,
          timezone: page.timezone,
        })
        total += created.length
      }
      setLastCount(total)
      onGenerated()
    } catch (err) {
      console.error(err)
      setFormError('Something went wrong generating slots. Try again.')
    }
    finally { setGenerating(false) }
  }

  if (shootTypes.length === 0) {
    return <p className="text-xs px-4 py-3" style={{ color: 'var(--text-muted)' }}>Add a shoot type above before generating slots.</p>
  }

  return (
    <div className="px-4 py-3 space-y-2.5">
      <select value={shootTypeId} onChange={e => setShootTypeId(e.target.value)}
        style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}>
        {shootTypes.map(t => <option key={t.id} value={t.id}>{t.name} ({t.duration_minutes} min)</option>)}
      </select>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Start date</p>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13 }} />
        </div>
        <div>
          <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>End date (optional)</p>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} min={date || undefined}
            style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13 }} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
          style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13, boxSizing: 'border-box' }} />
        <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
          style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13, boxSizing: 'border-box' }} />
        <div className="flex items-center gap-1.5">
          <input type="number" min="0" step="5" value={buffer} onChange={e => setBuffer(e.target.value)}
            style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13 }} />
          <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>min buffer</span>
        </div>
      </div>
      {formError && <p className="text-xs" style={{ color: 'var(--danger)' }}>{formError}</p>}
      <div className="flex items-center gap-3">
        <Button variant="secondary" onClick={handleGenerate} disabled={generating}>
          {generating ? 'Generating...' : endDate && endDate !== date ? 'Generate slots for these days' : 'Generate slots for this day'}
        </Button>
        {lastCount !== null && (
          <span className="text-xs" style={{ color: lastCount > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
            {lastCount > 0 ? `${lastCount} slots created` : 'No slots fit that window'}
          </span>
        )}
      </div>
    </div>
  )
}

function ManualAddSlotForm({ page, shootTypes, onAdded }) {
  const [open, setOpen] = useState(false)
  const [shootTypeId, setShootTypeId] = useState('')
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('10:00')
  const [adding, setAdding] = useState(false)
  const [formError, setFormError] = useState(null)

  useEffect(() => {
    if (shootTypes.length > 0 && !shootTypeId) setShootTypeId(shootTypes[0].id)
  }, [shootTypes, shootTypeId])

  const selectedType = shootTypes.find(t => t.id === shootTypeId)

  async function handleAdd() {
    if (!selectedType || !date) {
      setFormError('Pick a shoot type and date first.')
      return
    }
    setFormError(null)
    setAdding(true)
    try {
      await createManualSlot({
        signupPageId: page.id, shootTypeId, date, startTime,
        durationMinutes: selectedType.duration_minutes, timezone: page.timezone,
      })
      setOpen(false)
      setDate('')
      onAdded()
    } catch (err) {
      console.error(err)
      setFormError('Something went wrong adding that slot.')
    } finally {
      setAdding(false)
    }
  }

  if (shootTypes.length === 0) return null

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs font-medium" style={{ color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer' }}>
        + Add a single slot manually
      </button>
    )
  }

  return (
    <div className="rounded-xl p-3 space-y-2" style={{ border: '1px solid var(--border)' }}>
      <select value={shootTypeId} onChange={e => setShootTypeId(e.target.value)}
        style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}>
        {shootTypes.map(t => <option key={t.id} value={t.id}>{t.name} ({t.duration_minutes} min)</option>)}
      </select>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13, boxSizing: 'border-box' }} />
        <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
          style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13, boxSizing: 'border-box' }} />
      </div>
      {selectedType && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Ends automatically after {selectedType.duration_minutes} minutes.</p>}
      {formError && <p className="text-xs" style={{ color: 'var(--danger)' }}>{formError}</p>}
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={handleAdd} disabled={adding}>{adding ? 'Adding...' : 'Add slot'}</Button>
        <Button variant="secondary" size="sm" onClick={() => setOpen(false)} disabled={adding}>Cancel</Button>
      </div>
    </div>
  )
}

function SlotDayRow({ day, dayData, isFirst, timezone, shootTypes, onDeleteSlot }) {
  const [expanded, setExpanded] = useState(false)
  const sorted = [...dayData.slots].sort((a, b) => new Date(a.start_time) - new Date(b.start_time))

  return (
    <div style={{ borderTop: isFirst ? 'none' : '1px solid var(--border)' }}>
      <button onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)' }}>
        <span>{day}</span>
        <span className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{dayData.claimed} of {dayData.total} claimed</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 11, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▾</span>
        </span>
      </button>
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
          {sorted.map(slot => {
            const shootType = shootTypes.find(t => t.id === slot.shoot_type_id)
            const time = new Date(slot.start_time).toLocaleTimeString('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit' })
            return (
              <div key={slot.id} className="flex items-center justify-between px-4 py-2.5 text-xs" style={{ borderTop: '1px solid var(--border)' }}>
                <div className="min-w-0">
                  <span className="font-medium" style={{ color: 'var(--text)' }}>{time}</span>
                  <span style={{ color: 'var(--text-muted)' }}> · {shootType?.name || 'Unknown'}</span>
                  {slot.claimed_at ? (
                    <div style={{ color: 'var(--text-muted)' }}>
                      {slot.client_name}{slot.client_pronouns && ` (${slot.client_pronouns})`} · {slot.client_email}
                      {slot.client_phone && ` · ${slot.client_phone}`}
                    </div>
                  ) : (
                    <div style={{ color: 'var(--text-muted)' }}>Open</div>
                  )}
                </div>
                {!slot.claimed_at && (
                  <button onClick={() => onDeleteSlot(slot.id)} title="Delete this open slot"
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 4, flexShrink: 0 }}>
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SignupPageDetailModal({ pageId, onClose, onChanged }) {
  const [page, setPage] = useState(null)
  const [slots, setSlots] = useState([])
  const [loading, setLoading] = useState(true)
  const [addingType, setAddingType] = useState(false)
  const [newTypeName, setNewTypeName] = useState('')
  const [newTypeDuration, setNewTypeDuration] = useState('15')
  const [newTypeSessionType, setNewTypeSessionType] = useState('Portrait')
  const [address, setAddress] = useState('')
  const [timezone, setTimezone] = useState('America/New_York')
  const [confirmationNote, setConfirmationNote] = useState('')
  const [notificationNote, setNotificationNote] = useState('')
  const [bookingDescription, setBookingDescription] = useState('')
  const [copied, setCopied] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmClearAll, setConfirmClearAll] = useState(false)
  const [clearingAll, setClearingAll] = useState(false)
  const [questionnaires, setQuestionnaires] = useState([])

  useEffect(() => { load() }, [pageId])

  async function handleClearAllOpenSlots() {
    setClearingAll(true)
    try {
      await deleteAllOpenSlots(pageId)
      setConfirmClearAll(false)
      await load()
    } catch (err) { console.error(err) }
    finally { setClearingAll(false) }
  }

  async function load({ silent = false } = {}) {
    // silent=true refreshes the underlying data without swapping the whole
    // modal to a loading spinner -- used after in-modal actions (slot
    // generation, manual add) where a full remount would wipe out that
    // action's own local success/error feedback (e.g. GenerateSlotsForm's
    // "X slots created" message) before the person ever sees it. The
    // genuine first-open load still shows the spinner normally.
    if (!silent) setLoading(true)
    try {
      const [p, s, q] = await Promise.all([getSignupPage(pageId), getSlots(pageId), getQuestionnaireTemplates()])
      setPage(p)
      setSlots(s)
      setQuestionnaires(q)
      setAddress(p.venue_address || '')
      setTimezone(p.timezone)
      setConfirmationNote(p.confirmation_note || '')
      setNotificationNote(p.notification_note || '')
      setBookingDescription(p.booking_description || '')
    } catch (err) { console.error(err) }
    finally { if (!silent) setLoading(false) }
  }

  async function handleSaveBookingDescription() {
    const updated = await updateSignupPage(pageId, { bookingDescription })
    setPage(updated ? { ...page, ...updated, signup_shoot_types: page.signup_shoot_types } : page)
  }

  async function handleSaveConfirmationNote() {
    const updated = await updateSignupPage(pageId, { confirmationNote })
    setPage(updated ? { ...page, ...updated, signup_shoot_types: page.signup_shoot_types } : page)
  }

  async function handleSaveNotificationNote() {
    const updated = await updateSignupPage(pageId, { notificationNote })
    setPage(updated ? { ...page, ...updated, signup_shoot_types: page.signup_shoot_types } : page)
  }

  async function handleAddressSelect({ address: streetAddress, city, state, lat, lng }) {
    const fullAddress = [streetAddress, city, state].filter(Boolean).join(', ')
    setAddress(fullAddress)
    const updated = await updateSignupPage(pageId, {
      venueAddress: fullAddress, venueLat: lat ?? null, venueLng: lng ?? null,
    })
    setPage(updated ? { ...page, ...updated, signup_shoot_types: page.signup_shoot_types } : page)
    onChanged()
  }

  async function handleTimezoneChange(tz) {
    setTimezone(tz)
    const updated = await updateSignupPage(pageId, { timezone: tz })
    setPage(updated ? { ...page, ...updated, signup_shoot_types: page.signup_shoot_types } : page)
  }

  async function handleToggleActive() {
    const updated = await updateSignupPage(pageId, { isActive: !page.is_active })
    setPage(updated ? { ...page, ...updated, signup_shoot_types: page.signup_shoot_types } : page)
    onChanged()
  }

  async function handleAddShootType() {
    if (!newTypeName.trim()) return
    const created = await createShootType({
      signupPageId: pageId, name: newTypeName, durationMinutes: parseInt(newTypeDuration, 10) || 15,
      sessionType: newTypeSessionType, sortOrder: page.signup_shoot_types.length,
    })
    setPage(prev => ({ ...prev, signup_shoot_types: [...prev.signup_shoot_types, created] }))
    setNewTypeName(''); setNewTypeDuration('15'); setAddingType(false)
    onChanged()
  }

  async function handleUpdateShootType(updated) {
    setPage(prev => ({ ...prev, signup_shoot_types: prev.signup_shoot_types.map(t => t.id === updated.id ? updated : t) }))
  }

  async function handleDeleteShootType(id) {
    await deleteShootType(id)
    setPage(prev => ({ ...prev, signup_shoot_types: prev.signup_shoot_types.filter(t => t.id !== id) }))
    onChanged()
  }

  async function handleDeletePage() {
    await deleteSignupPage(pageId)
    onChanged()
    onClose()
  }

  const bookingUrl = page ? `${window.location.origin}/book/${page.token}` : ''

  function handleCopyLink() {
    navigator.clipboard.writeText(bookingUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const slotsByDay = {}
  for (const s of slots) {
    const day = new Date(s.start_time).toLocaleDateString('en-US', { timeZone: page?.timezone, weekday: 'short', month: 'short', day: 'numeric' })
    if (!slotsByDay[day]) slotsByDay[day] = { total: 0, claimed: 0, slots: [] }
    slotsByDay[day].total++
    if (s.claimed_at) slotsByDay[day].claimed++
    slotsByDay[day].slots.push(s)
  }

  async function handleDeleteSlot(slotId) {
    await deleteSlot(slotId)
    setSlots(prev => prev.filter(s => s.id !== slotId))
  }

  return (
    <Modal title={page?.title || 'Signup page'} onClose={onClose} size="lg">
      {loading || !page ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Link + active toggle */}
          <div className="rounded-xl p-3 flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 min-w-0">
              <Link2 size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <span className="text-xs flex-1 min-w-0 truncate" style={{ color: 'var(--text-muted)' }}>{bookingUrl}</span>
              <button onClick={handleCopyLink} className="text-xs font-medium px-2.5 py-1.5 rounded-lg flex items-center gap-1 shrink-0"
                style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                {copied ? <Check size={12} /> : <Copy size={12} />}{copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="flex items-center justify-between sm:justify-start sm:ml-auto gap-3">
              <RouterLink to={`/sessions/signups/${page.id}/status`} target="_blank" rel="noopener noreferrer"
                className="text-xs font-medium px-2.5 py-1.5 rounded-lg flex items-center gap-1 shrink-0"
                style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', textDecoration: 'none' }}>
                Live status
              </RouterLink>
              <Toggle checked={page.is_active} onChange={handleToggleActive} label={page.is_active ? 'Active' : 'Inactive'} />
            </div>
          </div>

          {/* Booking page description -- shown to clients on the public
              booking page itself, right below the title/venue header.
              Per-page like the email notes, since a welcome message for
              GenCon shouldn't have to be the same one shown for every
              other event. */}
          <div>
            <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }}>Booking page description</label>
            <p className="text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Shown to clients on the public booking page, above the shoot type options.</p>
            <textarea value={bookingDescription} onChange={e => setBookingDescription(e.target.value)} onBlur={handleSaveBookingDescription}
              placeholder="Thank you for your interest in booking a session! Select a shoot type below, then pick an available time."
              rows={3}
              style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', resize: 'vertical' }} />
          </div>

          {/* Venue + timezone */}
          <div>
            <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }}>Venue</label>
            <div className="relative">
              <MapPin size={14} style={{ position: 'absolute', left: 12, top: 11, color: 'var(--text-muted)' }} />
              <AddressAutocomplete
                value={address}
                onChange={setAddress}
                onSelect={handleAddressSelect}
                style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '9px 12px 9px 34px', fontSize: 14 }}
              />
            </div>
            <div className="flex items-center gap-2 mt-2">
              <select value={timezone} onChange={e => handleTimezoneChange(e.target.value)}
                style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '7px 10px', fontSize: 12 }}>
                {COMMON_TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
              </select>
            </div>
          </div>

          {/* Booking emails -- per-page, so different events (different
              venues/instructions) can each have their own note rather
              than sharing one account-wide message */}
          <div>
            <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }}>Booking emails</label>
            <div className="space-y-2.5">
              <div>
                <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Client confirmation note (optional)</p>
                <textarea value={confirmationNote} onChange={e => setConfirmationNote(e.target.value)} onBlur={handleSaveConfirmationNote}
                  placeholder="e.g. Please arrive 10 minutes early. Parking is available on the 3rd floor."
                  rows={2}
                  style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', resize: 'vertical' }} />
              </div>
              <div>
                <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Your notification note (optional)</p>
                <textarea value={notificationNote} onChange={e => setNotificationNote(e.target.value)} onBlur={handleSaveNotificationNote}
                  placeholder="e.g. Remember to confirm equipment availability for this event."
                  rows={2}
                  style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', resize: 'vertical' }} />
              </div>
            </div>
          </div>

          {/* Shoot types */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>Shoot types</label>
              {!addingType && (
                <button onClick={() => setAddingType(true)} className="text-xs font-medium" style={{ color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer' }}>
                  + Add shoot type
                </button>
              )}
            </div>
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              {page.signup_shoot_types.length === 0 && !addingType && (
                <p className="text-xs px-4 py-3" style={{ color: 'var(--text-muted)' }}>No shoot types yet.</p>
              )}
              {page.signup_shoot_types.map(t => (
                <ShootTypeRow key={t.id} shootType={t} allQuestionnaires={questionnaires} onUpdated={handleUpdateShootType} onDeleted={handleDeleteShootType} />
              ))}
              {addingType && (
                <div className="flex items-center gap-2 px-4 py-3" style={{ borderTop: page.signup_shoot_types.length > 0 ? '1px solid var(--border)' : 'none' }}>
                  <input value={newTypeName} onChange={e => setNewTypeName(e.target.value)} placeholder="Cosplay Portrait" autoFocus
                    style={{ flex: 2, background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '7px 10px', fontSize: 13 }} />
                  <input type="number" min="5" step="5" value={newTypeDuration} onChange={e => setNewTypeDuration(e.target.value)}
                    style={{ width: 64, background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '7px 10px', fontSize: 13 }} />
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>min</span>
                  <select value={newTypeSessionType} onChange={e => setNewTypeSessionType(e.target.value)}
                    style={{ flex: 1, background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '7px 10px', fontSize: 13 }}>
                    {SESSION_TYPES.map(st => <option key={st} value={st}>{st}</option>)}
                  </select>
                  <button onClick={handleAddShootType} disabled={!newTypeName.trim()} className="text-xs font-medium px-2.5 py-1.5 rounded-lg"
                    style={{ background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer' }}>Add</button>
                  <button onClick={() => setAddingType(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}>
                    <X size={15} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Slot generator */}
          <div>
            <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }}>Generate time slots</label>
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              <GenerateSlotsForm page={page} shootTypes={page.signup_shoot_types} onGenerated={() => load({ silent: true })} />
            </div>
            <div className="mt-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <ManualAddSlotForm page={page} shootTypes={page.signup_shoot_types} onAdded={() => load({ silent: true })} />
              {slots.some(s => !s.claimed_at) && (
                confirmClearAll ? (
                  <div className="flex items-center flex-wrap gap-2">
                    <span className="text-xs" style={{ color: 'var(--danger)' }}>Remove all open slots?</span>
                    <Button variant="danger" size="sm" onClick={handleClearAllOpenSlots} disabled={clearingAll}>
                      {clearingAll ? 'Clearing...' : 'Confirm'}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setConfirmClearAll(false)}>Cancel</Button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmClearAll(true)} className="text-xs font-medium text-left" style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}>
                    Clear all open slots
                  </button>
                )
              )}
            </div>
          </div>

          {/* Slot summary by day */}
          {Object.keys(slotsByDay).length > 0 && (
            <div>
              <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }}>Slots by day</label>
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                {Object.entries(slotsByDay).map(([day, dayData], i) => (
                  <SlotDayRow key={day} day={day} dayData={dayData} isFirst={i === 0}
                    timezone={page.timezone} shootTypes={page.signup_shoot_types}
                    onDeleteSlot={handleDeleteSlot} />
                ))}
              </div>
            </div>
          )}

          {/* Danger zone */}
          <div className="pt-2" style={{ borderTop: '1px solid var(--border)' }}>
            {!confirmDelete ? (
              <button onClick={() => setConfirmDelete(true)} className="text-xs font-medium" style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}>
                Delete signup page
              </button>
            ) : (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)' }}>
                <p className="text-sm flex-1 font-medium" style={{ color: 'var(--danger)' }}>Delete this page and all its slots? Bookings already made stay as real sessions.</p>
                <Button variant="danger" size="sm" onClick={handleDeletePage}>Confirm</Button>
                <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}

function SignupPagesView({ pages, loading, onCreate, onOpen }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
      </div>
    )
  }
  if (pages.length === 0) {
    return (
      <div className="py-20 text-center rounded-2xl" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
        <TicketIcon size={32} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
        <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>No signup pages yet</p>
        <p className="text-xs mt-1 mb-4" style={{ color: 'var(--text-muted)' }}>Create one to let clients book their own session slots</p>
        <button onClick={onCreate} className="text-sm font-medium px-4 py-2 rounded-lg" style={{ background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer' }}>
          New signup page
        </button>
      </div>
    )
  }
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
      {pages.map(p => <SignupPageCard key={p.id} page={p} onOpen={() => onOpen(p.id)} />)}
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
  const [filterType, setFilterType] = useState(null)
  const [filterPayment, setFilterPayment] = useState(null)
  const [sortBy, setSortBy] = useState('date_desc')
  const [showNew, setShowNew] = useState(false)
  const [view, setView] = useState(() => window.innerWidth >= 768 ? 'kanban' : 'list')
  const [signupPages, setSignupPages] = useState([])
  const [loadingSignups, setLoadingSignups] = useState(false)
  const [showNewSignup, setShowNewSignup] = useState(false)
  const [openSignupPageId, setOpenSignupPageId] = useState(null)

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (view === 'signups' && signupPages.length === 0) loadSignupPages()
  }, [view])

  async function loadSignupPages() {
    setLoadingSignups(true)
    try {
      const data = await getSignupPages()
      setSignupPages(data)
    } catch (err) { console.error(err) }
    finally { setLoadingSignups(false) }
  }

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
    const matchesType = !filterType || s.type === filterType
    const matchesPayment = !filterPayment || s.payment_status === filterPayment
    return matchesSearch && matchesStatus && matchesMode && matchesType && matchesPayment
  }).sort((a, b) => {
    switch (sortBy) {
      case 'date_asc':
        return new Date(a.session_date || 0) - new Date(b.session_date || 0)
      case 'created_desc':
        return new Date(b.created_at) - new Date(a.created_at)
      case 'client_asc': {
        const an = a.clients ? `${a.clients.first_name} ${a.clients.last_name}` : ''
        const bn = b.clients ? `${b.clients.first_name} ${b.clients.last_name}` : ''
        return an.localeCompare(bn)
      }
      case 'date_desc':
      default:
        return new Date(b.session_date || 0) - new Date(a.session_date || 0)
    }
  })

  return (
    <div className="space-y-5">

      {/* Header — always full width */}
      <PageHeader
        title="Sessions"
        subtitle={`${sessions.length} ${sessions.length === 1 ? 'session' : 'sessions'}`}
        search={(loading || sessions.length > 0) ? { value: search, onChange: setSearch, placeholder: 'Search sessions or clients...' } : undefined}
        filterSections={(loading || sessions.length > 0) ? [
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
          {
            key: 'type', label: 'Type', type: 'select',
            value: filterType, onChange: setFilterType,
            options: SESSION_TYPES.map(t => ({ value: t, label: t })),
          },
          {
            key: 'payment', label: 'Payment status', type: 'select',
            value: filterPayment, onChange: setFilterPayment,
            options: PAYMENT_STATUSES.map(p => ({ value: p.value, label: p.label })),
          },
          {
            key: 'sort', label: 'Sort by', type: 'sort',
            value: sortBy, onChange: setSortBy,
            options: [
              { value: 'date_desc', label: 'Session Date: New \u2192 Old' },
              { value: 'date_asc', label: 'Session Date: Old \u2192 New' },
              { value: 'client_asc', label: 'Client: A \u2192 Z' },
              { value: 'created_desc', label: 'Recently created' },
            ],
          },
        ] : undefined}
        onClearAllFilters={() => { setFilterStatus(null); setFilterMode(null); setFilterType(null); setFilterPayment(null); setSearch('') }}
        primaryAction={view === 'signups'
          ? { label: 'New signup page', icon: Plus, onClick: () => setShowNewSignup(true) }
          : { label: 'New Session', icon: Plus, onClick: () => setShowNew(true) }}
        extra={
          <div>
            <p className="text-xs font-medium mb-1.5 md:hidden" style={{ color: 'var(--text-muted)' }}>View</p>
            <div className="flex items-center rounded-full p-0.5 w-full md:w-auto" style={{ background: 'var(--bg-subtle)' }}>
              <button onClick={() => setView('kanban')} className="flex-1 md:flex-none flex items-center justify-center gap-1 py-1.5 px-0 md:px-3 rounded-full text-xs font-medium whitespace-nowrap"
                style={{ background: view === 'kanban' ? 'var(--surface)' : 'transparent', color: view === 'kanban' ? 'var(--text)' : 'var(--text-muted)', border: 'none', cursor: 'pointer' }}>
                <Columns size={12} />Board
              </button>
              <button onClick={() => setView('list')} className="flex-1 md:flex-none flex items-center justify-center gap-1 py-1.5 px-0 md:px-3 rounded-full text-xs font-medium whitespace-nowrap"
                style={{ background: view === 'list' ? 'var(--surface)' : 'transparent', color: view === 'list' ? 'var(--text)' : 'var(--text-muted)', border: 'none', cursor: 'pointer' }}>
                <LayoutList size={12} />List
              </button>
              <button onClick={() => setView('signups')} className="flex-1 md:flex-none flex items-center justify-center gap-1 py-1.5 px-0 md:px-3 rounded-full text-xs font-medium whitespace-nowrap"
                style={{ background: view === 'signups' ? 'var(--surface)' : 'transparent', color: view === 'signups' ? 'var(--text)' : 'var(--text-muted)', border: 'none', cursor: 'pointer' }}>
                <TicketIcon size={12} />Sign-ups
              </button>
            </div>
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

      {/* Sign-ups view */}
      {view === 'signups' && (
        <div className="max-w-4xl">
          <SignupPagesView
            pages={signupPages}
            loading={loadingSignups}
            onCreate={() => setShowNewSignup(true)}
            onOpen={setOpenSignupPageId}
          />
        </div>
      )}

      {showNew && <NewSessionModal onClose={() => setShowNew(false)} onCreated={handleCreated} />}
      {showNewSignup && (
        <NewSignupPageModal
          onClose={() => setShowNewSignup(false)}
          onCreated={page => { setShowNewSignup(false); setOpenSignupPageId(page.id); loadSignupPages() }}
        />
      )}
      {openSignupPageId && (
        <SignupPageDetailModal
          pageId={openSignupPageId}
          onClose={() => setOpenSignupPageId(null)}
          onChanged={loadSignupPages}
        />
      )}
    </div>
  )
}
