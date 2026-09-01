#!/usr/bin/env python3
"""
Patch v1.5.11 -- booking-page redesign, step 11: bigger, centered desktop
logo.

Requires steps 1 through 10 already applied.

More feedback on step 9's overlay treatment: the small top-left corner
mark felt undersized once seen live against how much rail it's floating
over. Centers it and sizes it up well past either of BrandHeader's two
existing tiers (32 for the old inline-row placement, 44 for the
mobile-width centered one).

Two files:

1. MODIFIED src/components/booking/BrandHeader.jsx -- new `size` prop
   that overrides the mark's height independent of `align` (max width and
   the initials-fallback font size scale proportionally with it, same
   1:5 height-to-max-width ratio the two built-in sizes already share).

2. MODIFIED src/components/booking/BookingHero.jsx -- the desktop rail's
   BrandHeader call drops `align="left"` (back to the default centered
   layout) and adds `size={64}`, wrapped in a `justify-content: center`
   div so it centers across the full rail width, not just within its own
   content box. The top scrim also grows from 130 to 160px to keep
   comfortably covering the larger mark.

Run from the repo root, after steps 1 through 10. Idempotent -- safe to
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


# ── 1. BrandHeader.jsx -- new `size` override prop ──────────────────────────
patch_file("src/components/booking/BrandHeader.jsx", [
    (
        '''// align="center" (default) is the original stacked/centered treatment.
// align="left" is a smaller, row-layout variant added for
// BookingHero.jsx's desktop rail, where the header sits at the top of a
// vertical panel rather than centered above a narrow mobile column.
//
// overlay=true is BookingHero.jsx's own treatment: the header floats''',
        '''// align="center" (default) is the original stacked/centered treatment.
// align="left" is a smaller, row-layout variant added for
// BookingHero.jsx's desktop rail's earlier top-left corner placement --
// still used by AllSessionsBooking.jsx-style plain (non-overlay) headers
// wherever a compact inline row fits better than a stacked, centered one.
//
// size optionally overrides the mark's height (and, proportionally, its
// max width and initials font size) independent of align -- e.g.
// BookingHero.jsx's desktop overlay wants align="center"'s stacked
// layout but noticeably larger than either of the two built-in sizes.
//
// overlay=true is BookingHero.jsx's own treatment: the header floats''',
        1,
    ),
    (
        '''export default function BrandHeader({ branding, align = 'center', overlay = false }) {
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
      )}''',
        '''export default function BrandHeader({ branding, align = 'center', overlay = false, size }) {
  const logoKey = overlay ? resolveOverlayLogoR2Key(branding) : resolveLogoR2Key(branding)
  const hasLogo = !!logoKey
  const isLeft = align === 'left'
  const markSize = size ?? (isLeft ? 32 : 44)
  // The two built-in sizes (32/160, 44/220) both happen to keep the same
  // 1:5 height-to-max-width ratio -- carrying that forward for a custom
  // size means a bigger mark still gets proportionally more room for a
  // wide wordmark logo, not just a taller crop of the same 220px cap.
  const maxLogoWidth = markSize * 5
  const initialsFontSize = Math.round(markSize * 0.34)

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
            height: markSize, maxWidth: maxLogoWidth, objectFit: 'contain', flexShrink: 0,
            filter: overlay ? 'drop-shadow(0 1px 4px rgba(0,0,0,0.45))' : undefined,
          }} />
      ) : (
        <div className="flex items-center justify-center rounded-full flex-shrink-0"
          style={{
            width: markSize, height: markSize, background: 'var(--bk-accent)', color: 'var(--bk-accent-button-text)', fontSize: initialsFontSize, fontWeight: 600,
            boxShadow: overlay ? '0 1px 6px rgba(0,0,0,0.35)' : undefined,
          }}>
          {getInitials(branding.studio_name)}
        </div>
      )}''',
        1,
    ),
])

# ── 2. BookingHero.jsx -- centered, larger desktop logo ─────────────────────
patch_file("src/components/booking/BookingHero.jsx", [
    (
        '''// The logo used to sit in its own solid-background block stacked above
// the cover -- once the cover itself went edge-to-edge (step 6 of this
// series), that read as a lot of dead padding sitting on a hard seam.
// Now the cover runs all the way to the top on both breakpoints and the
// logo floats directly over it, under its own top scrim (mirroring the
// existing bottom scrim under the title below) -- one continuous image,
// no seam. See BrandHeader.jsx's `overlay` prop for what changes on the
// logo itself.
const TOP_SCRIM''',
        '''// The logo used to sit in its own solid-background block stacked above
// the cover -- once the cover itself went edge-to-edge (step 6 of this
// series), that read as a lot of dead padding sitting on a hard seam.
// Now the cover runs all the way to the top on both breakpoints and the
// logo floats directly over it, under its own top scrim (mirroring the
// existing bottom scrim under the title below) -- one continuous image,
// no seam. See BrandHeader.jsx's `overlay` prop for what changes on the
// logo itself.
//
// The desktop rail's logo is centered and sized up (size=64, well past
// either of BrandHeader's two built-in tiers) rather than reusing the
// small top-left corner placement every other breakpoint/context uses --
// post-launch feedback was that the small corner mark felt undersized
// against how much rail it's floating over. The wrapping div's own
// `justify-content: center` is what centers it horizontally across the
// full rail width; BrandHeader's own align="center" (the default) only
// centers the logo/name within their own content-sized box.
const TOP_SCRIM''',
        1,
    ),
    (
        '''          <div style={{ position: 'absolute', inset: 0, background: BOTTOM_SCRIM }} />
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 130, background: TOP_SCRIM }} />
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '24px 32px 0' }}>
            <BrandHeader branding={branding} align="left" overlay />
          </div>''',
        '''          <div style={{ position: 'absolute', inset: 0, background: BOTTOM_SCRIM }} />
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 160, background: TOP_SCRIM }} />
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '32px 32px 0', display: 'flex', justifyContent: 'center' }}>
            <BrandHeader branding={branding} overlay size={64} />
          </div>''',
        1,
    ),
])
