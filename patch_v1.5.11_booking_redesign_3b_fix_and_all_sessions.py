#!/usr/bin/env python3
"""
Patch v1.5.11 -- booking-page redesign, step 3 fix + extends branding to
the All Sessions chooser page.

Requires steps 1-3 already applied (patch_v1.5.11_booking_redesign_1_data.py,
_2_icons.py, _3_branding.py).

Two things prompted this patch:

1. BUG FIX: the logo in step 3's header was being force-cropped into a
   44x44 circle (object-fit: cover), which mangles any logo that isn't
   already square -- most studio logos are wide wordmarks, so this cut
   most of the actual logo off. Fixed to match how MicrositeRenderer.jsx's
   own nav logo already renders (.ms-logo-img: height-constrained,
   object-fit: contain, no crop) -- the circular treatment now only
   applies to the initials fallback, which is what it was actually
   designed for.

2. EXTENDS the same branding/theme treatment (header + colors + font) to
   src/routes/AllSessionsBooking.jsx, the /book/all/:token chooser page --
   approved as in-scope alongside the fix. It already had branding data
   available (step 1's RPC migration added it to get_signup_pages_by_token
   too), it just wasn't being used yet.

Along the way, the branding/theme derivation logic that was inline in
SignupBooking.jsx (from step 3) is pulled out into two shared files so
both booking pages use exactly the same logic instead of two copies that
could drift apart:
  - src/utils/bookingBranding.js -- the useBookingBranding() hook,
    brandingLogoUrl(), getInitials()
  - src/components/booking/BrandHeader.jsx -- the logo/initials + studio
    name header itself

This is a pure refactor for SignupBooking.jsx beyond the logo fix --
nothing about how it looks or behaves changes except the logo sizing.

Run from the repo root, after steps 1-3. Idempotent -- safe to run twice.
"""
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent


def write_file(rel_path, content):
    path = ROOT / rel_path
    if path.exists() and path.read_text() == content:
        print(f"  (no changes needed -- {rel_path} already up to date)")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)
    print(f"Wrote {rel_path}")


def replace_whole_file(rel_path, expected_old, new_content):
    path = ROOT / rel_path
    current = path.read_text()
    if current == new_content:
        print(f"  (no changes needed -- {rel_path} already patched)")
        return
    assert current == expected_old, (
        f"{rel_path}: file doesn't match the expected pre-patch state (steps 1-3 applied).\n"
        f"Make sure the booking-redesign patches 1, 2, and 3 have all been run first."
    )
    path.write_text(new_content)
    print(f"Patched {rel_path}")


write_file("src/utils/bookingBranding.js", '''// Shared branding/theme resolution for every public booking page
// (SignupBooking.jsx, AllSessionsBooking.jsx) that reads the `branding`
// object every booking RPC returns (sql/058_booking_page_branding.sql).
// Pulled into its own file, rather than duplicated per page, so the two
// pages can never drift out of sync on how branding becomes actual
// colors/fonts -- same reasoning micrositeThemeOptions.js documents for
// THEME_OPTIONS itself.
import { useEffect } from 'react'
import {
  THEME_OPTIONS, DEFAULT_THEME, FONT_PAIRINGS, DEFAULT_FONT_PAIRING,
  DISPLAY_FONT_OPTIONS, BODY_FONT_OPTIONS, DEFAULT_CUSTOM_DISPLAY, DEFAULT_CUSTOM_BODY,
} from './micrositeThemeOptions.js'
import { hexToRgb, getAccentButtonTextColor } from './accentColor.js'

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL

// A photographer's account-level logo (set with no microsite, or with a
// microsite that's since been disabled) can't safely be previewed here --
// the R2 worker's verifyMicrositeAccess only serves a preview when an
// ENABLED microsite exists for that photographer at all (see
// r2-worker/src/middleware/micrositeAccess.js), regardless of which
// specific image is being requested. So this only ever gets called when
// branding.has_microsite is true, which is exactly when that check will
// pass -- everyone else gets the initials fallback instead of a broken
// image. Extending the worker to also allow a bare account logo through
// without an enabled microsite is possible later, but that's a Worker
// deploy, a separate change from anything in this file.
export function brandingLogoUrl(key) {
  return `${WORKER_URL}/preview/${encodeURIComponent(key)}?microsite=1`
}

export function getInitials(name) {
  const parts = (name || '').trim().split(/\\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Resolves a `branding` object into a set of --bk-* CSS custom properties
// (spread onto a page's outer wrapper) plus the raw theme/pairing, and
// loads the microsite's own Google Fonts stylesheet when there's an
// actual pairing to load. When branding.has_microsite is false, every
// variable just aliases the app's existing tokens (var(--bg) etc.) and
// the existing default indigo -- so a page with no branding to apply
// renders exactly as FinalVault's own default look, dark mode included,
// never an invented in-between style.
export function useBookingBranding(branding) {
  const hasMicrosite = !!branding?.has_microsite

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

  // Same MicrositeRenderer.jsx pattern (load only the chosen pairing's
  // stylesheet, not all of them) -- and the same pre-existing
  // react-hooks/exhaustive-deps warning that file already has for the
  // identical reason: depending on `pairing` itself (a new object every
  // render) instead of the primitive fields it's built from would loop.
  useEffect(() => {
    if (!hasMicrosite || !pairing) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = `https://fonts.googleapis.com/css2?${pairing.googleFonts}&display=swap`
    document.head.appendChild(link)
    return () => { document.head.removeChild(link) }
  }, [hasMicrosite, branding?.font_pairing, branding?.custom_display_font, branding?.custom_body_font])

  return { hasMicrosite, theme, pairing, bkVars }
}
''')
write_file("src/components/booking/BrandHeader.jsx", '''// Shared header for the public booking pages -- a photographer's logo (or
// an initials avatar when there isn't one to show, see brandingLogoUrl's
// own comment for why) plus their studio name. Used by both
// SignupBooking.jsx and AllSessionsBooking.jsx so the two stay visually
// identical here rather than maintaining two copies that can drift.
import { brandingLogoUrl, getInitials } from '../../utils/bookingBranding.js'

export default function BrandHeader({ branding }) {
  const hasLogo = branding.has_microsite && !!branding.logo_r2_key
  return (
    <div className="flex flex-col items-center gap-2 mb-5">
      {hasLogo ? (
        // Sized and fitted the same way MicrositeRenderer.jsx's own nav
        // logo is (.ms-logo-img: height-constrained, object-fit: contain)
        // -- NOT force-cropped into a square/circle. Most studio logos are
        // wide wordmarks, not square marks, so a fixed-size circular crop
        // (the initials avatar's treatment, which suits a single letter
        // or two) cuts most of a real logo off.
        <img src={brandingLogoUrl(branding.logo_r2_key)} alt={branding.studio_name || 'Photographer logo'}
          style={{ height: 44, maxWidth: 220, objectFit: 'contain', flexShrink: 0 }} />
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
''')

SIGNUP_BOOKING_OLD = '''import { useState, useEffect } from 'react'
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

SIGNUP_BOOKING_NEW = '''import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { CalendarDays, MapPin, Clock, ChevronLeft, Check, Calendar } from 'lucide-react'
import { supabaseAnon } from '../supabaseClientAnon.js'
import { SessionTypeIcon } from '../utils/sessionTypeIcon.jsx'
import { useBookingBranding } from '../utils/bookingBranding.js'
import BrandHeader from '../components/booking/BrandHeader.jsx'

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

replace_whole_file("src/routes/SignupBooking.jsx", SIGNUP_BOOKING_OLD, SIGNUP_BOOKING_NEW)

ALL_SESSIONS_OLD = '''import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { MapPin, CalendarDays, Camera } from 'lucide-react'
import { supabaseAnon } from '../supabaseClientAnon.js'

// ── Data (anonymous, via supabaseAnon -- same isolation pattern as
// SignupBooking.jsx: this is a fully public page, so it never touches the
// authenticated `supabase` client or anything that could carry a leaked
// photographer session along with the request. See supabaseClientAnon.js's
// own comment. ) ──────────────────────────────────────────────────────────

async function getSignupPagesByToken(token) {
  const { data, error } = await supabaseAnon.rpc('get_signup_pages_by_token', { p_token: token })
  if (error) throw error
  return data
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

// Nick's explicit requirement: each row shows its dates, not just the
// title/venue -- formatted from the earliest/latest OPEN future slot the
// RPC already computed server-side, in that page's own timezone.
function formatSessionDates(page) {
  if (!page.earliest_open_slot) return 'No upcoming times open'
  const start = new Date(page.earliest_open_slot)
  const end = page.latest_open_slot ? new Date(page.latest_open_slot) : start
  const fmt = d => d.toLocaleDateString('en-US', { timeZone: page.timezone, month: 'short', day: 'numeric' })
  const startStr = fmt(start)
  const endStr = fmt(end)
  return startStr === endStr ? startStr : `${startStr} – ${endStr}`
}

function SignupPageRow({ page }) {
  const hasOpenSlots = !!page.earliest_open_slot
  return (
    <Link to={`/book/${page.token}`}
      className="w-full flex items-center gap-3 text-left rounded-xl p-3.5 transition-colors"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', textDecoration: 'none', cursor: 'pointer' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.background = 'rgba(99,102,241,0.06)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface)' }}>
      <div className="flex items-center justify-center rounded-lg flex-shrink-0" style={{ width: 36, height: 36, background: 'rgba(99,102,241,0.1)' }}>
        <Camera size={17} style={{ color: '#6366f1' }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{page.title}</p>
        <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: hasOpenSlots ? 'var(--text-muted)' : 'var(--danger)' }}>
          <CalendarDays size={11} style={{ flexShrink: 0 }} />
          {formatSessionDates(page)}
        </p>
        {page.venue_address && (
          <p className="text-xs mt-1 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
            <MapPin size={11} style={{ flexShrink: 0 }} />
            {page.venue_address}
          </p>
        )}
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
        <path d="m9 18 6-6-6-6" />
      </svg>
    </Link>
  )
}

export default function AllSessionsBooking() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => { load() }, [token])

  async function load() {
    setLoading(true)
    try {
      const result = await getSignupPagesByToken(token)
      if (!result || result.type === 'not_found') { setNotFound(true); return }
      // Single active session: skip the chooser entirely and go straight
      // to its own booking page, per the agreed passthrough behavior.
      if (result.signup_pages.length === 1) {
        navigate(`/book/${result.signup_pages[0].token}`, { replace: true })
        return
      }
      setData(result)
    } catch {
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  if (notFound) return <CenteredMessage title="This link isn't valid" body="Double-check the link, or contact the photographer directly." />
  if (!data) return null
  if (data.signup_pages.length === 0) return <CenteredMessage title={data.business_name || 'No sessions open'} body="Nothing is open for booking right now. Check back soon, or contact the photographer directly." />

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: 'var(--bg)' }}>
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <p className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{data.business_name}</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Choose a session to book</p>
        </div>

        <div className="space-y-2">
          {data.signup_pages.map(page => <SignupPageRow key={page.id} page={page} />)}
        </div>
      </div>
    </div>
  )
}
'''

ALL_SESSIONS_NEW = '''import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { MapPin, CalendarDays, Camera } from 'lucide-react'
import { supabaseAnon } from '../supabaseClientAnon.js'
import { useBookingBranding } from '../utils/bookingBranding.js'
import BrandHeader from '../components/booking/BrandHeader.jsx'

// ── Data (anonymous, via supabaseAnon -- same isolation pattern as
// SignupBooking.jsx: this is a fully public page, so it never touches the
// authenticated `supabase` client or anything that could carry a leaked
// photographer session along with the request. See supabaseClientAnon.js's
// own comment. ) ──────────────────────────────────────────────────────────

async function getSignupPagesByToken(token) {
  const { data, error } = await supabaseAnon.rpc('get_signup_pages_by_token', { p_token: token })
  if (error) throw error
  return data
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

// Nick's explicit requirement: each row shows its dates, not just the
// title/venue -- formatted from the earliest/latest OPEN future slot the
// RPC already computed server-side, in that page's own timezone.
function formatSessionDates(page) {
  if (!page.earliest_open_slot) return 'No upcoming times open'
  const start = new Date(page.earliest_open_slot)
  const end = page.latest_open_slot ? new Date(page.latest_open_slot) : start
  const fmt = d => d.toLocaleDateString('en-US', { timeZone: page.timezone, month: 'short', day: 'numeric' })
  const startStr = fmt(start)
  const endStr = fmt(end)
  return startStr === endStr ? startStr : `${startStr} – ${endStr}`
}

function SignupPageRow({ page }) {
  const hasOpenSlots = !!page.earliest_open_slot
  return (
    <Link to={`/book/${page.token}`}
      className="w-full flex items-center gap-3 text-left rounded-xl p-3.5 transition-colors"
      style={{ background: 'var(--bk-surface)', border: '1px solid var(--bk-border)', textDecoration: 'none', cursor: 'pointer' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--bk-accent)'; e.currentTarget.style.background = 'rgba(var(--bk-accent-rgb), 0.06)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bk-border)'; e.currentTarget.style.background = 'var(--bk-surface)' }}>
      <div className="flex items-center justify-center rounded-lg flex-shrink-0" style={{ width: 36, height: 36, background: 'rgba(var(--bk-accent-rgb), 0.1)' }}>
        <Camera size={17} style={{ color: 'var(--bk-accent)' }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold" style={{ color: 'var(--bk-ink)' }}>{page.title}</p>
        <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: hasOpenSlots ? 'var(--bk-muted)' : 'var(--danger)' }}>
          <CalendarDays size={11} style={{ flexShrink: 0 }} />
          {formatSessionDates(page)}
        </p>
        {page.venue_address && (
          <p className="text-xs mt-1 flex items-center gap-1" style={{ color: 'var(--bk-muted)' }}>
            <MapPin size={11} style={{ flexShrink: 0 }} />
            {page.venue_address}
          </p>
        )}
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--bk-muted)', flexShrink: 0 }}>
        <path d="m9 18 6-6-6-6" />
      </svg>
    </Link>
  )
}

export default function AllSessionsBooking() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => { load() }, [token])

  async function load() {
    setLoading(true)
    try {
      const result = await getSignupPagesByToken(token)
      if (!result || result.type === 'not_found') { setNotFound(true); return }
      // Single active session: skip the chooser entirely and go straight
      // to its own booking page, per the agreed passthrough behavior.
      if (result.signup_pages.length === 1) {
        navigate(`/book/${result.signup_pages[0].token}`, { replace: true })
        return
      }
      setData(result)
    } catch {
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }

  // Safe before data has loaded (branding just defaults to the unbranded
  // shape) -- kept above the early returns below along with
  // useBookingBranding's own effect so hook order never changes across
  // renders. Same reasoning as SignupBooking.jsx.
  const branding = data?.branding || { has_microsite: false, studio_name: null, logo_r2_key: null }
  const { bkVars } = useBookingBranding(branding)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  if (notFound) return <CenteredMessage title="This link isn't valid" body="Double-check the link, or contact the photographer directly." />
  if (!data) return null
  if (data.signup_pages.length === 0) return <CenteredMessage title={data.business_name || 'No sessions open'} body="Nothing is open for booking right now. Check back soon, or contact the photographer directly." />

  return (
    <div className="min-h-screen px-4 py-8" style={{ ...bkVars, background: 'var(--bk-bg)', color: 'var(--bk-ink)', fontFamily: 'var(--bk-font-body)' }}>
      <div className="max-w-md mx-auto">
        <BrandHeader branding={branding} />

        <div className="text-center mb-6">
          <p className="text-sm" style={{ color: 'var(--bk-muted)' }}>Choose a session to book</p>
        </div>

        <div className="space-y-2">
          {data.signup_pages.map(page => <SignupPageRow key={page.id} page={page} />)}
        </div>
      </div>
    </div>
  )
}
'''

replace_whole_file("src/routes/AllSessionsBooking.jsx", ALL_SESSIONS_OLD, ALL_SESSIONS_NEW)

print("\nDone. Check:")
print("  1. A branded booking page's logo now shows the WHOLE logo (any aspect ratio),")
print("     not cropped into a circle -- only the initials fallback is still a circle.")
print("  2. /book/all/<a real all_sessions_token> now shows the same logo/initials +")
print("     studio name header, and the list rows are tinted with the theme accent when")
print("     that photographer has an enabled microsite (indigo otherwise, same as before).")
print("  3. Re-click through a full booking on both pages once more to confirm the")
print("     refactor didn't change any behavior.")
