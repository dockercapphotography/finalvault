#!/usr/bin/env python3
"""
Patch v1.5.11 -- booking-page redesign, Phase 1 / step 3 of 4: branding + theme fallback.

Requires steps 1 and 2 already applied (patch_v1.5.11_booking_redesign_1_data.py,
patch_v1.5.11_booking_redesign_2_icons.py) -- this reads the `branding` object
step 1's RPC migration added.

This is the actual visual heart of the redesign. src/routes/SignupBooking.jsx
now:

- Shows the photographer's logo (only when they have an ENABLED microsite --
  see the comment above brandingLogoUrl() in the new file for exactly why an
  account-level logo can't safely be shown otherwise) or an initials avatar,
  plus their studio name, above the page title. Previously nothing was shown
  here at all.
- When branding.has_microsite is true: applies that microsite's actual theme
  (THEME_OPTIONS), accent color, and font pairing throughout the page, via a
  set of --bk-* CSS custom properties set on the page's outer wrapper (bg,
  surface, border, ink, muted, accent, accent-on-accent text, and the two
  fonts). So a photographer with, say, Cool Slate + a red accent sees their
  booking page actually look like their site.
- When branding.has_microsite is false: every --bk-* variable is set to just
  alias the existing var(--bg)/var(--text)/etc. app tokens plus the existing
  hardcoded indigo, so the page looks EXACTLY as it does today (including
  correctly following the app's own dark mode, since those app tokens
  already do). No invented default look, no cream -- this was the explicit
  correction from earlier in the redesign discussion: the fallback is
  FinalVault's own real default, not a guessed "branded-ish" style.
- Loading state and the not-found/inactive-link messages stay completely
  unbranded on purpose -- branding data isn't available yet (or ever, for
  those states -- see the RPC in step 1), so there's nothing to apply.

Nothing about AllSessionsBooking.jsx (the /book/all/:token chooser) is
touched in this step -- see the message accompanying this patch for why
that's deliberately being handled separately.

Run from the repo root, after steps 1 and 2. Idempotent -- safe to run twice,
and safe against a repo that's already at the exact post-step-2 state (it
checks before it writes).
"""
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent


def replace_whole_file(rel_path, expected_old, new_content):
    path = ROOT / rel_path
    current = path.read_text()
    if current == new_content:
        print(f"  (no changes needed -- {rel_path} already patched)")
        return
    assert current == expected_old, (
        f"{rel_path}: file doesn't match the expected pre-patch state (steps 1+2 applied).\n"
        f"Make sure patch_v1.5.11_booking_redesign_1_data.py and "
        f"patch_v1.5.11_booking_redesign_2_icons.py have both been run first."
    )
    path.write_text(new_content)
    print(f"Patched {rel_path}")


OLD_CONTENT = '''import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { CalendarDays, MapPin, Clock, ChevronLeft, Check, Calendar } from 'lucide-react'
import { supabaseAnon } from '../supabaseClientAnon.js'
import { SessionTypeIcon } from '../utils/sessionTypeIcon.jsx'

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

// Same list already used for clients elsewhere in the app (ClientDetail.jsx,
// Clients.jsx) -- kept in sync manually since it's just a few inline
// <option> tags there too, not an extracted shared constant.
const PRONOUN_OPTIONS = ['she/her', 'he/him', 'they/them', 'she/they', 'he/they', 'ze/hir', 'xe/xem', 'Prefer not to say']

// ── Calendar links (no auth, no backend -- see project discussion: this is
// a one-time "add this booking" action, not an ongoing subscription feed) ──

function googleCalendarUrl({ title, startTime, endTime, location, details }) {
  const fmt = iso => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\\.\\d{3}Z$/, 'Z')
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
  const fmt = iso => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\\.\\d{3}Z$/, 'Z')
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
  ].filter(Boolean).join('\\r\\n')
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
                background: step >= s.n ? '#6366f1' : 'var(--surface-raised)',
                color: step >= s.n ? '#fff' : 'var(--text-muted)',
              }}>
              {s.n}
            </div>
            <span className="text-xs" style={{ color: step >= s.n ? 'var(--text)' : 'var(--text-muted)', fontWeight: step === s.n ? 500 : 400 }}>{s.label}</span>
          </div>
          {i < steps.length - 1 && <div style={{ width: 20, height: 1, background: 'var(--border)', marginLeft: 4 }} />}
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
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.background = 'rgba(99,102,241,0.06)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface)' }}>
          <div className="flex items-center justify-center rounded-lg flex-shrink-0" style={{ width: 36, height: 36, background: 'rgba(99,102,241,0.1)' }}>
            <SessionTypeIcon type={t.session_type} size={17} color="#6366f1" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{t.name}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{t.duration_minutes} minutes</p>
            {t.description && <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{t.description}</p>}
          </div>
          {(t.price != null || t.retainer_amount != null) && (
            <div className="ml-auto flex-shrink-0 text-right">
              {t.price != null && (
                <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                  Price: ${parseFloat(t.price).toFixed(2)}
                </p>
              )}
              {t.retainer_amount != null && (
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
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
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>{day}</p>
            <div className="grid grid-cols-3 gap-2">
              {slots.map(slot => (
                <button key={slot.id} onClick={() => onSelect(slot)}
                  className="text-sm font-medium px-3 py-2.5 rounded-lg transition-colors"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#6366f1'; e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.color = '#fff' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text)' }}>
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

function DetailsStep({ pageData, shootType, slot, onBack, onConfirmed, onConflict }) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [pronouns, setPronouns] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const canSubmit = firstName.trim() && lastName.trim() && email.trim()

  async function handleConfirm() {
    if (!canSubmit || submitting) return
    setSubmitting(true)
    setError(null)
    try {
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
    width: '100%', background: 'var(--surface)', border: '1px solid var(--border)',
    color: 'var(--text)', borderRadius: 8, padding: '10px 12px', fontSize: 14, outline: 'none',
  }

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-xs font-medium mb-4"
        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
        <ChevronLeft size={13} />Pick a different time
      </button>

      <div className="rounded-xl p-4 mb-5" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}>
        <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{shootType.name}</p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          {new Date(slot.start_time).toLocaleString('en-US', { timeZone: pageData.timezone, weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </p>
        {pageData.venue_address && <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{pageData.venue_address}</p>}
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
            background: '#6366f1', color: '#fff', border: 'none',
            cursor: (!canSubmit || submitting) ? 'not-allowed' : 'pointer',
            opacity: (!canSubmit || submitting) ? 0.6 : 1,
          }}>
          {submitting ? 'Confirming...' : 'Confirm booking'}
        </button>
      </div>
    </div>
  )
}

function SuccessStep({ pageData, shootType, result }) {
  const calendarArgs = {
    title: `${shootType.name} — ${pageData.title}`,
    startTime: result.start_time,
    endTime: result.end_time,
    location: result.venue,
    details: `Booked via ${pageData.title}`,
  }

  return (
    <div className="text-center">
      <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(99,102,241,0.1)' }}>
        <Check size={20} style={{ color: '#6366f1' }} />
      </div>
      <p className="text-base font-medium" style={{ color: 'var(--text)' }}>You're booked!</p>
      <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{result.shoot_type}</p>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        {new Date(result.start_time).toLocaleString('en-US', { timeZone: pageData.timezone, weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
      </p>
      {result.venue && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{result.venue}</p>}

      <div className="flex items-center justify-center gap-2 mt-6">
        <a href={googleCalendarUrl(calendarArgs)} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', textDecoration: 'none' }}>
          <Calendar size={13} />Add to Google Calendar
        </a>
        <button onClick={() => downloadIcs(calendarArgs)}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer' }}>
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
  const [result, setResult] = useState(null)
  const [conflictNotice, setConflictNotice] = useState(false)

  useEffect(() => { load() }, [token])

  async function load() {
    setLoading(true)
    try {
      const data = await getSignupPageData(token)
      if (!data) { setNotFound(true); return }
      setPageData(data)
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  if (notFound) return <CenteredMessage title="This link isn't valid" body="Double-check the link, or contact the photographer directly." />
  if (!pageData.active) return <CenteredMessage title={pageData.title} body="This isn't accepting bookings right now." />

  const currentStep = result ? null : slot ? 3 : shootType ? 2 : 1

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: 'var(--bg)' }}>
      <div className="max-w-md mx-auto">
        {currentStep && <StepIndicator step={currentStep} />}

        <div className="text-center mb-6">
          <p className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{pageData.title}</p>
          {pageData.venue_address && (
            <p className="text-xs mt-1 flex items-center justify-center gap-1" style={{ color: 'var(--text-muted)' }}>
              <MapPin size={11} />{pageData.venue_address}
            </p>
          )}
          {pageData.description && !result && (
            <p className="text-sm mt-4 text-left" style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>{pageData.description}</p>
          )}
        </div>

        {conflictNotice && !slot && (
          <div className="rounded-xl p-3 mb-4 text-xs text-center" style={{ background: 'var(--danger-subtle)', color: 'var(--danger)' }}>
            That time was just booked by someone else — pick another below.
          </div>
        )}

        {result ? (
          <SuccessStep pageData={pageData} shootType={shootType} result={result} />
        ) : slot ? (
          <DetailsStep
            pageData={pageData} shootType={shootType} slot={slot}
            onBack={() => setSlot(null)}
            onConfirmed={r => setResult(r)}
            onConflict={handleConflict}
          />
        ) : shootType ? (
          <SlotStep
            pageData={pageData} shootType={shootType}
            showBack={pageData.shoot_types.length > 1}
            onBack={() => setShootType(null)}
            onSelect={setSlot}
          />
        ) : (
          <ShootTypeStep shootTypes={pageData.shoot_types} onSelect={setShootType} />
        )}
      </div>
    </div>
  )
}
'''

NEW_CONTENT = '''import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { CalendarDays, MapPin, Clock, ChevronLeft, Check, Calendar } from 'lucide-react'
import { supabaseAnon } from '../supabaseClientAnon.js'
import { SessionTypeIcon } from '../utils/sessionTypeIcon.jsx'
import {
  THEME_OPTIONS, DEFAULT_THEME, FONT_PAIRINGS, DEFAULT_FONT_PAIRING,
  DISPLAY_FONT_OPTIONS, BODY_FONT_OPTIONS, DEFAULT_CUSTOM_DISPLAY, DEFAULT_CUSTOM_BODY,
} from '../utils/micrositeThemeOptions.js'
import { hexToRgb, getAccentButtonTextColor } from '../utils/accentColor.js'

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL

// A photographer's account-level logo (set with no microsite, or with a
// microsite that's since been disabled) can't safely be previewed here --
// the R2 worker's verifyMicrositeAccess only serves a preview when an
// ENABLED microsite exists for that photographer at all (see
// r2-worker/src/middleware/micrositeAccess.js), regardless of which
// specific image is being requested. So this only ever gets called when
// branding.has_microsite is true, which is exactly when that check will
// pass -- everyone else gets the initials fallback below instead of a
// broken image. Extending the worker to also allow a bare account logo
// through without an enabled microsite is possible later, but that's a
// Worker deploy, a separate change from this patch.
function brandingLogoUrl(key) {
  return `${WORKER_URL}/preview/${encodeURIComponent(key)}?microsite=1`
}

function getInitials(name) {
  const parts = (name || '').trim().split(/\\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

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

// Same list already used for clients elsewhere in the app (ClientDetail.jsx,
// Clients.jsx) -- kept in sync manually since it's just a few inline
// <option> tags there too, not an extracted shared constant.
const PRONOUN_OPTIONS = ['she/her', 'he/him', 'they/them', 'she/they', 'he/they', 'ze/hir', 'xe/xem', 'Prefer not to say']

// ── Calendar links (no auth, no backend -- see project discussion: this is
// a one-time "add this booking" action, not an ongoing subscription feed) ──

function googleCalendarUrl({ title, startTime, endTime, location, details }) {
  const fmt = iso => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\\.\\d{3}Z$/, 'Z')
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
  const fmt = iso => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\\.\\d{3}Z$/, 'Z')
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
  ].filter(Boolean).join('\\r\\n')
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

// Logo (if the photographer's enabled microsite has one) or an initials
// avatar, plus their studio name -- previously nothing at all was shown
// here besides the signup page's own title further down. Deliberately
// its own component: BrandHeader only ever needs `branding`, never the
// rest of pageData, so it can't accidentally end up depending on
// something that isn't actually available in every state this page can
// be in (see the has_microsite / logo gating notes above brandingLogoUrl).
function BrandHeader({ branding }) {
  const hasLogo = branding.has_microsite && !!branding.logo_r2_key
  return (
    <div className="flex flex-col items-center gap-2 mb-5">
      {hasLogo ? (
        <img src={brandingLogoUrl(branding.logo_r2_key)} alt={branding.studio_name || 'Photographer logo'}
          style={{ width: 44, height: 44, borderRadius: 999, objectFit: 'cover', border: '1px solid var(--bk-border)', flexShrink: 0 }} />
      ) : (
        <div className="flex items-center justify-center rounded-full flex-shrink-0"
          style={{ width: 44, height: 44, background: 'var(--bk-accent)', color: 'var(--bk-accent-button-text)', fontSize: 15, fontWeight: 600 }}>
          {getInitials(branding.studio_name)}
        </div>
      )}
      {branding.studio_name && (
        <p className="text-sm font-semibold" style={{ color: 'var(--bk-ink)', fontFamily: 'var(--bk-font-display)' }}>{branding.studio_name}</p>
      )}
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

function DetailsStep({ pageData, shootType, slot, onBack, onConfirmed, onConflict }) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [pronouns, setPronouns] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const canSubmit = firstName.trim() && lastName.trim() && email.trim()

  async function handleConfirm() {
    if (!canSubmit || submitting) return
    setSubmitting(true)
    setError(null)
    try {
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
        <ChevronLeft size={13} />Pick a different time
      </button>

      <div className="rounded-xl p-4 mb-5" style={{ background: 'var(--bk-bg-subtle)', border: '1px solid var(--bk-border)' }}>
        <p className="text-sm font-semibold" style={{ color: 'var(--bk-ink)' }}>{shootType.name}</p>
        <p className="text-xs mt-1" style={{ color: 'var(--bk-muted)' }}>
          {new Date(slot.start_time).toLocaleString('en-US', { timeZone: pageData.timezone, weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </p>
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
          {submitting ? 'Confirming...' : 'Confirm booking'}
        </button>
      </div>
    </div>
  )
}

function SuccessStep({ pageData, shootType, result }) {
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
  const [result, setResult] = useState(null)
  const [conflictNotice, setConflictNotice] = useState(false)

  useEffect(() => { load() }, [token])

  async function load() {
    setLoading(true)
    try {
      const data = await getSignupPageData(token)
      if (!data) { setNotFound(true); return }
      setPageData(data)
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

  // Branding derivation -- safe to compute on every render even before
  // pageData has loaded (branding just defaults to the unbranded shape),
  // and kept above the early returns below along with the two effects
  // that depend on it so hook order never changes across renders.
  const branding = pageData?.branding || { has_microsite: false, studio_name: null, logo_r2_key: null }
  const hasMicrosite = !!branding.has_microsite

  const theme = hasMicrosite
    ? (THEME_OPTIONS.find(t => t.id === branding.theme) || THEME_OPTIONS.find(t => t.id === DEFAULT_THEME))
    : null

  const pairing = hasMicrosite
    ? (branding.font_pairing === 'custom'
        ? (() => {
            const displayFont = DISPLAY_FONT_OPTIONS.find(f => f.id === branding.custom_display_font) || DISPLAY_FONT_OPTIONS.find(f => f.id === DEFAULT_CUSTOM_DISPLAY)
            const bodyFont = BODY_FONT_OPTIONS.find(f => f.id === branding.custom_body_font) || BODY_FONT_OPTIONS.find(f => f.id === DEFAULT_CUSTOM_BODY)
            return { display: displayFont.family, body: bodyFont.family, googleFonts: `${displayFont.googleFonts}&${bodyFont.googleFonts}` }
          })()
        : FONT_PAIRINGS[branding.font_pairing] || FONT_PAIRINGS[DEFAULT_FONT_PAIRING])
    : null

  // Same default MicrositeRenderer.jsx falls back to when a microsite has
  // no accent_color set yet, so a booking page always matches its own
  // microsite's real look rather than picking a different default color.
  const accent = hasMicrosite ? (branding.accent_color || '#B5651D') : '#6366f1'
  const { r: accentR, g: accentG, b: accentB } = hexToRgb(accent)
  const accentButtonText = getAccentButtonTextColor(accent)

  const bkVars = {
    '--bk-bg': hasMicrosite ? theme.bg : 'var(--bg)',
    '--bk-surface': hasMicrosite ? theme.paper : 'var(--surface)',
    '--bk-bg-subtle': hasMicrosite ? theme.paper : 'var(--bg-subtle)',
    '--bk-border': hasMicrosite ? theme.line : 'var(--border)',
    '--bk-ink': hasMicrosite ? theme.ink : 'var(--text)',
    '--bk-muted': hasMicrosite ? theme.muted : 'var(--text-muted)',
    '--bk-secondary': hasMicrosite ? theme.muted : 'var(--text-secondary)',
    '--bk-accent': accent,
    '--bk-accent-rgb': `${accentR}, ${accentG}, ${accentB}`,
    '--bk-accent-button-text': accentButtonText,
    '--bk-font-display': hasMicrosite ? pairing.display : 'inherit',
    '--bk-font-body': hasMicrosite ? pairing.body : 'inherit',
  }

  // Only load a Google Fonts stylesheet when there's an actual microsite
  // font pairing to load -- the unbranded default just inherits the
  // app's own already-loaded Geist font (see index.css), no extra
  // network request needed.
  useEffect(() => {
    if (!hasMicrosite || !pairing) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = `https://fonts.googleapis.com/css2?${pairing.googleFonts}&display=swap`
    document.head.appendChild(link)
    return () => { document.head.removeChild(link) }
  }, [hasMicrosite, branding.font_pairing, branding.custom_display_font, branding.custom_body_font])

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

  const currentStep = result ? null : slot ? 3 : shootType ? 2 : 1

  return (
    <div className="min-h-screen px-4 py-8" style={{ ...bkVars, background: 'var(--bk-bg)', color: 'var(--bk-ink)', fontFamily: 'var(--bk-font-body)' }}>
      <div className="max-w-md mx-auto">
        <BrandHeader branding={branding} />

        {currentStep && <StepIndicator step={currentStep} />}

        <div className="text-center mb-6">
          <p className="text-lg font-semibold" style={{ color: 'var(--bk-ink)', fontFamily: 'var(--bk-font-display)' }}>{pageData.title}</p>
          {pageData.venue_address && (
            <p className="text-xs mt-1 flex items-center justify-center gap-1" style={{ color: 'var(--bk-muted)' }}>
              <MapPin size={11} />{pageData.venue_address}
            </p>
          )}
          {pageData.description && !result && (
            <p className="text-sm mt-4 text-left" style={{ color: 'var(--bk-secondary)', lineHeight: 1.6 }}>{pageData.description}</p>
          )}
        </div>

        {conflictNotice && !slot && (
          <div className="rounded-xl p-3 mb-4 text-xs text-center" style={{ background: 'var(--danger-subtle)', color: 'var(--danger)' }}>
            That time was just booked by someone else — pick another below.
          </div>
        )}

        {result ? (
          <SuccessStep pageData={pageData} shootType={shootType} result={result} />
        ) : slot ? (
          <DetailsStep
            pageData={pageData} shootType={shootType} slot={slot}
            onBack={() => setSlot(null)}
            onConfirmed={r => setResult(r)}
            onConflict={handleConflict}
          />
        ) : shootType ? (
          <SlotStep
            pageData={pageData} shootType={shootType}
            showBack={pageData.shoot_types.length > 1}
            onBack={() => setShootType(null)}
            onSelect={setSlot}
          />
        ) : (
          <ShootTypeStep shootTypes={pageData.shoot_types} onSelect={setShootType} />
        )}
      </div>
    </div>
  )
}
'''

replace_whole_file("src/routes/SignupBooking.jsx", OLD_CONTENT, NEW_CONTENT)

print("\nDone. Check:")
print("  1. A booking page for a photographer WITH an enabled microsite -- colors, font,")
print("     and logo/initials should now match that microsite's own theme and accent.")
print("  2. A booking page for a photographer WITHOUT an enabled microsite -- should look")
print("     exactly as it did before (indigo accent, app default colors), just with an")
print("     initials avatar + studio name now showing at the top.")
print("  3. Click through all 3 steps and the success screen on both, to confirm nothing")
print("     broke -- slot picking, the confirm button, calendar links.")
