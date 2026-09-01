#!/usr/bin/env python3
"""
Patch v1.5.11 -- booking-page redesign, Phase 1 / step 2 of 4: per-shoot-type icons.

Builds on step 1 (patch_v1.5.11_booking_redesign_1_data.py) -- requires
sql/058_booking_page_branding.sql to already be applied in Supabase, since
this reads the `session_type` field that migration added to the RPC
response.

src/routes/SignupBooking.jsx: the shoot-type list on /book/:token showed a
fixed camera icon for every entry, regardless of what kind of session it
actually was. Swaps it for SessionTypeIcon (added in step 1), which looks
up each shoot type's session_type against the same category -> icon
mapping already used internally on the Sessions page (Boudoir, Convention,
Corporate, Event, Family, Graduation, Headshot, Maternity, Newborn,
Portrait, Sports, Wedding, Other -- 13 categories, see SESSION_TYPE_ICON in
sessionApi.js). A shoot type with no session_type set, or one outside that
list, falls back to the same generic calendar icon SessionTypeIcon already
defaults to.

Colors and layout are untouched here -- still the existing indigo tint,
same box size and position. That's step 3 (branding/theme), not this one.

Run from the repo root, after step 1. Idempotent -- safe to run twice.
"""
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent


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


patch_file("src/routes/SignupBooking.jsx", [
    (
        "import { CalendarDays, MapPin, Clock, ChevronLeft, Check, Calendar, Camera } from 'lucide-react'\n"
        "import { supabaseAnon } from '../supabaseClientAnon.js'\n",
        "import { CalendarDays, MapPin, Clock, ChevronLeft, Check, Calendar } from 'lucide-react'\n"
        "import { supabaseAnon } from '../supabaseClientAnon.js'\n"
        "import { SessionTypeIcon } from '../utils/sessionTypeIcon.jsx'\n",
        1,
    ),
    (
        "          <div className=\"flex items-center justify-center rounded-lg flex-shrink-0\" style={{ width: 36, height: 36, background: 'rgba(99,102,241,0.1)' }}>\n"
        "            <Camera size={17} style={{ color: '#6366f1' }} />\n"
        "          </div>\n",
        "          <div className=\"flex items-center justify-center rounded-lg flex-shrink-0\" style={{ width: 36, height: 36, background: 'rgba(99,102,241,0.1)' }}>\n"
        "            <SessionTypeIcon type={t.session_type} size={17} color=\"#6366f1\" />\n"
        "          </div>\n",
        1,
    ),
])

print("\nDone. Check /book/<a token with several shoot types of different categories>")
print("and confirm each row now shows an icon matching its category (e.g. a heart for")
print("Wedding, a trophy for Sports) instead of a camera on all of them.")
