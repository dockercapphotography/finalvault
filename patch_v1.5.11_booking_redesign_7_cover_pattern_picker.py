#!/usr/bin/env python3
"""
Patch v1.5.11 -- booking-page redesign, step 7: cover-pattern picker
(Phase 2).

Requires steps 1, 2, 3, 3b, 4, 5, and 6 already applied.

Lets a photographer choose which illustrated cover pattern a given signup
page's booking hero uses -- Mountains (the existing one), Trees, or Moon &
Stars -- picked per session from that session's own settings, rather than
every booking page defaulting to the same pattern.

Six files:

1. sql/060_signup_page_cover_pattern.sql -- adds signup_pages.cover_pattern
   (text, defaults to 'mountains', so every existing page keeps exactly
   the look it already has), and get_signup_page_data now returns it.

2. NEW src/utils/coverPatterns.js -- the pattern id/label list
   (COVER_PATTERN_OPTIONS) and the 'mountains' default, kept in their own
   plain file rather than exported alongside BookingCover.jsx's React
   components (avoids a Fast-Refresh lint warning about a file mixing
   component and non-component exports -- same reasoning
   utils/sessionTypeIcon.jsx already documents).

3. MODIFIED src/components/booking/BookingCover.jsx -- the single
   'mountains' pattern becomes a small registry of three, each a plain
   function taking accent/ink fill values (not hardcoded to the
   --bk-* variables) so the exact same shape geometry renders both the
   real, theme-driven booking page AND Sessions.jsx's small picker
   swatches (fixed colors there, no booking-page theme in scope) --
   one drawing per pattern, not two copies that could drift apart.
   BookingCover itself takes a new `pattern` prop.

4. MODIFIED src/components/booking/BookingHero.jsx -- reads
   pageData.cover_pattern and passes it through to both BookingCover
   call sites (mobile strip, desktop rail).

5. MODIFIED src/utils/signupApi.js -- updateSignupPage maps a new
   `coverPattern` update field to the cover_pattern column, same pattern
   as every other per-page setting it already handles.

6. MODIFIED src/routes/Sessions.jsx -- adds a "Cover image" picker to a
   signup page's settings tab, right below "Show pricing publicly": three
   small preview swatches (same swatch-picker treatment
   MicrositeEditor.jsx already uses for its theme choices), each reusing
   BookingCover.jsx's real pattern-drawing code at fixed admin colors.
   Picking one saves immediately via updateSignupPage, same as every
   other setting on this tab.

Run from the repo root, after steps 1, 2, 3, 3b, 4, 5, and 6. Idempotent
-- safe to run twice.
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
        f"(steps 1, 2, 3, 3b, 4, 5, and 6 applied).\n"
        f"Make sure the booking-redesign patches 1, 2, 3, 3b, 4, 5, and 6 have all been run first."
    )
    path.write_text(new_content)
    print(f"Patched {rel_path}")

write_file("sql/060_signup_page_cover_pattern.sql", '''-- 060_signup_page_cover_pattern.sql
--
-- Phase 2 of the booking-page redesign: lets a photographer choose which
-- illustrated cover pattern (see src/components/booking/BookingCover.jsx)
-- a given signup page's booking hero uses -- Mountains, Trees, or Moon &
-- Stars -- rather than every page defaulting to the same one. Picked per
-- session from Sessions.jsx (the signup page's own settings), stored on
-- the page itself since it's specific to that one booking page, not the
-- photographer's account or microsite.
--
-- New column: signup_pages.cover_pattern, defaulting to 'mountains' so
-- every existing page keeps exactly the look it already has -- nothing
-- changes for a page until someone picks something else.
--
-- get_signup_page_data (the /book/:token RPC) now returns cover_pattern
-- at the top level alongside title/description/etc. Not added to
-- get_signup_pages_by_token (the /book/all/:token chooser) -- that page
-- doesn't render the hero/cover for any of its listed sessions, so there's
-- nothing there that would use it yet.
--
-- Run after: 059_booking_logo_dark_variant.sql
-- Run this whole file in the Supabase SQL editor.

ALTER TABLE signup_pages
  ADD COLUMN IF NOT EXISTS cover_pattern text NOT NULL DEFAULT 'mountains';

CREATE OR REPLACE FUNCTION public.get_signup_page_data(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_page signup_pages;
  v_result json;
BEGIN
  SELECT * INTO v_page FROM signup_pages WHERE token = p_token;

  IF v_page IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT v_page.is_active THEN
    RETURN json_build_object('active', false, 'title', v_page.title);
  END IF;

  SELECT json_build_object(
    'active', true,
    'title', v_page.title,
    'venue_address', v_page.venue_address,
    'timezone', v_page.timezone,
    'description', v_page.booking_description,
    'cover_pattern', v_page.cover_pattern,
    'shoot_types', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', st.id,
        'name', st.name,
        'duration_minutes', st.duration_minutes,
        'session_type', st.session_type,
        'description', st.description,
        'price', CASE WHEN v_page.show_pricing THEN st.price ELSE NULL END,
        'retainer_amount', CASE WHEN v_page.show_pricing THEN st.retainer_amount ELSE NULL END
      ) ORDER BY st.sort_order), '[]'::json)
      FROM signup_shoot_types st
      WHERE st.signup_page_id = v_page.id
    ),
    'open_slots', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', s.id,
        'shoot_type_id', s.shoot_type_id,
        'start_time', s.start_time,
        'end_time', s.end_time
      ) ORDER BY s.start_time), '[]'::json)
      FROM signup_slots s
      WHERE s.signup_page_id = v_page.id
        AND s.claimed_at IS NULL
        AND s.start_time > now()
        AND NOT EXISTS (
          SELECT 1 FROM signup_slots claimed
          WHERE claimed.signup_page_id = s.signup_page_id
            AND claimed.claimed_at IS NOT NULL
            AND claimed.time_range && s.time_range
        )
    ),
    'branding', (
      SELECT CASE WHEN m.id IS NOT NULL THEN
        json_build_object(
          'has_microsite', true,
          'studio_name', COALESCE(m.studio_name, p.business_name, p.display_name),
          'logo_r2_key', COALESCE(m.logo_r2_key, p.logo_r2_key),
          'logo_dark_r2_key', m.logo_dark_r2_key,
          'theme', m.theme,
          'accent_color', m.accent_color,
          'font_pairing', m.font_pairing,
          'custom_display_font', m.custom_display_font,
          'custom_body_font', m.custom_body_font,
          'radius', m.radius
        )
      ELSE
        json_build_object(
          'has_microsite', false,
          'studio_name', COALESCE(p.business_name, p.display_name),
          'logo_r2_key', p.logo_r2_key
        )
      END
      FROM photographers p
      LEFT JOIN microsites m ON m.photographer_id = p.id AND m.enabled = true
      WHERE p.id = v_page.photographer_id
    )
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION get_signup_page_data(text) TO anon;
''')
write_file("src/utils/coverPatterns.js", '''// Cover-pattern id/label list for the booking-page illustrated cover
// (components/booking/BookingCover.jsx) and its Sessions.jsx picker. Kept
// in its own plain file rather than exported alongside BookingCover's
// React components, so Fast Refresh doesn't warn about one file mixing
// component and non-component exports -- same reasoning
// utils/sessionTypeIcon.jsx already documents for the same class of
// warning.
export const DEFAULT_COVER_PATTERN = 'mountains'

export const COVER_PATTERN_OPTIONS = [
  { id: 'mountains', label: 'Mountains' },
  { id: 'trees', label: 'Trees' },
  { id: 'moon', label: 'Moon & Stars' },
]
''')
BOOKING_COVER_OLD = '''// The illustrated placeholder cover shown above a booking page's title,
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
export default function BookingCover({ height = 180 }) {
  return (
    <div style={{ position: 'relative', width: '100%', height, overflow: 'hidden', background: 'linear-gradient(160deg, var(--bk-bg) 0%, var(--bk-surface) 100%)' }}>
      <svg width="100%" height="100%" viewBox="0 0 390 210" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0 }}>
        <circle cx="60" cy="40" r="90" fill="var(--bk-accent)" opacity="0.32" />
        <circle cx="340" cy="170" r="120" fill="var(--bk-ink)" opacity="0.1" />
        <path d="M20 170 L60 110 L100 170 Z" fill="var(--bk-ink)" opacity="0.2" />
        <path d="M90 175 L140 95 L190 175 Z" fill="var(--bk-accent)" opacity="0.45" />
        <path d="M170 178 L215 120 L260 178 Z" fill="var(--bk-ink)" opacity="0.2" />
        <path d="M245 175 L300 100 L355 175 Z" fill="var(--bk-accent)" opacity="0.32" />
        <g opacity="0.55">
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
'''
BOOKING_COVER_NEW = '''// The illustrated placeholder cover shown above a booking page's title,
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
import { DEFAULT_COVER_PATTERN } from '../../utils/coverPatterns.js'

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

export default function BookingCover({ pattern, height = 180 }) {
  return (
    <div style={{ position: 'relative', width: '100%', height, overflow: 'hidden', background: 'linear-gradient(160deg, var(--bk-bg) 0%, var(--bk-surface) 100%)' }}>
      <svg width="100%" height="100%" viewBox="0 0 390 210" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0 }}>
        <CoverPatternShapes pattern={pattern} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 45%, var(--bk-bg) 100%)' }} />
    </div>
  )
}
'''
replace_whole_file("src/components/booking/BookingCover.jsx", BOOKING_COVER_OLD, BOOKING_COVER_NEW)
BOOKING_HERO_OLD = '''import { MapPin } from 'lucide-react'
import BrandHeader from './BrandHeader.jsx'
import BookingCover from './BookingCover.jsx'

// `dark` is true only for the desktop rail, where this sits directly over
// the cover pattern behind a dedicated scrim (added below) -- always a
// dark backdrop there regardless of theme, so the text is always the
// scrim's own light colors rather than the theme's --bk-ink/--bk-muted
// (which are meant for the page's normal, non-overlaid surfaces and can
// easily be a dark color themselves on a light theme, going illegible
// over a dark scrim). On mobile this renders inside the plain --bk-surface
// card below the cover strip, not over the image, so it keeps the
// theme's own text colors there.
function HeroContent({ pageData, dark }) {
  return (
    <>
      <p className="text-xs font-semibold uppercase" style={{ color: dark ? 'rgba(255,255,255,0.85)' : 'var(--bk-accent)', letterSpacing: '0.08em' }}>Now booking</p>
      <p className="text-xl font-bold mt-1" style={{ color: dark ? '#fff' : 'var(--bk-ink)', fontFamily: 'var(--bk-font-display)' }}>{pageData.title}</p>
      {pageData.venue_address && (
        <p className="text-xs mt-2 flex items-center gap-1" style={{ color: dark ? 'rgba(255,255,255,0.75)' : 'var(--bk-muted)' }}>
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
        <div className="overflow-hidden" style={{ position: 'relative', flex: 1 }}>
          <BookingCover height="100%" />
          {/* Same dark-scrim-under-white-text treatment MicrositeRenderer.css's
              own .ms-hero-overlay already uses over its hero image (same
              rgba(20,17,13,...) tone), so the title stays legible here
              regardless of the pattern's own theme-driven colors. */}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(20,17,13,0) 35%, rgba(20,17,13,0.55) 70%, rgba(20,17,13,0.88) 100%)' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 28 }}>
            <HeroContent pageData={pageData} dark />
          </div>
        </div>
      </div>
    </>
  )
}
'''
BOOKING_HERO_NEW = '''import { MapPin } from 'lucide-react'
import BrandHeader from './BrandHeader.jsx'
import BookingCover from './BookingCover.jsx'

// `dark` is true only for the desktop rail, where this sits directly over
// the cover pattern behind a dedicated scrim (added below) -- always a
// dark backdrop there regardless of theme, so the text is always the
// scrim's own light colors rather than the theme's --bk-ink/--bk-muted
// (which are meant for the page's normal, non-overlaid surfaces and can
// easily be a dark color themselves on a light theme, going illegible
// over a dark scrim). On mobile this renders inside the plain --bk-surface
// card below the cover strip, not over the image, so it keeps the
// theme's own text colors there.
function HeroContent({ pageData, dark }) {
  return (
    <>
      <p className="text-xs font-semibold uppercase" style={{ color: dark ? 'rgba(255,255,255,0.85)' : 'var(--bk-accent)', letterSpacing: '0.08em' }}>Now booking</p>
      <p className="text-xl font-bold mt-1" style={{ color: dark ? '#fff' : 'var(--bk-ink)', fontFamily: 'var(--bk-font-display)' }}>{pageData.title}</p>
      {pageData.venue_address && (
        <p className="text-xs mt-2 flex items-center gap-1" style={{ color: dark ? 'rgba(255,255,255,0.75)' : 'var(--bk-muted)' }}>
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
  const pattern = pageData.cover_pattern

  return (
    <>
      <div className="lg:hidden">
        <div className="pt-7 pb-5">
          <BrandHeader branding={branding} />
        </div>
        <BookingCover pattern={pattern} height={170} />
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
        <div className="overflow-hidden" style={{ position: 'relative', flex: 1 }}>
          <BookingCover pattern={pattern} height="100%" />
          {/* Same dark-scrim-under-white-text treatment MicrositeRenderer.css's
              own .ms-hero-overlay already uses over its hero image (same
              rgba(20,17,13,...) tone), so the title stays legible here
              regardless of the pattern's own theme-driven colors. */}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(20,17,13,0) 35%, rgba(20,17,13,0.55) 70%, rgba(20,17,13,0.88) 100%)' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 28 }}>
            <HeroContent pageData={pageData} dark />
          </div>
        </div>
      </div>
    </>
  )
}
'''
replace_whole_file("src/components/booking/BookingHero.jsx", BOOKING_HERO_OLD, BOOKING_HERO_NEW)
SIGNUP_API_OLD = '''import { supabase } from '../supabaseClient.js'

// ── Signup Pages ─────────────────────────────────────────────────────────────

export async function getSignupPages() {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('signup_pages')
    .select(`
      id, title, token, venue_address, venue_lat, venue_lng, timezone, is_active, created_at,
      signup_shoot_types ( id ),
      signup_slots ( id, claimed_at, start_time )
    `)
    .eq('photographer_id', user.id)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(p => {
    const days = new Set((p.signup_slots ?? []).map(s => new Date(s.start_time).toLocaleDateString('en-CA', { timeZone: p.timezone })))
    return {
      ...p,
      shoot_type_count: p.signup_shoot_types?.length ?? 0,
      slot_total: p.signup_slots?.length ?? 0,
      slot_claimed: p.signup_slots?.filter(s => s.claimed_at).length ?? 0,
      day_count: days.size,
    }
  })
}

export async function getMyAllSessionsToken() {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('photographers')
    .select('all_sessions_token')
    .eq('id', user.id)
    .single()
  if (error) throw error
  return data.all_sessions_token
}

export async function getSignupPage(id) {
  const { data, error } = await supabase
    .from('signup_pages')
    .select('*, signup_shoot_types(*)')
    .eq('id', id)
    .single()
  if (error) throw error
  data.signup_shoot_types = (data.signup_shoot_types ?? []).sort((a, b) => a.sort_order - b.sort_order)
  return data
}

export async function createSignupPage({ title, venueAddress, venueLat, venueLng, timezone }) {
  const { data: { user } } = await supabase.auth.getUser()
  const token = crypto.randomUUID().replace(/-/g, '')
  const { data, error } = await supabase
    .from('signup_pages')
    .insert({
      photographer_id: user.id,
      title: title.trim(),
      token,
      venue_address: venueAddress?.trim() || null,
      venue_lat: venueLat ?? null,
      venue_lng: venueLng ?? null,
      timezone: timezone || 'America/New_York',
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateSignupPage(id, updates) {
  const mapped = { updated_at: new Date().toISOString() }
  if (updates.title !== undefined) mapped.title = updates.title.trim()
  if (updates.venueAddress !== undefined) mapped.venue_address = updates.venueAddress?.trim() || null
  if (updates.venueLat !== undefined) mapped.venue_lat = updates.venueLat
  if (updates.venueLng !== undefined) mapped.venue_lng = updates.venueLng
  if (updates.timezone !== undefined) mapped.timezone = updates.timezone
  if (updates.isActive !== undefined) mapped.is_active = updates.isActive
  if (updates.confirmationNote !== undefined) mapped.confirmation_note = updates.confirmationNote?.trim() || null
  if (updates.notificationNote !== undefined) mapped.notification_note = updates.notificationNote?.trim() || null
  if (updates.bookingDescription !== undefined) mapped.booking_description = updates.bookingDescription?.trim() || null
  if (updates.showPricing !== undefined) mapped.show_pricing = updates.showPricing

  const { data, error } = await supabase
    .from('signup_pages')
    .update(mapped)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteSignupPage(id) {
  const { error } = await supabase.from('signup_pages').delete().eq('id', id)
  if (error) throw error
}

// ── Shoot Types ──────────────────────────────────────────────────────────────

export async function createShootType({ signupPageId, name, durationMinutes, sessionType, description, sortOrder, price, retainerAmount }) {
  const { data, error } = await supabase
    .from('signup_shoot_types')
    .insert({
      signup_page_id: signupPageId,
      name: name.trim(),
      duration_minutes: durationMinutes,
      session_type: sessionType || 'Portrait',
      description: description?.trim() || null,
      sort_order: sortOrder ?? 0,
      price: price === '' || price == null ? null : price,
      retainer_amount: retainerAmount === '' || retainerAmount == null ? null : retainerAmount,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateShootType(id, updates) {
  const mapped = {}
  if (updates.name !== undefined) mapped.name = updates.name.trim()
  if (updates.durationMinutes !== undefined) mapped.duration_minutes = updates.durationMinutes
  if (updates.sessionType !== undefined) mapped.session_type = updates.sessionType
  if (updates.description !== undefined) mapped.description = updates.description?.trim() || null
  if (updates.sortOrder !== undefined) mapped.sort_order = updates.sortOrder
  if (updates.price !== undefined) mapped.price = updates.price === '' || updates.price == null ? null : updates.price
  if (updates.retainerAmount !== undefined) mapped.retainer_amount = updates.retainerAmount === '' || updates.retainerAmount == null ? null : updates.retainerAmount

  const { data, error } = await supabase
    .from('signup_shoot_types')
    .update(mapped)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteShootType(id) {
  const { error } = await supabase.from('signup_shoot_types').delete().eq('id', id)
  if (error) throw error
}

export async function getShootTypeQuestionnaires(shootTypeId) {
  const { data, error } = await supabase
    .from('signup_shoot_type_questionnaires')
    .select('questionnaire_id')
    .eq('shoot_type_id', shootTypeId)
  if (error) throw error
  return (data ?? []).map(r => r.questionnaire_id)
}

// Replace-all semantics -- simplest correct approach for a small list like
// this (a handful of questionnaires per shoot type at most), rather than
// diffing adds/removes.
export async function setShootTypeQuestionnaires(shootTypeId, questionnaireIds) {
  const { error: delError } = await supabase
    .from('signup_shoot_type_questionnaires')
    .delete()
    .eq('shoot_type_id', shootTypeId)
  if (delError) throw delError

  if (questionnaireIds.length === 0) return

  const { error: insError } = await supabase
    .from('signup_shoot_type_questionnaires')
    .insert(questionnaireIds.map((qId, i) => ({ shoot_type_id: shootTypeId, questionnaire_id: qId, sort_order: i })))
  if (insError) throw insError
}

// ── Slots ────────────────────────────────────────────────────────────────────

export async function getSlots(signupPageId) {
  const { data, error } = await supabase
    .from('signup_slots')
    .select('*')
    .eq('signup_page_id', signupPageId)
    .order('start_time', { ascending: true })
  if (error) throw error
  return data ?? []
}

// Converts a wall-clock date/time as understood in a specific IANA
// timezone (e.g. "2026-08-01" "10:00" in "America/New_York") into the
// correct UTC instant. Deliberately NOT `new Date(dateStr + 'T' + timeStr)`
// -- that parses using the browser's own local timezone, which only
// happens to be correct if the person creating slots is physically in the
// same timezone as the venue. Library-free double-conversion technique:
// treat the wall-clock as a UTC reference point, see what that reference
// instant looks like when displayed in the target timezone, and use the
// difference to solve for the real offset.
export function zonedTimeToUtc(dateStr, timeStr, timeZone) {
  const [year, month, day] = dateStr.split('-').map(Number)
  const [hour, minute] = timeStr.split(':').map(Number)
  const desired = Date.UTC(year, month - 1, day, hour, minute)

  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
  const parts = dtf.formatToParts(new Date(desired))
  const get = type => parts.find(p => p.type === type)?.value
  const hourVal = Number(get('hour'))
  const inTZAsUTC = Date.UTC(
    Number(get('year')), Number(get('month')) - 1, Number(get('day')),
    hourVal === 24 ? 0 : hourVal, Number(get('minute')), Number(get('second')),
  )
  const offsetMs = desired - inTZAsUTC
  return new Date(desired + offsetMs)
}

// Bulk-inserts slots for a recurring pattern within a single day, e.g.
// 10:00am-6:00pm in 15-minute increments with a 5-minute buffer between
// each. Used by the slot generator -- one call per day block, since
// GenCon's days don't all run the same hours. `timezone` must be the
// signup page's own IANA timezone, not assumed from the browser.
export async function generateSlots({ signupPageId, shootTypeId, date, startTime, endTime, durationMinutes, bufferMinutes = 0, timezone }) {
  const slots = []
  const dayStart = zonedTimeToUtc(date, startTime, timezone)
  const dayEnd = zonedTimeToUtc(date, endTime, timezone)
  const stepMs = (durationMinutes + bufferMinutes) * 60_000
  const durationMs = durationMinutes * 60_000

  let cursor = dayStart
  while (cursor.getTime() + durationMs <= dayEnd.getTime()) {
    const slotEnd = new Date(cursor.getTime() + durationMs)
    slots.push({
      signup_page_id: signupPageId,
      shoot_type_id: shootTypeId,
      start_time: cursor.toISOString(),
      end_time: slotEnd.toISOString(),
    })
    cursor = new Date(cursor.getTime() + stepMs)
  }

  if (slots.length === 0) return []

  const { data, error } = await supabase
    .from('signup_slots')
    .insert(slots)
    .select()
  if (error) throw error
  return data
}

export async function deleteSlot(id) {
  const { error } = await supabase.from('signup_slots').delete().eq('id', id)
  if (error) throw error
}

// Single manually-specified slot, as opposed to the generator's batch
// insert -- for the "I just need one extra slot" case that doesn't
// justify running the generator for a single day. Takes the same
// date/time/timezone inputs as generateSlots (not raw ISO strings) so the
// same venue-local-to-UTC conversion applies consistently either way.
export async function createManualSlot({ signupPageId, shootTypeId, date, startTime, durationMinutes, timezone }) {
  const start = zonedTimeToUtc(date, startTime, timezone)
  const end = new Date(start.getTime() + durationMinutes * 60_000)
  const { data, error } = await supabase
    .from('signup_slots')
    .insert({
      signup_page_id: signupPageId, shoot_type_id: shootTypeId,
      start_time: start.toISOString(), end_time: end.toISOString(),
    })
    .select()
    .single()
  if (error) throw error
  return data
}

// Deliberately scoped to OPEN slots only -- a "clear slots" action should
// never silently delete already-claimed slots, since those represent
// real client bookings with real sessions attached. If someone wants to
// remove a specific claimed slot's record, that's a one-at-a-time
// decision, not a bulk one.
export async function deleteAllOpenSlots(signupPageId) {
  const { error } = await supabase
    .from('signup_slots')
    .delete()
    .eq('signup_page_id', signupPageId)
    .is('claimed_at', null)
  if (error) throw error
}

// Checks what's actually attached to a session before it gets deleted as
// part of a no-show -- galleries, submitted questionnaires, sent
// questionnaires, and contracts. Contracts are SET NULL (not
// cascade-deleted) at the DB level when a session is removed, so they're
// reported separately as "orphaned" rather than "deleted" -- everything
// else here genuinely gets deleted by the cascade.
export async function getSessionDeletionImpact(sessionId) {
  const [{ count: galleries }, { count: submissions }, { count: questionnaireSends }, { count: contracts }] = await Promise.all([
    supabase.from('session_galleries').select('*', { count: 'exact', head: true }).eq('session_id', sessionId),
    supabase.from('session_submissions').select('*', { count: 'exact', head: true }).eq('session_id', sessionId),
    supabase.from('questionnaire_sends').select('*', { count: 'exact', head: true }).eq('session_id', sessionId),
    supabase.from('contracts').select('*', { count: 'exact', head: true }).eq('session_id', sessionId),
  ])
  return { galleries: galleries ?? 0, submissions: submissions ?? 0, questionnaireSends: questionnaireSends ?? 0, contracts: contracts ?? 0 }
}

// Deletes the session record itself. session_questionnaires/
// session_galleries/session_submissions/questionnaire_sends cascade-delete
// via the DB's own foreign keys; contracts get SET NULL (orphaned, not
// deleted). Call getSessionDeletionImpact first and get the photographer's
// confirmation if it reports anything -- this function itself doesn't ask.
export async function deleteSession(sessionId) {
  const { error } = await supabase.from('sessions').delete().eq('id', sessionId)
  if (error) throw error
}

// Frees a claimed slot back to open, for a no-show or a booking mistake.
// Resets the slot's own fields only -- deleting the session it points to
// (if any) is the caller's job via deleteSession above, since that's a
// separate, bigger decision that needs its own confirmation.
export async function unclaimSlot(id) {
  const { error } = await supabase
    .from('signup_slots')
    .update({
      claimed_at: null,
      client_name: null,
      client_email: null,
      client_phone: null,
      client_pronouns: null,
    })
    .eq('id', id)
  if (error) throw error
}

// A private, photographer-only note on a slot (e.g. "brought 2 friends,
// wants extra prints"). Never shown to the client, never touched by the
// public claim_signup_slot RPC or the public booking page.
export async function updateSlotNote(id, note) {
  const { error } = await supabase
    .from('signup_slots')
    .update({ photographer_note: note?.trim() || null })
    .eq('id', id)
  if (error) throw error
}

// ── Public booking (anonymous, via RPC) ─────────────────────────────────────

export async function getSignupPageData(token) {
  const { data, error } = await supabase.rpc('get_signup_page_data', { p_token: token })
  if (error) throw error
  return data
}

export async function claimSignupSlot({ slotId, firstName, lastName, email, phone, pronouns }) {
  const { data, error } = await supabase.rpc('claim_signup_slot', {
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

// Moves an existing claimed slot's booking to a different open slot on
// the same signup page (optionally a different shoot type -- a client
// upgrade). Photographer-only (checked server-side via auth.uid()),
// unlike claim_signup_slot which is intentionally public. Conflict
// checking is the DB's own no_overlapping_claimed_slots EXCLUDE
// constraint -- the RPC returns { success: false, error:
// 'conflicts_with_existing_booking' } if the target would overlap another
// claimed slot, rather than this function pre-checking for conflicts itself.
export async function moveSignupSlotBooking(sourceSlotId, targetSlotId, notifyClient = false) {
  const { data, error } = await supabase.rpc('move_signup_slot_booking', {
    p_source_slot_id: sourceSlotId,
    p_target_slot_id: targetSlotId,
    p_notify_client: notifyClient,
  })
  if (error) throw error
  return data
}

// Manually adjusts an already-claimed slot's own start/end time to
// something outside the pre-generated slot grid entirely (e.g. shifting
// 15 minutes to accommodate a late arrival). Takes local date/time
// strings + the page's own timezone, same shape as createManualSlot
// above, rather than raw ISO datetimes -- keeps the timezone conversion
// in one place (zonedTimeToUtc) instead of pushing it onto every caller.
// Same conflict/authorization handling as moveSignupSlotBooking.
export async function updateSignupSlotTime({ slotId, date, startTime, endTime, timezone, notifyClient = false }) {
  const start = zonedTimeToUtc(date, startTime, timezone)
  const end = zonedTimeToUtc(date, endTime, timezone)
  const { data, error } = await supabase.rpc('update_signup_slot_time', {
    p_slot_id: slotId,
    p_new_start: start.toISOString(),
    p_new_end: end.toISOString(),
    p_notify_client: notifyClient,
  })
  if (error) throw error
  return data
}
'''
SIGNUP_API_NEW = '''import { supabase } from '../supabaseClient.js'

// ── Signup Pages ─────────────────────────────────────────────────────────────

export async function getSignupPages() {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('signup_pages')
    .select(`
      id, title, token, venue_address, venue_lat, venue_lng, timezone, is_active, created_at,
      signup_shoot_types ( id ),
      signup_slots ( id, claimed_at, start_time )
    `)
    .eq('photographer_id', user.id)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(p => {
    const days = new Set((p.signup_slots ?? []).map(s => new Date(s.start_time).toLocaleDateString('en-CA', { timeZone: p.timezone })))
    return {
      ...p,
      shoot_type_count: p.signup_shoot_types?.length ?? 0,
      slot_total: p.signup_slots?.length ?? 0,
      slot_claimed: p.signup_slots?.filter(s => s.claimed_at).length ?? 0,
      day_count: days.size,
    }
  })
}

export async function getMyAllSessionsToken() {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('photographers')
    .select('all_sessions_token')
    .eq('id', user.id)
    .single()
  if (error) throw error
  return data.all_sessions_token
}

export async function getSignupPage(id) {
  const { data, error } = await supabase
    .from('signup_pages')
    .select('*, signup_shoot_types(*)')
    .eq('id', id)
    .single()
  if (error) throw error
  data.signup_shoot_types = (data.signup_shoot_types ?? []).sort((a, b) => a.sort_order - b.sort_order)
  return data
}

export async function createSignupPage({ title, venueAddress, venueLat, venueLng, timezone }) {
  const { data: { user } } = await supabase.auth.getUser()
  const token = crypto.randomUUID().replace(/-/g, '')
  const { data, error } = await supabase
    .from('signup_pages')
    .insert({
      photographer_id: user.id,
      title: title.trim(),
      token,
      venue_address: venueAddress?.trim() || null,
      venue_lat: venueLat ?? null,
      venue_lng: venueLng ?? null,
      timezone: timezone || 'America/New_York',
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateSignupPage(id, updates) {
  const mapped = { updated_at: new Date().toISOString() }
  if (updates.title !== undefined) mapped.title = updates.title.trim()
  if (updates.venueAddress !== undefined) mapped.venue_address = updates.venueAddress?.trim() || null
  if (updates.venueLat !== undefined) mapped.venue_lat = updates.venueLat
  if (updates.venueLng !== undefined) mapped.venue_lng = updates.venueLng
  if (updates.timezone !== undefined) mapped.timezone = updates.timezone
  if (updates.isActive !== undefined) mapped.is_active = updates.isActive
  if (updates.confirmationNote !== undefined) mapped.confirmation_note = updates.confirmationNote?.trim() || null
  if (updates.notificationNote !== undefined) mapped.notification_note = updates.notificationNote?.trim() || null
  if (updates.bookingDescription !== undefined) mapped.booking_description = updates.bookingDescription?.trim() || null
  if (updates.showPricing !== undefined) mapped.show_pricing = updates.showPricing
  if (updates.coverPattern !== undefined) mapped.cover_pattern = updates.coverPattern

  const { data, error } = await supabase
    .from('signup_pages')
    .update(mapped)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteSignupPage(id) {
  const { error } = await supabase.from('signup_pages').delete().eq('id', id)
  if (error) throw error
}

// ── Shoot Types ──────────────────────────────────────────────────────────────

export async function createShootType({ signupPageId, name, durationMinutes, sessionType, description, sortOrder, price, retainerAmount }) {
  const { data, error } = await supabase
    .from('signup_shoot_types')
    .insert({
      signup_page_id: signupPageId,
      name: name.trim(),
      duration_minutes: durationMinutes,
      session_type: sessionType || 'Portrait',
      description: description?.trim() || null,
      sort_order: sortOrder ?? 0,
      price: price === '' || price == null ? null : price,
      retainer_amount: retainerAmount === '' || retainerAmount == null ? null : retainerAmount,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateShootType(id, updates) {
  const mapped = {}
  if (updates.name !== undefined) mapped.name = updates.name.trim()
  if (updates.durationMinutes !== undefined) mapped.duration_minutes = updates.durationMinutes
  if (updates.sessionType !== undefined) mapped.session_type = updates.sessionType
  if (updates.description !== undefined) mapped.description = updates.description?.trim() || null
  if (updates.sortOrder !== undefined) mapped.sort_order = updates.sortOrder
  if (updates.price !== undefined) mapped.price = updates.price === '' || updates.price == null ? null : updates.price
  if (updates.retainerAmount !== undefined) mapped.retainer_amount = updates.retainerAmount === '' || updates.retainerAmount == null ? null : updates.retainerAmount

  const { data, error } = await supabase
    .from('signup_shoot_types')
    .update(mapped)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteShootType(id) {
  const { error } = await supabase.from('signup_shoot_types').delete().eq('id', id)
  if (error) throw error
}

export async function getShootTypeQuestionnaires(shootTypeId) {
  const { data, error } = await supabase
    .from('signup_shoot_type_questionnaires')
    .select('questionnaire_id')
    .eq('shoot_type_id', shootTypeId)
  if (error) throw error
  return (data ?? []).map(r => r.questionnaire_id)
}

// Replace-all semantics -- simplest correct approach for a small list like
// this (a handful of questionnaires per shoot type at most), rather than
// diffing adds/removes.
export async function setShootTypeQuestionnaires(shootTypeId, questionnaireIds) {
  const { error: delError } = await supabase
    .from('signup_shoot_type_questionnaires')
    .delete()
    .eq('shoot_type_id', shootTypeId)
  if (delError) throw delError

  if (questionnaireIds.length === 0) return

  const { error: insError } = await supabase
    .from('signup_shoot_type_questionnaires')
    .insert(questionnaireIds.map((qId, i) => ({ shoot_type_id: shootTypeId, questionnaire_id: qId, sort_order: i })))
  if (insError) throw insError
}

// ── Slots ────────────────────────────────────────────────────────────────────

export async function getSlots(signupPageId) {
  const { data, error } = await supabase
    .from('signup_slots')
    .select('*')
    .eq('signup_page_id', signupPageId)
    .order('start_time', { ascending: true })
  if (error) throw error
  return data ?? []
}

// Converts a wall-clock date/time as understood in a specific IANA
// timezone (e.g. "2026-08-01" "10:00" in "America/New_York") into the
// correct UTC instant. Deliberately NOT `new Date(dateStr + 'T' + timeStr)`
// -- that parses using the browser's own local timezone, which only
// happens to be correct if the person creating slots is physically in the
// same timezone as the venue. Library-free double-conversion technique:
// treat the wall-clock as a UTC reference point, see what that reference
// instant looks like when displayed in the target timezone, and use the
// difference to solve for the real offset.
export function zonedTimeToUtc(dateStr, timeStr, timeZone) {
  const [year, month, day] = dateStr.split('-').map(Number)
  const [hour, minute] = timeStr.split(':').map(Number)
  const desired = Date.UTC(year, month - 1, day, hour, minute)

  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
  const parts = dtf.formatToParts(new Date(desired))
  const get = type => parts.find(p => p.type === type)?.value
  const hourVal = Number(get('hour'))
  const inTZAsUTC = Date.UTC(
    Number(get('year')), Number(get('month')) - 1, Number(get('day')),
    hourVal === 24 ? 0 : hourVal, Number(get('minute')), Number(get('second')),
  )
  const offsetMs = desired - inTZAsUTC
  return new Date(desired + offsetMs)
}

// Bulk-inserts slots for a recurring pattern within a single day, e.g.
// 10:00am-6:00pm in 15-minute increments with a 5-minute buffer between
// each. Used by the slot generator -- one call per day block, since
// GenCon's days don't all run the same hours. `timezone` must be the
// signup page's own IANA timezone, not assumed from the browser.
export async function generateSlots({ signupPageId, shootTypeId, date, startTime, endTime, durationMinutes, bufferMinutes = 0, timezone }) {
  const slots = []
  const dayStart = zonedTimeToUtc(date, startTime, timezone)
  const dayEnd = zonedTimeToUtc(date, endTime, timezone)
  const stepMs = (durationMinutes + bufferMinutes) * 60_000
  const durationMs = durationMinutes * 60_000

  let cursor = dayStart
  while (cursor.getTime() + durationMs <= dayEnd.getTime()) {
    const slotEnd = new Date(cursor.getTime() + durationMs)
    slots.push({
      signup_page_id: signupPageId,
      shoot_type_id: shootTypeId,
      start_time: cursor.toISOString(),
      end_time: slotEnd.toISOString(),
    })
    cursor = new Date(cursor.getTime() + stepMs)
  }

  if (slots.length === 0) return []

  const { data, error } = await supabase
    .from('signup_slots')
    .insert(slots)
    .select()
  if (error) throw error
  return data
}

export async function deleteSlot(id) {
  const { error } = await supabase.from('signup_slots').delete().eq('id', id)
  if (error) throw error
}

// Single manually-specified slot, as opposed to the generator's batch
// insert -- for the "I just need one extra slot" case that doesn't
// justify running the generator for a single day. Takes the same
// date/time/timezone inputs as generateSlots (not raw ISO strings) so the
// same venue-local-to-UTC conversion applies consistently either way.
export async function createManualSlot({ signupPageId, shootTypeId, date, startTime, durationMinutes, timezone }) {
  const start = zonedTimeToUtc(date, startTime, timezone)
  const end = new Date(start.getTime() + durationMinutes * 60_000)
  const { data, error } = await supabase
    .from('signup_slots')
    .insert({
      signup_page_id: signupPageId, shoot_type_id: shootTypeId,
      start_time: start.toISOString(), end_time: end.toISOString(),
    })
    .select()
    .single()
  if (error) throw error
  return data
}

// Deliberately scoped to OPEN slots only -- a "clear slots" action should
// never silently delete already-claimed slots, since those represent
// real client bookings with real sessions attached. If someone wants to
// remove a specific claimed slot's record, that's a one-at-a-time
// decision, not a bulk one.
export async function deleteAllOpenSlots(signupPageId) {
  const { error } = await supabase
    .from('signup_slots')
    .delete()
    .eq('signup_page_id', signupPageId)
    .is('claimed_at', null)
  if (error) throw error
}

// Checks what's actually attached to a session before it gets deleted as
// part of a no-show -- galleries, submitted questionnaires, sent
// questionnaires, and contracts. Contracts are SET NULL (not
// cascade-deleted) at the DB level when a session is removed, so they're
// reported separately as "orphaned" rather than "deleted" -- everything
// else here genuinely gets deleted by the cascade.
export async function getSessionDeletionImpact(sessionId) {
  const [{ count: galleries }, { count: submissions }, { count: questionnaireSends }, { count: contracts }] = await Promise.all([
    supabase.from('session_galleries').select('*', { count: 'exact', head: true }).eq('session_id', sessionId),
    supabase.from('session_submissions').select('*', { count: 'exact', head: true }).eq('session_id', sessionId),
    supabase.from('questionnaire_sends').select('*', { count: 'exact', head: true }).eq('session_id', sessionId),
    supabase.from('contracts').select('*', { count: 'exact', head: true }).eq('session_id', sessionId),
  ])
  return { galleries: galleries ?? 0, submissions: submissions ?? 0, questionnaireSends: questionnaireSends ?? 0, contracts: contracts ?? 0 }
}

// Deletes the session record itself. session_questionnaires/
// session_galleries/session_submissions/questionnaire_sends cascade-delete
// via the DB's own foreign keys; contracts get SET NULL (orphaned, not
// deleted). Call getSessionDeletionImpact first and get the photographer's
// confirmation if it reports anything -- this function itself doesn't ask.
export async function deleteSession(sessionId) {
  const { error } = await supabase.from('sessions').delete().eq('id', sessionId)
  if (error) throw error
}

// Frees a claimed slot back to open, for a no-show or a booking mistake.
// Resets the slot's own fields only -- deleting the session it points to
// (if any) is the caller's job via deleteSession above, since that's a
// separate, bigger decision that needs its own confirmation.
export async function unclaimSlot(id) {
  const { error } = await supabase
    .from('signup_slots')
    .update({
      claimed_at: null,
      client_name: null,
      client_email: null,
      client_phone: null,
      client_pronouns: null,
    })
    .eq('id', id)
  if (error) throw error
}

// A private, photographer-only note on a slot (e.g. "brought 2 friends,
// wants extra prints"). Never shown to the client, never touched by the
// public claim_signup_slot RPC or the public booking page.
export async function updateSlotNote(id, note) {
  const { error } = await supabase
    .from('signup_slots')
    .update({ photographer_note: note?.trim() || null })
    .eq('id', id)
  if (error) throw error
}

// ── Public booking (anonymous, via RPC) ─────────────────────────────────────

export async function getSignupPageData(token) {
  const { data, error } = await supabase.rpc('get_signup_page_data', { p_token: token })
  if (error) throw error
  return data
}

export async function claimSignupSlot({ slotId, firstName, lastName, email, phone, pronouns }) {
  const { data, error } = await supabase.rpc('claim_signup_slot', {
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

// Moves an existing claimed slot's booking to a different open slot on
// the same signup page (optionally a different shoot type -- a client
// upgrade). Photographer-only (checked server-side via auth.uid()),
// unlike claim_signup_slot which is intentionally public. Conflict
// checking is the DB's own no_overlapping_claimed_slots EXCLUDE
// constraint -- the RPC returns { success: false, error:
// 'conflicts_with_existing_booking' } if the target would overlap another
// claimed slot, rather than this function pre-checking for conflicts itself.
export async function moveSignupSlotBooking(sourceSlotId, targetSlotId, notifyClient = false) {
  const { data, error } = await supabase.rpc('move_signup_slot_booking', {
    p_source_slot_id: sourceSlotId,
    p_target_slot_id: targetSlotId,
    p_notify_client: notifyClient,
  })
  if (error) throw error
  return data
}

// Manually adjusts an already-claimed slot's own start/end time to
// something outside the pre-generated slot grid entirely (e.g. shifting
// 15 minutes to accommodate a late arrival). Takes local date/time
// strings + the page's own timezone, same shape as createManualSlot
// above, rather than raw ISO datetimes -- keeps the timezone conversion
// in one place (zonedTimeToUtc) instead of pushing it onto every caller.
// Same conflict/authorization handling as moveSignupSlotBooking.
export async function updateSignupSlotTime({ slotId, date, startTime, endTime, timezone, notifyClient = false }) {
  const start = zonedTimeToUtc(date, startTime, timezone)
  const end = zonedTimeToUtc(date, endTime, timezone)
  const { data, error } = await supabase.rpc('update_signup_slot_time', {
    p_slot_id: slotId,
    p_new_start: start.toISOString(),
    p_new_end: end.toISOString(),
    p_notify_client: notifyClient,
  })
  if (error) throw error
  return data
}
'''
replace_whole_file("src/utils/signupApi.js", SIGNUP_API_OLD, SIGNUP_API_NEW)
SESSIONS_OLD = '''import { useEffect, useRef, useState } from 'react'
import RescheduleModal from '../components/signup/RescheduleModal.jsx'
import MultiSelectPicker from '../components/ui/MultiSelectPicker.jsx'
import { SlotActionsModal, SlotActionsSheet } from './SignupLiveStatus.jsx'
import { useMediaQuery } from '../hooks/useMediaQuery.js'
import { useNavigate, Link as RouterLink } from 'react-router-dom'
import { Plus, CalendarDays, X, LayoutList, Columns, Link2, Copy, Check, Trash2, MapPin, Ticket as TicketIcon, Camera,
  Users, Briefcase, Ticket, Home, GraduationCap, ScanFace, Baby, User, Trophy, Heart, BookHeart, SquareUser, CalendarClock, Search } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader.jsx'
import { supabase } from '../supabaseClient.js'
import { getPublicBaseUrl } from '../utils/publicBaseUrl.js'
import { formatPlainTimeRange, formatTimeRange } from '../utils/formatters.js'
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
  getMyAllSessionsToken,
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
          {session.type}
          {session.session_date ? ` · ${new Date(session.session_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
          {session.start_time && session.end_time ? ` · ${formatPlainTimeRange(session.start_time, session.end_time)}` : ''}
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
  const [price, setPrice] = useState(shootType.price != null ? String(shootType.price) : '')
  const [retainerAmount, setRetainerAmount] = useState(shootType.retainer_amount != null ? String(shootType.retainer_amount) : '')
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
        price: price.trim() === '' ? null : parseFloat(price),
        retainerAmount: retainerAmount.trim() === '' ? null : parseFloat(retainerAmount),
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
        <input value={name} onChange={e => setName(e.target.value)}
          style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '7px 10px', fontSize: 13, boxSizing: 'border-box' }} />
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-1.5">
            <input type="number" min="5" step="5" value={duration} onChange={e => setDuration(e.target.value)}
              style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '7px 10px', fontSize: 13 }} />
            <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>min</span>
          </div>
          <select value={sessionType} onChange={e => setSessionType(e.target.value)}
            style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '7px 10px', fontSize: 13 }}>
            {SESSION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div>
          <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Price (optional)</p>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--text-muted)' }}>$</span>
            <input type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)}
              placeholder="0.00"
              style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '7px 10px 7px 22px', fontSize: 13, boxSizing: 'border-box' }} />
          </div>
        </div>

        <div>
          <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Deposit / retainer required (optional)</p>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--text-muted)' }}>$</span>
            <input type="number" min="0" step="0.01" value={retainerAmount} onChange={e => setRetainerAmount(e.target.value)}
              placeholder="0.00"
              style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '7px 10px 7px 22px', fontSize: 13, boxSizing: 'border-box' }} />
          </div>
        </div>

        <div>
          <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Questionnaires assigned automatically when someone books this shoot type</p>
          {loadingQuestionnaires ? (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading...</p>
          ) : (
            <MultiSelectPicker
              items={allQuestionnaires}
              selectedIds={questionnaireIds}
              onChange={setQuestionnaireIds}
              placeholder="Add a questionnaire..."
              emptyMessage="No questionnaire templates yet. Create one in Account → Questionnaires."
            />
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
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{shootType.duration_minutes} min · {shootType.session_type}{shootType.price != null ? ` · $${parseFloat(shootType.price).toFixed(2)}` : ''}</p>
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

function SlotDayRow({ day, dayData, isFirst, timezone, shootTypes, onDeleteSlot, onReschedule }) {
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
                {!slot.claimed_at ? (
                  <button onClick={() => onDeleteSlot(slot.id)} title="Delete this open slot"
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 4, flexShrink: 0 }}>
                    <Trash2 size={13} />
                  </button>
                ) : (
                  <button onClick={() => onReschedule(slot)}
                    className="flex items-center gap-1 text-xs font-medium"
                    style={{ color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', flexShrink: 0 }}>
                    <CalendarClock size={12} />
                    Reschedule
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
  const [newTypePrice, setNewTypePrice] = useState('')
  const [newTypeRetainerAmount, setNewTypeRetainerAmount] = useState('')
  const [newTypeQuestionnaireIds, setNewTypeQuestionnaireIds] = useState([])
  const [address, setAddress] = useState('')
  const [timezone, setTimezone] = useState('America/New_York')
  const [confirmationNote, setConfirmationNote] = useState('')
  const [notificationNote, setNotificationNote] = useState('')
  const [bookingDescription, setBookingDescription] = useState('')
  const [showPricing, setShowPricing] = useState(true)
  const [copied, setCopied] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmClearAll, setConfirmClearAll] = useState(false)
  const [clearingAll, setClearingAll] = useState(false)
  const [questionnaires, setQuestionnaires] = useState([])
  const [activeTab, setActiveTab] = useState('slots')

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
      setShowPricing(p.show_pricing ?? true)
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

  async function handleToggleShowPricing() {
    const next = !showPricing
    setShowPricing(next)
    const updated = await updateSignupPage(pageId, { showPricing: next })
    setPage(updated ? { ...page, ...updated, signup_shoot_types: page.signup_shoot_types } : page)
  }

  async function handleAddShootType() {
    if (!newTypeName.trim()) return
    const created = await createShootType({
      signupPageId: pageId, name: newTypeName, durationMinutes: parseInt(newTypeDuration, 10) || 15,
      sessionType: newTypeSessionType, sortOrder: page.signup_shoot_types.length,
      price: newTypePrice.trim() === '' ? null : parseFloat(newTypePrice),
      retainerAmount: newTypeRetainerAmount.trim() === '' ? null : parseFloat(newTypeRetainerAmount),
    })
    if (newTypeQuestionnaireIds.length > 0) {
      await setShootTypeQuestionnaires(created.id, newTypeQuestionnaireIds)
    }
    setPage(prev => ({ ...prev, signup_shoot_types: [...prev.signup_shoot_types, created] }))
    setNewTypeName(''); setNewTypeDuration('15'); setNewTypePrice(''); setNewTypeRetainerAmount(''); setNewTypeQuestionnaireIds([]); setAddingType(false)
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

  const [baseUrl, setBaseUrl] = useState(window.location.origin)
  useEffect(() => { getPublicBaseUrl().then(setBaseUrl) }, [])
  const bookingUrl = page ? `${baseUrl}/book/${page.token}` : ''

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

  const [rescheduleSlot, setRescheduleSlot] = useState(null)
  const [actionsSlot, setActionsSlot] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showGenerator, setShowGenerator] = useState(false)
  const isDesktop = useMediaQuery('(min-width: 768px)')

  // Cross-day search: matches claimed slots by client name/email across
  // ALL days at once, not scoped to whichever day happens to be expanded
  // in the accordion below. Open (unclaimed) slots have no client info to
  // search by, so they're excluded here -- they're still reachable via
  // the day-by-day fallback when search is empty.
  const isSearchingSlots = searchQuery.trim().length > 0
  const searchResults = isSearchingSlots
    ? slots
        .filter(s => s.claimed_at && (
          s.client_name?.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
          s.client_email?.toLowerCase().includes(searchQuery.trim().toLowerCase())
        ))
        .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
    : []

  return (
    <>
    <Modal title={page?.title || 'Signup page'} onClose={onClose} size="lg">
      {loading || !page ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Link + active toggle */}
          <div className="rounded-xl p-3 flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Link2 size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <span className="text-xs flex-1 min-w-0 truncate" style={{ color: 'var(--text-muted)' }}>{bookingUrl}</span>
              <button onClick={handleCopyLink} className="text-xs font-medium px-2.5 py-1.5 rounded-lg flex items-center gap-1 shrink-0"
                style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                {copied ? <Check size={12} /> : <Copy size={12} />}{copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 sm:gap-3 shrink-0">
              <RouterLink to={`/sessions/signups/${page.id}/status`} target="_blank" rel="noopener noreferrer"
                className="text-xs font-medium px-2.5 py-1.5 rounded-lg flex items-center justify-center gap-1"
                style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', textDecoration: 'none' }}>
                Live status
              </RouterLink>
              <div className="flex items-center justify-center sm:justify-start">
                <Toggle checked={page.is_active} onChange={handleToggleActive} label={page.is_active ? 'Active' : 'Inactive'} />
              </div>
            </div>
          </div>

          {/* Tab switcher -- same pill-toggle pattern as RescheduleModal's
              Move/Custom-time tabs. "Booking slots" is the default since
              finding/acting on a booking is the primary task; page
              settings are secondary and don't need to be scrolled past
              to get there anymore. */}
          <div className="flex rounded-lg p-0.5" style={{ background: 'var(--bg-subtle)' }}>
            {[['slots', 'Booking slots'], ['settings', 'Session settings']].map(([key, tabLabel]) => (
              <button key={key} onClick={() => setActiveTab(key)}
                className="flex-1 text-xs font-medium px-2.5 py-1.5 rounded-md"
                style={{
                  background: activeTab === key ? 'var(--surface)' : 'transparent',
                  color: activeTab === key ? 'var(--text)' : 'var(--text-muted)',
                  border: 'none', cursor: 'pointer',
                }}>
                {tabLabel}
              </button>
            ))}
          </div>

          {activeTab === 'slots' && (
            <div className="space-y-6">
              {/* Cross-day search -- see isSearchingSlots/searchResults above. */}
              <div className="relative">
                <Search size={14} style={{ position: 'absolute', left: 12, top: 11, color: 'var(--text-muted)' }} />
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search bookings by name or email..."
                  style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '9px 12px 9px 34px', fontSize: 13, boxSizing: 'border-box' }} />
              </div>

              {isSearchingSlots ? (
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                  {searchResults.length === 0 ? (
                    <p className="text-xs px-4 py-3" style={{ color: 'var(--text-muted)' }}>No bookings match "{searchQuery}".</p>
                  ) : (
                    searchResults.map((slot, i) => {
                      const shootType = page.signup_shoot_types.find(t => t.id === slot.shoot_type_id)
                      const day = new Date(slot.start_time).toLocaleDateString('en-US', { timeZone: page.timezone, weekday: 'short', month: 'short', day: 'numeric' })
                      return (
                        <button key={slot.id} onClick={() => setActionsSlot(slot)}
                          className="w-full flex items-center justify-between px-4 py-2.5 text-left text-xs"
                          style={{ background: 'none', border: 'none', borderTop: i === 0 ? 'none' : '1px solid var(--border)', cursor: 'pointer' }}>
                          <div className="min-w-0">
                            <span className="font-medium" style={{ color: 'var(--text)' }}>{slot.client_name}</span>
                            <div style={{ color: 'var(--text-muted)' }}>
                              {day}, {formatTimeRange(slot.start_time, slot.end_time, page.timezone)} · {shootType?.name || 'Unknown'}
                            </div>
                          </div>
                        </button>
                      )
                    })
                  )}
                </div>
              ) : (
              <>
          {/* Slot generator -- collapsed by default (v1.5.5): creating new
              slots happens far less often than finding existing ones, so
              it no longer needs to always be visible here. */}
          {showGenerator ? (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>Generate time slots</label>
                <button onClick={() => setShowGenerator(false)} className="text-xs font-medium"
                  style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
                  Hide
                </button>
              </div>
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                <GenerateSlotsForm page={page} shootTypes={page.signup_shoot_types} onGenerated={() => load({ silent: true })} />
              </div>
              <div className="mt-2.5">
                <ManualAddSlotForm page={page} shootTypes={page.signup_shoot_types} onAdded={() => load({ silent: true })} />
              </div>
            </div>
          ) : (
            <button onClick={() => setShowGenerator(true)} className="text-xs font-medium"
              style={{ color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer' }}>
              + Generate or add time slots
            </button>
          )}


          {/* Slot summary by day */}
          {Object.keys(slotsByDay).length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>Slots by day</label>
                {slots.some(s => !s.claimed_at) && !confirmClearAll && (
                  <button onClick={() => setConfirmClearAll(true)}
                    className="flex items-center gap-1 text-xs font-medium"
                    style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
                    <Trash2 size={12} />Clear all open slots
                  </button>
                )}
              </div>
              {confirmClearAll && (
                <div className="flex items-center flex-wrap gap-2 mb-1.5 px-3 py-2 rounded-lg" style={{ background: 'var(--danger-subtle)' }}>
                  <span className="text-xs flex-1" style={{ color: 'var(--danger)' }}>Remove all open slots? Claimed slots won't be affected.</span>
                  <Button variant="danger" size="sm" onClick={handleClearAllOpenSlots} disabled={clearingAll}>
                    {clearingAll ? 'Clearing...' : 'Confirm'}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setConfirmClearAll(false)}>Cancel</Button>
                </div>
              )}
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                {Object.entries(slotsByDay).map(([day, dayData], i) => (
                  <SlotDayRow key={day} day={day} dayData={dayData} isFirst={i === 0}
                    timezone={page.timezone} shootTypes={page.signup_shoot_types}
                    onDeleteSlot={handleDeleteSlot} onReschedule={setRescheduleSlot} />
                ))}
              </div>
            </div>
          )}
              </>
              )}
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-6">

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

          {/* Pricing visibility -- applies to all shoot type prices on this
              page's public booking page. Defaults on; some photographers
              may prefer to keep pricing off the public page entirely. */}
          <div className="flex items-center justify-between rounded-xl p-3" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>Show pricing publicly</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Displays each shoot type's price to clients on the booking page.</p>
            </div>
            <Toggle checked={showPricing} onChange={handleToggleShowPricing} />
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
                <div className="p-3 space-y-2" style={{ borderTop: page.signup_shoot_types.length > 0 ? '1px solid var(--border)' : 'none' }}>
                  <input value={newTypeName} onChange={e => setNewTypeName(e.target.value)} placeholder="Cosplay Portrait" autoFocus
                    style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '7px 10px', fontSize: 13, boxSizing: 'border-box' }} />
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-1.5">
                      <input type="number" min="5" step="5" value={newTypeDuration} onChange={e => setNewTypeDuration(e.target.value)}
                        style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '7px 10px', fontSize: 13 }} />
                      <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>min</span>
                    </div>
                    <select value={newTypeSessionType} onChange={e => setNewTypeSessionType(e.target.value)}
                      style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '7px 10px', fontSize: 13 }}>
                      {SESSION_TYPES.map(st => <option key={st} value={st}>{st}</option>)}
                    </select>
                  </div>

                  <div>
                    <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Price (optional)</p>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--text-muted)' }}>$</span>
                      <input type="number" min="0" step="0.01" value={newTypePrice} onChange={e => setNewTypePrice(e.target.value)}
                        placeholder="0.00"
                        style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '7px 10px 7px 22px', fontSize: 13, boxSizing: 'border-box' }} />
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Deposit / retainer required (optional)</p>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--text-muted)' }}>$</span>
                      <input type="number" min="0" step="0.01" value={newTypeRetainerAmount} onChange={e => setNewTypeRetainerAmount(e.target.value)}
                        placeholder="0.00"
                        style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '7px 10px 7px 22px', fontSize: 13, boxSizing: 'border-box' }} />
                    </div>
                  </div>

                  {/* Questionnaire assignment at creation time (v1.5.5) --
                      previously only available after creating the shoot
                      type, via ShootTypeRow's edit mode. Same checklist
                      UI/pattern, reused here. */}
                  <div>
                    <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Questionnaires assigned automatically when someone books this shoot type</p>
                    <MultiSelectPicker
                      items={questionnaires}
                      selectedIds={newTypeQuestionnaireIds}
                      onChange={setNewTypeQuestionnaireIds}
                      placeholder="Add a questionnaire..."
                      emptyMessage="No questionnaire templates yet. Create one in Account → Questionnaires."
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <button onClick={handleAddShootType} disabled={!newTypeName.trim()} className="text-xs font-medium px-2.5 py-1.5 rounded-lg"
                      style={{ background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer' }}>Add</button>
                    <button onClick={() => { setAddingType(false); setNewTypeQuestionnaireIds([]) }} className="text-xs font-medium px-2.5 py-1.5 rounded-lg"
                      style={{ background: 'var(--surface-raised)', color: 'var(--text-muted)', border: 'none', cursor: 'pointer' }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          </div>


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
        </div>
      )}
    </Modal>

    {rescheduleSlot && (
      <RescheduleModal
        slot={rescheduleSlot}
        allSlots={slots}
        shootTypes={page.signup_shoot_types}
        timezone={page.timezone}
        onClose={() => setRescheduleSlot(null)}
        onDone={() => { setRescheduleSlot(null); load({ silent: true }) }}
      />
    )}

    {actionsSlot && (
      isDesktop ? (
        <SlotActionsModal
          slot={actionsSlot}
          onClose={() => setActionsSlot(null)}
          onReschedule={slot => { setActionsSlot(null); setRescheduleSlot(slot) }}
          shootTypes={page.signup_shoot_types}
          timezone={page.timezone}
          onUnclaimed={() => { setActionsSlot(null); load({ silent: true }) }}
          onNoteSaved={() => load({ silent: true })}
        />
      ) : (
        <SlotActionsSheet
          slot={actionsSlot}
          onClose={() => setActionsSlot(null)}
          onReschedule={slot => { setActionsSlot(null); setRescheduleSlot(slot) }}
          shootTypes={page.signup_shoot_types}
          timezone={page.timezone}
          onUnclaimed={() => { setActionsSlot(null); load({ silent: true }) }}
          onNoteSaved={() => load({ silent: true })}
        />
      )
    )}
    </>
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
  const [allSessionsToken, setAllSessionsToken] = useState(null)
  const [allSessionsBaseUrl, setAllSessionsBaseUrl] = useState(window.location.origin)
  const [allSessionsCopied, setAllSessionsCopied] = useState(false)

  const [photographerId, setPhotographerId] = useState(null)

  useEffect(() => {
    load()
    supabase.auth.getUser().then(({ data: { user } }) => setPhotographerId(user?.id ?? null))
  }, [])

  useEffect(() => {
    if (!photographerId) return
    const channel = supabase
      .channel(`sessions_${photographerId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'sessions', filter: `photographer_id=eq.${photographerId}` },
        () => load({ silent: true })
      )
      .subscribe()

    const fallbackInterval = setInterval(() => load({ silent: true }), 30_000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(fallbackInterval)
    }
  }, [photographerId])

  useEffect(() => {
    if (view === 'signups' && signupPages.length === 0) loadSignupPages()
    if (view === 'signups' && allSessionsToken === null) {
      getMyAllSessionsToken().then(setAllSessionsToken).catch(() => {})
      getPublicBaseUrl().then(setAllSessionsBaseUrl).catch(() => {})
    }
  }, [view])

  async function loadSignupPages() {
    setLoadingSignups(true)
    try {
      const data = await getSignupPages()
      setSignupPages(data)
    } catch (err) { console.error(err) }
    finally { setLoadingSignups(false) }
  }

  const allSessionsUrl = allSessionsToken ? `${allSessionsBaseUrl}/book/all/${allSessionsToken}` : ''

  function handleCopyAllSessionsLink() {
    if (!allSessionsUrl) return
    navigator.clipboard.writeText(allSessionsUrl)
    setAllSessionsCopied(true)
    setTimeout(() => setAllSessionsCopied(false), 1500)
  }

  async function load({ silent = false } = {}) {
    if (!silent) setLoading(true)
    try {
      const data = await getSessions()
      setSessions(data)
    } catch (err) { console.error(err) }
    finally { if (!silent) setLoading(false) }
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
              { value: 'date_desc', label: 'Session Date: New \\u2192 Old' },
              { value: 'date_asc', label: 'Session Date: Old \\u2192 New' },
              { value: 'client_asc', label: 'Client: A \\u2192 Z' },
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
                            session.session_date ? formatSessionDate(session.session_date, session.start_time, session.end_time) : null,
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
          {allSessionsToken && (
            <div className="rounded-xl p-3 mb-4 flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3"
              style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.25)' }}>
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Link2 size={14} style={{ color: '#6366f1', flexShrink: 0 }} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium" style={{ color: 'var(--text)' }}>All active sessions</p>
                  <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{allSessionsUrl}</p>
                </div>
              </div>
              <button onClick={handleCopyAllSessionsLink} className="text-xs font-medium px-2.5 py-1.5 rounded-lg flex items-center justify-center gap-1 shrink-0 w-full sm:w-auto"
                style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                {allSessionsCopied ? <Check size={12} /> : <Copy size={12} />}{allSessionsCopied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}
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
'''
SESSIONS_NEW = '''import { useEffect, useRef, useState } from 'react'
import RescheduleModal from '../components/signup/RescheduleModal.jsx'
import MultiSelectPicker from '../components/ui/MultiSelectPicker.jsx'
import { SlotActionsModal, SlotActionsSheet } from './SignupLiveStatus.jsx'
import { useMediaQuery } from '../hooks/useMediaQuery.js'
import { useNavigate, Link as RouterLink } from 'react-router-dom'
import { Plus, CalendarDays, X, LayoutList, Columns, Link2, Copy, Check, Trash2, MapPin, Ticket as TicketIcon, Camera,
  Users, Briefcase, Ticket, Home, GraduationCap, ScanFace, Baby, User, Trophy, Heart, BookHeart, SquareUser, CalendarClock, Search } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader.jsx'
import { supabase } from '../supabaseClient.js'
import { getPublicBaseUrl } from '../utils/publicBaseUrl.js'
import { formatPlainTimeRange, formatTimeRange } from '../utils/formatters.js'
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
  getMyAllSessionsToken,
} from '../utils/signupApi.js'
import { COMMON_TIMEZONES } from '../utils/timezoneApi.js'
import { CoverPatternShapes } from '../components/booking/BookingCover.jsx'
import { COVER_PATTERN_OPTIONS, DEFAULT_COVER_PATTERN } from '../utils/coverPatterns.js'
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
          {session.type}
          {session.session_date ? ` · ${new Date(session.session_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
          {session.start_time && session.end_time ? ` · ${formatPlainTimeRange(session.start_time, session.end_time)}` : ''}
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
  const [price, setPrice] = useState(shootType.price != null ? String(shootType.price) : '')
  const [retainerAmount, setRetainerAmount] = useState(shootType.retainer_amount != null ? String(shootType.retainer_amount) : '')
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
        price: price.trim() === '' ? null : parseFloat(price),
        retainerAmount: retainerAmount.trim() === '' ? null : parseFloat(retainerAmount),
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
        <input value={name} onChange={e => setName(e.target.value)}
          style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '7px 10px', fontSize: 13, boxSizing: 'border-box' }} />
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-1.5">
            <input type="number" min="5" step="5" value={duration} onChange={e => setDuration(e.target.value)}
              style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '7px 10px', fontSize: 13 }} />
            <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>min</span>
          </div>
          <select value={sessionType} onChange={e => setSessionType(e.target.value)}
            style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '7px 10px', fontSize: 13 }}>
            {SESSION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div>
          <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Price (optional)</p>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--text-muted)' }}>$</span>
            <input type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)}
              placeholder="0.00"
              style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '7px 10px 7px 22px', fontSize: 13, boxSizing: 'border-box' }} />
          </div>
        </div>

        <div>
          <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Deposit / retainer required (optional)</p>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--text-muted)' }}>$</span>
            <input type="number" min="0" step="0.01" value={retainerAmount} onChange={e => setRetainerAmount(e.target.value)}
              placeholder="0.00"
              style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '7px 10px 7px 22px', fontSize: 13, boxSizing: 'border-box' }} />
          </div>
        </div>

        <div>
          <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Questionnaires assigned automatically when someone books this shoot type</p>
          {loadingQuestionnaires ? (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading...</p>
          ) : (
            <MultiSelectPicker
              items={allQuestionnaires}
              selectedIds={questionnaireIds}
              onChange={setQuestionnaireIds}
              placeholder="Add a questionnaire..."
              emptyMessage="No questionnaire templates yet. Create one in Account → Questionnaires."
            />
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
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{shootType.duration_minutes} min · {shootType.session_type}{shootType.price != null ? ` · $${parseFloat(shootType.price).toFixed(2)}` : ''}</p>
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

function SlotDayRow({ day, dayData, isFirst, timezone, shootTypes, onDeleteSlot, onReschedule }) {
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
                {!slot.claimed_at ? (
                  <button onClick={() => onDeleteSlot(slot.id)} title="Delete this open slot"
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 4, flexShrink: 0 }}>
                    <Trash2 size={13} />
                  </button>
                ) : (
                  <button onClick={() => onReschedule(slot)}
                    className="flex items-center gap-1 text-xs font-medium"
                    style={{ color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', flexShrink: 0 }}>
                    <CalendarClock size={12} />
                    Reschedule
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
  const [newTypePrice, setNewTypePrice] = useState('')
  const [newTypeRetainerAmount, setNewTypeRetainerAmount] = useState('')
  const [newTypeQuestionnaireIds, setNewTypeQuestionnaireIds] = useState([])
  const [address, setAddress] = useState('')
  const [timezone, setTimezone] = useState('America/New_York')
  const [confirmationNote, setConfirmationNote] = useState('')
  const [notificationNote, setNotificationNote] = useState('')
  const [bookingDescription, setBookingDescription] = useState('')
  const [showPricing, setShowPricing] = useState(true)
  const [coverPattern, setCoverPattern] = useState(DEFAULT_COVER_PATTERN)
  const [copied, setCopied] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmClearAll, setConfirmClearAll] = useState(false)
  const [clearingAll, setClearingAll] = useState(false)
  const [questionnaires, setQuestionnaires] = useState([])
  const [activeTab, setActiveTab] = useState('slots')

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
      setShowPricing(p.show_pricing ?? true)
      setCoverPattern(p.cover_pattern || DEFAULT_COVER_PATTERN)
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

  async function handleToggleShowPricing() {
    const next = !showPricing
    setShowPricing(next)
    const updated = await updateSignupPage(pageId, { showPricing: next })
    setPage(updated ? { ...page, ...updated, signup_shoot_types: page.signup_shoot_types } : page)
  }

  async function handleSaveCoverPattern(patternId) {
    setCoverPattern(patternId)
    const updated = await updateSignupPage(pageId, { coverPattern: patternId })
    setPage(updated ? { ...page, ...updated, signup_shoot_types: page.signup_shoot_types } : page)
  }

  async function handleAddShootType() {
    if (!newTypeName.trim()) return
    const created = await createShootType({
      signupPageId: pageId, name: newTypeName, durationMinutes: parseInt(newTypeDuration, 10) || 15,
      sessionType: newTypeSessionType, sortOrder: page.signup_shoot_types.length,
      price: newTypePrice.trim() === '' ? null : parseFloat(newTypePrice),
      retainerAmount: newTypeRetainerAmount.trim() === '' ? null : parseFloat(newTypeRetainerAmount),
    })
    if (newTypeQuestionnaireIds.length > 0) {
      await setShootTypeQuestionnaires(created.id, newTypeQuestionnaireIds)
    }
    setPage(prev => ({ ...prev, signup_shoot_types: [...prev.signup_shoot_types, created] }))
    setNewTypeName(''); setNewTypeDuration('15'); setNewTypePrice(''); setNewTypeRetainerAmount(''); setNewTypeQuestionnaireIds([]); setAddingType(false)
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

  const [baseUrl, setBaseUrl] = useState(window.location.origin)
  useEffect(() => { getPublicBaseUrl().then(setBaseUrl) }, [])
  const bookingUrl = page ? `${baseUrl}/book/${page.token}` : ''

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

  const [rescheduleSlot, setRescheduleSlot] = useState(null)
  const [actionsSlot, setActionsSlot] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showGenerator, setShowGenerator] = useState(false)
  const isDesktop = useMediaQuery('(min-width: 768px)')

  // Cross-day search: matches claimed slots by client name/email across
  // ALL days at once, not scoped to whichever day happens to be expanded
  // in the accordion below. Open (unclaimed) slots have no client info to
  // search by, so they're excluded here -- they're still reachable via
  // the day-by-day fallback when search is empty.
  const isSearchingSlots = searchQuery.trim().length > 0
  const searchResults = isSearchingSlots
    ? slots
        .filter(s => s.claimed_at && (
          s.client_name?.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
          s.client_email?.toLowerCase().includes(searchQuery.trim().toLowerCase())
        ))
        .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
    : []

  return (
    <>
    <Modal title={page?.title || 'Signup page'} onClose={onClose} size="lg">
      {loading || !page ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Link + active toggle */}
          <div className="rounded-xl p-3 flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Link2 size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <span className="text-xs flex-1 min-w-0 truncate" style={{ color: 'var(--text-muted)' }}>{bookingUrl}</span>
              <button onClick={handleCopyLink} className="text-xs font-medium px-2.5 py-1.5 rounded-lg flex items-center gap-1 shrink-0"
                style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                {copied ? <Check size={12} /> : <Copy size={12} />}{copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 sm:gap-3 shrink-0">
              <RouterLink to={`/sessions/signups/${page.id}/status`} target="_blank" rel="noopener noreferrer"
                className="text-xs font-medium px-2.5 py-1.5 rounded-lg flex items-center justify-center gap-1"
                style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', textDecoration: 'none' }}>
                Live status
              </RouterLink>
              <div className="flex items-center justify-center sm:justify-start">
                <Toggle checked={page.is_active} onChange={handleToggleActive} label={page.is_active ? 'Active' : 'Inactive'} />
              </div>
            </div>
          </div>

          {/* Tab switcher -- same pill-toggle pattern as RescheduleModal's
              Move/Custom-time tabs. "Booking slots" is the default since
              finding/acting on a booking is the primary task; page
              settings are secondary and don't need to be scrolled past
              to get there anymore. */}
          <div className="flex rounded-lg p-0.5" style={{ background: 'var(--bg-subtle)' }}>
            {[['slots', 'Booking slots'], ['settings', 'Session settings']].map(([key, tabLabel]) => (
              <button key={key} onClick={() => setActiveTab(key)}
                className="flex-1 text-xs font-medium px-2.5 py-1.5 rounded-md"
                style={{
                  background: activeTab === key ? 'var(--surface)' : 'transparent',
                  color: activeTab === key ? 'var(--text)' : 'var(--text-muted)',
                  border: 'none', cursor: 'pointer',
                }}>
                {tabLabel}
              </button>
            ))}
          </div>

          {activeTab === 'slots' && (
            <div className="space-y-6">
              {/* Cross-day search -- see isSearchingSlots/searchResults above. */}
              <div className="relative">
                <Search size={14} style={{ position: 'absolute', left: 12, top: 11, color: 'var(--text-muted)' }} />
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search bookings by name or email..."
                  style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '9px 12px 9px 34px', fontSize: 13, boxSizing: 'border-box' }} />
              </div>

              {isSearchingSlots ? (
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                  {searchResults.length === 0 ? (
                    <p className="text-xs px-4 py-3" style={{ color: 'var(--text-muted)' }}>No bookings match "{searchQuery}".</p>
                  ) : (
                    searchResults.map((slot, i) => {
                      const shootType = page.signup_shoot_types.find(t => t.id === slot.shoot_type_id)
                      const day = new Date(slot.start_time).toLocaleDateString('en-US', { timeZone: page.timezone, weekday: 'short', month: 'short', day: 'numeric' })
                      return (
                        <button key={slot.id} onClick={() => setActionsSlot(slot)}
                          className="w-full flex items-center justify-between px-4 py-2.5 text-left text-xs"
                          style={{ background: 'none', border: 'none', borderTop: i === 0 ? 'none' : '1px solid var(--border)', cursor: 'pointer' }}>
                          <div className="min-w-0">
                            <span className="font-medium" style={{ color: 'var(--text)' }}>{slot.client_name}</span>
                            <div style={{ color: 'var(--text-muted)' }}>
                              {day}, {formatTimeRange(slot.start_time, slot.end_time, page.timezone)} · {shootType?.name || 'Unknown'}
                            </div>
                          </div>
                        </button>
                      )
                    })
                  )}
                </div>
              ) : (
              <>
          {/* Slot generator -- collapsed by default (v1.5.5): creating new
              slots happens far less often than finding existing ones, so
              it no longer needs to always be visible here. */}
          {showGenerator ? (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>Generate time slots</label>
                <button onClick={() => setShowGenerator(false)} className="text-xs font-medium"
                  style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
                  Hide
                </button>
              </div>
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                <GenerateSlotsForm page={page} shootTypes={page.signup_shoot_types} onGenerated={() => load({ silent: true })} />
              </div>
              <div className="mt-2.5">
                <ManualAddSlotForm page={page} shootTypes={page.signup_shoot_types} onAdded={() => load({ silent: true })} />
              </div>
            </div>
          ) : (
            <button onClick={() => setShowGenerator(true)} className="text-xs font-medium"
              style={{ color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer' }}>
              + Generate or add time slots
            </button>
          )}


          {/* Slot summary by day */}
          {Object.keys(slotsByDay).length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>Slots by day</label>
                {slots.some(s => !s.claimed_at) && !confirmClearAll && (
                  <button onClick={() => setConfirmClearAll(true)}
                    className="flex items-center gap-1 text-xs font-medium"
                    style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
                    <Trash2 size={12} />Clear all open slots
                  </button>
                )}
              </div>
              {confirmClearAll && (
                <div className="flex items-center flex-wrap gap-2 mb-1.5 px-3 py-2 rounded-lg" style={{ background: 'var(--danger-subtle)' }}>
                  <span className="text-xs flex-1" style={{ color: 'var(--danger)' }}>Remove all open slots? Claimed slots won't be affected.</span>
                  <Button variant="danger" size="sm" onClick={handleClearAllOpenSlots} disabled={clearingAll}>
                    {clearingAll ? 'Clearing...' : 'Confirm'}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setConfirmClearAll(false)}>Cancel</Button>
                </div>
              )}
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                {Object.entries(slotsByDay).map(([day, dayData], i) => (
                  <SlotDayRow key={day} day={day} dayData={dayData} isFirst={i === 0}
                    timezone={page.timezone} shootTypes={page.signup_shoot_types}
                    onDeleteSlot={handleDeleteSlot} onReschedule={setRescheduleSlot} />
                ))}
              </div>
            </div>
          )}
              </>
              )}
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-6">

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

          {/* Pricing visibility -- applies to all shoot type prices on this
              page's public booking page. Defaults on; some photographers
              may prefer to keep pricing off the public page entirely. */}
          <div className="flex items-center justify-between rounded-xl p-3" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>Show pricing publicly</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Displays each shoot type's price to clients on the booking page.</p>
            </div>
            <Toggle checked={showPricing} onChange={handleToggleShowPricing} />
          </div>

          {/* Cover image -- the illustrated pattern shown behind this
              page's title on the public booking page (see
              components/booking/BookingCover.jsx). Same swatch-picker
              treatment MicrositeEditor.jsx already uses for its theme
              choices: a small preview per option, an accent ring on
              whichever is active. Each preview reuses the exact shapes
              the live page renders (CoverPatternShapes), just with fixed
              colors instead of that page's own --bk-* theme variables,
              since no booking-page theme is in scope in this admin view. */}
          <div>
            <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }}>Cover image</label>
            <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>The illustrated pattern shown behind this session's title on its booking page.</p>
            <div className="flex gap-3 flex-wrap">
              {COVER_PATTERN_OPTIONS.map(opt => {
                const isActive = (coverPattern || DEFAULT_COVER_PATTERN) === opt.id
                return (
                  <button key={opt.id} onClick={() => handleSaveCoverPattern(opt.id)} title={opt.label}
                    className="flex flex-col items-center gap-1.5"
                    style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                    <div style={{
                      width: 64, height: 44, borderRadius: 8, overflow: 'hidden',
                      boxShadow: isActive ? '0 0 0 2px var(--surface), 0 0 0 4px #6366f1' : '0 0 0 1px var(--border)',
                    }}>
                      <svg width="100%" height="100%" viewBox="0 0 390 210" preserveAspectRatio="xMidYMid slice" style={{ background: 'var(--bg-subtle)' }}>
                        <CoverPatternShapes pattern={opt.id} accent="#6366f1" ink="#1f2937" />
                      </svg>
                    </div>
                    <span className="text-xs" style={{ color: isActive ? 'var(--text)' : 'var(--text-muted)' }}>{opt.label}</span>
                  </button>
                )
              })}
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
                <div className="p-3 space-y-2" style={{ borderTop: page.signup_shoot_types.length > 0 ? '1px solid var(--border)' : 'none' }}>
                  <input value={newTypeName} onChange={e => setNewTypeName(e.target.value)} placeholder="Cosplay Portrait" autoFocus
                    style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '7px 10px', fontSize: 13, boxSizing: 'border-box' }} />
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-1.5">
                      <input type="number" min="5" step="5" value={newTypeDuration} onChange={e => setNewTypeDuration(e.target.value)}
                        style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '7px 10px', fontSize: 13 }} />
                      <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>min</span>
                    </div>
                    <select value={newTypeSessionType} onChange={e => setNewTypeSessionType(e.target.value)}
                      style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '7px 10px', fontSize: 13 }}>
                      {SESSION_TYPES.map(st => <option key={st} value={st}>{st}</option>)}
                    </select>
                  </div>

                  <div>
                    <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Price (optional)</p>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--text-muted)' }}>$</span>
                      <input type="number" min="0" step="0.01" value={newTypePrice} onChange={e => setNewTypePrice(e.target.value)}
                        placeholder="0.00"
                        style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '7px 10px 7px 22px', fontSize: 13, boxSizing: 'border-box' }} />
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Deposit / retainer required (optional)</p>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--text-muted)' }}>$</span>
                      <input type="number" min="0" step="0.01" value={newTypeRetainerAmount} onChange={e => setNewTypeRetainerAmount(e.target.value)}
                        placeholder="0.00"
                        style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '7px 10px 7px 22px', fontSize: 13, boxSizing: 'border-box' }} />
                    </div>
                  </div>

                  {/* Questionnaire assignment at creation time (v1.5.5) --
                      previously only available after creating the shoot
                      type, via ShootTypeRow's edit mode. Same checklist
                      UI/pattern, reused here. */}
                  <div>
                    <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Questionnaires assigned automatically when someone books this shoot type</p>
                    <MultiSelectPicker
                      items={questionnaires}
                      selectedIds={newTypeQuestionnaireIds}
                      onChange={setNewTypeQuestionnaireIds}
                      placeholder="Add a questionnaire..."
                      emptyMessage="No questionnaire templates yet. Create one in Account → Questionnaires."
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <button onClick={handleAddShootType} disabled={!newTypeName.trim()} className="text-xs font-medium px-2.5 py-1.5 rounded-lg"
                      style={{ background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer' }}>Add</button>
                    <button onClick={() => { setAddingType(false); setNewTypeQuestionnaireIds([]) }} className="text-xs font-medium px-2.5 py-1.5 rounded-lg"
                      style={{ background: 'var(--surface-raised)', color: 'var(--text-muted)', border: 'none', cursor: 'pointer' }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          </div>


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
        </div>
      )}
    </Modal>

    {rescheduleSlot && (
      <RescheduleModal
        slot={rescheduleSlot}
        allSlots={slots}
        shootTypes={page.signup_shoot_types}
        timezone={page.timezone}
        onClose={() => setRescheduleSlot(null)}
        onDone={() => { setRescheduleSlot(null); load({ silent: true }) }}
      />
    )}

    {actionsSlot && (
      isDesktop ? (
        <SlotActionsModal
          slot={actionsSlot}
          onClose={() => setActionsSlot(null)}
          onReschedule={slot => { setActionsSlot(null); setRescheduleSlot(slot) }}
          shootTypes={page.signup_shoot_types}
          timezone={page.timezone}
          onUnclaimed={() => { setActionsSlot(null); load({ silent: true }) }}
          onNoteSaved={() => load({ silent: true })}
        />
      ) : (
        <SlotActionsSheet
          slot={actionsSlot}
          onClose={() => setActionsSlot(null)}
          onReschedule={slot => { setActionsSlot(null); setRescheduleSlot(slot) }}
          shootTypes={page.signup_shoot_types}
          timezone={page.timezone}
          onUnclaimed={() => { setActionsSlot(null); load({ silent: true }) }}
          onNoteSaved={() => load({ silent: true })}
        />
      )
    )}
    </>
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
  const [allSessionsToken, setAllSessionsToken] = useState(null)
  const [allSessionsBaseUrl, setAllSessionsBaseUrl] = useState(window.location.origin)
  const [allSessionsCopied, setAllSessionsCopied] = useState(false)

  const [photographerId, setPhotographerId] = useState(null)

  useEffect(() => {
    load()
    supabase.auth.getUser().then(({ data: { user } }) => setPhotographerId(user?.id ?? null))
  }, [])

  useEffect(() => {
    if (!photographerId) return
    const channel = supabase
      .channel(`sessions_${photographerId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'sessions', filter: `photographer_id=eq.${photographerId}` },
        () => load({ silent: true })
      )
      .subscribe()

    const fallbackInterval = setInterval(() => load({ silent: true }), 30_000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(fallbackInterval)
    }
  }, [photographerId])

  useEffect(() => {
    if (view === 'signups' && signupPages.length === 0) loadSignupPages()
    if (view === 'signups' && allSessionsToken === null) {
      getMyAllSessionsToken().then(setAllSessionsToken).catch(() => {})
      getPublicBaseUrl().then(setAllSessionsBaseUrl).catch(() => {})
    }
  }, [view])

  async function loadSignupPages() {
    setLoadingSignups(true)
    try {
      const data = await getSignupPages()
      setSignupPages(data)
    } catch (err) { console.error(err) }
    finally { setLoadingSignups(false) }
  }

  const allSessionsUrl = allSessionsToken ? `${allSessionsBaseUrl}/book/all/${allSessionsToken}` : ''

  function handleCopyAllSessionsLink() {
    if (!allSessionsUrl) return
    navigator.clipboard.writeText(allSessionsUrl)
    setAllSessionsCopied(true)
    setTimeout(() => setAllSessionsCopied(false), 1500)
  }

  async function load({ silent = false } = {}) {
    if (!silent) setLoading(true)
    try {
      const data = await getSessions()
      setSessions(data)
    } catch (err) { console.error(err) }
    finally { if (!silent) setLoading(false) }
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
              { value: 'date_desc', label: 'Session Date: New \\u2192 Old' },
              { value: 'date_asc', label: 'Session Date: Old \\u2192 New' },
              { value: 'client_asc', label: 'Client: A \\u2192 Z' },
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
                            session.session_date ? formatSessionDate(session.session_date, session.start_time, session.end_time) : null,
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
          {allSessionsToken && (
            <div className="rounded-xl p-3 mb-4 flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3"
              style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.25)' }}>
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Link2 size={14} style={{ color: '#6366f1', flexShrink: 0 }} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium" style={{ color: 'var(--text)' }}>All active sessions</p>
                  <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{allSessionsUrl}</p>
                </div>
              </div>
              <button onClick={handleCopyAllSessionsLink} className="text-xs font-medium px-2.5 py-1.5 rounded-lg flex items-center justify-center gap-1 shrink-0 w-full sm:w-auto"
                style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                {allSessionsCopied ? <Check size={12} /> : <Copy size={12} />}{allSessionsCopied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}
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
'''
replace_whole_file("src/routes/Sessions.jsx", SESSIONS_OLD, SESSIONS_NEW)

print()
print("Done. Step 7 (cover-pattern picker) applied.")
print()
print("Next steps:")
print("  1. Open sql/060_signup_page_cover_pattern.sql, copy its contents, and run")
print("     the whole thing in the Supabase SQL editor.")
print("  2. Restart your dev server if it's running.")
print("  3. Open a session in Sessions -> Signups -> a signup page's settings tab.")
print("     You should see a new \"Cover image\" picker below \"Show pricing")
print("     publicly\" with three swatches: Mountains, Trees, Moon & Stars.")
print("  4. Pick a different one, then open that session's public /book/:token")
print("     link and confirm the cover on both mobile and desktop now shows the")
print("     pattern you picked.")
print("  5. Confirm a session you DON'T change still shows Mountains, unchanged.")
