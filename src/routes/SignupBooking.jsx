import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { CalendarDays, Clock, ChevronLeft, ChevronRight, Check, Calendar } from 'lucide-react'
import { supabaseAnon } from '../supabaseClientAnon.js'
import { SessionTypeIcon } from '../utils/sessionTypeIcon.jsx'
import { useBookingBranding } from '../utils/bookingBranding.js'
import { COMMON_TIMEZONES } from '../utils/timezoneApi.js'
import BookingHero from '../components/booking/BookingHero.jsx'

// ── Data (anonymous, via supabaseAnon -- see supabaseClientAnon.js's own
// comment for why this matters: guarantees no leaked photographer session
// ever rides along with a request from this public page) ───────────────────

async function getSignupPageData(token) {
  const { data, error } = await supabaseAnon.rpc('get_signup_page_data', { p_token: token })
  if (error) throw error
  return data
}

async function claimSignupSlot({ slotId, firstName, lastName, email, phone, pronouns }) {
  const { data, error } = await supabaseAnon.rpc('claim_signup_slot', {
    p_slot_id: slotId,
    p_first_name: firstName.trim(),
    p_last_name: lastName.trim(),
    p_email: email.trim(),
    p_phone: phone?.trim() || null,
    p_pronouns: pronouns || null,
  })
  if (error) throw error
  return data
}

async function submitSignupInquiry({ token, shootTypeId, date, time, firstName, lastName, email, phone, pronouns }) {
  const { data, error } = await supabaseAnon.rpc('submit_signup_inquiry', {
    p_token: token,
    p_shoot_type_id: shootTypeId,
    p_date: date,
    p_time: time,
    p_first_name: firstName.trim(),
    p_last_name: lastName.trim(),
    p_email: email.trim(),
    p_phone: phone?.trim() || null,
    p_pronouns: pronouns || null,
  })
  if (error) throw error
  return data
}

// date: 'YYYY-MM-DD', time: 'HH:MM' or 'HH:MM:SS' -- both used interchangeably
// across this file depending on whether the value came from a <select> or the DB.
function formatInquiryDateTime(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [h, min] = timeStr.split(':').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d, h, min))
  return date.toLocaleString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// Same list already used for clients elsewhere in the app (ClientDetail.jsx,
// Clients.jsx) -- kept in sync manually since it's just a few inline
// <option> tags there too, not an extracted shared constant.
const PRONOUN_OPTIONS = ['she/her', 'he/him', 'they/them', 'she/they', 'he/they', 'ze/hir', 'xe/xem', 'Prefer not to say']

// Same curated US-focused list Settings' own timezone dropdown uses --
// falls back to the raw IANA string only for a timezone outside it.
function friendlyTimezoneLabel(tz) {
  return COMMON_TIMEZONES.find(t => t.value === tz)?.label || tz
}

// ── Calendar links (no auth, no backend -- see project discussion: this is
// a one-time "add this booking" action, not an ongoing subscription feed) ──

function googleCalendarUrl({ title, startTime, endTime, location, details }) {
  const fmt = iso => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${fmt(startTime)}/${fmt(endTime)}`,
    location: location || '',
    details: details || '',
  })
  return `https://www.google.com/calendar/render?${params.toString()}`
}

function downloadIcs({ title, startTime, endTime, location, details }) {
  const fmt = iso => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FinalVault//Booking//EN',
    'BEGIN:VEVENT',
    `UID:${crypto.randomUUID()}@finalvault`,
    `DTSTAMP:${fmt(new Date().toISOString())}`,
    `DTSTART:${fmt(startTime)}`,
    `DTEND:${fmt(endTime)}`,
    `SUMMARY:${title}`,
    location ? `LOCATION:${location}` : '',
    details ? `DESCRIPTION:${details}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n')
  const blob = new Blob([ics], { type: 'text/calendar' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'booking.ics'
  a.click()
  URL.revokeObjectURL(url)
}

// ── UI ───────────────────────────────────────────────────────────────────────

function CenteredMessage({ title, body }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
      <div className="text-center max-w-sm">
        <p className="text-base font-medium" style={{ color: 'var(--text)' }}>{title}</p>
        {body && <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{body}</p>}
      </div>
    </div>
  )
}

function StepIndicator({ step }) {
  const steps = [
    { n: 1, label: 'Shoot' },
    { n: 2, label: 'Time' },
    { n: 3, label: 'Details' },
  ]
  return (
    <div className="flex items-center justify-center gap-1.5 mb-6">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center gap-1.5">
          <div className="flex items-center gap-1.5">
            <div className="flex items-center justify-center rounded-full"
              style={{
                width: 22, height: 22, fontSize: 11, fontWeight: 500,
                background: step >= s.n ? 'var(--bk-accent)' : 'var(--surface-raised)',
                color: step >= s.n ? 'var(--bk-accent-button-text)' : 'var(--text-muted)',
              }}>
              {s.n}
            </div>
            <span className="text-xs" style={{ color: step >= s.n ? 'var(--bk-ink)' : 'var(--text-muted)', fontWeight: step === s.n ? 500 : 400 }}>{s.label}</span>
          </div>
          {i < steps.length - 1 && <div style={{ width: 20, height: 1, background: 'var(--bk-border)', marginLeft: 4 }} />}
        </div>
      ))}
    </div>
  )
}

function ShootTypeStep({ shootTypes, onSelect }) {
  return (
    <div className="space-y-2">
      {shootTypes.map(t => (
        <button key={t.id} onClick={() => onSelect(t)}
          className="w-full flex items-center gap-3 text-left rounded-xl p-3.5 transition-colors"
          style={{ background: 'var(--bk-surface)', border: '1px solid var(--bk-border)', cursor: 'pointer' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--bk-accent)'; e.currentTarget.style.background = 'rgba(var(--bk-accent-rgb), 0.06)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bk-border)'; e.currentTarget.style.background = 'var(--bk-surface)' }}>
          <div className="flex items-center justify-center rounded-lg flex-shrink-0" style={{ width: 36, height: 36, background: 'rgba(var(--bk-accent-rgb), 0.1)' }}>
            <SessionTypeIcon type={t.session_type} size={17} color="var(--bk-accent)" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold" style={{ color: 'var(--bk-ink)' }}>{t.name}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--bk-muted)' }}>{t.duration_minutes} minutes</p>
            {t.description && <p className="text-xs mt-1" style={{ color: 'var(--bk-muted)' }}>{t.description}</p>}
          </div>
          {(t.price != null || t.retainer_amount != null) && (
            <div className="ml-auto flex-shrink-0 text-right">
              {t.price != null && (
                <p className="text-sm font-semibold" style={{ color: 'var(--bk-ink)' }}>
                  Price: ${parseFloat(t.price).toFixed(2)}
                </p>
              )}
              {t.retainer_amount != null && (
                <p className="text-xs mt-0.5" style={{ color: 'var(--bk-muted)' }}>
                  ${parseFloat(t.retainer_amount).toFixed(2)} deposit required
                </p>
              )}
            </div>
          )}
        </button>
      ))}
    </div>
  )
}

function SlotStep({ pageData, shootType, onBack, showBack, onSelect }) {
  const relevantSlots = pageData.open_slots.filter(s => s.shoot_type_id === shootType.id)

  const byDay = {}
  for (const slot of relevantSlots) {
    const day = new Date(slot.start_time).toLocaleDateString('en-US', {
      timeZone: pageData.timezone, weekday: 'long', month: 'long', day: 'numeric',
    })
    if (!byDay[day]) byDay[day] = []
    byDay[day].push(slot)
  }

  return (
    <div>
      {showBack && (
        <button onClick={onBack} className="flex items-center gap-1 text-xs font-medium mb-4"
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
          <ChevronLeft size={13} />Change shoot type
        </button>
      )}
      {relevantSlots.length === 0 ? (
        <CenteredMessage title="No open times right now" body="Check back soon, or ask the photographer directly." />
      ) : (
        Object.entries(byDay).map(([day, slots]) => (
          <div key={day} className="mb-5">
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--bk-muted)' }}>{day}</p>
            <div className="grid grid-cols-3 gap-2">
              {slots.map(slot => (
                <button key={slot.id} onClick={() => onSelect(slot)}
                  className="text-sm font-medium px-3 py-2.5 rounded-lg transition-colors"
                  style={{ background: 'var(--bk-surface)', border: '1px solid var(--bk-border)', color: 'var(--bk-ink)', cursor: 'pointer' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bk-accent)'; e.currentTarget.style.borderColor = 'var(--bk-accent)'; e.currentTarget.style.color = 'var(--bk-accent-button-text)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--bk-surface)'; e.currentTarget.style.borderColor = 'var(--bk-border)'; e.currentTarget.style.color = 'var(--bk-ink)' }}>
                  {new Date(slot.start_time).toLocaleTimeString('en-US', { timeZone: pageData.timezone, hour: 'numeric', minute: '2-digit' })}
                </button>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

const INQUIRY_TIME_INCREMENT_MINUTES = 30

// Every bookable time-of-day within a window, spaced at 30-minute
// increments, stopping once the shoot type's duration would run past
// the window's own end time -- e.g. a 2-hour session in a 1-5pm window
// only offers up to 3:00pm as a start time, not 3:30 or later.
function timeStrToMinutes(t) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

// Checked against the CANDIDATE slot's own buffer-padded range, not
// padded a second time on the existing booking's side -- matches
// submit_signup_inquiry's server-side check exactly (sql/066), so the
// client-side list and the real gate never disagree.
function isInquiryTimeAvailable(dateStr, startMinutes, durationMinutes, bufferMinutes, bookings) {
  const paddedStart = startMinutes - bufferMinutes
  const paddedEnd = startMinutes + durationMinutes + bufferMinutes
  return !bookings.some(b => {
    if (b.session_date !== dateStr) return false
    const bStart = timeStrToMinutes(b.start_time)
    const bEnd = timeStrToMinutes(b.end_time)
    return paddedStart < bEnd && paddedEnd > bStart
  })
}

function dailyInquiryCount(dateStr, bookings) {
  return bookings.filter(b => b.session_date === dateStr).length
}

function generateInquiryTimeOptions(dateStr, windowStartTime, windowEndTime, durationMinutes, bufferMinutes, bookings) {
  const [sh, sm] = windowStartTime.split(':').map(Number)
  const [eh, em] = windowEndTime.split(':').map(Number)
  const startMins = sh * 60 + sm
  const endMins = eh * 60 + em
  const options = []
  for (let m = startMins; m + durationMinutes <= endMins; m += INQUIRY_TIME_INCREMENT_MINUTES) {
    if (!isInquiryTimeAvailable(dateStr, m, durationMinutes, bufferMinutes, bookings)) continue
    const hh = String(Math.floor(m / 60)).padStart(2, '0')
    const mm = String(m % 60).padStart(2, '0')
    options.push(`${hh}:${mm}`)
  }
  return options
}

function formatInquiryTimeLabel(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(2000, 0, 1, h, m)).toLocaleTimeString('en-US', { timeZone: 'UTC', hour: 'numeric', minute: '2-digit' })
}

// Replaces SlotStep for mode === 'inquiry' pages -- a calendar instead of
// a list of pre-generated times. Only days covered by at least one of the
// page's inquiry_windows (right date range + right weekday) are
// clickable; picking one reveals a "Preferred time" dropdown bounded to
// that window's hours. This is a UX nicety only -- submit_signup_inquiry
// re-validates the same constraints server-side regardless.
function InquiryDateStep({ pageData, shootType, onBack, showBack, onSelect }) {
  const windows = pageData.inquiry_windows || []
  const [viewYear, setViewYear] = useState(null)
  const [viewMonth, setViewMonth] = useState(null)
  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedTime, setSelectedTime] = useState('')

  useEffect(() => {
    if (windows.length === 0) return
    const earliest = windows.reduce((min, w) => (w.start_date < min ? w.start_date : min), windows[0].start_date)
    const [y, m] = earliest.split('-').map(Number)
    setViewYear(y)
    setViewMonth(m - 1)
  }, [pageData])

  if (windows.length === 0) {
    return (
      <div>
        {showBack && (
          <button onClick={onBack} className="flex items-center gap-1 text-xs font-medium mb-4"
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <ChevronLeft size={13} />Change shoot type
          </button>
        )}
        <CenteredMessage title="Nothing open right now" body="Check back soon, or ask the photographer directly." />
      </div>
    )
  }

  if (viewYear === null) return null

  const bookings = pageData.inquiry_bookings || []
  const bufferMinutes = pageData.buffer_minutes || 0

  function windowForDate(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number)
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
    return windows.find(w => dateStr >= w.start_date && dateStr <= w.end_date && w.days_of_week.includes(weekday))
  }

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const firstWeekday = new Date(Date.UTC(viewYear, viewMonth, 1)).getUTCDay()
  const cells = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const dayWindow = windowForDate(dateStr)
    const full = pageData.max_daily_inquiries != null && dailyInquiryCount(dateStr, bookings) >= pageData.max_daily_inquiries
    cells.push({ day: d, dateStr, window: dayWindow && !full ? dayWindow : null })
  }

  function goMonth(delta) {
    let m = viewMonth + delta
    let y = viewYear
    if (m < 0) { m = 11; y -= 1 }
    if (m > 11) { m = 0; y += 1 }
    setViewMonth(m)
    setViewYear(y)
    setSelectedDate(null)
    setSelectedTime('')
  }

  function handlePickDate(cell) {
    if (!cell.window) return
    setSelectedDate(cell)
    const options = generateInquiryTimeOptions(cell.dateStr, cell.window.start_time, cell.window.end_time, shootType.duration_minutes, bufferMinutes, bookings)
    setSelectedTime(options[0] || '')
  }

  const timeOptions = selectedDate
    ? generateInquiryTimeOptions(selectedDate.dateStr, selectedDate.window.start_time, selectedDate.window.end_time, shootType.duration_minutes, bufferMinutes, bookings)
    : []
  const monthLabel = new Date(Date.UTC(viewYear, viewMonth, 1)).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' })

  return (
    <div>
      {showBack && (
        <button onClick={onBack} className="flex items-center gap-1 text-xs font-medium mb-4"
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
          <ChevronLeft size={13} />Change shoot type
        </button>
      )}
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => goMonth(-1)} aria-label="Previous month"
          style={{ background: 'none', border: 'none', color: 'var(--bk-muted)', cursor: 'pointer', display: 'flex' }}>
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-medium" style={{ color: 'var(--bk-ink)' }}>{monthLabel}</span>
        <button onClick={() => goMonth(1)} aria-label="Next month"
          style={{ background: 'none', border: 'none', color: 'var(--bk-muted)', cursor: 'pointer', display: 'flex' }}>
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <span key={i} className="text-center" style={{ fontSize: 10, color: 'var(--bk-muted)' }}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 mb-5">
        {cells.map((cell, i) => {
          if (!cell) return <div key={i} style={{ aspectRatio: '1' }} />
          const open = !!cell.window
          const isSelected = selectedDate?.dateStr === cell.dateStr
          return (
            <button key={i} disabled={!open} onClick={() => handlePickDate(cell)}
              style={{
                aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 8, border: 'none', fontSize: 12,
                cursor: open ? 'pointer' : 'default',
                background: isSelected ? 'var(--bk-accent)' : 'var(--bk-surface)',
                color: isSelected ? 'var(--bk-accent-button-text)' : open ? 'var(--bk-ink)' : 'var(--bk-muted)',
                opacity: open ? 1 : 0.4,
              }}>
              {cell.day}
            </button>
          )
        })}
      </div>
      {selectedDate && (
        <div className="mb-5">
          {timeOptions.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--bk-muted)' }}>No times available that day for this session length -- try another date.</p>
          ) : (
            <>
              <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--bk-ink)' }}>Preferred time <span style={{ fontWeight: 400, color: 'var(--bk-muted)' }}>{friendlyTimezoneLabel(pageData.timezone)}</span></p>
              <select value={selectedTime} onChange={e => setSelectedTime(e.target.value)}
                style={{ width: '100%', background: 'var(--bk-surface)', border: '1px solid var(--bk-border)', color: 'var(--bk-ink)', borderRadius: 8, padding: '10px 12px', fontSize: 14 }}>
                {timeOptions.map(t => <option key={t} value={t}>{formatInquiryTimeLabel(t)}</option>)}
              </select>
              <p className="text-xs mt-1.5" style={{ color: 'var(--bk-muted)' }}>The photographer will confirm your exact time.</p>
            </>
          )}
        </div>
      )}
      <button onClick={() => onSelect({ date: selectedDate.dateStr, time: selectedTime })} disabled={!selectedDate || !selectedTime}
        className="w-full py-2.5 rounded-lg text-sm font-medium"
        style={{
          background: 'var(--bk-accent)', color: 'var(--bk-accent-button-text)', border: 'none',
          cursor: (!selectedDate || !selectedTime) ? 'not-allowed' : 'pointer',
          opacity: (!selectedDate || !selectedTime) ? 0.5 : 1,
        }}>
        Continue
      </button>
    </div>
  )
}

function DetailsStep({ pageData, shootType, slot, inquirySelection, onBack, onConfirmed, onConflict }) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [pronouns, setPronouns] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const isInquiry = !!inquirySelection
  const canSubmit = firstName.trim() && lastName.trim() && email.trim()

  async function handleConfirm() {
    if (!canSubmit || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      if (isInquiry) {
        const timeWithSeconds = inquirySelection.time.length === 5 ? inquirySelection.time + ':00' : inquirySelection.time
        const result = await submitSignupInquiry({
          token: pageData.token, shootTypeId: shootType.id,
          date: inquirySelection.date, time: timeWithSeconds,
          firstName, lastName, email, phone, pronouns,
        })
        if (result.success) {
          onConfirmed(result)
        } else if (result.error === 'outside_window') {
          setError("That time is no longer available. Go back and pick a different date or time.")
        } else {
          setError('Something went wrong. Please try again.')
        }
        return
      }
      const result = await claimSignupSlot({ slotId: slot.id, firstName, lastName, email, phone, pronouns })
      if (result.success) {
        onConfirmed(result)
      } else if (result.error === 'already_claimed' || result.error === 'conflicts_with_existing_booking') {
        onConflict()
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
    width: '100%', background: 'var(--bk-surface)', border: '1px solid var(--bk-border)',
    color: 'var(--bk-ink)', borderRadius: 8, padding: '10px 12px', fontSize: 14, outline: 'none',
  }

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-xs font-medium mb-4"
        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
        <ChevronLeft size={13} />{isInquiry ? 'Pick a different date' : 'Pick a different time'}
      </button>

      <div className="rounded-xl p-4 mb-5" style={{ background: 'var(--bk-bg-subtle)', border: '1px solid var(--bk-border)' }}>
        <p className="text-sm font-semibold" style={{ color: 'var(--bk-ink)' }}>{shootType.name}</p>
        <p className="text-xs mt-1" style={{ color: 'var(--bk-muted)' }}>
          {isInquiry
            ? formatInquiryDateTime(inquirySelection.date, inquirySelection.time)
            : new Date(slot.start_time).toLocaleString('en-US', { timeZone: pageData.timezone, weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </p>
        {isInquiry && <p className="text-xs mt-1" style={{ color: 'var(--bk-muted)' }}>Requested time -- the photographer will confirm.</p>}
        {pageData.venue_address && <p className="text-xs mt-1" style={{ color: 'var(--bk-muted)' }}>{pageData.venue_address}</p>}
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" style={inputStyle} />
          <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last name" style={inputStyle} />
        </div>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" style={inputStyle} />
        <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone (optional)" style={inputStyle} />
        <select value={pronouns} onChange={e => setPronouns(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
          <option value="">Pronouns (optional)</option>
          {PRONOUN_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        {error && <p className="text-xs" style={{ color: 'var(--danger)' }}>{error}</p>}
        <button onClick={handleConfirm} disabled={!canSubmit || submitting}
          className="w-full py-2.5 rounded-lg text-sm font-medium"
          style={{
            background: 'var(--bk-accent)', color: 'var(--bk-accent-button-text)', border: 'none',
            cursor: (!canSubmit || submitting) ? 'not-allowed' : 'pointer',
            opacity: (!canSubmit || submitting) ? 0.6 : 1,
          }}>
          {submitting ? (isInquiry ? 'Sending...' : 'Confirming...') : (isInquiry ? 'Send inquiry' : 'Confirm booking')}
        </button>
      </div>
    </div>
  )
}

function SuccessStep({ pageData, shootType, result }) {
  const isInquiry = !result.start_time

  if (isInquiry) {
    return (
      <div className="text-center">
        <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(var(--bk-accent-rgb), 0.1)' }}>
          <Check size={20} style={{ color: 'var(--bk-accent)' }} />
        </div>
        <p className="text-base font-medium" style={{ color: 'var(--bk-ink)' }}>Inquiry sent!</p>
        <p className="text-sm mt-1" style={{ color: 'var(--bk-muted)' }}>{result.shoot_type}</p>
        <p className="text-sm" style={{ color: 'var(--bk-muted)' }}>{formatInquiryDateTime(result.requested_date, result.requested_time)}</p>
        {result.venue && <p className="text-sm" style={{ color: 'var(--bk-muted)' }}>{result.venue}</p>}
        <p className="text-xs mt-4" style={{ color: 'var(--bk-muted)' }}>The photographer will follow up to confirm your exact time.</p>
      </div>
    )
  }

  const calendarArgs = {
    title: `${shootType.name} — ${pageData.title}`,
    startTime: result.start_time,
    endTime: result.end_time,
    location: result.venue,
    details: `Booked via ${pageData.title}`,
  }

  return (
    <div className="text-center">
      <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(var(--bk-accent-rgb), 0.1)' }}>
        <Check size={20} style={{ color: 'var(--bk-accent)' }} />
      </div>
      <p className="text-base font-medium" style={{ color: 'var(--bk-ink)' }}>You're booked!</p>
      <p className="text-sm mt-1" style={{ color: 'var(--bk-muted)' }}>{result.shoot_type}</p>
      <p className="text-sm" style={{ color: 'var(--bk-muted)' }}>
        {new Date(result.start_time).toLocaleString('en-US', { timeZone: pageData.timezone, weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
      </p>
      {result.venue && <p className="text-sm" style={{ color: 'var(--bk-muted)' }}>{result.venue}</p>}

      <div className="flex items-center justify-center gap-2 mt-6">
        <a href={googleCalendarUrl(calendarArgs)} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg"
          style={{ background: 'var(--bk-surface)', border: '1px solid var(--bk-border)', color: 'var(--bk-ink)', textDecoration: 'none' }}>
          <Calendar size={13} />Add to Google Calendar
        </a>
        <button onClick={() => downloadIcs(calendarArgs)}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg"
          style={{ background: 'var(--bk-surface)', border: '1px solid var(--bk-border)', color: 'var(--bk-ink)', cursor: 'pointer' }}>
          <CalendarDays size={13} />Download .ics
        </button>
      </div>
    </div>
  )
}

export default function SignupBooking() {
  const { token } = useParams()
  const [pageData, setPageData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [shootType, setShootType] = useState(null)
  const [slot, setSlot] = useState(null)
  const [inquirySelection, setInquirySelection] = useState(null)
  const [result, setResult] = useState(null)
  const [conflictNotice, setConflictNotice] = useState(false)

  useEffect(() => { load() }, [token])

  async function load() {
    setLoading(true)
    try {
      const data = await getSignupPageData(token)
      if (!data) { setNotFound(true); return }
      // get_signup_page_data never returns the page's own id or token --
      // submit_signup_inquiry needs the token, so it's merged in here
      // once rather than threading a separate prop through every step.
      setPageData({ ...data, token })
      if (data.active && data.shoot_types.length === 1) setShootType(data.shoot_types[0])
    } catch {
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }

  async function handleConflict() {
    setConflictNotice(true)
    setSlot(null)
    await load()
  }

  // Safe to compute on every render even before pageData has loaded
  // (branding just defaults to the unbranded shape), and kept above the
  // early returns below along with useBookingBranding's own effect so
  // hook order never changes across renders.
  const branding = pageData?.branding || { has_microsite: false, studio_name: null, logo_r2_key: null }
  const { bkVars } = useBookingBranding(branding)

  useEffect(() => {
    document.title = branding.studio_name || pageData?.title || 'Book a session'
  }, [branding.studio_name, pageData?.title])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  if (notFound) return <CenteredMessage title="This link isn't valid" body="Double-check the link, or contact the photographer directly." />
  if (!pageData.active) return <CenteredMessage title={pageData.title} body="This isn't accepting bookings right now." />

  const currentStep = result ? null : (slot || inquirySelection) ? 3 : shootType ? 2 : 1

  return (
    <div style={{ ...bkVars, background: 'var(--bk-bg)', color: 'var(--bk-ink)', fontFamily: 'var(--bk-font-body)' }} className="min-h-screen lg:flex">
      <BookingHero branding={branding} pageData={pageData} />

      <div className="flex-1 px-4 py-8 lg:ml-[400px] lg:flex lg:justify-center lg:px-12 lg:py-16">
        <div className="max-w-md w-full mx-auto lg:mx-0 lg:max-w-lg">
          {currentStep && <StepIndicator step={currentStep} />}

          {pageData.description && !result && (
            <p className="text-sm mb-6 text-left" style={{ color: 'var(--bk-secondary)', lineHeight: 1.6 }}>{pageData.description}</p>
          )}

          {conflictNotice && !slot && (
            <div className="rounded-xl p-3 mb-4 text-xs text-center" style={{ background: 'var(--danger-subtle)', color: 'var(--danger)' }}>
              That time was just booked by someone else — pick another below.
            </div>
          )}

          {result ? (
            <SuccessStep pageData={pageData} shootType={shootType} result={result} />
          ) : (slot || inquirySelection) ? (
            <DetailsStep
              pageData={pageData} shootType={shootType} slot={slot} inquirySelection={inquirySelection}
              onBack={() => { setSlot(null); setInquirySelection(null) }}
              onConfirmed={r => setResult(r)}
              onConflict={handleConflict}
            />
          ) : shootType ? (
            pageData.mode === 'inquiry' ? (
              <InquiryDateStep
                pageData={pageData} shootType={shootType}
                showBack={pageData.shoot_types.length > 1}
                onBack={() => setShootType(null)}
                onSelect={setInquirySelection}
              />
            ) : (
              <SlotStep
                pageData={pageData} shootType={shootType}
                showBack={pageData.shoot_types.length > 1}
                onBack={() => setShootType(null)}
                onSelect={setSlot}
              />
            )
          ) : (
            <ShootTypeStep shootTypes={pageData.shoot_types} onSelect={setShootType} />
          )}
        </div>
      </div>
    </div>
  )
}
