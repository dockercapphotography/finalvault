#!/usr/bin/env python3
"""
Patch v1.5.11 -- booking-page redesign, step 6: desktop cover was inset
instead of filling the rail.

Requires steps 1, 2, 3, 3b, 4, and 5 already applied.

The desktop rail's cover box had a rounded-2xl class plus a
margin: 24px 40px 40px, left over from an earlier "card floating inside
the rail" look -- but the approved mockup has the cover fill the entire
rail edge to edge, flush top/bottom/left/right, no rounded corners. Found
by inspecting the real page in devtools and disabling both properties to
confirm that's exactly what was missing.

One-line fix in src/components/booking/BookingHero.jsx: the desktop
cover's wrapper div drops rounded-2xl and the margin entirely. Nothing
else changes -- the header above it, the dark scrim, and the title
overlay are all untouched.

Run from the repo root, after steps 1, 2, 3, 3b, 4, and 5. Idempotent --
safe to run twice.
"""
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent


def replace_whole_file(rel_path, expected_old, new_content):
    path = ROOT / rel_path
    current = path.read_text()
    if current == new_content:
        print(f"  (no changes needed -- {rel_path} already patched)")
        return
    assert current == expected_old, (
        f"{rel_path}: file doesn't match the expected pre-patch state "
        f"(steps 1, 2, 3, 3b, 4, and 5 applied).\n"
        f"Make sure the booking-redesign patches 1, 2, 3, 3b, 4, and 5 have all been run first."
    )
    path.write_text(new_content)
    print(f"Patched {rel_path}")

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
replace_whole_file("src/components/booking/BookingHero.jsx", BOOKING_HERO_OLD, BOOKING_HERO_NEW)

print()
print("Done. Step 6 applied.")
print("Restart your dev server if it's running, then check the desktop rail:")
print("  the cover pattern should now fill the entire left panel edge to edge,")
print("  flush to all four sides, no rounded corners, no gap around it.")
