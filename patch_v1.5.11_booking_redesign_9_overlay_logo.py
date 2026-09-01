#!/usr/bin/env python3
"""
Patch v1.5.11 -- booking-page redesign, step 9: overlay the logo on the
cover instead of a separate padded header block.

Requires steps 1 through 8 already applied.

Post-launch feedback on the desktop/mobile hero: once the cover image
went edge-to-edge (step 6), the logo's own solid-background header block
above it read as a lot of dead padding sitting on a hard seam -- both the
padding itself (excessive on mobile, logo felt oddly small/positioned on
desktop) and the hard cut between the two blocks. Discussed three
directions with the photographer; picked the biggest one: drop the
separate header block entirely, run the cover image all the way to the
top on both breakpoints, and float the logo directly over it under its
own top scrim (mirroring the existing bottom scrim under the title).

Two files:

1. MODIFIED src/utils/bookingBranding.js -- new resolveOverlayLogoR2Key(),
   alongside the existing theme-based resolveLogoR2Key(). The overlaid
   logo always sits over its own dark scrim now, regardless of the page's
   theme, so it always uses the primary (dark-backdrop) logo_r2_key
   rather than picking a variant based on theme.dark.

2. MODIFIED src/components/booking/BrandHeader.jsx -- new `overlay` prop.
   When true: uses resolveOverlayLogoR2Key instead of resolveLogoR2Key,
   drops the mb-5 spacing (no longer needed once nothing sits below it in
   its own block), switches the studio-name fallback text to white, and
   adds a small drop-shadow to the logo image / initials badge so they
   stay legible over whatever's directly behind them in a real photo.

3. MODIFIED src/components/booking/BookingHero.jsx -- removes the
   px-10/pt-10 and pt-7/pb-5 header wrapper divs on both breakpoints.
   BookingCover now renders first and fills the full area (170px mobile
   strip, 100% desktop rail), with the logo absolutely positioned over
   its top edge under a new TOP_SCRIM gradient, and (desktop only) the
   existing BOTTOM_SCRIM/title overlay unchanged at the bottom.

Run from the repo root, after steps 1 through 8. Idempotent -- safe to
run twice.
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


# ── 1. bookingBranding.js -- overlay logo resolution ────────────────────────
patch_file("src/utils/bookingBranding.js", [
    (
        '''export function resolveLogoR2Key(branding) {
  if (!branding?.has_microsite || !branding.logo_r2_key) return null
  const theme = resolveTheme(branding)
  return theme?.dark ? branding.logo_r2_key : (branding.logo_dark_r2_key || branding.logo_r2_key)
}''',
        '''export function resolveLogoR2Key(branding) {
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
}''',
        1,
    ),
])

# ── 2. BrandHeader.jsx -- new `overlay` prop ────────────────────────────────
patch_file("src/components/booking/BrandHeader.jsx", [
    (
        '''// align="center" (default) is the original stacked/centered treatment.
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
}''',
        '''// align="center" (default) is the original stacked/centered treatment.
// align="left" is a smaller, row-layout variant added for
// BookingHero.jsx's desktop rail, where the header sits at the top of a
// vertical panel rather than centered above a narrow mobile column.
//
// overlay=true is BookingHero.jsx's own treatment: the header floats
// directly over the cover photo/pattern (behind a scrim BookingHero adds)
// instead of sitting in its own solid-background block above it. Two
// things change here rather than in the caller: the logo variant always
// uses the DARK-backdrop version (resolveOverlayLogoR2Key, ignoring
// theme) since it's now always over a scrim regardless of the page's own
// theme, and the studio-name fallback text switches to the scrim's own
// light color -- same reasoning HeroContent's `dark` prop documents in
// BookingHero.jsx. The logo image and initials badge also pick up a
// small drop-shadow here, so they stay readable over whatever's directly
// behind them in a real photo, not just a flat pattern color.
//
// The studio name only shows next to the INITIALS fallback -- once a real
// logo is showing, most studio logos already spell the name out (they're
// wordmarks, not abstract marks), so repeating it as text next to its own
// logo just reads as redundant.
import { brandingLogoUrl, getInitials, resolveLogoR2Key, resolveOverlayLogoR2Key } from '../../utils/bookingBranding.js'

export default function BrandHeader({ branding, align = 'center', overlay = false }) {
  const logoKey = overlay ? resolveOverlayLogoR2Key(branding) : resolveLogoR2Key(branding)
  const hasLogo = !!logoKey
  const isLeft = align === 'left'
  const markSize = isLeft ? 32 : 44

  return (
    <div className={isLeft ? 'flex items-center gap-3' : `flex flex-col items-center gap-2${overlay ? '' : ' mb-5'}`}>
      {hasLogo ? (
        // Sized and fitted the same way MicrositeRenderer.jsx's own nav
        // logo is (.ms-logo-img: height-constrained, object-fit: contain)
        // -- NOT force-cropped into a square/circle. Most studio logos are
        // wide wordmarks, not square marks, so a fixed-size circular crop
        // (the initials avatar's treatment, which suits a single letter
        // or two) cuts most of a real logo off.
        <img src={brandingLogoUrl(logoKey)} alt={branding.studio_name || 'Photographer logo'}
          style={{
            height: markSize, maxWidth: isLeft ? 160 : 220, objectFit: 'contain', flexShrink: 0,
            filter: overlay ? 'drop-shadow(0 1px 4px rgba(0,0,0,0.45))' : undefined,
          }} />
      ) : (
        <div className="flex items-center justify-center rounded-full flex-shrink-0"
          style={{
            width: markSize, height: markSize, background: 'var(--bk-accent)', color: 'var(--bk-accent-button-text)', fontSize: isLeft ? 12 : 15, fontWeight: 600,
            boxShadow: overlay ? '0 1px 6px rgba(0,0,0,0.35)' : undefined,
          }}>
          {getInitials(branding.studio_name)}
        </div>
      )}
      {!hasLogo && branding.studio_name && (
        <p className="text-sm font-semibold" style={{ color: overlay ? '#fff' : 'var(--bk-ink)', fontFamily: 'var(--bk-font-display)' }}>{branding.studio_name}</p>
      )}
    </div>
  )
}''',
        1,
    ),
])

# ── 3. BookingHero.jsx -- cover runs full-height, logo floats over top ─────
patch_file("src/components/booking/BookingHero.jsx", [
    (
        '''// The cover + logo + session title block at the top of /book/:token --
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
          <BookingCover pattern={pattern} imageKey={imageKey} focusX={focusX} focusY={focusY} height="100%" />
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
}''',
        '''// The cover + logo + session title block at the top of /book/:token --
// laid out completely differently on mobile (stacked: a short cover
// strip with the logo floated over its top edge, then a card overlapping
// its bottom edge) versus desktop (a fixed full-height left rail, cover
// filling it entirely, logo floated over its top edge, title overlaid at
// its bottom) rather than the same DOM reflowing via breakpoints alone --
// the two arrangements are different enough (an overlapping card vs. an
// absolute overlay pinned to a tall rail) that forcing one structure to
// do both jobs got messy fast. Both variants pull every color from the
// same --bk-* variables (see utils/bookingBranding.js), so neither
// needed its own theme logic, and both use BookingCover/BrandHeader
// rather than duplicating them.
//
// The logo used to sit in its own solid-background block stacked above
// the cover -- once the cover itself went edge-to-edge (step 6 of this
// series), that read as a lot of dead padding sitting on a hard seam.
// Now the cover runs all the way to the top on both breakpoints and the
// logo floats directly over it, under its own top scrim (mirroring the
// existing bottom scrim under the title below) -- one continuous image,
// no seam. See BrandHeader.jsx's `overlay` prop for what changes on the
// logo itself.
const TOP_SCRIM = 'linear-gradient(180deg, rgba(20,17,13,0.6) 0%, rgba(20,17,13,0) 100%)'
const BOTTOM_SCRIM = 'linear-gradient(180deg, rgba(20,17,13,0) 35%, rgba(20,17,13,0.55) 70%, rgba(20,17,13,0.88) 100%)'

export default function BookingHero({ branding, pageData }) {
  const pattern = pageData.cover_pattern
  const imageKey = pageData.cover_image_r2_key
  const focusX = pageData.cover_focus_x
  const focusY = pageData.cover_focus_y

  return (
    <>
      <div className="lg:hidden">
        <div style={{ position: 'relative' }}>
          <BookingCover pattern={pattern} imageKey={imageKey} focusX={focusX} focusY={focusY} height={170} />
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 90, background: TOP_SCRIM }} />
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '16px 20px 0' }}>
            <BrandHeader branding={branding} overlay />
          </div>
        </div>
        <div className="mx-4 rounded-2xl p-5"
          style={{ marginTop: -44, position: 'relative', zIndex: 2, background: 'var(--bk-surface)', border: '1px solid var(--bk-border)' }}>
          <HeroContent pageData={pageData} />
        </div>
      </div>

      <div className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:w-[400px]"
        style={{ background: 'var(--bk-bg)', borderRight: '1px solid var(--bk-border)' }}>
        <div className="overflow-hidden" style={{ position: 'relative', flex: 1 }}>
          <BookingCover pattern={pattern} imageKey={imageKey} focusX={focusX} focusY={focusY} height="100%" />
          {/* Same dark-scrim-under-white-text treatment MicrositeRenderer.css's
              own .ms-hero-overlay already uses over its hero image (same
              rgba(20,17,13,...) tone), so the title stays legible here
              regardless of the pattern's own theme-driven colors. */}
          <div style={{ position: 'absolute', inset: 0, background: BOTTOM_SCRIM }} />
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 130, background: TOP_SCRIM }} />
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '24px 32px 0' }}>
            <BrandHeader branding={branding} align="left" overlay />
          </div>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 28 }}>
            <HeroContent pageData={pageData} dark />
          </div>
        </div>
      </div>
    </>
  )
}''',
        1,
    ),
])
