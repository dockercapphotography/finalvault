#!/usr/bin/env python3
"""
Patch v1.5.11 -- booking-page redesign, Phase 1 / step 1 of 4: data plumbing.

This is the FIRST of several small patches for the booking-page redesign
(see claude/dev-workflow.md for why it's split up this way, and the
approved mockups from the design canvas for the visual target). Nothing
in this patch changes what either public booking page LOOKS like yet --
it only adds the data both pages will need for that:

1. Two new shared frontend files (pure additions, nothing else touched):
   - src/utils/accentColor.js -- the same accent-contrast color math
     MicrositeRenderer.jsx already uses, pulled into its own small file
     so the two booking pages can use it without depending on the whole
     microsite renderer.
   - src/utils/sessionTypeIcon.jsx -- session_type -> lucide icon
     rendering, reusing the existing SESSION_TYPE_ICON map from
     sessionApi.js (the same categories/icons already used internally
     on the Sessions page) rather than inventing a new icon set.

2. sql/058_booking_page_branding.sql -- written into the repo as a
   tracked migration record. THIS FILE DOES NOT RUN ITSELF. Per our
   process, copy its contents into the Supabase SQL editor and run it
   there separately -- see the instructions after this patch applies.

   It updates two existing public RPCs (get_signup_page_data,
   get_signup_pages_by_token) to also return:
     - each shoot type's `session_type` (already a column, just wasn't
       selected before)
     - a top-level `branding` object: { has_microsite, studio_name,
       logo_r2_key, and -- only when has_microsite is true -- theme,
       accent_color, font_pairing, custom_display_font,
       custom_body_font, radius }
   No new columns, no schema changes -- everything already exists on
   signup_shoot_types / microsites / photographers.

Nothing in the app reads `branding` or `session_type` yet -- that's
patches 2-4. This one is safe to apply and test in isolation: both
booking pages should look and behave EXACTLY as they do today, just with
more fields available in the RPC response if you inspect it (e.g. via
the Network tab or Supabase's own function logs).

Run from the repo root. Idempotent -- safe to run twice.
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


ACCENT_COLOR_JS = '''// Accent-contrast helpers, shared by the public booking pages
// (SignupBooking.jsx, AllSessionsBooking.jsx) for the branded look a
// photographer's microsite theme produces there.
//
// This is the same math MicrositeRenderer.jsx already uses for its own
// accent-contrast handling -- pulled out here rather than imported
// directly from that file so the booking pages don't take on a dependency
// on the (much larger, editor-adjacent) microsite renderer just for five
// small color functions. Keep any future fix to this math in both places
// in sync by hand if MicrositeRenderer.jsx's copy changes.

export function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return { r: parseInt(h.substring(0, 2), 16), g: parseInt(h.substring(2, 4), 16), b: parseInt(h.substring(4, 6), 16) }
}

export function rgbToHex(r, g, b) {
  const toHex = n => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

export function blendToward(hex, targetHex, amount) {
  const c = hexToRgb(hex)
  const t = hexToRgb(targetHex)
  return rgbToHex(c.r + (t.r - c.r) * amount, c.g + (t.g - c.g) * amount, c.b + (t.b - c.b) * amount)
}

// Text color guaranteed readable when the accent itself is used as text
// color (not as a button/badge background with fixed white text on top).
export function getAccentTextColor(accentHex, isDarkTheme) {
  if (!/^#[0-9a-fA-F]{6}$/.test(accentHex)) return accentHex
  const { r, g, b } = hexToRgb(accentHex)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  if (isDarkTheme && luminance < 0.55) return blendToward(accentHex, '#FFFFFF', 0.55)
  if (!isDarkTheme && luminance > 0.8) return blendToward(accentHex, '#000000', 0.35)
  return accentHex
}

// Text color for content sitting on a solid accent-colored background
// (buttons, badges) -- just needs black-vs-white, not a blended tone.
export function getAccentButtonTextColor(accentHex) {
  if (!/^#[0-9a-fA-F]{6}$/.test(accentHex)) return '#fff'
  const { r, g, b } = hexToRgb(accentHex)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? '#17171A' : '#fff'
}
'''

SESSION_TYPE_ICON_JSX = '''// Shared session-type -> icon rendering, reusing the SESSION_TYPE_ICON
// mapping already used for internal Sessions (sessionApi.js) so public
// booking pages show the same icon a photographer already sees for a
// given category, instead of the previous fixed camera icon everywhere.
//
// Deliberately its own small file rather than folded into Sessions.jsx
// (which defines the same lookup inline): Sessions.jsx is an
// authenticated, internal-only route with its own large import list,
// and the public booking pages should depend on as little of it as
// possible. If the two ever need to be reconciled into one definition,
// Sessions.jsx's inline SESSION_ICON_MAP/SessionTypeIcon can be swapped
// to import from here instead.
import {
  BookHeart, SquareUser, Users, Briefcase, Ticket, Home, GraduationCap,
  Baby, User, Trophy, Heart, CalendarDays,
} from 'lucide-react'
import { SESSION_TYPE_ICON } from './sessionApi.js'

const SESSION_ICON_MAP = {
  BookHeart, SquareUser, Users, Briefcase, Ticket, Home, GraduationCap,
  Baby, User, Trophy, Heart, CalendarDays,
}

export function SessionTypeIcon({ type, size = 18, color, style }) {
  const iconName = SESSION_TYPE_ICON[type] || 'CalendarDays'
  const Icon = SESSION_ICON_MAP[iconName] || CalendarDays
  return <Icon size={size} style={{ color, ...style }} />
}
'''

SQL_MIGRATION = '''-- 058_booking_page_branding.sql
--
-- Part 1 of the booking-page redesign (Phase 1, front-end pieces -- see
-- claude/dev-workflow.md and the v1.5.11 chat for the full plan). Neither
-- RPC gains a new column here -- everything below already exists on
-- signup_shoot_types / microsites / photographers, it just wasn't being
-- returned to the public booking pages yet.
--
-- 1. get_signup_page_data: adds `session_type` to each shoot_type (already
--    a column on signup_shoot_types, confirmed via information_schema --
--    just never selected here), and a top-level `branding` object so the
--    /book/:token page can show the photographer's actual name/logo/theme
--    instead of nothing at all.
-- 2. get_signup_pages_by_token: same `branding` object, for the /book/all/:token
--    chooser page, keeping both public booking pages on one visual system.
--
-- `branding.has_microsite` is the fallback gate the frontend keys off of:
-- true only when the photographer has an ENABLED microsite, in which case
-- branding carries that microsite's real theme/accent/font/radius (the
-- same fields get_site_by_hostname already exposes for the microsite
-- itself, sql/051) so the booking page matches their live site. false
-- means no enabled microsite -- branding carries just a name and possibly
-- a photographer-level logo, and the frontend renders FinalVault's own
-- default look (no theme/accent applied), never a guessed/invented style.
--
-- Run after: 057_microsite_booking_show_all_sessions.sql
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
'''

write_file("src/utils/accentColor.js", ACCENT_COLOR_JS)
write_file("src/utils/sessionTypeIcon.jsx", SESSION_TYPE_ICON_JSX)
write_file("sql/058_booking_page_branding.sql", SQL_MIGRATION)

print("\nDone. Next steps:")
print("  1. Open sql/058_booking_page_branding.sql, copy its contents, and run the whole")
print("     thing in the Supabase SQL editor -- this patch script only writes the file,")
print("     it does not touch your database.")
print("  2. Confirm both booking pages still work exactly as before:")
print("     - /book/<a real token>")
print("     - /book/all/<a real all_sessions_token>")
print("  3. Optional sanity check: open browser devtools Network tab on /book/<token>,")
print("     find the get_signup_page_data RPC call, and confirm the response now has a")
print("     top-level \"branding\" object and \"session_type\" on each shoot type.")
