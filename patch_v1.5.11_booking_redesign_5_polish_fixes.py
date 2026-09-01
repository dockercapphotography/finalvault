#!/usr/bin/env python3
"""
Patch v1.5.11 -- booking-page redesign, step 5: fixes from testing step 4
on the real Docker Cap Photography booking page.

Requires steps 1, 2, 3, 3b, and 4 already applied.

Three issues, all from real-world testing of step 4's desktop layout:

1. COVER PATTERN LOOKED WASHED OUT. The mockup used bold, saturated shape
   colors plus a dark gradient scrim with white overlay text; step 4's
   pattern kept the shape opacities low (to stay theme-safe) and faded the
   bottom to the theme's own background color instead of a dark scrim, so
   on a light theme it read as pale and the title text (in the theme's own
   ink color) had nowhere near the contrast the mockup had.

   Fixed by: BookingCover.jsx's shape opacities are now much bolder (still
   entirely theme-driven -- --bk-accent/--bk-ink, no hardcoded palette, so
   a warm theme stays warm and a jewel theme stays jewel-toned, exactly as
   asked); and BookingHero.jsx's desktop rail now layers a dedicated dark
   scrim (the same rgba(20,17,13,...) tone MicrositeRenderer.css's own
   .ms-hero-overlay already uses for its hero image) behind the title
   text, with that text switching to white/near-white only there -- mobile
   is untouched, since its title sits in a plain surface card below the
   cover strip, never over the image itself.

2. STUDIO NAME REDUNDANT NEXT TO A REAL LOGO. Most uploaded logos are
   wordmarks that already spell the studio name out, so showing the name
   as text right next to it just repeats it. BrandHeader.jsx now only
   shows the studio-name text alongside the INITIALS fallback (no logo to
   show) -- once a real logo renders, the name text is dropped.

3. WHITE LOGOS WENT NEARLY INVISIBLE ON A LIGHT BOOKING PAGE. The booking
   pages were always using a photographer's primary logo_r2_key, with no
   awareness of the light/dark logo variant system MicrositeRenderer.jsx
   already has for the microsite itself (logo_r2_key: primary, meant for a
   dark backdrop; logo_dark_r2_key: optional dark-colored variant, meant
   for a light backdrop -- sql/047_microsite_dark_logo.sql). A studio with
   a light/white primary logo and a light-themed booking page had no way
   to show anything but that barely-visible white logo.

   Fixed in two parts:
   - sql/059_booking_logo_dark_variant.sql adds logo_dark_r2_key (already
     an existing column, just never selected here) to both booking RPCs'
     `branding` object -- no schema change, same as 058.
   - src/utils/bookingBranding.js gains resolveTheme()/resolveLogoR2Key()
     (the same light/dark selection logic MicrositeRenderer.jsx already
     uses), and BrandHeader.jsx now calls resolveLogoR2Key() instead of
     always using branding.logo_r2_key directly.

   IMPORTANT: this only helps once a photographer actually has a dark logo
   variant uploaded. If Docker Cap Photography's microsite doesn't have
   one yet, this patch alone won't change what's showing -- go to
   Microsite Editor -> Branding -> "+ Add a dark logo variant" and upload
   a dark-colored version of the logo there first, then re-check the
   booking page.

Run from the repo root, after steps 1, 2, 3, 3b, and 4. Idempotent -- safe
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
        f"(steps 1, 2, 3, 3b, and 4 applied).\n"
        f"Make sure the booking-redesign patches 1, 2, 3, 3b, and 4 have all been run first."
    )
    path.write_text(new_content)
    print(f"Patched {rel_path}")

write_file("sql/059_booking_logo_dark_variant.sql", '''-- 059_booking_logo_dark_variant.sql
--
-- Bug fix for the booking-page redesign (v1.5.11): both booking RPCs'
-- `branding` object were missing logo_dark_r2_key -- the light-background
-- logo variant microsites.logo_dark_r2_key already stores (added in
-- 047_microsite_dark_logo.sql, already used by get_site_by_hostname for
-- the microsite itself). Without it, a booking page always showed the
-- studio's primary logo_r2_key even when the booking page's own theme is
-- light -- for a studio whose primary logo is a light/white wordmark
-- (meant for a dark backdrop), that reads as nearly invisible. No new
-- column: this only adds the existing microsites.logo_dark_r2_key to the
-- json each RPC already builds.
--
-- Adds no column, changes no other field -- everything else about both
-- RPCs is untouched from 058_booking_page_branding.sql.
--
-- Run after: 058_booking_page_branding.sql
-- Run this whole file in the Supabase SQL editor.

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

CREATE OR REPLACE FUNCTION get_signup_pages_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_photographer photographers%ROWTYPE;
BEGIN
  SELECT * INTO v_photographer
  FROM photographers
  WHERE all_sessions_token = p_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('type', 'not_found');
  END IF;

  RETURN jsonb_build_object(
    'type', 'found',
    'business_name', COALESCE(v_photographer.business_name, v_photographer.display_name),
    'branding', (
      SELECT CASE WHEN m.id IS NOT NULL THEN
        jsonb_build_object(
          'has_microsite', true,
          'studio_name', COALESCE(m.studio_name, v_photographer.business_name, v_photographer.display_name),
          'logo_r2_key', COALESCE(m.logo_r2_key, v_photographer.logo_r2_key),
          'logo_dark_r2_key', m.logo_dark_r2_key,
          'theme', m.theme,
          'accent_color', m.accent_color,
          'font_pairing', m.font_pairing,
          'custom_display_font', m.custom_display_font,
          'custom_body_font', m.custom_body_font,
          'radius', m.radius
        )
      ELSE
        jsonb_build_object(
          'has_microsite', false,
          'studio_name', COALESCE(v_photographer.business_name, v_photographer.display_name),
          'logo_r2_key', v_photographer.logo_r2_key
        )
      END
      FROM microsites m
      WHERE m.photographer_id = v_photographer.id AND m.enabled = true
    ),
    'signup_pages', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', sp.id,
        'token', sp.token,
        'title', sp.title,
        'venue_address', sp.venue_address,
        'timezone', sp.timezone,
        'earliest_open_slot', earliest.start_time,
        'latest_open_slot', latest.start_time
      ) ORDER BY earliest.start_time ASC NULLS LAST, sp.created_at ASC)
      FROM signup_pages sp
      LEFT JOIN LATERAL (
        SELECT start_time FROM signup_slots
        WHERE signup_page_id = sp.id AND claimed_at IS NULL AND start_time >= now()
        ORDER BY start_time ASC LIMIT 1
      ) earliest ON true
      LEFT JOIN LATERAL (
        SELECT start_time FROM signup_slots
        WHERE signup_page_id = sp.id AND claimed_at IS NULL AND start_time >= now()
        ORDER BY start_time DESC LIMIT 1
      ) latest ON true
      WHERE sp.photographer_id = v_photographer.id AND sp.is_active = true
    ), '[]'::jsonb)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION get_signup_page_data(text) TO anon;
GRANT EXECUTE ON FUNCTION get_signup_pages_by_token(text) TO anon;
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
replace_whole_file("src/components/booking/BookingCover.jsx", BOOKING_COVER_OLD, BOOKING_COVER_NEW)
BOOKING_HERO_OLD = '''import { MapPin } from 'lucide-react'
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
BRAND_HEADER_OLD = '''// Shared header for the public booking pages -- a photographer's logo (or
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
//
// The studio name only shows next to the INITIALS fallback -- once a real
// logo is showing, most studio logos already spell the name out (they're
// wordmarks, not abstract marks), so repeating it as text next to its own
// logo just reads as redundant.
import { brandingLogoUrl, getInitials, resolveLogoR2Key } from '../../utils/bookingBranding.js'

export default function BrandHeader({ branding, align = 'center' }) {
  const logoKey = resolveLogoR2Key(branding)
  const hasLogo = !!logoKey
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
        <img src={brandingLogoUrl(logoKey)} alt={branding.studio_name || 'Photographer logo'}
          style={{ height: markSize, maxWidth: isLeft ? 160 : 220, objectFit: 'contain', flexShrink: 0 }} />
      ) : (
        <div className="flex items-center justify-center rounded-full flex-shrink-0"
          style={{ width: markSize, height: markSize, background: 'var(--bk-accent)', color: 'var(--bk-accent-button-text)', fontSize: isLeft ? 12 : 15, fontWeight: 600 }}>
          {getInitials(branding.studio_name)}
        </div>
      )}
      {!hasLogo && branding.studio_name && (
        <p className="text-sm font-semibold" style={{ color: 'var(--bk-ink)', fontFamily: 'var(--bk-font-display)' }}>{branding.studio_name}</p>
      )}
    </div>
  )
}
'''
replace_whole_file("src/components/booking/BrandHeader.jsx", BRAND_HEADER_OLD, BRAND_HEADER_NEW)
BOOKING_BRANDING_OLD = '''// Shared branding/theme resolution for every public booking page
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
'''
BOOKING_BRANDING_NEW = '''// Shared branding/theme resolution for every public booking page
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
'''
replace_whole_file("src/utils/bookingBranding.js", BOOKING_BRANDING_OLD, BOOKING_BRANDING_NEW)

print()
print("Done. Step 5 (post-testing fixes) applied.")
print()
print("Next steps:")
print("  1. Open sql/059_booking_logo_dark_variant.sql, copy its contents, and run")
print("     the whole thing in the Supabase SQL editor.")
print("  2. Restart your dev server if it's running.")
print("  3. Check the desktop rail on a branded booking page: the cover pattern")
print("     should read as noticeably bolder/more colorful, with the title in")
print("     white over a dark scrim at the bottom -- legible regardless of theme.")
print("  4. If that photographer's logo is showing, confirm the studio name text")
print("     no longer shows next to it (still shows next to the initials fallback).")
print("  5. If a logo is still hard to read against a light theme, check whether")
print("     that photographer has a dark logo variant uploaded (Microsite Editor ->")
print("     Branding -> \"+ Add a dark logo variant\") -- without one there's nothing")
print("     for the fallback to use yet.")
print("  6. Confirm mobile view is unchanged from step 4.")
