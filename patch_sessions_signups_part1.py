import pathlib

path = pathlib.Path("src/routes/Sessions.jsx")
src = path.read_text()

# 1. Imports
old_imports = """import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, CalendarDays, X, LayoutList, Columns,
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
import PlaceAutocomplete from '../components/ui/PlaceAutocomplete.jsx'
import Button from '../components/ui/Button.jsx'
import Input from '../components/ui/Input.jsx'
import Toggle from '../components/ui/Toggle.jsx'
import KanbanBoard from '../components/ui/KanbanBoard.jsx'
import BottomSheet from '../components/layout/BottomSheet.jsx'
import Modal from '../components/ui/Modal.jsx'
import ClientPicker from '../components/ui/ClientPicker.jsx'"""

assert src.count(old_imports) == 1, "imports anchor not found or not unique"

new_imports = """import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, CalendarDays, X, LayoutList, Columns, Link2, Copy, Check, Trash2, MapPin, Ticket as TicketIcon,
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
} from '../utils/signupApi.js'
import { resolveTimezone, COMMON_TIMEZONES } from '../utils/timezoneApi.js'
import AddressAutocomplete from '../components/ui/AddressAutocomplete.jsx'
import PlaceAutocomplete from '../components/ui/PlaceAutocomplete.jsx'
import Button from '../components/ui/Button.jsx'
import Input from '../components/ui/Input.jsx'
import Toggle from '../components/ui/Toggle.jsx'
import KanbanBoard from '../components/ui/KanbanBoard.jsx'
import BottomSheet from '../components/layout/BottomSheet.jsx'
import Modal from '../components/ui/Modal.jsx'
import ClientPicker from '../components/ui/ClientPicker.jsx'"""

src = src.replace(old_imports, new_imports)

# 2. New components, inserted right before the main `export default function Sessions()`
old_anchor = "export default function Sessions() {"
assert src.count(old_anchor) == 1, "main component anchor not found or not unique"

new_components = '''// ── Sign-ups ─────────────────────────────────────────────────────────────────

function SignupPageCard({ page, onOpen }) {
  const openCount = page.slot_total - page.slot_claimed
  return (
    <button onClick={onOpen} className="w-full text-left rounded-2xl p-4 transition-colors"
      style={{ border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
      onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}>
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{page.title}</p>
        {!page.is_active && (
          <span className="text-xs px-2 py-0.5 rounded-full shrink-0" style={{ background: 'var(--surface-raised)', color: 'var(--text-muted)' }}>Inactive</span>
        )}
      </div>
      <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
        {page.venue_address || 'No venue set yet'}
      </p>
      <div className="flex items-center gap-4 mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
        <span>{page.shoot_type_count} shoot type{page.shoot_type_count === 1 ? '' : 's'}</span>
        <span>{page.slot_claimed} of {page.slot_total} claimed</span>
        {page.slot_total > 0 && <span>{openCount} open</span>}
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

function ShootTypeRow({ shootType, onUpdated, onDeleted }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(shootType.name)
  const [duration, setDuration] = useState(String(shootType.duration_minutes))
  const [sessionType, setSessionType] = useState(shootType.session_type)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      const updated = await updateShootType(shootType.id, {
        name, durationMinutes: parseInt(duration, 10) || shootType.duration_minutes, sessionType,
      })
      onUpdated(updated)
      setEditing(false)
    } catch (err) { console.error(err) }
    finally { setSaving(false) }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderTop: '1px solid var(--border)' }}>
        <input value={name} onChange={e => setName(e.target.value)}
          style={{ flex: 2, background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '7px 10px', fontSize: 13 }} />
        <input type="number" min="5" step="5" value={duration} onChange={e => setDuration(e.target.value)}
          style={{ width: 64, background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '7px 10px', fontSize: 13 }} />
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>min</span>
        <select value={sessionType} onChange={e => setSessionType(e.target.value)}
          style={{ flex: 1, background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '7px 10px', fontSize: 13 }}>
          {SESSION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={handleSave} disabled={saving} className="text-xs font-medium px-2.5 py-1.5 rounded-lg"
          style={{ background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer' }}>
          {saving ? '...' : 'Save'}
        </button>
        <button onClick={() => setEditing(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}>
          <X size={15} />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid var(--border)' }}>
      <button onClick={() => setEditing(true)} className="text-left flex-1 min-w-0" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
        <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{shootType.name}</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{shootType.duration_minutes} min · {shootType.session_type}</p>
      </button>
      <button onClick={() => onDeleted(shootType.id)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 4 }}>
        <Trash2 size={14} />
      </button>
    </div>
  )
}

function GenerateSlotsForm({ page, shootTypes, onGenerated }) {
  const [shootTypeId, setShootTypeId] = useState(shootTypes[0]?.id || '')
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('10:00')
  const [endTime, setEndTime] = useState('18:00')
  const [buffer, setBuffer] = useState('5')
  const [generating, setGenerating] = useState(false)
  const [lastCount, setLastCount] = useState(null)

  const selectedType = shootTypes.find(t => t.id === shootTypeId)

  async function handleGenerate() {
    if (!shootTypeId || !date || !selectedType) return
    setGenerating(true)
    setLastCount(null)
    try {
      const created = await generateSlots({
        signupPageId: page.id, shootTypeId, date, startTime, endTime,
        durationMinutes: selectedType.duration_minutes,
        bufferMinutes: parseInt(buffer, 10) || 0,
        timezone: page.timezone,
      })
      setLastCount(created.length)
      onGenerated()
    } catch (err) { console.error(err) }
    finally { setGenerating(false) }
  }

  if (shootTypes.length === 0) {
    return <p className="text-xs px-4 py-3" style={{ color: 'var(--text-muted)' }}>Add a shoot type above before generating slots.</p>
  }

  return (
    <div className="px-4 py-3 space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        <select value={shootTypeId} onChange={e => setShootTypeId(e.target.value)}
          style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}>
          {shootTypes.map(t => <option key={t.id} value={t.id}>{t.name} ({t.duration_minutes} min)</option>)}
        </select>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13 }} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
          style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13 }} />
        <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
          style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13 }} />
        <div className="flex items-center gap-1.5">
          <input type="number" min="0" step="5" value={buffer} onChange={e => setBuffer(e.target.value)}
            style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13 }} />
          <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>min buffer</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="secondary" onClick={handleGenerate} disabled={!date || generating}>
          {generating ? 'Generating...' : 'Generate slots for this day'}
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
  const [resolvingTz, setResolvingTz] = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => { load() }, [pageId])

  async function load() {
    setLoading(true)
    try {
      const [p, s] = await Promise.all([getSignupPage(pageId), getSlots(pageId)])
      setPage(p)
      setSlots(s)
      setAddress(p.venue_address || '')
      setTimezone(p.timezone)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  async function handleAddressSelect({ address: streetAddress, city, state, lat, lng }) {
    const fullAddress = [streetAddress, city, state].filter(Boolean).join(', ')
    setAddress(fullAddress)
    let resolvedTz = timezone
    if (lat != null && lng != null) {
      setResolvingTz(true)
      const tz = await resolveTimezone(lat, lng)
      setResolvingTz(false)
      if (tz) { resolvedTz = tz; setTimezone(tz) }
    }
    const updated = await updateSignupPage(pageId, {
      venueAddress: fullAddress, venueLat: lat ?? null, venueLng: lng ?? null, timezone: resolvedTz,
    })
    setPage(updated)
    onChanged()
  }

  async function handleTimezoneChange(tz) {
    setTimezone(tz)
    const updated = await updateSignupPage(pageId, { timezone: tz })
    setPage(updated)
  }

  async function handleToggleActive() {
    const updated = await updateSignupPage(pageId, { isActive: !page.is_active })
    setPage(updated)
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
    if (!slotsByDay[day]) slotsByDay[day] = { total: 0, claimed: 0 }
    slotsByDay[day].total++
    if (s.claimed_at) slotsByDay[day].claimed++
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
          <div className="rounded-xl p-3 flex items-center gap-3" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}>
            <Link2 size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <span className="text-xs flex-1 min-w-0 truncate" style={{ color: 'var(--text-muted)' }}>{bookingUrl}</span>
            <button onClick={handleCopyLink} className="text-xs font-medium px-2.5 py-1.5 rounded-lg flex items-center gap-1 shrink-0"
              style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer' }}>
              {copied ? <Check size={12} /> : <Copy size={12} />}{copied ? 'Copied' : 'Copy'}
            </button>
            <Toggle checked={page.is_active} onChange={handleToggleActive} label={page.is_active ? 'Active' : 'Inactive'} />
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
              {resolvingTz && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Detecting timezone...</span>}
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
                <ShootTypeRow key={t.id} shootType={t} onUpdated={handleUpdateShootType} onDeleted={handleDeleteShootType} />
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
              <GenerateSlotsForm page={page} shootTypes={page.signup_shoot_types} onGenerated={load} />
            </div>
          </div>

          {/* Slot summary by day */}
          {Object.keys(slotsByDay).length > 0 && (
            <div>
              <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }}>Slots by day</label>
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                {Object.entries(slotsByDay).map(([day, counts], i) => (
                  <div key={day} className="flex items-center justify-between px-4 py-2.5 text-sm"
                    style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none', color: 'var(--text)' }}>
                    <span>{day}</span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{counts.claimed} of {counts.total} claimed</span>
                  </div>
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

export default function Sessions() {'''

src = src.replace(old_anchor, new_components)

path.write_text(src)
print("Added Sign-ups components to Sessions.jsx (part 1 of 2 -- view wiring comes next)")
