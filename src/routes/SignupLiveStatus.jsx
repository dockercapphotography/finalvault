import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Wifi, WifiOff, Clock, Mail, Phone, MessageSquare, MoreVertical, Search, StickyNote, Contact, X } from 'lucide-react'
import { supabase } from '../supabaseClient.js'
import { getSignupPage, getSlots, claimSignupSlot, unclaimSlot, updateSlotNote } from '../utils/signupApi.js'
import BottomSheet from '../components/layout/BottomSheet.jsx'
import Modal from '../components/ui/Modal.jsx'
import FilterSortControl from '../components/ui/FilterSortControl.jsx'

// Realtime requires the table to have replication enabled in Supabase
// (Database -> Replication -> toggle signup_slots on) -- not automatic
// for new tables. Falls back to a periodic refetch if the realtime
// channel is unavailable or silently drops, since a flaky convention-hall
// WiFi connection is a real, ordinary occurrence, not an edge case. Worth
// noting the double-booking guarantee itself doesn't depend on this page
// at all -- that's enforced at the database level by the exclusion
// constraint regardless of what's on screen here, so the worst case of a
// dropped connection is a stale display, not a real conflict.
const FALLBACK_REFETCH_MS = 30_000

// How often the "current time" ticker (Happening now / Next up card, and
// the past-slot dimming) refreshes. Doesn't need to be second-accurate --
// this is a glance-at-your-phone display, not a countdown timer.
const NOW_TICK_MS = 30_000

// Same list already used for clients/booking elsewhere in the app
// (ClientDetail.jsx, Clients.jsx, SignupBooking.jsx) -- kept in sync
// manually since it's just a few inline <option> tags, not an extracted
// shared constant.
const PRONOUN_OPTIONS = ['she/her', 'he/him', 'they/them', 'she/they', 'he/they', 'ze/hir', 'xe/xem', 'Prefer not to say']

function timeLabel(iso, timezone) {
  return new Date(iso).toLocaleTimeString('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit' })
}

function dayLabel(iso, timezone) {
  return new Date(iso).toLocaleDateString('en-US', { timeZone: timezone, weekday: 'short', month: 'short', day: 'numeric' })
}

function dayKey(iso, timezone) {
  // en-CA gives YYYY-MM-DD, a clean sortable/comparable key
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: timezone })
}

function formatCountdown(ms) {
  const mins = Math.round(ms / 60_000)
  if (mins <= 0) return 'starting now'
  if (mins < 60) return `in ${mins} min`
  const hours = Math.floor(mins / 60)
  const rem = mins % 60
  return `in ${hours}h${rem ? ` ${rem}m` : ''}`
}

// Matches Tailwind's md: breakpoint (768px), used elsewhere on this page
// (e.g. the Contact icon vs. Call/Text/Email split) -- so "desktop" means
// the same thing everywhere on this page, not just visually via CSS.
function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mql = window.matchMedia(query)
    const handler = () => setMatches(mql.matches)
    handler()
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [query])
  return matches
}

function ProgressStat({ claimed, total }) {
  const pct = total > 0 ? Math.round((claimed / total) * 100) : 0
  const open = total - claimed
  return (
    <div className="rounded-2xl px-4 py-3.5 mb-4 flex items-center justify-between" style={{ background: 'rgba(99,102,241,0.1)' }}>
      <div>
        <p className="m-0" style={{ fontSize: 22, fontWeight: 500, color: '#26215C' }}>
          {claimed}<span style={{ fontSize: 14, fontWeight: 400, color: '#534AB7' }}> / {total} claimed</span>
        </p>
        <p className="text-xs mt-0.5" style={{ color: '#534AB7' }}>
          {total === 0 ? 'No slots yet' : open === 0 ? 'Fully booked' : `${open} slot${open === 1 ? '' : 's'} still open`}
        </p>
      </div>
      <div className="rounded-full flex items-center justify-center flex-shrink-0"
        style={{ width: 44, height: 44, background: `conic-gradient(#6366f1 0% ${pct}%, #CECBF6 ${pct}% 100%)` }}>
        <div className="rounded-full flex items-center justify-center" style={{ width: 32, height: 32, background: '#EEEDFE' }}>
          <span style={{ fontSize: 11, fontWeight: 500, color: '#3C3489' }}>{pct}%</span>
        </div>
      </div>
    </div>
  )
}

// "Happening now" / "Next up" card -- computed across ALL of the page's
// slots (not just whichever day is currently selected), so it stays
// accurate even while browsing a different day's tab.
function NowCard({ activeSlot, nextSlot, shootTypes, now, timezone }) {
  const activeType = activeSlot ? shootTypes.find(t => t.id === activeSlot.shoot_type_id) : null
  const nextType = nextSlot ? shootTypes.find(t => t.id === nextSlot.shoot_type_id) : null

  return (
    <div className="rounded-2xl px-4 py-3.5 mb-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-1.5 mb-2">
        <Clock size={12} style={{ color: 'var(--text-muted)' }} />
        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
          {now.toLocaleTimeString('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit' })}
        </span>
      </div>

      {activeSlot ? (
        <div>
          <p className="text-xs font-medium" style={{ color: activeSlot.claimed_at ? '#6366f1' : 'var(--text-muted)' }}>Happening now</p>
          <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--text)' }}>
            {activeSlot.claimed_at ? activeSlot.client_name : 'Open slot'}
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {activeType?.name || 'Unknown shoot type'} · until {timeLabel(activeSlot.end_time, timezone)}
          </p>
        </div>
      ) : (
        <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>No session right now</p>
      )}

      {nextSlot && (
        <div className="mt-2.5 pt-2.5" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Next: <span style={{ color: 'var(--text)', fontWeight: 500 }}>
              {nextSlot.claimed_at ? nextSlot.client_name : (nextType?.name || 'Open slot')}
            </span> at {timeLabel(nextSlot.start_time, timezone)} ({formatCountdown(new Date(nextSlot.start_time) - now)})
          </p>
        </div>
      )}
    </div>
  )
}

// Shared form fields for registering a walk-up client directly against
// an open slot. Calls the exact same claim_signup_slot RPC the public
// booking page uses (via claimSignupSlot in signupApi.js), so the
// resulting client match/create, session creation, questionnaire
// assignment, and confirmation/notification emails are identical to a
// normal signup -- no duplicated business logic here. Used by both the
// desktop modal and the mobile bottom sheet below.
function WalkupRegisterFields({ slot, onRegistered }) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [pronouns, setPronouns] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const canSubmit = firstName.trim() && lastName.trim() && email.trim()

  async function handleSubmit() {
    if (!canSubmit || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await claimSignupSlot({ slotId: slot.id, firstName, lastName, email, phone, pronouns })
      if (result.success) {
        onRegistered()
      } else if (result.error === 'already_claimed' || result.error === 'conflicts_with_existing_booking') {
        setError('This slot was just claimed by someone else.')
      } else {
        setError('Something went wrong. Please try again.')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle = {
    width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)',
    color: 'var(--text)', borderRadius: 8, padding: '10px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" style={inputStyle} />
        <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last name" style={inputStyle} />
      </div>
      <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email" style={inputStyle} />
      <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone (optional)" style={inputStyle} />
      <select value={pronouns} onChange={e => setPronouns(e.target.value)} style={inputStyle}>
        <option value="">Pronouns (optional)</option>
        {PRONOUN_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
      </select>
      {error && <p className="text-xs" style={{ color: 'var(--danger)' }}>{error}</p>}
      <button onClick={handleSubmit} disabled={!canSubmit || submitting}
        className="w-full text-sm font-semibold py-3 rounded-xl"
        style={{ background: '#6366f1', color: '#fff', border: 'none', cursor: canSubmit ? 'pointer' : 'not-allowed', opacity: !canSubmit || submitting ? 0.6 : 1 }}>
        {submitting ? 'Registering...' : 'Register & confirm booking'}
      </button>
      <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
        This creates a real booking — the client gets the same confirmation email as a normal signup.
      </p>
    </div>
  )
}

// Desktop-only: the app's standard pop-up for forms -- the same shared
// Modal component used elsewhere (e.g. the signup page editor), rather
// than a bottom sheet, since desktop has room for a proper centered
// dialog.
function WalkupRegisterModal({ slot, shootType, timezone, onClose, onRegistered }) {
  if (!slot) return null
  return (
    <Modal title="Register walk-up" onClose={onClose} size="sm">
      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
        {shootType?.name || 'Unknown shoot type'} · {timeLabel(slot.start_time, timezone)}
      </p>
      <WalkupRegisterFields slot={slot} onRegistered={onRegistered} />
    </Modal>
  )
}

// Mobile-only: slide-up bottom sheet, same fields as the desktop modal
// above (via WalkupRegisterFields) but in the mobile-appropriate
// container.
function WalkupRegisterSheet({ slot, shootType, timezone, onClose, onRegistered }) {
  return (
    <BottomSheet open={!!slot} onClose={onClose}>
      <div className="px-5 pb-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Register walk-up</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>
        {slot && (
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
            {shootType?.name || 'Unknown shoot type'} · {timeLabel(slot.start_time, timezone)}
          </p>
        )}
        {slot && <WalkupRegisterFields slot={slot} onRegistered={onRegistered} />}
      </div>
    </BottomSheet>
  )
}

// Shared inner content for a claimed slot's secondary actions: a
// private (photographer-only) note, and freeing the slot back up for a
// no-show or booking mistake. Unclaiming deliberately leaves the client
// and session records alone -- see unclaimSlot's own comment in
// signupApi.js -- it only resets the slot itself. Used by both the
// desktop popover and the mobile bottom sheet below, so the two share
// identical behavior and only differ in their container.
function SlotActionsFields({ slot, onUnclaimed, onNoteSaved, compact }) {
  const [note, setNote] = useState(slot?.photographer_note || '')
  const [savingNote, setSavingNote] = useState(false)
  const [confirmNoShow, setConfirmNoShow] = useState(false)
  const [unclaiming, setUnclaiming] = useState(false)
  const [error, setError] = useState(null)

  async function handleSaveNote() {
    setSavingNote(true)
    setError(null)
    try {
      await updateSlotNote(slot.id, note)
      onNoteSaved()
    } catch {
      setError('Could not save the note. Try again.')
    } finally {
      setSavingNote(false)
    }
  }

  async function handleUnclaim() {
    setUnclaiming(true)
    setError(null)
    try {
      await unclaimSlot(slot.id)
      onUnclaimed()
    } catch {
      setError('Could not free up this slot. Try again.')
    } finally {
      setUnclaiming(false)
    }
  }

  const inputStyle = {
    width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)',
    color: 'var(--text)', borderRadius: 8, padding: compact ? '8px 10px' : '10px 12px',
    fontSize: compact ? 13 : 14, outline: 'none', boxSizing: 'border-box', resize: 'vertical',
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Private note</label>
        {!compact && <p className="text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Only you see this — never shown to the client.</p>}
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
          placeholder="e.g. Brought a friend"
          style={inputStyle} />
        <button onClick={handleSaveNote} disabled={savingNote}
          className="text-xs font-medium mt-1"
          style={{ color: '#6366f1', background: 'none', border: 'none', cursor: savingNote ? 'default' : 'pointer', padding: 0 }}>
          {savingNote ? 'Saving...' : 'Save note'}
        </button>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
        {!confirmNoShow ? (
          <button onClick={() => setConfirmNoShow(true)}
            className="text-xs font-medium"
            style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            Mark as no-show
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-xs" style={{ color: 'var(--danger)' }}>
              Reopens the slot for someone else. The client and session stay in your records.
            </p>
            <div className="flex items-center gap-2">
              <button onClick={handleUnclaim} disabled={unclaiming}
                className="text-xs font-medium px-2.5 py-1.5 rounded-lg"
                style={{ background: 'var(--danger)', color: '#fff', border: 'none', cursor: unclaiming ? 'default' : 'pointer' }}>
                {unclaiming ? 'Freeing...' : 'Confirm'}
              </button>
              <button onClick={() => setConfirmNoShow(false)}
                className="text-xs font-medium px-2.5 py-1.5 rounded-lg"
                style={{ background: 'var(--surface-raised)', color: 'var(--text-muted)', border: 'none', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-xs" style={{ color: 'var(--danger)' }}>{error}</p>}
    </div>
  )
}

// Desktop-only: small anchored popover (portal + real screen coordinates,
// same technique FilterSortControl's desktop panel and multiSelect
// dropdown already use elsewhere in the app). Flips to open upward
// instead of downward when there isn't enough room below the trigger,
// so it never renders off the bottom of the screen.
function SlotActionsPopover({ slot, anchorEl, onClose, onUnclaimed, onNoteSaved }) {
  const [pos, setPos] = useState(null)
  const popoverRef = useRef(null)
  const estimatedHeight = 220

  useEffect(() => {
    function updatePos() {
      if (!anchorEl) return
      const rect = anchorEl.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      const openUpward = spaceBelow < estimatedHeight && rect.top > spaceBelow
      setPos({
        top: openUpward ? null : rect.bottom + 6,
        bottom: openUpward ? window.innerHeight - rect.top + 6 : null,
        right: Math.max(16, window.innerWidth - rect.right),
      })
    }
    updatePos()
    window.addEventListener('resize', updatePos)
    return () => window.removeEventListener('resize', updatePos)
  }, [anchorEl])

  useEffect(() => {
    function handleClickOutside(e) {
      if (anchorEl?.contains(e.target)) return
      if (popoverRef.current?.contains(e.target)) return
      onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [anchorEl, onClose])

  if (!slot || !pos) return null

  return createPortal(
    <div ref={popoverRef}
      style={{
        position: 'fixed', top: pos.top ?? undefined, bottom: pos.bottom ?? undefined, right: pos.right,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)',
        zIndex: 100, padding: 14, width: 260, maxWidth: 'calc(100vw - 32px)',
        maxHeight: 'calc(100vh - 32px)', overflowY: 'auto',
      }}>
      <p className="text-xs font-medium mb-2 truncate" style={{ color: 'var(--text)' }}>{slot.client_name}</p>
      <SlotActionsFields slot={slot} onUnclaimed={onUnclaimed} onNoteSaved={onNoteSaved} compact />
    </div>,
    document.body
  )
}

// Mobile-only: full slide-up bottom sheet, same content as the desktop
// popover above (via SlotActionsFields) but in the mobile-appropriate
// container.
function SlotActionsSheet({ slot, onClose, onUnclaimed, onNoteSaved }) {
  return (
    <BottomSheet open={!!slot} onClose={onClose}>
      {slot && (
        <div className="px-5 pb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold truncate" style={{ color: 'var(--text)' }}>{slot.client_name}</h2>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', flexShrink: 0 }}>
              <X size={18} />
            </button>
          </div>
          <SlotActionsFields slot={slot} onUnclaimed={onUnclaimed} onNoteSaved={onNoteSaved} />
        </div>
      )}
    </BottomSheet>
  )
}

// Mobile-only bottom sheet consolidating Call/Text/Email into one place,
// opened from a single "Contact" icon -- replaces three separate icons
// that didn't leave the name/email enough room on a narrow screen.
// Desktop keeps the three icons inline, unchanged, since there's room.
function ContactSheet({ slot, onClose }) {
  const rowStyle = {
    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px',
    textDecoration: 'none', color: 'var(--text)',
  }
  const iconWrapStyle = {
    width: 36, height: 36, borderRadius: '50%', background: 'var(--bg-subtle)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  }

  return (
    <BottomSheet open={!!slot} onClose={onClose}>
      {slot && (
        <div className="pb-4">
          <div className="flex items-center justify-between px-5 pb-2">
            <h2 className="text-base font-semibold truncate" style={{ color: 'var(--text)' }}>{slot.client_name}</h2>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', flexShrink: 0 }}>
              <X size={18} />
            </button>
          </div>
          {slot.client_phone && (
            <a href={`tel:${slot.client_phone}`} style={rowStyle}>
              <div style={iconWrapStyle}><Phone size={15} style={{ color: 'var(--text-muted)' }} /></div>
              <div className="min-w-0">
                <p className="text-sm font-medium" style={{ margin: 0 }}>Call</p>
                <p className="text-xs truncate" style={{ color: 'var(--text-muted)', margin: 0 }}>{slot.client_phone}</p>
              </div>
            </a>
          )}
          {slot.client_phone && (
            <a href={`sms:${slot.client_phone}`} style={rowStyle}>
              <div style={iconWrapStyle}><MessageSquare size={15} style={{ color: 'var(--text-muted)' }} /></div>
              <div className="min-w-0">
                <p className="text-sm font-medium" style={{ margin: 0 }}>Text</p>
                <p className="text-xs truncate" style={{ color: 'var(--text-muted)', margin: 0 }}>{slot.client_phone}</p>
              </div>
            </a>
          )}
          <a href={`mailto:${slot.client_email}`} style={rowStyle}>
            <div style={iconWrapStyle}><Mail size={15} style={{ color: 'var(--text-muted)' }} /></div>
            <div className="min-w-0">
              <p className="text-sm font-medium" style={{ margin: 0 }}>Email</p>
              <p className="text-xs truncate" style={{ color: 'var(--text-muted)', margin: 0 }}>{slot.client_email}</p>
            </div>
          </a>
        </div>
      )}
    </BottomSheet>
  )
}

export default function SignupLiveStatus() {
  const { id } = useParams()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const [page, setPage] = useState(null)
  const [slots, setSlots] = useState([])
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [selectedDay, setSelectedDay] = useState(null)
  const [now, setNow] = useState(new Date())
  const [bookedOnly, setBookedOnly] = useState(false)
  const [shootTypeFilters, setShootTypeFilters] = useState([])
  const [walkupSlot, setWalkupSlot] = useState(null)
  const [actionsSlot, setActionsSlot] = useState(null)
  const [actionsAnchorEl, setActionsAnchorEl] = useState(null)
  const [contactSlot, setContactSlot] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const slotRefs = useRef({})
  const hasAutoScrolled = useRef(false)
  // Set of claimed slot ids as of the last load -- diffed on each new load
  // to detect a genuinely new claim (vs. a page that's just re-rendering)
  // and trigger a vibration. Starts null so the very first load never
  // vibrates for slots that were already claimed before the page opened.
  const prevClaimedIdsRef = useRef(null)

  useEffect(() => { load() }, [id])

  async function load() {
    try {
      const [p, s] = await Promise.all([getSignupPage(id), getSlots(id)])
      setPage(p)
      setSlots(s)

      const claimedIds = new Set(s.filter(x => x.claimed_at).map(x => x.id))
      if (prevClaimedIdsRef.current) {
        const hasNewClaim = [...claimedIds].some(cid => !prevClaimedIdsRef.current.has(cid))
        if (hasNewClaim && navigator.vibrate) navigator.vibrate([200, 100, 200])
      }
      prevClaimedIdsRef.current = claimedIds
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  async function handleManualRefresh() {
    if (refreshing) return
    setRefreshing(true)
    const started = Date.now()
    await load()
    // A refresh can finish in well under 100ms, which would make the
    // spinner flash too fast to actually register as feedback. Pad it
    // out to a minimum visible duration instead.
    const minDurationMs = 500
    const elapsed = Date.now() - started
    if (elapsed < minDurationMs) await new Promise(r => setTimeout(r, minDurationMs - elapsed))
    setRefreshing(false)
  }

  function openActions(e, slot) {
    setActionsAnchorEl(e.currentTarget)
    setActionsSlot(slot)
  }

  function closeActions() {
    setActionsSlot(null)
    setActionsAnchorEl(null)
  }

  // Realtime subscription -- any insert/update/delete on this page's slots
  // (a claim, a manually deleted slot, a freshly generated batch) refetches
  // immediately rather than trying to patch individual rows in place,
  // since the grouping/sorting logic is cheap to just rerun.
  useEffect(() => {
    const channel = supabase
      .channel(`signup_slots_${id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'signup_slots', filter: `signup_page_id=eq.${id}` },
        () => load()
      )
      .subscribe(status => setConnected(status === 'SUBSCRIBED'))

    const fallbackInterval = setInterval(load, FALLBACK_REFETCH_MS)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(fallbackInterval)
    }
  }, [id])

  // "Current time" ticker -- drives the Happening now / Next up card and
  // the dimming of past open slots, without needing a page reload.
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), NOW_TICK_MS)
    return () => clearInterval(tick)
  }, [])

  const days = useMemo(() => {
    const map = {}
    for (const s of slots) {
      const key = dayKey(s.start_time, page?.timezone)
      if (!map[key]) map[key] = { key, label: dayLabel(s.start_time, page?.timezone), slots: [] }
      map[key].slots.push(s)
    }
    return Object.values(map).sort((a, b) => a.key.localeCompare(b.key))
  }, [slots, page])

  useEffect(() => {
    if (!page || days.length === 0) return
    if (selectedDay && days.some(d => d.key === selectedDay)) return
    const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: page.timezone })
    const todayMatch = days.find(d => d.key === todayKey)
    setSelectedDay((todayMatch || days[0]).key)
  }, [days, page])

  // Active ("happening now") and next-up slots, across the whole page --
  // not scoped to whichever day tab is selected, so this stays accurate
  // even while browsing a different day. A claimed slot always wins over
  // an open one for "active", since open slots for different shoot types
  // can legitimately overlap in time (only claimed slots are guaranteed
  // non-overlapping, via the DB exclusion constraint).
  const { activeSlot, nextSlot } = useMemo(() => {
    const nowMs = now.getTime()
    let active = null
    let next = null
    for (const s of slots) {
      const startMs = new Date(s.start_time).getTime()
      const endMs = new Date(s.end_time).getTime()
      if (nowMs >= startMs && nowMs < endMs) {
        if (!active || (s.claimed_at && !active.claimed_at)) active = s
      } else if (startMs > nowMs) {
        if (!next || startMs < new Date(next.start_time).getTime()) next = s
      }
    }
    return { activeSlot: active, nextSlot: next }
  }, [slots, now])

  // Auto-scroll to whatever's current/next, once, after the first load --
  // so opening the page on your phone mid-event doesn't require scrolling
  // through the whole day to find where you are.
  useEffect(() => {
    if (loading || hasAutoScrolled.current) return
    const t = setTimeout(() => {
      const target = activeSlot || nextSlot
      const el = target && slotRefs.current[target.id]
      if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      hasAutoScrolled.current = true
    }, 300)
    return () => clearTimeout(t)
  }, [loading])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  if (!page) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Signup page not found.</p>
      </div>
    )
  }

  const activeDay = days.find(d => d.key === selectedDay)
  const sortedSlots = activeDay ? [...activeDay.slots].sort((a, b) => new Date(a.start_time) - new Date(b.start_time)) : []
  const claimedCount = activeDay ? activeDay.slots.filter(s => s.claimed_at).length : 0
  const searchTerm = searchQuery.trim().toLowerCase()
  const visibleSlots = sortedSlots.filter(s => {
    if (bookedOnly && !s.claimed_at) return false
    if (shootTypeFilters.length > 0 && !shootTypeFilters.includes(s.shoot_type_id)) return false
    if (searchTerm) {
      const matches = (s.client_name || '').toLowerCase().includes(searchTerm) || (s.client_email || '').toLowerCase().includes(searchTerm)
      if (!matches) return false
    }
    return true
  })
  const walkupShootType = walkupSlot ? page.signup_shoot_types.find(t => t.id === walkupSlot.shoot_type_id) : null

  // Same FilterSortControl component (and interaction pattern) used across
  // the rest of the app, rather than a bespoke pill row -- gives this page
  // the same mobile bottom-sheet / desktop panel behavior as every other
  // filtered list.
  const filterSections = [
    {
      key: 'booked',
      label: 'Status',
      type: 'select',
      value: bookedOnly ? 'booked' : null,
      onChange: v => setBookedOnly(v === 'booked'),
      options: [{ value: 'booked', label: 'Booked only' }],
      placeholder: 'All slots',
    },
    ...(page.signup_shoot_types.length > 1 ? [{
      key: 'shootType',
      label: 'Shoot type',
      type: 'multiSelect',
      value: shootTypeFilters,
      onChange: setShootTypeFilters,
      options: page.signup_shoot_types.map(t => ({ value: t.id, label: t.name })),
      placeholder: 'All types',
    }] : []),
  ]

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="sticky top-0 z-10" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Link to="/sessions" style={{ color: 'var(--text-muted)', display: 'flex' }}>
              <ArrowLeft size={16} />
            </Link>
            <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{page.title}</p>
          </div>
          <button onClick={handleManualRefresh} title={connected ? 'Live — tap to refresh' : 'Reconnecting... tap to refresh'}
            className="flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full flex-shrink-0"
            style={{
              color: connected ? '#27500A' : 'var(--text-muted)',
              background: connected ? '#EAF3DE' : 'var(--bg-subtle)',
              border: 'none', cursor: refreshing ? 'default' : 'pointer',
            }}>
            {refreshing ? (
              <div className="w-3 h-3 rounded-full animate-spin flex-shrink-0"
                style={{ border: `2px solid ${connected ? '#27500A' : 'var(--text-muted)'}`, borderTopColor: 'transparent' }} />
            ) : connected ? <Wifi size={12} /> : <WifiOff size={12} />}
            {refreshing ? 'Refreshing' : connected ? 'Live' : 'Reconnecting'}
          </button>
        </div>
        {(days.length > 1 || slots.length > 0) && (
          <div className="flex items-center gap-2 px-4 pb-3">
            {days.length > 1 && (
              <div className="flex gap-1 overflow-x-auto flex-1" style={{ scrollbarWidth: 'none' }}>
                {days.map(d => (
                  <button key={d.key} onClick={() => setSelectedDay(d.key)}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg flex-shrink-0"
                    style={{
                      background: d.key === selectedDay ? '#6366f1' : 'var(--bg-subtle)',
                      color: d.key === selectedDay ? '#fff' : 'var(--text-muted)',
                      border: 'none', cursor: 'pointer',
                    }}>
                    {d.label}
                  </button>
                ))}
              </div>
            )}
            {slots.length > 0 && (
              <div className="flex-shrink-0" style={{ marginLeft: days.length > 1 ? 0 : 'auto' }}>
                <FilterSortControl sections={filterSections} />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="px-4 py-4">
        {slots.length > 0 && (
          <NowCard activeSlot={activeSlot} nextSlot={nextSlot} shootTypes={page.signup_shoot_types} now={now} timezone={page.timezone} />
        )}

        {activeDay && <ProgressStat claimed={claimedCount} total={activeDay.slots.length} />}

        {sortedSlots.length > 0 && (
          <div className="relative mb-3">
            <Search size={14} style={{ position: 'absolute', left: 12, top: 11, color: 'var(--text-muted)' }} />
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search by name or email..."
              style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 10, padding: '9px 12px 9px 34px', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
          </div>
        )}

        {sortedSlots.length === 0 ? (
          <p className="text-sm text-center py-12" style={{ color: 'var(--text-muted)' }}>No slots for this day.</p>
        ) : visibleSlots.length === 0 ? (
          <p className="text-sm text-center py-12" style={{ color: 'var(--text-muted)' }}>No sessions match this filter.</p>
        ) : (
          <div className="space-y-2">
            {visibleSlots.map(slot => {
              const shootType = page.signup_shoot_types.find(t => t.id === slot.shoot_type_id)
              const isPast = new Date(slot.end_time) < now
              const isOpen = !slot.claimed_at
              const isRegisterable = isOpen && !isPast
              return (
                <div key={slot.id}
                  ref={el => { if (el) slotRefs.current[slot.id] = el }}
                  onClick={isRegisterable ? () => setWalkupSlot(slot) : undefined}
                  className="flex rounded-xl overflow-hidden"
                  style={{ border: '1px solid var(--border)', opacity: isOpen && isPast ? 0.45 : 1, cursor: isRegisterable ? 'pointer' : 'default' }}>
                  <div style={{ width: 4, flexShrink: 0, background: slot.claimed_at ? '#6366f1' : 'var(--border-strong)' }} />
                  <div className="flex-1 min-w-0 px-4 py-3" style={{ background: 'var(--surface)' }}>
                    <div className="flex items-center justify-between">
                      <span className="text-base font-semibold" style={{ color: 'var(--text)' }}>{timeLabel(slot.start_time, page.timezone)}</span>
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0"
                        style={{
                          background: slot.claimed_at ? 'rgba(99,102,241,0.1)' : 'var(--bg-subtle)',
                          color: slot.claimed_at ? '#6366f1' : 'var(--text-muted)',
                        }}>
                        {slot.claimed_at ? 'Claimed' : 'Open'}
                      </span>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{shootType?.name || 'Unknown shoot type'}</p>
                    {slot.claimed_at ? (
                      <div className="mt-1.5">
                        <div className="flex items-end justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{slot.client_name}{slot.client_pronouns && <span className="font-normal" style={{ color: 'var(--text-muted)' }}> ({slot.client_pronouns})</span>}</p>
                            <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{slot.client_email}{slot.client_phone && ` · ${slot.client_phone}`}</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                            {(slot.client_phone || slot.client_email) && (
                              <button onClick={() => setContactSlot(slot)} title="Contact" className="md:hidden p-1.5 rounded-lg flex" style={{ background: 'var(--bg-subtle)', color: 'var(--text-muted)', border: 'none', cursor: 'pointer' }}>
                                <Contact size={13} />
                              </button>
                            )}
                            {slot.client_phone && (
                              <a href={`tel:${slot.client_phone}`} title="Call" className="hidden md:flex p-1.5 rounded-lg" style={{ background: 'var(--bg-subtle)', color: 'var(--text-muted)' }}>
                                <Phone size={13} />
                              </a>
                            )}
                            {slot.client_phone && (
                              <a href={`sms:${slot.client_phone}`} title="Text" className="hidden md:flex p-1.5 rounded-lg" style={{ background: 'var(--bg-subtle)', color: 'var(--text-muted)' }}>
                                <MessageSquare size={13} />
                              </a>
                            )}
                            <a href={`mailto:${slot.client_email}`} title="Email" className="hidden md:flex p-1.5 rounded-lg" style={{ background: 'var(--bg-subtle)', color: 'var(--text-muted)' }}>
                              <Mail size={13} />
                            </a>
                            <button onClick={e => openActions(e, slot)} title="More options" className="p-1.5 rounded-lg flex" style={{ background: 'var(--bg-subtle)', color: 'var(--text-muted)', border: 'none', cursor: 'pointer' }}>
                              <MoreVertical size={13} />
                            </button>
                          </div>
                        </div>
                        {slot.photographer_note && (
                          <div className="flex items-start gap-1.5 mt-1.5">
                            <StickyNote size={11} style={{ color: 'var(--text-muted)', marginTop: 2, flexShrink: 0 }} />
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{slot.photographer_note}</p>
                          </div>
                        )}
                      </div>
                    ) : isRegisterable && (
                      <p className="text-xs mt-1.5 font-medium" style={{ color: '#6366f1' }}>Tap to register a walk-up</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {walkupSlot && (
        isDesktop ? (
          <WalkupRegisterModal
            slot={walkupSlot}
            shootType={walkupShootType}
            timezone={page.timezone}
            onClose={() => setWalkupSlot(null)}
            onRegistered={() => { setWalkupSlot(null); load() }}
          />
        ) : (
          <WalkupRegisterSheet
            slot={walkupSlot}
            shootType={walkupShootType}
            timezone={page.timezone}
            onClose={() => setWalkupSlot(null)}
            onRegistered={() => { setWalkupSlot(null); load() }}
          />
        )
      )}

      {actionsSlot && (
        isDesktop ? (
          <SlotActionsPopover
            slot={actionsSlot}
            anchorEl={actionsAnchorEl}
            onClose={closeActions}
            onUnclaimed={() => { closeActions(); load() }}
            onNoteSaved={() => { closeActions(); load() }}
          />
        ) : (
          <SlotActionsSheet
            slot={actionsSlot}
            onClose={closeActions}
            onUnclaimed={() => { closeActions(); load() }}
            onNoteSaved={() => { closeActions(); load() }}
          />
        )
      )}

      {contactSlot && (
        <ContactSheet slot={contactSlot} onClose={() => setContactSlot(null)} />
      )}
    </div>
  )
}
