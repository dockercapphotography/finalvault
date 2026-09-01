#!/usr/bin/env python3
"""
Patch v1.5.11 -- booking-page redesign, step 12: image-forward session
cards on the All Sessions chooser page.

Requires steps 1 through 11 already applied.

Feedback on /book/all/:token (the multi-session chooser): now that each
individual /book/:token page leads with a real cover (illustrated pattern
or, once uploaded, a real photo -- BookingCover.jsx), the chooser's own
compact rows -- a small generic camera-icon square plus a title/date line
-- read as flat by comparison. Each row is now a larger card that leads
with that same cover as its main visual, same component, same theme
variables, so the chooser reads as a genuine preview of what's behind
each link rather than a plain list -- not a grid/mosaic (that would break
from the narrow max-w-md column every public booking page in this series
uses), just a taller, richer version of the same list.

Three files:

1. MODIFIED src/components/booking/BookingCover.jsx -- new `fade = true`
   prop. BookingCover's own bottom fade-to-var(--bk-bg) treatment is
   right where it already sits (hidden under an overlapping card, or a
   dark scrim, in BookingHero.jsx's two call sites) but wrong in a
   context where the cover sits directly above a plain --bk-surface card
   body with no overlap or scrim -- there the fade creates a visible
   color seam instead of hiding one. fade={false} skips the div;
   BookingHero.jsx's existing call sites are untouched (fade defaults to
   true).

2. NEW sql/062_all_sessions_cover_images.sql -- extends
   get_signup_pages_by_token (the chooser page's RPC) to also return
   each signup page's cover_pattern/cover_image_r2_key/cover_focus_x/
   cover_focus_y, the same columns sql/060 and sql/061 added but
   deliberately left out of this particular RPC at the time ("that page
   doesn't render a cover for any of its listed sessions"). No new
   columns -- this migration only changes what the RPC selects.

3. MODIFIED src/routes/AllSessionsBooking.jsx -- SignupPageRow rewritten
   from a compact horizontal row (small camera-icon square + title/date)
   into a taller card: an aspect-[16/9] BookingCover (fade={false}) on
   top, a plain p-4 text body below with the title/date/venue -- the
   same image-on-top-body-below shape the app's own GalleryCard.jsx
   already uses elsewhere, rather than inventing a new overlay-text
   treatment. Card list spacing grows from space-y-2 to space-y-4 to
   match the larger cards.

Run from the repo root, after steps 1 through 11. Idempotent -- safe to
run twice. No R2 Worker changes needed -- the existing
verifyBookingCoverAccess middleware (step 8) already checks any
signup_pages.cover_image_r2_key match generically, regardless of which
RPC surfaced the key to the frontend.
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


def patch_file(rel_path, replacements):
    path = ROOT / rel_path
    text = path.read_text()
    changed = False
    for old, new, expected_count in replacements:
        if new in text:
            continue
        count = text.count(old)
        assert count == expected_count, (
            f"{rel_path}: expected {expected_count} occurrence(s) of a block, found {count}.\n"
            f"--- block ---\n{old}\n-------------"
        )
        text = text.replace(old, new)
        changed = True
    if not changed:
        print(f"  (no changes needed -- {rel_path} already patched)")
        return
    path.write_text(text)
    print(f"Patched {rel_path}")


# ── 1. BookingCover.jsx -- new `fade` prop ───────────────────────────────────
patch_file("src/components/booking/BookingCover.jsx", [
    (
        '''export default function BookingCover({ pattern, imageKey, focusX = 0.5, focusY = 0.5, height = 180 }) {''',
        '''export default function BookingCover({ pattern, imageKey, focusX = 0.5, focusY = 0.5, height = 180, fade = true }) {''',
        1,
    ),
    (
        '''      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 45%, var(--bk-bg) 100%)' }} />
    </div>
  )
}''',
        '''      {/* Fades the bottom edge toward --bk-bg -- right for BookingHero.jsx's
          own two call sites (either hidden under an overlapping card, or
          under a separate dark scrim) but wrong wherever the cover sits
          directly above a plain --bk-surface card body with no overlap or
          scrim to hide the seam (AllSessionsBooking.jsx's session cards) --
          fade={false} skips it there, letting the card's own border do the
          separating instead. */}
      {fade && <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 45%, var(--bk-bg) 100%)' }} />}
    </div>
  )
}''',
        1,
    ),
])

# ── 2. sql/062 -- cover fields on the All Sessions RPC ───────────────────────
write_file("sql/062_all_sessions_cover_images.sql", '''-- 062_all_sessions_cover_images.sql
--
-- Feeds each signup page's cover (illustrated pattern or, once uploaded,
-- a real photo -- see sql/060_signup_page_cover_pattern.sql and
-- sql/061_signup_page_cover_image.sql) into get_signup_pages_by_token,
-- the /book/all/:token chooser page's RPC. Both prior migrations
-- deliberately skipped this RPC ("that page doesn't render the hero/cover
-- for any of its listed sessions") -- that's no longer true: the chooser
-- page's session cards now show each session's own cover as their main
-- visual, the same as its individual /book/:token page does, rather than
-- a plain generic camera icon.
--
-- Adds cover_pattern, cover_image_r2_key, cover_focus_x, cover_focus_y to
-- each entry in the signup_pages array. No new columns -- these already
-- exist on signup_pages; this migration only changes what the RPC
-- selects. `branding` (added in sql/058/059) is untouched.
--
-- Run after: 061_signup_page_cover_image.sql
-- Run this whole file in the Supabase SQL editor.

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
        'latest_open_slot', latest.start_time,
        'cover_pattern', sp.cover_pattern,
        'cover_image_r2_key', sp.cover_image_r2_key,
        'cover_focus_x', sp.cover_focus_x,
        'cover_focus_y', sp.cover_focus_y
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

GRANT EXECUTE ON FUNCTION get_signup_pages_by_token(text) TO anon;
''')

# ── 3. AllSessionsBooking.jsx -- larger, image-forward session cards ────────
patch_file("src/routes/AllSessionsBooking.jsx", [
    (
        """import { MapPin, CalendarDays, Camera } from 'lucide-react'
import { supabaseAnon } from '../supabaseClientAnon.js'
import { useBookingBranding } from '../utils/bookingBranding.js'
import BrandHeader from '../components/booking/BrandHeader.jsx'""",
        """import { MapPin, CalendarDays } from 'lucide-react'
import { supabaseAnon } from '../supabaseClientAnon.js'
import { useBookingBranding } from '../utils/bookingBranding.js'
import BrandHeader from '../components/booking/BrandHeader.jsx'
import BookingCover from '../components/booking/BookingCover.jsx'""",
        1,
    ),
    (
        '''function SignupPageRow({ page }) {
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
}''',
        '''// A plain generic camera icon next to a title/date row -- the original
// treatment here -- undersold what these sessions actually look like once
// the individual /book/:token pages themselves became this visual (cover
// pattern or, once uploaded, a real photo -- BookingCover.jsx). Each card
// now leads with that same cover, same component, same theme variables,
// so the chooser reads as a genuine preview of what's behind each link
// rather than a plain list. fade={false} on BookingCover: its own
// fade-to-bk-bg bottom treatment is right where it normally sits (hidden
// under an overlapping card or a dark scrim in BookingHero.jsx) but wrong
// here, where the cover sits directly above a plain --bk-surface card
// body -- the card's own border is what separates the two instead.
function SignupPageRow({ page }) {
  const hasOpenSlots = !!page.earliest_open_slot
  return (
    <Link to={`/book/${page.token}`}
      className="block rounded-xl overflow-hidden transition-colors"
      style={{ background: 'var(--bk-surface)', border: '1px solid var(--bk-border)', textDecoration: 'none', cursor: 'pointer' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--bk-accent)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bk-border)' }}>
      <div className="aspect-[16/9]" style={{ position: 'relative' }}>
        <BookingCover
          pattern={page.cover_pattern} imageKey={page.cover_image_r2_key}
          focusX={page.cover_focus_x} focusY={page.cover_focus_y}
          height="100%" fade={false}
        />
      </div>
      <div className="p-4">
        <p className="text-sm font-semibold" style={{ color: 'var(--bk-ink)' }}>{page.title}</p>
        <p className="text-xs mt-1 flex items-center gap-1" style={{ color: hasOpenSlots ? 'var(--bk-muted)' : 'var(--danger)' }}>
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
    </Link>
  )
}''',
        1,
    ),
    (
        '''        <div className="space-y-2">
          {data.signup_pages.map(page => <SignupPageRow key={page.id} page={page} />)}
        </div>''',
        '''        <div className="space-y-4">
          {data.signup_pages.map(page => <SignupPageRow key={page.id} page={page} />)}
        </div>''',
        1,
    ),
])
