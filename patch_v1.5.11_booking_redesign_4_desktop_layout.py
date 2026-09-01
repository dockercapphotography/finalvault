#!/usr/bin/env python3
"""
Patch v1.5.11 -- booking-page redesign, step 4: desktop-responsive layout
+ illustrated cover-image placeholder for /book/:token.

Requires steps 1, 2, 3, and 3b already applied (patch_v1.5.11_booking_redesign_
1_data.py, _2_icons.py, _3_branding.py, _3b_fix_and_all_sessions.py).

This closes out "Phase 1" of the booking-page redesign (icons, branding
fallback, and now desktop layout -- all front-end only, no schema changes).
The upload-your-own-cover-image feature is a separate, later phase (needs
its own DB column + RPC change) -- this ships the illustrated placeholder
from the mockups instead, so the page looks finished on desktop today
without waiting on that.

Four files change:

1. NEW src/components/booking/BookingCover.jsx -- the illustrated
   "mountains" SVG pattern shown above the booking title. Tinted entirely
   through the existing --bk-accent/--bk-ink/--bk-bg variables, so it's
   automatically correct for every microsite theme and for the
   no-microsite default (a quiet neutral pattern, never an invented
   "branded-ish" look for photographers without a microsite).

2. MODIFIED src/components/booking/BrandHeader.jsx -- adds an align prop
   ("center", the existing default, or "left") so the same header
   component can also render as a smaller left-aligned lockup for the new
   desktop rail, without duplicating it.

3. NEW src/components/booking/BookingHero.jsx -- combines BrandHeader and
   BookingCover into the actual responsive hero: on mobile, the existing
   stacked header -> cover strip -> overlapping title card; on desktop
   (lg breakpoint, 1024px+), a fixed full-height left rail (400px wide)
   with the cover filling it and the title overlaid at the bottom, while
   the booking flow itself scrolls in the remaining space to the right.
   This mirrors the two-column look from the approved mockups without
   copying their literal dark-scrim/white-text treatment -- everything
   here still reads off the same --bk-* variables, so it stays correct
   for every theme instead of only looking right on dark ones.

4. MODIFIED src/routes/SignupBooking.jsx -- switches from rendering
   BrandHeader + a plain title block directly to rendering the new
   BookingHero, and adds the lg:ml-[400px] content column so the booking
   flow sits to the right of the rail on desktop. Below 1024px wide,
   nothing about the page's behavior changes from step 3b.

Nothing here touches AllSessionsBooking.jsx (the /book/all/:token
chooser) -- that page stays as it is from step 3b; a full-height cover
rail didn't make sense for a page whose whole job is a short list of
links.

Run from the repo root, after steps 1, 2, 3, and 3b. Idempotent -- safe
to run twice.
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
        f"{rel_path}: file doesn't match the expected pre-patch state "
        f"(steps 1, 2, 3, and 3b applied).\n"
        f"Make sure the booking-redesign patches 1, 2, 3, and 3b have all been run first."
    )
    path.write_text(new_content)
    print(f"Patched {rel_path}")

write_file("src/components/booking/BookingCover.jsx", '''// The illustrated placeholder cover shown above a booking page's title,
// standing in for an actual uploaded shoot-type cover image -- that's a
// separate, later feature (needs its own DB column + RPC change, unlike
// everything in this branding pass, which only ever reads existing
// columns). Tinted entirely through the same --bk-accent/--bk-ink/--bk-bg
// CSS variables the rest of the branded page already uses (see
// utils/bookingBranding.js), so it's automatically correct for every
// microsite theme, and for the no-microsite default it just reads as a
// quiet indigo/neutral pattern rather than a literal photo -- never an
// invented "branded-ish" look for photographers without a microsite.
export default function BookingCover({ height = 180 }) {
  return (
    <div style={{ position: 'relative', width: '100%', height, overflow: 'hidden', background: 'linear-gradient(160deg, var(--bk-bg) 0%, var(--bk-surface) 100%)' }}>
      <svg width="100%" height="100%" viewBox="0 0 390 210" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0 }}>
        <circle cx="60" cy="40" r="90" fill="var(--bk-accent)" opacity="0.09" />
        <circle cx="340" cy="170" r="120" fill="var(--bk-ink)" opacity="0.05" />
        <path d="M20 170 L60 110 L100 170 Z" fill="var(--bk-ink)" opacity="0.08" />
        <path d="M90 175 L140 95 L190 175 Z" fill="var(--bk-accent)" opacity="0.14" />
        <path d="M170 178 L215 120 L260 178 Z" fill="var(--bk-ink)" opacity="0.08" />
        <path d="M245 175 L300 100 L355 175 Z" fill="var(--bk-accent)" opacity="0.1" />
        <g opacity="0.45">
          <circle cx="80" cy="60" r="3" fill="var(--bk-ink)" />
          <circle cx="130" cy="45" r="2" fill="var(--bk-ink)" />
          <circle cx="230" cy="55" r="2.5" fill="var(--bk-ink)" />
          <circle cx="300" cy="40" r="3" fill="var(--bk-ink)" />
          <circle cx="330" cy="65" r="2" fill="var(--bk-ink)" />
        </g>
      </svg>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 45%, var(--bk-bg) 100%)' }} />
    </div>
  )
}
''')
write_file("src/components/booking/BookingHero.jsx", '''import { MapPin } from 'lucide-react'
import BrandHeader from './BrandHeader.jsx'
import BookingCover from './BookingCover.jsx'

function HeroContent({ pageData }) {
  return (
    <>
      <p className="text-xs font-semibold uppercase" style={{ color: 'var(--bk-accent)', letterSpacing: '0.08em' }}>Now booking</p>
      <p className="text-xl font-bold mt-1" style={{ color: 'var(--bk-ink)', fontFamily: 'var(--bk-font-display)' }}>{pageData.title}</p>
      {pageData.venue_address && (
        <p className="text-xs mt-2 flex items-center gap-1" style={{ color: 'var(--bk-muted)' }}>
          <MapPin size={11} style={{ flexShrink: 0 }} />{pageData.venue_address}
        </p>
      )}
    </>
  )
}

// The cover + logo + session title block at the top of /book/:token --
// laid out completely differently on mobile (stacked: header, then a
// short cover strip, then a card overlapping its bottom edge) versus
// desktop (a fixed full-height left rail, cover filling it, the same
// title content overlaid at its bottom) rather than the same DOM
// reflowing via breakpoints alone -- the two arrangements are different
// enough (an overlapping card vs. an absolute overlay pinned to a tall
// rail) that forcing one structure to do both jobs got messy fast. Both
// variants pull every color from the same --bk-* variables (see
// utils/bookingBranding.js), so neither needed its own theme logic, and
// both use BookingCover/BrandHeader rather than duplicating them.
export default function BookingHero({ branding, pageData }) {
  return (
    <>
      <div className="lg:hidden">
        <div className="pt-7 pb-5">
          <BrandHeader branding={branding} />
        </div>
        <BookingCover height={170} />
        <div className="mx-4 rounded-2xl p-5"
          style={{ marginTop: -44, position: 'relative', zIndex: 2, background: 'var(--bk-surface)', border: '1px solid var(--bk-border)' }}>
          <HeroContent pageData={pageData} />
        </div>
      </div>

      <div className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:w-[400px]"
        style={{ background: 'var(--bk-bg)', borderRight: '1px solid var(--bk-border)' }}>
        <div className="px-10 pt-10">
          <BrandHeader branding={branding} align="left" />
        </div>
        <div className="rounded-2xl overflow-hidden" style={{ position: 'relative', flex: 1, margin: '24px 40px 40px' }}>
          <BookingCover height="100%" />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 28 }}>
            <HeroContent pageData={pageData} />
          </div>
        </div>
      </div>
    </>
  )
}
''')
BRAND_HEADER_OLD = '''// Shared header for the public booking pages -- a photographer's logo (or
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
'''
BRAND_HEADER_NEW = '''// Shared header for the public booking pages -- a photographer's logo (or
// an initials avatar when there isn't one to show, see brandingLogoUrl's
// own comment for why) plus their studio name. Used by SignupBooking.jsx
// (both directly, in AllSessionsBooking.jsx, and inside BookingHero.jsx)
// so the three stay visually identical here rather than maintaining
// copies that can drift.
//
// align="center" (default) is the original stacked/centered treatment.
// align="left" is a smaller, row-layout variant added for
// BookingHero.jsx's desktop rail, where the header sits at the top of a
// vertical panel rather than centered above a narrow mobile column.
import { brandingLogoUrl, getInitials } from '../../utils/bookingBranding.js'

export default function BrandHeader({ branding, align = 'center' }) {
  const hasLogo = branding.has_microsite && !!branding.logo_r2_key
  const isLeft = align === 'left'
  const markSize = isLeft ? 32 : 44

  return (
    <div className={isLeft ? 'flex items-center gap-3' : 'flex flex-col items-center gap-2 mb-5'}>
      {hasLogo ? (
        // Sized and fitted the same way MicrositeRenderer.jsx's own nav
        // logo is (.ms-logo-img: height-constrained, object-fit: contain)
        // -- NOT force-cropped into a square/circle. Most studio logos are
        // wide wordmarks, not square marks, so a fixed-size circular crop
        // (the initials avatar's treatment, which suits a single letter
        // or two) cuts most of a real logo off.
        <img src={brandingLogoUrl(branding.logo_r2_key)} alt={branding.studio_name || 'Photographer logo'}
          style={{ height: markSize, maxWidth: isLeft ? 160 : 220, objectFit: 'contain', flexShrink: 0 }} />
      ) : (
        <div className="flex items-center justify-center rounded-full flex-shrink-0"
          style={{ width: markSize, height: markSize, background: 'var(--bk-accent)', color: 'var(--bk-accent-button-text)', fontSize: isLeft ? 12 : 15, fontWeight: 600 }}>
          {getInitials(branding.studio_name)}
        </div>
      )}
      {branding.studio_name && (
        <p className="text-sm font-semibold" style={{ color: 'var(--bk-ink)', fontFamily: 'var(--bk-font-display)' }}>{branding.studio_name}</p>
      )}
    </div>
  )
}
'''
replace_whole_file("src/components/booking/BrandHeader.jsx", BRAND_HEADER_OLD, BRAND_HEADER_NEW)
SIGNUP_BOOKING_OLD = '''import { useState, useEffect } from 'react'
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
SIGNUP_BOOKING_NEW = '''import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { CalendarDays, Clock, ChevronLeft, Check, Calendar } from 'lucide-react'
import { supabaseAnon } from '../supabaseClientAnon.js'
import { SessionTypeIcon } from '../utils/sessionTypeIcon.jsx'
import { useBookingBranding } from '../utils/bookingBranding.js'
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
    </div>
  )
}
'''
replace_whole_file("src/routes/SignupBooking.jsx", SIGNUP_BOOKING_OLD, SIGNUP_BOOKING_NEW)

print()
print("Done. Step 4 (desktop layout + cover placeholder) applied.")
print("Restart your dev server if it's running, then test:")
print("  - Desktop width (>=1024px): a fixed left rail with the cover")
print("    pattern + logo/name (top) and session title (bottom-overlay),")
print("    booking flow to the right of it.")
print("  - Mobile/narrow width (<1024px): unchanged from step 3b --")
print("    stacked header, short cover strip, overlapping title card.")
print("  - Both a photographer WITH an enabled microsite and one WITHOUT")
print("    one, to confirm the cover pattern tints correctly (branded")
print("    accent color vs. the default indigo) in both cases.")
print("  - Full click-through booking flow still completes end to end.")
