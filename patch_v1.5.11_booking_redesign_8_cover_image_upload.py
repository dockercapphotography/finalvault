#!/usr/bin/env python3
r"""
Patch v1.5.11 -- booking-page redesign, step 8: real cover-photo upload.

Requires steps 1, 2, 3, 3b, 4, 5, 6, and 7 already applied.

This is the real "Phase 2" of the booking-page cover -- letting a
photographer use an actual photo as a signup page's cover, instead of (or
alongside, as the automatic fallback) the illustrated pattern added in
step 7. The photo is picked from an existing gallery image via
MicrositeImagePicker -- the exact same component the microsite editor
already uses for its own hero image -- so nothing is freshly uploaded;
only referenced. A focal point (MicrositeFocalPointModal, also reused
as-is) lets the photographer choose what stays in frame across the very
different mobile (short wide strip) and desktop (tall narrow rail) crop
shapes.

IMPORTANT -- this patch has TWO parts that deploy separately:

  A. The usual frontend .py patch (this script) + a Supabase SQL file,
     same as every prior step.

  B. An R2 Worker code change (r2-worker/), which is a SEPARATE
     Cloudflare Worker service from the finalvault frontend -- it needs
     its own `wrangler deploy` from the r2-worker/ directory. This is a
     genuinely new capability: booking-page cover photos need a public,
     no-login image-serving path that didn't exist before (the closest
     existing thing, the microsite hero image path, is narrowly scoped
     to microsite state). See the full deploy instructions at the bottom
     of the delivery message.

Eight files:

1. NEW sql/061_signup_page_cover_image.sql -- adds
   signup_pages.cover_image_r2_key (text, NULL by default),
   cover_focus_x/cover_focus_y (real, default 0.5 -- same convention as
   sql/039_microsite_focal_points.sql). get_signup_page_data now returns
   all three alongside cover_pattern.

2. NEW r2-worker/src/middleware/bookingCoverAccess.js -- verifies a
   requested preview image is legitimately an active signup page's cover
   photo (exact match against signup_pages.cover_image_r2_key AND
   is_active = true, re-checked fresh on every request), the booking-page
   counterpart to the existing verifyMicrositeAccess().

3. MODIFIED r2-worker/src/handlers/preview.js -- adds a new
   ?booking_cover=1 public auth mode to the existing /preview/:key route,
   mirroring the existing ?microsite=1 mode exactly (same "no client
   secret, verified entirely server-side" model). No new route needed --
   this reuses the same GET /preview/:key path every other preview
   already goes through.

4. MODIFIED src/components/booking/BookingCover.jsx -- when a signup page
   has a cover_image_r2_key, renders that real photo (via the new public
   ?booking_cover=1 preview mode, cropped with the chosen focal point)
   INSTEAD OF the illustrated pattern; the pattern remains the automatic
   fallback whenever no photo has been chosen.

5. MODIFIED src/components/booking/BookingHero.jsx -- reads
   pageData.cover_image_r2_key/cover_focus_x/cover_focus_y and passes
   them through to both BookingCover call sites (mobile strip, desktop
   rail), alongside the existing cover_pattern.

6. MODIFIED src/utils/signupApi.js -- updateSignupPage maps three new
   update fields (coverImageR2Key, coverFocusX, coverFocusY) to their
   columns, same pattern as every other per-page setting.

7. MODIFIED src/routes/Sessions.jsx -- the "Cover image" picker in a
   signup page's settings tab gets a new "Photo" tile alongside the three
   pattern swatches: click it to pick an existing gallery image
   (MicrositeImagePicker), then adjust its focus point
   (MicrositeFocalPointModal, opened via a small crosshair badge once a
   photo is set). Picking a pattern always switches back to it (clears
   any chosen photo) since BookingCover only ever renders one or the
   other.

Run from the repo root, after steps 1 through 7. Idempotent -- safe to
run twice.
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


# ── 1. New SQL migration ────────────────────────────────────────────────────
write_file("sql/061_signup_page_cover_image.sql", '''-- 061_signup_page_cover_image.sql
--
-- The real cover-photo upload feature (the original "Phase 2" of the
-- booking-page redesign, folded into this v1.5.11 release): lets a
-- photographer use an actual photo as a signup page's cover, instead of
-- the illustrated pattern added in 060. The photo is picked from an
-- existing gallery image via MicrositeImagePicker (the same component
-- microsites already use for their own hero image) -- nothing is freshly
-- uploaded here, only referenced, so this needs no new R2 Worker upload
-- endpoint. A focal point (same convention as
-- sql/039_microsite_focal_points.sql) lets the photographer choose what
-- stays in frame across the very different mobile (short wide strip) and
-- desktop (tall narrow rail) crop shapes -- set via MicrositeFocalPointModal,
-- also reused as-is.
--
-- New columns:
--   cover_image_r2_key  -- the chosen gallery image's preview R2 key, NULL
--                           until a photographer picks a photo. When set,
--                           BookingCover.jsx renders this photo INSTEAD OF
--                           the illustrated cover_pattern; the pattern
--                           remains the automatic fallback whenever this
--                           is NULL.
--   cover_focus_x/y      -- normalized 0-1 focal point, defaulting to dead
--                           center like every other focal-point column in
--                           the app.
--
-- Serving this image on the public /book/:token page needs a NEW public
-- (no-login) R2 Worker verification path, since the existing
-- /preview/:key auth modes are either photographer/client-only (JWT,
-- share token) or scoped to microsite state (?microsite=1) -- neither
-- recognizes a signup page's cover photo as legitimate. Added as a new
-- ?booking_cover=1 mode on the SAME /preview/:key route (mirroring
-- ?microsite=1 exactly), verified fresh on every request against
-- signup_pages.cover_image_r2_key + is_active. See
-- r2-worker/src/middleware/bookingCoverAccess.js and the matching change
-- to r2-worker/src/handlers/preview.js. That worker change ships and
-- deploys separately from this SQL file and the frontend patch -- see the
-- delivery notes for the exact `wrangler deploy` step.
--
-- get_signup_page_data (the /book/:token RPC) now returns
-- cover_image_r2_key, cover_focus_x, cover_focus_y at the top level,
-- alongside cover_pattern. Not added to get_signup_pages_by_token (the
-- /book/all/:token chooser) -- same reasoning as 060, that page doesn't
-- render the hero/cover for any of its listed sessions.
--
-- Run after: 060_signup_page_cover_pattern.sql
-- Run this whole file in the Supabase SQL editor.

ALTER TABLE signup_pages
  ADD COLUMN IF NOT EXISTS cover_image_r2_key text,
  ADD COLUMN IF NOT EXISTS cover_focus_x real NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS cover_focus_y real NOT NULL DEFAULT 0.5;

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
    'cover_image_r2_key', v_page.cover_image_r2_key,
    'cover_focus_x', v_page.cover_focus_x,
    'cover_focus_y', v_page.cover_focus_y,
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

# ── 2. New R2 Worker middleware ─────────────────────────────────────────────
write_file("r2-worker/src/middleware/bookingCoverAccess.js", r'''/**
 * Verifies that a requested preview image legitimately belongs to a
 * currently-active signup page as its cover photo -- the booking-page
 * counterpart to verifyMicrositeAccess() in micrositeAccess.js. Same
 * reasoning: no client-supplied secret at all, legitimacy comes entirely
 * from server-side state (Supabase), re-checked fresh on EVERY request
 * against the EXACT column it claims to be
 * (signup_pages.cover_image_r2_key), never a folder-convention match --
 * unlike /logo/ and /avatar/, which key off folder conventions. A signup
 * page's photographer may have private client galleries sitting right
 * next to whatever photo they picked as a cover, so a loose match here
 * would expose far more than intended.
 *
 * The image itself is already intentionally public: it's the exact photo
 * shown to every visitor of that page's live booking form.
 */
export async function verifyBookingCoverAccess(key, env) {
  const photographerMatch = key.match(/^photographers\/([^/]+)\//)
  if (!photographerMatch) {
    return { valid: false, error: 'Invalid key format for booking cover access' }
  }
  const photographerId = photographerMatch[1]

  try {
    const checkUrl = `${env.SUPABASE_URL}/rest/v1/signup_pages?select=id&photographer_id=eq.${photographerId}&cover_image_r2_key=eq.${encodeURIComponent(key)}&is_active=eq.true&limit=1`
    const checkRes = await fetch(checkUrl, {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    })
    if (!checkRes.ok) {
      return { valid: false, error: 'Failed to validate booking cover access' }
    }

    const rows = await checkRes.json().catch(() => [])
    if (!Array.isArray(rows) || rows.length === 0) {
      return { valid: false, error: 'Image is not an active booking page cover' }
    }

    return { valid: true, photographerId }
  } catch (err) {
    console.error('Booking cover access verification error:', err)
    return { valid: false, error: 'Booking cover access verification failed' }
  }
}
''')

# ── 3. R2 Worker preview.js -- new ?booking_cover=1 mode ───────────────────
patch_file("r2-worker/src/handlers/preview.js", [
    (
        "import { verifyJWT } from '../middleware/auth.js'\n"
        "import { verifyShareToken } from '../middleware/shareToken.js'\n"
        "import { verifyMicrositeAccess } from '../middleware/micrositeAccess.js'\n",

        "import { verifyJWT } from '../middleware/auth.js'\n"
        "import { verifyShareToken } from '../middleware/shareToken.js'\n"
        "import { verifyMicrositeAccess } from '../middleware/micrositeAccess.js'\n"
        "import { verifyBookingCoverAccess } from '../middleware/bookingCoverAccess.js'\n",
        1,
    ),
    (
        r"""  const isMicrositeRequest = url.searchParams.get('microsite') === '1'

  if (!hasJWT && !queryToken && !hasShareHeader && !queryShareToken && !isMicrositeRequest) {
    return jsonResponse({ ok: false, error: 'Authentication required' }, 401, corsHeaders)
  }

  let photographerId

  if (hasJWT || queryToken) {
    // Photographer access — JWT from header or query param
    const authRequest = queryToken
      ? new Request(request.url, { headers: { 'Authorization': `Bearer ${queryToken}` } })
      : request
    const auth = await verifyJWT(authRequest)
    if (!auth.valid) return jsonResponse({ ok: false, error: auth.error }, 401, corsHeaders)
    photographerId = auth.userId
  } else if (hasShareHeader || queryShareToken) {
    // Client access — share token from header or query param
    const tokenRequest = queryShareToken
      ? new Request(request.url, {
          ...request,
          headers: { ...Object.fromEntries(request.headers), 'X-Share-Token': queryShareToken }
        })
      : request

    const shareAuth = await verifyShareToken(tokenRequest, env, false, allowExpiredPreview)
    if (!shareAuth.valid) return jsonResponse({ ok: false, error: shareAuth.error }, 403, corsHeaders)
    photographerId = shareAuth.photographerId
  } else {
    // Public microsite access
    const micrositeAuth = await verifyMicrositeAccess(key, env)
    if (!micrositeAuth.valid) return jsonResponse({ ok: false, error: micrositeAuth.error }, 403, corsHeaders)
    photographerId = micrositeAuth.photographerId
  }""",

        r"""  const isMicrositeRequest = url.searchParams.get('microsite') === '1'

  // Public booking-page cover-photo request -- same no-client-secret model
  // as isMicrositeRequest above, just verified against signup_pages'
  // cover_image_r2_key + is_active instead of a microsite's fields. See
  // verifyBookingCoverAccess() for the exact check.
  const isBookingCoverRequest = url.searchParams.get('booking_cover') === '1'

  if (!hasJWT && !queryToken && !hasShareHeader && !queryShareToken && !isMicrositeRequest && !isBookingCoverRequest) {
    return jsonResponse({ ok: false, error: 'Authentication required' }, 401, corsHeaders)
  }

  let photographerId

  if (hasJWT || queryToken) {
    // Photographer access — JWT from header or query param
    const authRequest = queryToken
      ? new Request(request.url, { headers: { 'Authorization': `Bearer ${queryToken}` } })
      : request
    const auth = await verifyJWT(authRequest)
    if (!auth.valid) return jsonResponse({ ok: false, error: auth.error }, 401, corsHeaders)
    photographerId = auth.userId
  } else if (hasShareHeader || queryShareToken) {
    // Client access — share token from header or query param
    const tokenRequest = queryShareToken
      ? new Request(request.url, {
          ...request,
          headers: { ...Object.fromEntries(request.headers), 'X-Share-Token': queryShareToken }
        })
      : request

    const shareAuth = await verifyShareToken(tokenRequest, env, false, allowExpiredPreview)
    if (!shareAuth.valid) return jsonResponse({ ok: false, error: shareAuth.error }, 403, corsHeaders)
    photographerId = shareAuth.photographerId
  } else if (isMicrositeRequest) {
    // Public microsite access
    const micrositeAuth = await verifyMicrositeAccess(key, env)
    if (!micrositeAuth.valid) return jsonResponse({ ok: false, error: micrositeAuth.error }, 403, corsHeaders)
    photographerId = micrositeAuth.photographerId
  } else {
    // Public booking-page cover-photo access
    const coverAuth = await verifyBookingCoverAccess(key, env)
    if (!coverAuth.valid) return jsonResponse({ ok: false, error: coverAuth.error }, 403, corsHeaders)
    photographerId = coverAuth.photographerId
  }""",
        1,
    ),
])

# ── 4. BookingCover.jsx -- render a real photo when one's chosen ───────────
patch_file("src/components/booking/BookingCover.jsx", [
    (
        "// Shape opacities are intentionally bold (not a light tint) -- an earlier\n"
        "// pass kept them subtle so the pattern would never fight a theme's own\n"
        "// colors, but against a light theme that just read as washed out. The\n"
        "// legibility of any text overlaid on top (BookingHero.jsx's desktop rail)\n"
        "// comes from its own dark scrim + white text, not from this pattern\n"
        "// staying pale, so there's no tension in making the pattern itself read\n"
        "// as actual color.\n"
        "import { DEFAULT_COVER_PATTERN } from '../../utils/coverPatterns.js'\n",

        "// Shape opacities are intentionally bold (not a light tint) -- an earlier\n"
        "// pass kept them subtle so the pattern would never fight a theme's own\n"
        "// colors, but against a light theme that just read as washed out. The\n"
        "// legibility of any text overlaid on top (BookingHero.jsx's desktop rail)\n"
        "// comes from its own dark scrim + white text, not from this pattern\n"
        "// staying pale, so there's no tension in making the pattern itself read\n"
        "// as actual color.\n"
        "//\n"
        "// The real-photo feature (sql/061_signup_page_cover_image.sql): when a\n"
        "// signup page has an uploaded cover_image_r2_key, that photo renders here\n"
        "// INSTEAD OF the illustrated pattern -- the pattern is the automatic\n"
        "// fallback whenever no photo has been chosen, never something the\n"
        "// photographer has to explicitly pick. Served via the public,\n"
        "// no-login /preview/:key?booking_cover=1 mode added to the R2 Worker\n"
        "// (r2-worker/src/handlers/preview.js + middleware/bookingCoverAccess.js),\n"
        "// the same shape as the existing ?microsite=1 mode -- legitimacy is\n"
        "// verified server-side against signup_pages.cover_image_r2_key + is_active\n"
        "// on every request, never a folder-convention match.\n"
        "import { DEFAULT_COVER_PATTERN } from '../../utils/coverPatterns.js'\n"
        "\n"
        "const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL\n"
        "\n"
        "function bookingCoverImageUrl(key) {\n"
        "  return `${WORKER_URL}/preview/${encodeURIComponent(key)}?booking_cover=1`\n"
        "}\n",
        1,
    ),
    (
        '''export default function BookingCover({ pattern, height = 180 }) {
  return (
    <div style={{ position: 'relative', width: '100%', height, overflow: 'hidden', background: 'linear-gradient(160deg, var(--bk-bg) 0%, var(--bk-surface) 100%)' }}>
      <svg width="100%" height="100%" viewBox="0 0 390 210" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0 }}>
        <CoverPatternShapes pattern={pattern} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 45%, var(--bk-bg) 100%)' }} />
    </div>
  )
}
''',
        '''export default function BookingCover({ pattern, imageKey, focusX = 0.5, focusY = 0.5, height = 180 }) {
  return (
    <div style={{ position: 'relative', width: '100%', height, overflow: 'hidden', background: 'linear-gradient(160deg, var(--bk-bg) 0%, var(--bk-surface) 100%)' }}>
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
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 45%, var(--bk-bg) 100%)' }} />
    </div>
  )
}
''',
        1,
    ),
])

# ── 5. BookingHero.jsx -- pass the real photo + focal point through ────────
patch_file("src/components/booking/BookingHero.jsx", [
    (
        '''export default function BookingHero({ branding, pageData }) {
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
          <BookingCover pattern={pattern} height="100%" />''',

        '''export default function BookingHero({ branding, pageData }) {
  const pattern = pageData.cover_pattern
  const imageKey = pageData.cover_image_r2_key
  const focusX = pageData.cover_focus_x
  const focusY = pageData.cover_focus_y

  return (
    <>
      <div className="lg:hidden">
        <div className="pt-7 pb-5">
          <BrandHeader branding={branding} />
        </div>
        <BookingCover pattern={pattern} imageKey={imageKey} focusX={focusX} focusY={focusY} height={170} />
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
          <BookingCover pattern={pattern} imageKey={imageKey} focusX={focusX} focusY={focusY} height="100%" />''',
        1,
    ),
])

# ── 6. signupApi.js -- map the three new update fields ─────────────────────
patch_file("src/utils/signupApi.js", [
    (
        "  if (updates.coverPattern !== undefined) mapped.cover_pattern = updates.coverPattern\n",
        "  if (updates.coverPattern !== undefined) mapped.cover_pattern = updates.coverPattern\n"
        "  if (updates.coverImageR2Key !== undefined) mapped.cover_image_r2_key = updates.coverImageR2Key\n"
        "  if (updates.coverFocusX !== undefined) mapped.cover_focus_x = updates.coverFocusX\n"
        "  if (updates.coverFocusY !== undefined) mapped.cover_focus_y = updates.coverFocusY\n",
        1,
    ),
])

# ── 7. Sessions.jsx -- photo tile in the Cover image picker ────────────────
patch_file("src/routes/Sessions.jsx", [
    (
        "import { Plus, CalendarDays, X, LayoutList, Columns, Link2, Copy, Check, Trash2, MapPin, Ticket as TicketIcon, Camera,\n"
        "  Users, Briefcase, Ticket, Home, GraduationCap, ScanFace, Baby, User, Trophy, Heart, BookHeart, SquareUser, CalendarClock, Search } from 'lucide-react'\n",

        "import { Plus, CalendarDays, X, LayoutList, Columns, Link2, Copy, Check, Trash2, MapPin, Ticket as TicketIcon, Camera,\n"
        "  Users, Briefcase, Ticket, Home, GraduationCap, ScanFace, Baby, User, Trophy, Heart, BookHeart, SquareUser, CalendarClock, Search, Crosshair } from 'lucide-react'\n",
        1,
    ),
    (
        "import { COMMON_TIMEZONES } from '../utils/timezoneApi.js'\n"
        "import { CoverPatternShapes } from '../components/booking/BookingCover.jsx'\n"
        "import { COVER_PATTERN_OPTIONS, DEFAULT_COVER_PATTERN } from '../utils/coverPatterns.js'\n"
        "import AddressAutocomplete from '../components/ui/AddressAutocomplete.jsx'\n",

        "import { COMMON_TIMEZONES } from '../utils/timezoneApi.js'\n"
        "import { CoverPatternShapes } from '../components/booking/BookingCover.jsx'\n"
        "import { COVER_PATTERN_OPTIONS, DEFAULT_COVER_PATTERN } from '../utils/coverPatterns.js'\n"
        "import MicrositeImagePicker from '../components/microsite/MicrositeImagePicker.jsx'\n"
        "import MicrositeFocalPointModal from '../components/microsite/MicrositeFocalPointModal.jsx'\n"
        "import AddressAutocomplete from '../components/ui/AddressAutocomplete.jsx'\n",
        1,
    ),
    (
        "import Modal from '../components/ui/Modal.jsx'\n"
        "import ClientPicker from '../components/ui/ClientPicker.jsx'\n"
        "\n"
        "\n"
        "const SESSION_ICON_MAP = {\n",

        "import Modal from '../components/ui/Modal.jsx'\n"
        "import ClientPicker from '../components/ui/ClientPicker.jsx'\n"
        "\n"
        "const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL\n"
        "\n"
        "// Same small per-component pattern MicrositeEditor.jsx's own\n"
        "// fetchAuthedBlob/HeroThumbnail use -- deliberately not shared, see\n"
        "// MicrositeImagePicker.jsx's own copy for the same reasoning. Used only\n"
        "// to show an admin-side thumbnail of a chosen cover photo; the live\n"
        "// booking page never calls this (it uses the public ?booking_cover=1\n"
        "// mode instead, which needs no auth).\n"
        "async function fetchAuthedBlob(r2Key) {\n"
        "  const { data: { session } } = await supabase.auth.getSession()\n"
        "  const resp = await fetch(`${WORKER_URL}/preview/${encodeURIComponent(r2Key)}`, {\n"
        "    headers: { Authorization: `Bearer ${session.access_token}` }\n"
        "  })\n"
        "  if (!resp.ok) throw new Error('Failed to fetch preview')\n"
        "  return URL.createObjectURL(await resp.blob())\n"
        "}\n"
        "\n"
        "const SESSION_ICON_MAP = {\n",
        1,
    ),
    (
        "function SignupPageDetailModal({ pageId, onClose, onChanged }) {\n",

        "// Swatch-sized thumbnail for a chosen cover photo, in the same 64x44\n"
        "// footprint as the pattern swatches next to it. Fetches an authenticated\n"
        "// preview blob (the admin viewer is logged in, so this can use the plain\n"
        "// /preview/:key path rather than the public ?booking_cover=1 mode the\n"
        "// live booking page uses).\n"
        "function CoverPhotoThumb({ r2Key }) {\n"
        "  const [url, setUrl] = useState(null)\n"
        "  useEffect(() => {\n"
        "    // Unlike MicrositeEditor.jsx's HeroThumbnail, this never actually\n"
        "    // renders with a falsy r2Key -- the one call site below only mounts\n"
        "    // it once coverImageR2Key is already truthy -- so there's no \"reset\n"
        "    // to null\" branch here, which also sidesteps that copy's\n"
        "    // react-hooks/set-state-in-effect lint error on the early return.\n"
        "    if (!r2Key) return\n"
        "    let cancelled = false\n"
        "    let blobUrl = null\n"
        "    fetchAuthedBlob(r2Key).then(u => {\n"
        "      if (cancelled) { URL.revokeObjectURL(u); return }\n"
        "      blobUrl = u\n"
        "      setUrl(u)\n"
        "    }).catch(() => {})\n"
        "    return () => { cancelled = true; if (blobUrl) URL.revokeObjectURL(blobUrl) }\n"
        "  }, [r2Key])\n"
        "\n"
        "  return <div className=\"w-full h-full\" style={{ background: 'var(--bg-subtle)' }}>{url && <img src={url} alt=\"\" className=\"w-full h-full object-cover\" />}</div>\n"
        "}\n"
        "\n"
        "function SignupPageDetailModal({ pageId, onClose, onChanged }) {\n",
        1,
    ),
    (
        "  const [coverPattern, setCoverPattern] = useState(DEFAULT_COVER_PATTERN)\n"
        "  const [copied, setCopied] = useState(false)\n",

        "  const [coverPattern, setCoverPattern] = useState(DEFAULT_COVER_PATTERN)\n"
        "  const [coverImageR2Key, setCoverImageR2Key] = useState(null)\n"
        "  const [coverFocusX, setCoverFocusX] = useState(0.5)\n"
        "  const [coverFocusY, setCoverFocusY] = useState(0.5)\n"
        "  const [showCoverImagePicker, setShowCoverImagePicker] = useState(false)\n"
        "  const [showCoverFocalModal, setShowCoverFocalModal] = useState(false)\n"
        "  const [copied, setCopied] = useState(false)\n",
        1,
    ),
    (
        "      setCoverPattern(p.cover_pattern || DEFAULT_COVER_PATTERN)\n"
        "    } catch (err) { console.error(err) }\n",

        "      setCoverPattern(p.cover_pattern || DEFAULT_COVER_PATTERN)\n"
        "      setCoverImageR2Key(p.cover_image_r2_key || null)\n"
        "      setCoverFocusX(p.cover_focus_x ?? 0.5)\n"
        "      setCoverFocusY(p.cover_focus_y ?? 0.5)\n"
        "    } catch (err) { console.error(err) }\n",
        1,
    ),
    (
        "  async function handleSaveCoverPattern(patternId) {\n"
        "    setCoverPattern(patternId)\n"
        "    const updated = await updateSignupPage(pageId, { coverPattern: patternId })\n"
        "    setPage(updated ? { ...page, ...updated, signup_shoot_types: page.signup_shoot_types } : page)\n"
        "  }\n",

        "  async function handleSaveCoverPattern(patternId) {\n"
        "    // Picking a pattern always makes it the active cover -- if a photo\n"
        "    // was previously chosen, this switches back to the pattern rather\n"
        "    // than layering both, since BookingCover.jsx only ever renders one.\n"
        "    setCoverPattern(patternId)\n"
        "    setCoverImageR2Key(null)\n"
        "    const updated = await updateSignupPage(pageId, { coverPattern: patternId, coverImageR2Key: null })\n"
        "    setPage(updated ? { ...page, ...updated, signup_shoot_types: page.signup_shoot_types } : page)\n"
        "  }\n"
        "\n"
        "  async function handleSelectCoverImage(key) {\n"
        "    setShowCoverImagePicker(false)\n"
        "    setCoverImageR2Key(key)\n"
        "    setCoverFocusX(0.5)\n"
        "    setCoverFocusY(0.5)\n"
        "    const updated = await updateSignupPage(pageId, { coverImageR2Key: key, coverFocusX: 0.5, coverFocusY: 0.5 })\n"
        "    setPage(updated ? { ...page, ...updated, signup_shoot_types: page.signup_shoot_types } : page)\n"
        "  }\n"
        "\n"
        "  async function handleSaveCoverFocus(x, y) {\n"
        "    setCoverFocusX(x)\n"
        "    setCoverFocusY(y)\n"
        "    setShowCoverFocalModal(false)\n"
        "    const updated = await updateSignupPage(pageId, { coverFocusX: x, coverFocusY: y })\n"
        "    setPage(updated ? { ...page, ...updated, signup_shoot_types: page.signup_shoot_types } : page)\n"
        "  }\n"
        "\n"
        "  async function handleRemoveCoverImage() {\n"
        "    setCoverImageR2Key(null)\n"
        "    const updated = await updateSignupPage(pageId, { coverImageR2Key: null })\n"
        "    setPage(updated ? { ...page, ...updated, signup_shoot_types: page.signup_shoot_types } : page)\n"
        "  }\n",
        1,
    ),
    (
        '''          {/* Cover image -- the illustrated pattern shown behind this
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
          </div>''',

        '''          {/* Cover image -- shown behind this page's title on the public
              booking page (see components/booking/BookingCover.jsx): an
              uploaded photo if one's chosen, otherwise an illustrated
              pattern. Same swatch-picker treatment MicrositeEditor.jsx
              already uses for its theme choices: a small preview per
              option, an accent ring on whichever is active. Pattern
              previews reuse the exact shapes the live page renders
              (CoverPatternShapes), just with fixed colors instead of that
              page's own --bk-* theme variables, since no booking-page
              theme is in scope in this admin view. The photo tile picks
              from an existing gallery image (MicrositeImagePicker, same
              component microsites use for their own hero image) rather
              than a fresh upload -- see sql/061_signup_page_cover_image.sql. */}
          <div>
            <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }}>Cover image</label>
            <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Shown behind this session's title on its booking page -- an uploaded photo if you add one, otherwise an illustrated pattern.</p>
            <div className="flex gap-3 flex-wrap items-start">
              <div className="flex flex-col items-center gap-1.5">
                <div style={{ position: 'relative', width: 64, height: 44 }}>
                  <button onClick={() => setShowCoverImagePicker(true)} title={coverImageR2Key ? 'Change photo' : 'Choose a photo'}
                    style={{
                      width: 64, height: 44, borderRadius: 8, overflow: 'hidden', display: 'block', padding: 0,
                      background: 'none', border: 'none', cursor: 'pointer',
                      boxShadow: coverImageR2Key ? '0 0 0 2px var(--surface), 0 0 0 4px #6366f1' : '0 0 0 1px var(--border)',
                    }}>
                    {coverImageR2Key ? (
                      <CoverPhotoThumb r2Key={coverImageR2Key} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--bg-subtle)' }}>
                        <Camera size={16} style={{ color: 'var(--text-muted)' }} />
                      </div>
                    )}
                  </button>
                  {coverImageR2Key && (
                    <button onClick={() => setShowCoverFocalModal(true)} title="Adjust focus point"
                      style={{
                        position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%',
                        background: '#6366f1', color: '#fff', border: '2px solid var(--surface)', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                      }}>
                      <Crosshair size={11} />
                    </button>
                  )}
                </div>
                <span className="text-xs" style={{ color: coverImageR2Key ? 'var(--text)' : 'var(--text-muted)' }}>
                  {coverImageR2Key ? 'Photo' : 'Upload photo'}
                </span>
                {coverImageR2Key && (
                  <button onClick={handleRemoveCoverImage} className="text-xs" style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    Remove
                  </button>
                )}
              </div>

              {COVER_PATTERN_OPTIONS.map(opt => {
                const isActive = !coverImageR2Key && (coverPattern || DEFAULT_COVER_PATTERN) === opt.id
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
          </div>''',
        1,
    ),
    (
        "    </Modal>\n"
        "\n"
        "    {rescheduleSlot && (\n",

        "    </Modal>\n"
        "\n"
        "    {showCoverImagePicker && (\n"
        "      <MicrositeImagePicker\n"
        "        onSelect={key => handleSelectCoverImage(key)}\n"
        "        onClose={() => setShowCoverImagePicker(false)}\n"
        "      />\n"
        "    )}\n"
        "\n"
        "    {showCoverFocalModal && coverImageR2Key && (\n"
        "      <MicrositeFocalPointModal\n"
        "        r2Key={coverImageR2Key}\n"
        "        initialFocusX={coverFocusX}\n"
        "        initialFocusY={coverFocusY}\n"
        "        onSave={(x, y) => handleSaveCoverFocus(x, y)}\n"
        "        onClose={() => setShowCoverFocalModal(false)}\n"
        "      />\n"
        "    )}\n"
        "\n"
        "    {rescheduleSlot && (\n",
        1,
    ),
])
