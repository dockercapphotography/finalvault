import { MapPin } from 'lucide-react'
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
//
// The desktop rail's logo is centered and sized up (size=64, well past
// either of BrandHeader's two built-in tiers) rather than reusing the
// small top-left corner placement every other breakpoint/context uses --
// post-launch feedback was that the small corner mark felt undersized
// against how much rail it's floating over. The wrapping div's own
// `justify-content: center` is what centers it horizontally across the
// full rail width; BrandHeader's own align="center" (the default) only
// centers the logo/name within their own content-sized box.
const TOP_SCRIM = 'linear-gradient(180deg, rgba(20,17,13,0.6) 0%, rgba(20,17,13,0) 100%)'
const BOTTOM_SCRIM = 'linear-gradient(180deg, rgba(20,17,13,0) 35%, rgba(20,17,13,0.55) 70%, rgba(20,17,13,0.88) 100%)'

export default function BookingHero({ branding, pageData }) {
  const pattern = pageData.cover_pattern
  const imageKey = pageData.cover_image_r2_key
  const focusX = pageData.cover_focus_x
  const focusY = pageData.cover_focus_y

  return (
    <>
      <div className="lg:hidden" data-testid="booking-hero-mobile">
        <div style={{ position: 'relative' }}>
          <BookingCover pattern={pattern} imageKey={imageKey} focusX={focusX} focusY={focusY} height={250} />
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

      <div className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:w-[400px]" data-testid="booking-hero-desktop"
        style={{ background: 'var(--bk-bg)', borderRight: '1px solid var(--bk-border)' }}>
        <div className="overflow-hidden" style={{ position: 'relative', flex: 1 }}>
          <BookingCover pattern={pattern} imageKey={imageKey} focusX={focusX} focusY={focusY} height="100%" />
          {/* Same dark-scrim-under-white-text treatment MicrositeRenderer.css's
              own .ms-hero-overlay already uses over its hero image (same
              rgba(20,17,13,...) tone), so the title stays legible here
              regardless of the pattern's own theme-driven colors. */}
          <div style={{ position: 'absolute', inset: 0, background: BOTTOM_SCRIM }} />
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 160, background: TOP_SCRIM }} />
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '32px 32px 0', display: 'flex', justifyContent: 'center' }}>
            <BrandHeader branding={branding} overlay size={64} />
          </div>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 28 }}>
            <HeroContent pageData={pageData} dark />
          </div>
        </div>
      </div>
    </>
  )
}
