import { useState } from 'react'
import { Check } from 'lucide-react'
import Modal from '../ui/Modal.jsx'
import Toggle from '../ui/Toggle.jsx'
import { formatTimeRange } from '../../utils/formatters.js'
import { moveSignupSlotBooking, updateSignupSlotTime, zonedTimeToUtc } from '../../utils/signupApi.js'

// Shared between the Live Status page's actions sheet and the Sessions ->
// Signups -> slot list (SignupPageDetailModal) -- both surfaces need the
// same two capabilities: move an existing booking to a different open
// slot (optionally a different shoot type, e.g. a client upgrade), or
// manually set a claimed slot's own time to something outside the
// pre-generated slot grid entirely. One modal, two tabs, rather than
// building this UI twice or splitting it into two separate modals for
// what's conceptually one action ("change when this booking happens").
//
// Conflict checking against other real bookings is the DB's own
// no_overlapping_claimed_slots EXCLUDE constraint (open slots are already
// exempt) -- this component doesn't pre-validate conflicts itself, it
// just surfaces whatever error the RPC returns.
function toLocalDateStr(iso, timezone) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: timezone })
}
function toLocalTimeStr(iso, timezone) {
  return new Date(iso).toLocaleTimeString('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false })
}
function timeLabel(iso, timezone) {
  return new Date(iso).toLocaleTimeString('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit' })
}
function dayLabel(iso, timezone) {
  return new Date(iso).toLocaleDateString('en-US', { timeZone: timezone, weekday: 'short', month: 'short', day: 'numeric' })
}

export default function RescheduleModal({ slot, allSlots, shootTypes, timezone, onClose, onDone }) {
  const [mode, setMode] = useState('move')
  const [sameTypeOnly, setSameTypeOnly] = useState(true)
  const [targetId, setTargetId] = useState(null)
  const [date, setDate] = useState(() => toLocalDateStr(slot.start_time, timezone))
  const [startTime, setStartTime] = useState(() => toLocalTimeStr(slot.start_time, timezone))
  const [endTime, setEndTime] = useState(() => toLocalTimeStr(slot.end_time, timezone))
  const [notifyClient, setNotifyClient] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const currentShootType = shootTypes.find(t => t.id === slot.shoot_type_id)

  const claimedRanges = allSlots
    .filter(s => s.claimed_at && s.id !== slot.id)
    .map(s => ({ start: new Date(s.start_time).getTime(), end: new Date(s.end_time).getTime() }))

  function overlapsAnyClaimed(startMs, endMs) {
    return claimedRanges.some(r => startMs < r.end && r.start < endMs)
  }

  // An open slot can still conflict with a DIFFERENT claimed booking (e.g.
  // an open slot for one shoot type overlapping a claimed slot for another)
  // -- filtering on the slot's own claimed_at alone isn't enough.
  const openSlots = allSlots
    .filter(s => s.id !== slot.id && !s.claimed_at)
    .filter(s => new Date(s.start_time) > new Date())
    .filter(s => sameTypeOnly ? s.shoot_type_id === slot.shoot_type_id : true)
    .filter(s => !overlapsAnyClaimed(new Date(s.start_time).getTime(), new Date(s.end_time).getTime()))
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))

  const customStartMs = date && startTime ? zonedTimeToUtc(date, startTime, timezone).getTime() : null
  const customEndMs = date && endTime ? zonedTimeToUtc(date, endTime, timezone).getTime() : null
  const customConflict = customStartMs !== null && customEndMs !== null && overlapsAnyClaimed(customStartMs, customEndMs)

  const ERROR_MESSAGES = {
    conflicts_with_existing_booking: 'That time conflicts with another booking. Pick a different time.',
    end_before_start: 'End time has to be after the start time.',
    target_already_claimed: 'That slot was just claimed by someone else. Pick another.',
    unauthorized: "You don't have permission to change this booking.",
  }

  async function handleMove() {
    if (!targetId) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await moveSignupSlotBooking(slot.id, targetId, notifyClient)
      if (!result.success) {
        setError(ERROR_MESSAGES[result.error] || 'Could not move this booking. Try again.')
        return
      }
      onDone()
    } catch {
      setError('Could not move this booking. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCustomTime() {
    if (!date || !startTime || !endTime) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await updateSignupSlotTime({ slotId: slot.id, date, startTime, endTime, timezone, notifyClient })
      if (!result.success) {
        setError(ERROR_MESSAGES[result.error] || 'Could not update this booking. Try again.')
        return
      }
      onDone()
    } catch {
      setError('Could not update this booking. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle = {
    width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)',
    color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13, boxSizing: 'border-box',
  }

  return (
    <Modal title="Reschedule booking" onClose={onClose} size="md">
      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
        {slot.client_name} · {currentShootType?.name || 'Unknown shoot type'} · currently {dayLabel(slot.start_time, timezone)}, {formatTimeRange(slot.start_time, slot.end_time, timezone)}
      </p>

      <div className="flex rounded-lg p-0.5 mb-4" style={{ background: 'var(--bg-subtle)' }}>
        {['move', 'custom'].map(m => (
          <button key={m} onClick={() => setMode(m)}
            className="flex-1 text-xs font-medium px-2.5 py-1.5 rounded-md"
            style={{
              background: mode === m ? 'var(--surface)' : 'transparent',
              color: mode === m ? 'var(--text)' : 'var(--text-muted)',
              border: 'none', cursor: 'pointer',
            }}>
            {m === 'move' ? 'Move to open slot' : 'Custom time'}
          </button>
        ))}
      </div>

      {mode === 'move' ? (
        <div className="space-y-3">
          <Toggle checked={!sameTypeOnly} onChange={v => { setSameTypeOnly(!v); setTargetId(null) }}
            label="Show all shoot types" description="Off shows only open slots for this same shoot type." />

          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', maxHeight: 280, overflowY: 'auto' }}>
            {openSlots.length === 0 ? (
              <p className="text-xs px-4 py-3" style={{ color: 'var(--text-muted)' }}>
                No open slots {sameTypeOnly ? 'for this shoot type' : ''} right now.
              </p>
            ) : openSlots.map((s, i) => {
              const st = shootTypes.find(t => t.id === s.shoot_type_id)
              const selected = targetId === s.id
              return (
                <button key={s.id} onClick={() => setTargetId(s.id)}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-left"
                  style={{
                    border: 'none',
                    borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                    background: selected ? 'rgba(99,102,241,0.08)' : 'var(--surface)',
                    cursor: 'pointer',
                  }}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                      {dayLabel(s.start_time, timezone)}, {formatTimeRange(s.start_time, s.end_time, timezone)}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{st?.name || 'Unknown'}</p>
                  </div>
                  {selected && <Check size={16} style={{ color: '#6366f1', flexShrink: 0 }} />}
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={inputStyle} />
            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} style={inputStyle} />
          </div>
          {customConflict ? (
            <p className="text-xs" style={{ color: 'var(--danger)' }}>
              That time conflicts with another booking. Pick a different time.
            </p>
          ) : (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Only checked against other actual bookings -- doesn't need to line up with an existing slot.
            </p>
          )}
        </div>
      )}

      <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
        <Toggle checked={notifyClient} onChange={setNotifyClient}
          label="Notify client of this change" description="Sends an updated confirmation email with a fresh calendar invite." />
      </div>

      {error && <p className="text-xs mt-3" style={{ color: 'var(--danger)' }}>{error}</p>}

      <div className="flex items-center gap-2 mt-4">
        <button
          onClick={mode === 'move' ? handleMove : handleCustomTime}
          disabled={submitting || (mode === 'move' && !targetId) || (mode === 'custom' && customConflict)}
          className="text-xs font-medium px-3 py-2 rounded-lg"
          style={{
            background: '#6366f1', color: '#fff', border: 'none',
            opacity: submitting || (mode === 'move' && !targetId) || (mode === 'custom' && customConflict) ? 0.5 : 1,
            cursor: submitting || (mode === 'move' && !targetId) || (mode === 'custom' && customConflict) ? 'default' : 'pointer',
          }}>
          {submitting ? 'Saving...' : 'Confirm'}
        </button>
        <button onClick={onClose} disabled={submitting}
          className="text-xs font-medium px-3 py-2 rounded-lg"
          style={{ background: 'var(--surface-raised)', color: 'var(--text-muted)', border: 'none', cursor: 'pointer' }}>
          Cancel
        </button>
      </div>
    </Modal>
  )
}
