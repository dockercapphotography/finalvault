// The illustrated placeholder cover shown above a booking page's title,
// standing in for an actual uploaded shoot-type cover image -- that's a
// separate, later feature (needs its own DB column + RPC change, unlike
// everything in this branding pass, which only ever reads existing
// columns). Tinted entirely through the same --bk-accent/--bk-ink/--bk-bg
// CSS variables the rest of the branded page already uses (see
// utils/bookingBranding.js), so it's automatically correct for every
// microsite theme, and for the no-microsite default it just reads as a
// quiet indigo/neutral pattern rather than a literal photo -- never an
// invented "branded-ish" look for photographers without a microsite.
//
// Shape opacities are intentionally bold (not a light tint) -- an earlier
// pass kept them subtle so the pattern would never fight a theme's own
// colors, but against a light theme that just read as washed out. The
// legibility of any text overlaid on top (BookingHero.jsx's desktop rail)
// comes from its own dark scrim + white text, not from this pattern
// staying pale, so there's no tension in making the pattern itself read
// as actual color.
//
// The real-photo feature (sql/061_signup_page_cover_image.sql): when a
// signup page has an uploaded cover_image_r2_key, that photo renders here
// INSTEAD OF the illustrated pattern -- the pattern is the automatic
// fallback whenever no photo has been chosen, never something the
// photographer has to explicitly pick. Served via the public,
// no-login /preview/:key?booking_cover=1 mode added to the R2 Worker
// (r2-worker/src/handlers/preview.js + middleware/bookingCoverAccess.js),
// the same shape as the existing ?microsite=1 mode -- legitimacy is
// verified server-side against signup_pages.cover_image_r2_key + is_active
// on every request, never a folder-convention match.
import { DEFAULT_COVER_PATTERN } from '../../utils/coverPatterns.js'

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL

function bookingCoverImageUrl(key) {
  return `${WORKER_URL}/preview/${encodeURIComponent(key)}?booking_cover=1`
}

// Three patterns, picked per signup page (signup_pages.cover_pattern,
// sql/060_signup_page_cover_pattern.sql) via Sessions.jsx's picker. Each
// renderer takes plain `accent`/`ink` fill values rather than reading the
// --bk-* variables itself, so the exact same shape geometry can be reused
// for Sessions.jsx's small picker swatches (fixed colors, no booking-page
// theme in scope there) as well as the real, theme-driven page render --
// one drawing per pattern, never two copies that can drift.
const PATTERN_RENDERERS = {
  mountains: (accent, ink) => (
    <>
      <circle cx="60" cy="40" r="90" fill={accent} opacity="0.32" />
      <circle cx="340" cy="170" r="120" fill={ink} opacity="0.1" />
      <path d="M20 170 L60 110 L100 170 Z" fill={ink} opacity="0.2" />
      <path d="M90 175 L140 95 L190 175 Z" fill={accent} opacity="0.45" />
      <path d="M170 178 L215 120 L260 178 Z" fill={ink} opacity="0.2" />
      <path d="M245 175 L300 100 L355 175 Z" fill={accent} opacity="0.32" />
      <g opacity="0.55">
        <circle cx="80" cy="60" r="3" fill={ink} />
        <circle cx="130" cy="45" r="2" fill={ink} />
        <circle cx="230" cy="55" r="2.5" fill={ink} />
        <circle cx="300" cy="40" r="3" fill={ink} />
        <circle cx="330" cy="65" r="2" fill={ink} />
      </g>
    </>
  ),
  trees: (accent, ink) => (
    <>
      <circle cx="330" cy="45" r="65" fill={accent} opacity="0.3" />
      <path d="M50 140 L65 90 L80 140 Z" fill={ink} opacity="0.14" />
      <path d="M140 145 L157 92 L174 145 Z" fill={ink} opacity="0.14" />
      <path d="M230 142 L246 88 L262 142 Z" fill={ink} opacity="0.14" />
      <path d="M310 146 L326 94 L342 146 Z" fill={ink} opacity="0.14" />
      <path d="M10 178 L34 100 L58 178 Z" fill={accent} opacity="0.4" />
      <path d="M95 180 L122 96 L149 180 Z" fill={ink} opacity="0.24" />
      <path d="M190 182 L216 98 L242 182 Z" fill={accent} opacity="0.32" />
      <path d="M280 179 L305 99 L330 179 Z" fill={ink} opacity="0.22" />
      <path d="M345 181 L365 105 L385 181 Z" fill={accent} opacity="0.28" />
      <g opacity="0.5">
        <circle cx="60" cy="55" r="2" fill={ink} />
        <circle cx="200" cy="35" r="2.5" fill={ink} />
        <circle cx="270" cy="60" r="2" fill={ink} />
      </g>
    </>
  ),
  moon: (accent, ink) => (
    <>
      <circle cx="300" cy="55" r="55" fill={ink} opacity="0.16" />
      <circle cx="300" cy="55" r="40" fill={accent} opacity="0.38" />
      <g opacity="0.6">
        <circle cx="40" cy="30" r="2" fill={ink} />
        <circle cx="80" cy="60" r="1.5" fill={ink} />
        <circle cx="130" cy="25" r="2.5" fill={ink} />
        <circle cx="170" cy="70" r="1.5" fill={ink} />
        <circle cx="210" cy="40" r="2" fill={ink} />
        <circle cx="60" cy="100" r="1.5" fill={ink} />
        <circle cx="150" cy="110" r="2" fill={ink} />
        <circle cx="20" cy="140" r="1.5" fill={ink} />
        <circle cx="100" cy="150" r="2" fill={ink} />
        <circle cx="230" cy="120" r="1.5" fill={ink} />
      </g>
      <path d="M0 210 L0 168 Q195 132 390 168 L390 210 Z" fill={ink} opacity="0.12" />
    </>
  ),
}

// Exported on its own (not just used internally by BookingCover below) so
// Sessions.jsx's picker can render the same shapes at swatch size with
// fixed colors instead of the live --bk-* variables, which aren't in
// scope there.
export function CoverPatternShapes({ pattern, accent = 'var(--bk-accent)', ink = 'var(--bk-ink)' }) {
  const renderShapes = PATTERN_RENDERERS[pattern] || PATTERN_RENDERERS[DEFAULT_COVER_PATTERN]
  return renderShapes(accent, ink)
}

export default function BookingCover({ pattern, imageKey, focusX = 0.5, focusY = 0.5, height = 180, fade = true }) {
  return (
    <div data-testid="booking-cover" style={{ position: 'relative', width: '100%', height, overflow: 'hidden', background: 'linear-gradient(160deg, var(--bk-bg) 0%, var(--bk-surface) 100%)' }}>
      {imageKey ? (
        <img
          src={bookingCoverImageUrl(imageKey)}
          alt=""
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
            objectPosition: `${(focusX ?? 0.5) * 100}% ${(focusY ?? 0.5) * 100}%`,
          }}
        />
      ) : (
        <svg width="100%" height="100%" viewBox="0 0 390 210" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0 }}>
          <CoverPatternShapes pattern={pattern} />
        </svg>
      )}
      {/* Fades the bottom edge toward --bk-bg -- right for BookingHero.jsx's
          own two call sites (either hidden under an overlapping card, or
          under a separate dark scrim) but wrong wherever the cover sits
          directly above a plain --bk-surface card body with no overlap or
          scrim to hide the seam (AllSessionsBooking.jsx's session cards) --
          fade={false} skips it there, letting the card's own border do the
          separating instead. */}
      {fade && <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 45%, var(--bk-bg) 100%)' }} />}
    </div>
  )
}
