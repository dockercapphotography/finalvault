// Shared header for the public booking pages -- a photographer's logo (or
// an initials avatar when there isn't one to show, see brandingLogoUrl's
// own comment for why) plus their studio name. Used by SignupBooking.jsx
// (both directly, in AllSessionsBooking.jsx, and inside BookingHero.jsx)
// so the three stay visually identical here rather than maintaining
// copies that can drift.
//
// align="center" (default) is the original stacked/centered treatment.
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

export default function BrandHeader({ branding, align = 'center', overlay = false, size }) {
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
      )}
      {!hasLogo && branding.studio_name && (
        <p className="text-sm font-semibold" style={{ color: overlay ? '#fff' : 'var(--bk-ink)', fontFamily: 'var(--bk-font-display)' }}>{branding.studio_name}</p>
      )}
    </div>
  )
}
