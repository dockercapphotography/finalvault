// Shared branding/theme resolution for every public booking page
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
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Pulled out of useBookingBranding so BrandHeader can resolve the theme
// (and, below, the right logo variant) without needing the hook itself --
// this part of branding resolution is pure, no useEffect involved.
export function resolveTheme(branding) {
  if (!branding?.has_microsite) return null
  return THEME_OPTIONS.find(t => t.id === branding.theme) || THEME_OPTIONS.find(t => t.id === DEFAULT_THEME)
}

// Same light/dark logo variant selection MicrositeRenderer.jsx already
// does for its own nav/footer (see logo_dark_r2_key, sql/047): logo_r2_key
// is the studio's primary logo, meant to read against a DARK backdrop;
// logo_dark_r2_key (when set) is a second, dark-colored variant meant for
// a LIGHT backdrop. A booking page's theme picks which one actually
// applies here -- without this, a white wordmark logo goes unreadable the
// moment the booking page lands on a light theme (or the app's own
// default, unbranded look). Returns null when there's no logo to show at
// all (has_microsite is what gates whether a real logo preview is even
// allowed -- see brandingLogoUrl above).
export function resolveLogoR2Key(branding) {
  if (!branding?.has_microsite || !branding.logo_r2_key) return null
  const theme = resolveTheme(branding)
  return theme?.dark ? branding.logo_r2_key : (branding.logo_dark_r2_key || branding.logo_r2_key)
}

// BookingHero.jsx's overlay treatment (logo floated directly over the
// cover photo/pattern, under its own scrim) always sits over that same
// dark scrim regardless of the page's own theme -- so unlike
// resolveLogoR2Key above, this ignores theme.dark entirely and always
// returns the primary logo_r2_key (the variant meant for a dark
// backdrop). Same reasoning HeroContent's `dark` prop documents in
// BookingHero.jsx for hardcoding white title text over that same scrim.
export function resolveOverlayLogoR2Key(branding) {
  if (!branding?.has_microsite || !branding.logo_r2_key) return null
  return branding.logo_r2_key
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

  const theme = resolveTheme(branding)

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
