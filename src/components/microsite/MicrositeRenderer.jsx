import { useEffect, useState, useRef } from 'react'
import { Mail, Phone, MapPin, Clock, ArrowUp, X, ZoomIn, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabaseAnon as supabase } from '../../supabaseClientAnon.js'
import {
  FONT_PAIRINGS, DEFAULT_FONT_PAIRING, RADIUS_MAP, DEFAULT_RADIUS,
  DISPLAY_FONT_OPTIONS, BODY_FONT_OPTIONS, DEFAULT_CUSTOM_DISPLAY, DEFAULT_CUSTOM_BODY,
  THEME_OPTIONS, DEFAULT_THEME, MOBILE_MENU_VARIANT_OPTIONS, FOOTER_VARIANT_OPTIONS,
} from '../../utils/micrositeThemeOptions.js'
import './MicrositeRenderer.css'

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL

// The new public auth mode added to preview.js (sql/034-036 +
// r2-worker/src/middleware/micrositeAccess.js) -- no JWT, no share
// token, verified purely against server-side state. A plain <img src>
// works directly since the worker requires no request headers for this
// mode, unlike every other authenticated preview path in the app.
// Set once per render by MicrositeRenderer itself, below -- lets every
// previewUrl() call site (there are many, across every section) pick up
// the authenticated JWT path automatically without threading a prop
// through each one individually.
let _previewAuthToken = null

// Plain hex color math -- no dependency needed for a handful of RGB
// blends. Used to derive a guaranteed-readable text variant of the
// user's chosen accent color, since the raw accent (picked independent
// of theme) can be too dark to read on a dark theme's background, or
// too light on a light theme's -- the same class of bug that hit the
// Hero eyebrow, just showing up anywhere accent is used as text rather
// than as a button/badge background with fixed white text on top.
function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return { r: parseInt(h.substring(0, 2), 16), g: parseInt(h.substring(2, 4), 16), b: parseInt(h.substring(4, 6), 16) }
}
function rgbToHex(r, g, b) {
  const toHex = n => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}
function blendToward(hex, targetHex, amount) {
  const c = hexToRgb(hex)
  const t = hexToRgb(targetHex)
  return rgbToHex(c.r + (t.r - c.r) * amount, c.g + (t.g - c.g) * amount, c.b + (t.b - c.b) * amount)
}
function getAccentButtonTextColor(accentHex) {
  if (!/^#[0-9a-fA-F]{6}$/.test(accentHex)) return '#fff'
  const { r, g, b } = hexToRgb(accentHex)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? '#17171A' : '#fff'
}

function getAccentTextColor(accentHex, isDarkTheme) {
  if (!/^#[0-9a-fA-F]{6}$/.test(accentHex)) return accentHex
  const { r, g, b } = hexToRgb(accentHex)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  if (isDarkTheme && luminance < 0.55) return blendToward(accentHex, '#FFFFFF', 0.55)
  if (!isDarkTheme && luminance > 0.8) return blendToward(accentHex, '#000000', 0.35)
  return accentHex
}

function previewUrl(key) {
  if (_previewAuthToken) {
    // Authenticated editor/preview context: the existing JWT ?token=
    // path (preview.js) scopes access to the caller's own
    // photographers/{id}/ prefix, independent of any database-saved
    // reference -- exactly what's needed to preview unsaved uploads.
    return `${WORKER_URL}/preview/${encodeURIComponent(key)}?token=${encodeURIComponent(_previewAuthToken)}`
  }
  // Public visitor context (CustomDomainRoot): no client-supplied
  // secret, verified entirely server-side against saved microsite state.
  return `${WORKER_URL}/preview/${encodeURIComponent(key)}?microsite=1`
}



// site: the { type: 'microsite', ... } payload from get_site_by_hostname.
export default function MicrositeRenderer({ site, previewAuthToken }) {
  _previewAuthToken = previewAuthToken || null
  const [galleryKeys, setGalleryKeys] = useState([])
  const [navScrolled, setNavScrolled] = useState(false)

  const pairing = site.font_pairing === 'custom'
    ? (() => {
        const displayFont = DISPLAY_FONT_OPTIONS.find(f => f.id === site.custom_display_font) || DISPLAY_FONT_OPTIONS.find(f => f.id === DEFAULT_CUSTOM_DISPLAY)
        const bodyFont = BODY_FONT_OPTIONS.find(f => f.id === site.custom_body_font) || BODY_FONT_OPTIONS.find(f => f.id === DEFAULT_CUSTOM_BODY)
        return {
          display: displayFont.family,
          body: bodyFont.family,
          mono: "'Space Mono', monospace",
          googleFonts: `${displayFont.googleFonts}&${bodyFont.googleFonts}&family=Space+Mono:wght@400;700`,
        }
      })()
    : FONT_PAIRINGS[site.font_pairing] || FONT_PAIRINGS[DEFAULT_FONT_PAIRING]
  const radius = RADIUS_MAP[site.radius] || RADIUS_MAP[DEFAULT_RADIUS]
  const theme = THEME_OPTIONS.find(t => t.id === site.theme) || THEME_OPTIONS.find(t => t.id === DEFAULT_THEME)
  const accent = site.accent_color || '#B5651D'
  const testimonialVariant = site.section_variants?.testimonials || 'stack'
  const heroVariant = site.section_variants?.hero || 'fullbleed'
  const heroIsDark = true // every Hero variant in the new family has a dark backdrop
  const mobileMenuVariant = MOBILE_MENU_VARIANT_OPTIONS.some(o => o.id === site.section_variants?.mobileMenu)
    ? site.section_variants.mobileMenu
    : 'drawer'
  const footerVariant = FOOTER_VARIANT_OPTIONS.some(o => o.id === site.section_variants?.footer)
    ? site.section_variants.footer
    : 'accented'
  const footerLogoKey = theme.dark ? site.logo_r2_key : (site.logo_dark_r2_key || site.logo_r2_key)
  const galleryVariant = site.section_variants?.gallery || 'grid'
  const aboutVariant = site.section_variants?.about || 'split'
  const pricingVariant = site.section_variants?.pricing || 'list'
  const contactVariant = site.section_variants?.contact || 'simple'
  const hasAbout = site.show_about !== false && !!(site.bio || site.about_photo_key || (site.about_stats && site.about_stats.length > 0))

  useEffect(() => {
    document.title = site.studio_name || 'Photography'
  }, [site.studio_name])

  // Load only the chosen pairing's Google Fonts stylesheet, not all four.
  useEffect(() => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = `https://fonts.googleapis.com/css2?${pairing.googleFonts}&display=swap`
    document.head.appendChild(link)
    return () => { document.head.removeChild(link) }
  }, [site.font_pairing, site.custom_display_font, site.custom_body_font])

  const [activeSection, setActiveSection] = useState('home')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const [showBackToTop, setShowBackToTop] = useState(false)

  // Forces the nav's solid-background state only for the Dropdown mobile
  // menu specifically -- it's the only variant that expands directly
  // below the nav with nothing else providing a backdrop. Full-Screen
  // and Drawer each already have their own full covering panel, so
  // forcing this for them too just caused a visible logo/padding jump
  // and a color mismatch with no real benefit.
  const forceNavSolid = mobileMenuOpen && mobileMenuVariant === 'dropdown'
  // Which logo variant to show where. Nav: light logo whenever unscrolled
  // (always over a dark hero/overlay now), on a dark theme, or while the
  // Dropdown menu specifically has forced the nav solid; dark logo only
  // once scrolled on a light theme. Footer always sits on the theme's
  // real background, so it's handled separately above, purely theme-based.
  const useLightLogoNav = !(navScrolled || forceNavSolid) || theme.dark
  const navLogoKey = useLightLogoNav ? site.logo_r2_key : (site.logo_dark_r2_key || site.logo_r2_key)

  useEffect(() => {
    function onScroll() {
      setNavScrolled(window.scrollY > 60)
      const scrollableDistance = document.documentElement.scrollHeight - window.innerHeight
      setShowBackToTop(scrollableDistance > 0 && window.scrollY > scrollableDistance / 2)

      const sectionIds = ['about', 'gallery', 'pricing', 'testimonials', 'contact']
      let current = 'home'
      for (const id of sectionIds) {
        const el = document.getElementById(id)
        if (el && el.getBoundingClientRect().top <= 140) current = id
      }
      setActiveSection(current)
    }
    window.addEventListener('scroll', onScroll)
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Resolve the actual list of image keys for the Gallery section --
  // either every image in the designated gallery, or the exact hand-picked
  // set, matching the two gallery_source_type paths the editor supports.
  useEffect(() => {
    let cancelled = false
    async function loadGallery() {
      if (site.gallery_source_type === 'manual') {
        if (Array.isArray(site.gallery_source_image_keys)) {
          setGalleryKeys(site.gallery_source_image_keys)
        }
        return
      }
      if (site.gallery_source_type === 'gallery' && site.gallery_source_gallery_id) {
        const { data, error } = await supabase
          .from('gallery_images')
          .select('preview_r2_key')
          .eq('gallery_id', site.gallery_source_gallery_id)
          .is('deleted_at', null)
          .order('sort_order', { ascending: true })
        if (!cancelled && !error && data) {
          setGalleryKeys(data.map(row => row.preview_r2_key))
        }
      }
    }
    loadGallery()
    return () => { cancelled = true }
  }, [site.gallery_source_type, site.gallery_source_gallery_id, site.gallery_source_image_keys])

  const hasHero = !!site.hero_image_key
  const hasContact = site.show_contact !== false && !!(site.contact_email || site.contact_phone || site.contact_address)
  const hasGallery = site.show_gallery !== false && galleryKeys.length > 0
  const hasPricing = site.show_pricing !== false && Array.isArray(site.packages) && site.packages.length > 0
  const hasTestimonials = site.show_testimonials !== false && Array.isArray(site.testimonials) && site.testimonials.length > 0

  const accentTextColor = getAccentTextColor(accent, theme.dark)
  // Pricing cards are always a light surface now (white on dark themes,
  // a subtle tint of the page bg on light themes) regardless of the
  // site's overall theme darkness -- computed here rather than
  // hardcoded so light themes get a theme-appropriate tint instead of
  // an arbitrary new color.
  const cardBg = theme.dark ? '#FFFFFF' : blendToward(theme.bg, theme.ink, 0.04)
  const accentButtonText = getAccentButtonTextColor(accent)
  const cssVars = {
    '--ms-accent': accent,
    '--ms-accent-text': accentTextColor,
    '--ms-accent-button-text': accentButtonText,
    '--ms-card-bg': cardBg,
    '--ms-font-display': pairing.display,
    '--ms-font-body': pairing.body,
    '--ms-font-mono': pairing.mono,
    '--ms-radius': radius,
    '--ms-bg': theme.bg,
    '--ms-ink': theme.ink,
    '--ms-paper': theme.paper,
    '--ms-slate': theme.slate,
    '--ms-line': theme.line,
    '--ms-muted': theme.muted,
  }

  return (
    <div className="ms-root" style={cssVars}>
      <nav className={`ms-nav${navScrolled ? ' ms-nav--scrolled' : ''}${forceNavSolid ? ' ms-nav--menu-solid' : ''}${!heroIsDark ? ' ms-nav--on-light' : ''}`}>
        <div className="ms-nav-inner">
          {site.logo_r2_key ? (
            <img className="ms-logo-img" src={previewUrl(navLogoKey)} alt={site.studio_name || 'Photography'} />
          ) : (
            <span className="ms-logo">{site.studio_name || 'Photography'}</span>
          )}
          <div className="ms-nav-links">
            <a href="#" className={activeSection === 'home' ? 'ms-nav-active' : ''} onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Home</a>
            {hasAbout && <a href="#about" className={activeSection === 'about' ? 'ms-nav-active' : ''}>About</a>}
            {hasGallery && <a href="#gallery" className={activeSection === 'gallery' ? 'ms-nav-active' : ''}>Gallery</a>}
            {hasPricing && <a href="#pricing" className={activeSection === 'pricing' ? 'ms-nav-active' : ''}>Pricing</a>}
            {hasTestimonials && <a href="#testimonials" className={activeSection === 'testimonials' ? 'ms-nav-active' : ''}>Reviews</a>}
            {hasContact && <a href="#contact" className={activeSection === 'contact' ? 'ms-nav-active' : ''}>Contact</a>}
          </div>
          <button
            className={`ms-mobile-burger${mobileMenuOpen ? ' ms-mobile-burger--open' : ''}`}
            style={{ color: useLightLogoNav ? '#fff' : 'var(--ms-ink)' }}
            onClick={() => setMobileMenuOpen(o => !o)}
            aria-label="Menu"
          >
            <span></span><span></span><span></span>
          </button>
        </div>

        {mobileMenuVariant === 'drawer' && (
          <div className={`ms-mobile-scrim${mobileMenuOpen ? ' ms-mobile-scrim--open' : ''}`} onClick={() => setMobileMenuOpen(false)} />
        )}

        <div className={`ms-mobile-menu ms-mobile-menu--${mobileMenuVariant}${mobileMenuOpen ? ' ms-mobile-menu--open' : ''}`}>
          {mobileMenuVariant !== 'dropdown' && (
            <button className="ms-mobile-menu-close" onClick={() => setMobileMenuOpen(false)} aria-label="Close menu">
              <span></span><span></span>
            </button>
          )}
          <a href="#" className={activeSection === 'home' ? 'ms-nav-active' : ''} onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); setMobileMenuOpen(false) }}>Home</a>
          {hasAbout && <a href="#about" className={activeSection === 'about' ? 'ms-nav-active' : ''} onClick={() => setMobileMenuOpen(false)}>About</a>}
          {hasGallery && <a href="#gallery" className={activeSection === 'gallery' ? 'ms-nav-active' : ''} onClick={() => setMobileMenuOpen(false)}>Gallery</a>}
          {hasPricing && <a href="#pricing" className={activeSection === 'pricing' ? 'ms-nav-active' : ''} onClick={() => setMobileMenuOpen(false)}>Pricing</a>}
          {hasTestimonials && <a href="#testimonials" className={activeSection === 'testimonials' ? 'ms-nav-active' : ''} onClick={() => setMobileMenuOpen(false)}>Reviews</a>}
          {hasContact && <a href="#contact" className={activeSection === 'contact' ? 'ms-nav-active' : ''} onClick={() => setMobileMenuOpen(false)}>Contact</a>}
        </div>
      </nav>

      <HeroSection variant={heroVariant} site={site} hasHero={hasHero} hasGallery={hasGallery} galleryKeys={galleryKeys} />

      {hasAbout && <AboutSection variant={aboutVariant} site={site} />}

      {hasGallery && (
        <section className="ms-gallery" id="gallery">
          <div className="ms-wrap">
            <SectionHead title={site.gallery_title} subheading={site.gallery_subheading} />
            <GallerySection variant={galleryVariant} keys={galleryKeys} onImageClick={i => setLightboxIndex(i)} focus={site.gallery_image_focus} />
          </div>
        </section>
      )}

      {hasPricing && (
        <section className="ms-pricing" id="pricing">
          <div className="ms-wrap">
            <SectionHead title={site.pricing_title} subheading={site.pricing_subheading} />
            <PricingSection variant={pricingVariant} packages={site.packages} pricingNote={site.pricing_note} />
          </div>
        </section>
      )}

      {hasTestimonials && (
        <section className="ms-testimonials" id="testimonials">
          <SectionHead title={site.testimonials_title} subheading={site.testimonials_subheading} />
          <TestimonialsSection variant={testimonialVariant} testimonials={site.testimonials} />
        </section>
      )}

      {hasContact && (
        <section className="ms-contact" id="contact">
          <SectionHead title={site.contact_title} subheading={site.contact_subheading} />
          <ContactSection variant={contactVariant} site={site} />
        </section>
      )}

      <FooterSection
        variant={footerVariant}
        site={site}
        footerLogoKey={footerLogoKey}
        hasAbout={hasAbout}
        hasGallery={hasGallery}
        hasPricing={hasPricing}
        hasTestimonials={hasTestimonials}
      />

      <button
        className={`ms-back-to-top${showBackToTop ? ' ms-back-to-top--visible' : ''}`}
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        aria-label="Back to top"
      >
        <ArrowUp size={20} />
      </button>

      {lightboxIndex !== null && galleryKeys.length > 0 && (
        <GalleryLightbox
          keys={galleryKeys}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onPrev={() => setLightboxIndex(i => (i - 1 + galleryKeys.length) % galleryKeys.length)}
          onNext={() => setLightboxIndex(i => (i + 1) % galleryKeys.length)}
        />
      )}
    </div>
  )
}

function SectionHead({ title, subheading }) {
  if (!title && !subheading) return null
  return (
    <div className="ms-shead">
      {title && <h2>{title}</h2>}
      <div className="ms-shead-divider" />
      {subheading && <p className="ms-shead-sub">{subheading}</p>}
    </div>
  )
}

function AboutStatRow({ stats }) {
  if (!stats || stats.length === 0) return null
  return (
    <div className="ms-about-stat-row">
      {stats.map((s, i) => (
        <div key={i}>
          <div className="num">{s.value}</div>
          <div className="lbl">{s.label}</div>
        </div>
      ))}
    </div>
  )
}

function AboutSection({ variant, site }) {
  if (variant === 'centered') return <AboutCentered site={site} />
  if (variant === 'banner') return <AboutBanner site={site} />
  if (variant === 'cards') return <AboutCards site={site} />
  return <AboutSplit site={site} />
}

function AboutSplit({ site }) {
  // No photo set -> the split layout has nothing for its second column,
  // so fall back to Centered rather than leaving a broken empty gap.
  if (!site.about_photo_key) return <AboutCentered site={site} />
  return (
    <section className="ms-about" id="about">
      <SectionHead title={site.about_title} subheading={site.about_subheading} />
      <div className="ms-wrap ms-about-split">
        <div className="ms-about-photo"><img src={previewUrl(site.about_photo_key)} alt="" style={{ objectPosition: `${(site.about_focus_x ?? 0.5) * 100}% ${(site.about_focus_y ?? 0.5) * 100}%` }} /></div>
        <div>
          
          <h2>{site.about_heading || 'About'}</h2>
          {site.bio && <p>{site.bio}</p>}
          <AboutStatRow stats={site.about_stats} />
        </div>
      </div>
    </section>
  )
}

function AboutCentered({ site }) {
  return (
    <section className="ms-about" id="about">
      <SectionHead title={site.about_title} subheading={site.about_subheading} />
      <div className="ms-wrap ms-about-centered">
        
        <h2>{site.about_heading || 'About'}</h2>
        {site.bio && <p>{site.bio}</p>}
        <AboutStatRow stats={site.about_stats} />
      </div>
    </section>
  )
}

function AboutBanner({ site }) {
  if (!site.about_photo_key) return <AboutCentered site={site} />
  return (
    <section className="ms-about ms-about-banner" id="about">
      <SectionHead title={site.about_title} subheading={site.about_subheading} />
      <div className="ms-wrap">
        <div className="ms-about-photo"><img src={previewUrl(site.about_photo_key)} alt="" style={{ objectPosition: `${(site.about_focus_x ?? 0.5) * 100}% ${(site.about_focus_y ?? 0.5) * 100}%` }} /></div>
        <div className="ms-about-banner-content">
          
          <h2>{site.about_heading || 'About'}</h2>
          {site.bio && <p>{site.bio}</p>}
          <AboutStatRow stats={site.about_stats} />
        </div>
      </div>
    </section>
  )
}

function AboutCards({ site }) {
  return (
    <section className="ms-about" id="about">
      <SectionHead title={site.about_title} subheading={site.about_subheading} />
      <div className="ms-wrap ms-about-cards">
        {site.about_photo_key && (
          <div className="ms-about-avatar"><img src={previewUrl(site.about_photo_key)} alt="" style={{ objectPosition: `${(site.about_focus_x ?? 0.5) * 100}% ${(site.about_focus_y ?? 0.5) * 100}%` }} /></div>
        )}
        
        <h2>{site.about_heading || 'About'}</h2>
        {site.bio && <p>{site.bio}</p>}
        {site.about_stats && site.about_stats.length > 0 && (
          <div className="ms-about-cards-row">
            {site.about_stats.map((s, i) => (
              <div className="ms-about-stat-card" key={i}>
                <div className="num">{s.value}</div>
                <div className="lbl">{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

const SOCIAL_ICON_BASE = 'https://final-vault.app/brand-icons'
const SOCIAL_PLATFORM_LABELS = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', x: 'X', youtube: 'YouTube', pinterest: 'Pinterest' }

function SocialLinksRow({ socialLinks, circle }) {
  const entries = Object.entries(socialLinks || {}).filter(([, url]) => url)
  if (entries.length === 0) return null
  return (
    <div className={`ms-social-row${circle ? ' ms-social-row--circle' : ''}`}>
      {entries.map(([platform, url]) => (
        <a key={platform} href={url} target="_blank" rel="noopener noreferrer" title={SOCIAL_PLATFORM_LABELS[platform] || platform}>
          <img src={`${SOCIAL_ICON_BASE}/${platform}.png`} alt={SOCIAL_PLATFORM_LABELS[platform] || platform} />
        </a>
      ))}
    </div>
  )
}

function ContactSection({ variant, site }) {
  if (variant === 'grid') return <ContactInfoGrid site={site} />
  if (variant === 'card') return <ContactCard site={site} />
  if (variant === 'split') return <ContactSplit site={site} />
  return <ContactSimple site={site} />
}

function ContactSimple({ site }) {
  return (
    <>
      <h2>Let's work together</h2>
      {site.contact_email && <a className="ms-btn ms-btn--primary" href={`mailto:${site.contact_email}`}>{site.contact_email}</a>}
      {site.contact_phone && <a className="ms-contact-phone" href={`tel:${site.contact_phone}`}>{site.contact_phone}</a>}
      {site.contact_address && <p className="ms-contact-simple-line">{site.contact_address}</p>}
      {site.contact_hours && <p className="ms-contact-simple-line">{site.contact_hours}</p>}
    </>
  )
}

function ContactInfoGrid({ site }) {
  return (
    <>
      <h2>Get in touch</h2>
      <div className="ms-contact-grid">
        {site.contact_email && (
          <div className="ms-contact-item">
            <Mail size={18} />
            <div><div className="lbl">Email</div><a href={`mailto:${site.contact_email}`}>{site.contact_email}</a></div>
          </div>
        )}
        {site.contact_phone && (
          <div className="ms-contact-item">
            <Phone size={18} />
            <div><div className="lbl">Phone</div><a href={`tel:${site.contact_phone}`}>{site.contact_phone}</a></div>
          </div>
        )}
        {site.contact_address && (
          <div className="ms-contact-item">
            <MapPin size={18} />
            <div><div className="lbl">Address</div><p>{site.contact_address}</p></div>
          </div>
        )}
        {site.contact_hours && (
          <div className="ms-contact-item">
            <Clock size={18} />
            <div><div className="lbl">Hours</div><p>{site.contact_hours}</p></div>
          </div>
        )}
      </div>
    </>
  )
}

function ContactCard({ site }) {
  return (
    <div className="ms-contact-card">
      <h2>Let's work together</h2>
      <div className="ms-contact-card-info">
        {site.contact_email && <p>{site.contact_email}</p>}
        {site.contact_phone && <p>{site.contact_phone}</p>}
        {site.contact_address && <p>{site.contact_address}</p>}
        {site.contact_hours && <p>{site.contact_hours}</p>}
      </div>
      {site.contact_email && <a className="ms-btn ms-btn--primary" href={`mailto:${site.contact_email}`}>Send an email</a>}
    </div>
  )
}

function ContactSplit({ site }) {
  return (
    <div className="ms-contact-split">
      <div>
        <h2>Let's work together</h2>
        {site.contact_email && <a href={`mailto:${site.contact_email}`}>{site.contact_email}</a>}
        {site.contact_phone && <a href={`tel:${site.contact_phone}`}>{site.contact_phone}</a>}
        {site.contact_address && <p>{site.contact_address}</p>}
        {site.contact_hours && <p>{site.contact_hours}</p>}
      </div>
      {site.contact_email && <a className="ms-btn ms-btn--primary ms-contact-split-cta" href={`mailto:${site.contact_email}`}>Get in touch</a>}
    </div>
  )
}

function PricingSection({ variant, packages, pricingNote }) {
  if (variant === 'cards') return <PricingCards packages={packages} pricingNote={pricingNote} />
  if (variant === 'featured') return <PricingFeatured packages={packages} pricingNote={pricingNote} />
  if (variant === 'compact') return <PricingCompact packages={packages} pricingNote={pricingNote} />
  return <PricingList packages={packages} pricingNote={pricingNote} />
}

function PricingList({ packages, pricingNote }) {
  return (
    <>
      <div className="ms-pricing-list">
        {packages.map((pkg, i) => (
          <div className="ms-pricing-row" key={i}>
            <div>
              <h3>{pkg.name}</h3>
              {pkg.description && <p>{pkg.description}</p>}
            </div>
            <div className="ms-price">{pkg.price}</div>
          </div>
        ))}
      </div>
      {pricingNote && <p className="ms-pricing-note">{pricingNote}</p>}
    </>
  )
}

function PricingCards({ packages, pricingNote }) {
  return (
    <>
      <div className="ms-pricing-cards">
        {packages.map((pkg, i) => (
          <div className="ms-pricing-card" key={i}>
            <h3>{pkg.name}</h3>
            <div className="ms-price">{pkg.price}</div>
            {pkg.description && <p>{pkg.description}</p>}
          </div>
        ))}
      </div>
      {pricingNote && <p className="ms-pricing-note">{pricingNote}</p>}
    </>
  )
}

function PricingFeatured({ packages, pricingNote }) {
  const featuredIndex = Math.floor((packages.length - 1) / 2)
  return (
    <>
      <div className="ms-pricing-cards">
        {packages.map((pkg, i) => {
          const isFeatured = packages.length > 1 && i === featuredIndex
          return (
            <div className={`ms-pricing-card${isFeatured ? ' ms-pricing-card--featured' : ''}`} key={i}>
              {isFeatured && <div className="ms-pricing-badge">Most Popular</div>}
              <h3>{pkg.name}</h3>
              <div className="ms-price">{pkg.price}</div>
              {pkg.description && <p>{pkg.description}</p>}
            </div>
          )
        })}
      </div>
      {pricingNote && <p className="ms-pricing-note">{pricingNote}</p>}
    </>
  )
}

function PricingCompact({ packages, pricingNote }) {
  return (
    <>
      <div className="ms-pricing-compact">
        {packages.map((pkg, i) => (
          <div className="ms-pricing-compact-row" key={i}>
            <span className="ms-pricing-compact-name">{pkg.name}</span>
            {pkg.description && <span className="ms-pricing-compact-desc">{pkg.description}</span>}
            <span className="ms-price">{pkg.price}</span>
          </div>
        ))}
      </div>
      {pricingNote && <p className="ms-pricing-note">{pricingNote}</p>}
    </>
  )
}

function GallerySection({ variant, keys, onImageClick, focus }) {
  if (variant === 'masonry') return <GalleryMasonry keys={keys} onImageClick={onImageClick} focus={focus} />
  if (variant === 'carousel') return <GalleryCarousel keys={keys} onImageClick={onImageClick} focus={focus} />
  if (variant === 'featured') return <GalleryFeatured keys={keys} onImageClick={onImageClick} focus={focus} />
  return <GalleryGrid keys={keys} onImageClick={onImageClick} focus={focus} />
}

function focusStyle(focus, key) {
  const f = (focus || {})[key]
  return { objectPosition: `${(f?.x ?? 0.5) * 100}% ${(f?.y ?? 0.5) * 100}%` }
}

function GalleryHoverOverlay() {
  return (
    <div className="ms-gallery-hover-overlay">
      <div className="ms-gallery-zoom-icon"><ZoomIn size={26} /></div>
    </div>
  )
}

function GalleryGrid({ keys, onImageClick, focus }) {
  return (
    <div className="ms-gallery-grid">
      {keys.map((key, i) => (
        <div className="ms-gallery-item" key={key + i} onClick={() => onImageClick(i)}>
          <img src={previewUrl(key)} alt="" loading="lazy" style={focusStyle(focus, key)} />
          <GalleryHoverOverlay />
        </div>
      ))}
    </div>
  )
}

function GalleryMasonry({ keys, onImageClick, focus }) {
  return (
    <div className="ms-gallery-masonry">
      {keys.map((key, i) => (
        <div className="ms-gallery-masonry-item" key={key + i} onClick={() => onImageClick(i)}>
          <img src={previewUrl(key)} alt="" loading="lazy" style={focusStyle(focus, key)} />
          <GalleryHoverOverlay />
        </div>
      ))}
    </div>
  )
}

function GalleryCarousel({ keys, onImageClick, focus }) {
  const scrollRef = useRef(null)
  const pausedRef = useRef(false)
  const resumeTimeoutRef = useRef(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el || keys.length < 2) return
    let rafId
    function tick() {
      if (!pausedRef.current) {
        el.scrollLeft += 0.4
        const singleSetWidth = el.scrollWidth / 2
        if (el.scrollLeft >= singleSetWidth) {
          el.scrollLeft -= singleSetWidth
        }
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [keys.length])

  function pauseThenResume() {
    pausedRef.current = true
    clearTimeout(resumeTimeoutRef.current)
    resumeTimeoutRef.current = setTimeout(() => { pausedRef.current = false }, 2500)
  }

  // Duplicate the set so the loop-reset (scrollLeft -= singleSetWidth)
  // always has a matching image already in view -- the illusion of a
  // continuous cycle rather than a visible jump back to the start.
  const displayKeys = keys.length > 1 ? [...keys, ...keys] : keys

  return (
    <div
      className="ms-gallery-carousel"
      ref={scrollRef}
      onMouseEnter={() => { pausedRef.current = true }}
      onMouseLeave={() => { pausedRef.current = false }}
      onTouchStart={pauseThenResume}
      onWheel={pauseThenResume}
    >
      {displayKeys.map((key, i) => (
        <div className="ms-gallery-carousel-item" key={key + i} onClick={() => onImageClick(i % keys.length)}>
          <img src={previewUrl(key)} alt="" loading="lazy" style={focusStyle(focus, key)} />
          <GalleryHoverOverlay />
        </div>
      ))}
    </div>
  )
}

function GalleryFeatured({ keys, onImageClick, focus }) {
  const [first, ...rest] = keys
  return (
    <div>
      {first && (
        <div className="ms-gallery-featured-main" onClick={() => onImageClick(0)}>
          <img src={previewUrl(first)} alt="" loading="lazy" style={focusStyle(focus, first)} />
          <GalleryHoverOverlay />
        </div>
      )}
      {rest.length > 0 && (
        <div className="ms-gallery-featured-grid">
          {rest.map((key, i) => (
            <div className="ms-gallery-item" key={key + i} onClick={() => onImageClick(i + 1)}>
              <img src={previewUrl(key)} alt="" loading="lazy" style={focusStyle(focus, key)} />
              <GalleryHoverOverlay />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function GalleryLightbox({ keys, index, onClose, onPrev, onNext }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') onPrev()
      if (e.key === 'ArrowRight') onNext()
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose, onPrev, onNext])

  return (
    <div className="ms-lightbox" onClick={onClose}>
      <button className="ms-lightbox-close" onClick={onClose} aria-label="Close"><X size={26} /></button>
      {keys.length > 1 && (
        <button className="ms-lightbox-prev" onClick={e => { e.stopPropagation(); onPrev() }} aria-label="Previous image"><ChevronLeft size={30} /></button>
      )}
      <img className="ms-lightbox-img" src={previewUrl(keys[index])} alt="" onClick={e => e.stopPropagation()} />
      {keys.length > 1 && (
        <button className="ms-lightbox-next" onClick={e => { e.stopPropagation(); onNext() }} aria-label="Next image"><ChevronRight size={30} /></button>
      )}
    </div>
  )
}

function FooterSection({ variant, site, footerLogoKey, hasAbout, hasGallery, hasPricing, hasTestimonials }) {
  if (variant === 'bold-dark') return <FooterBoldDark site={site} hasAbout={hasAbout} hasGallery={hasGallery} hasPricing={hasPricing} hasTestimonials={hasTestimonials} />
  if (variant === 'minimal') return <FooterMinimal site={site} footerLogoKey={footerLogoKey} hasAbout={hasAbout} hasGallery={hasGallery} hasPricing={hasPricing} hasTestimonials={hasTestimonials} />
  if (variant === 'dark-minimal') return <FooterDarkMinimal site={site} hasAbout={hasAbout} hasGallery={hasGallery} hasPricing={hasPricing} hasTestimonials={hasTestimonials} />
  return <FooterAccented site={site} footerLogoKey={footerLogoKey} hasAbout={hasAbout} hasGallery={hasGallery} hasPricing={hasPricing} hasTestimonials={hasTestimonials} />
}

function FooterAccented({ site, footerLogoKey, hasAbout, hasGallery, hasPricing, hasTestimonials }) {
  return (
    <>
      <footer className="ms-footer">
        <div className="ms-wrap ms-footer-inner">
          <div>
            {site.logo_r2_key
              ? <img className="ms-footer-logo" src={previewUrl(footerLogoKey)} alt={site.studio_name || 'Photography'} />
              : <div className="ms-footer-name">{site.studio_name || 'Photography'}</div>}
            {site.tagline && <p className="ms-footer-tagline">{site.tagline}</p>}
            <SocialLinksRow socialLinks={site.social_links} />
          </div>
          <div className="ms-footer-links">
            <div className="ms-footer-col-title ms-footer-col-title--accented">Quick Links</div>
            {hasAbout && <a href="#about">About</a>}
            {hasGallery && <a href="#gallery">Gallery</a>}
            {hasPricing && <a href="#pricing">Pricing</a>}
            {hasTestimonials && <a href="#testimonials">Reviews</a>}
          </div>
          <div className="ms-footer-contact">
            <div className="ms-footer-col-title ms-footer-col-title--accented">Contact</div>
            {site.contact_email && <a href={`mailto:${site.contact_email}`}>{site.contact_email}</a>}
            {site.contact_phone && <a href={`tel:${site.contact_phone}`}>{site.contact_phone}</a>}
            {site.contact_address && <p>{site.contact_address}</p>}
          </div>
        </div>
        <div className="ms-footer-bottom">
          <p>&copy; {new Date().getFullYear()} {site.studio_name || 'Photography'}</p>
        </div>
      </footer>
    </>
  )
}

function FooterBoldDark({ site, hasAbout, hasGallery, hasPricing, hasTestimonials }) {
  return (
    <div className="ms-footer ms-footer--bold-dark">
      <div className="ms-wrap ms-footer-inner">
        <div>
          {site.logo_r2_key
            ? <img className="ms-footer-logo" src={previewUrl(site.logo_r2_key)} alt={site.studio_name || 'Photography'} />
            : <div className="ms-footer-name">{site.studio_name || 'Photography'}</div>}
          {site.tagline && <p className="ms-footer-tagline">{site.tagline}</p>}
          <SocialLinksRow socialLinks={site.social_links} />
        </div>
        <div className="ms-footer-links">
          <div className="ms-footer-col-title ms-footer-col-title--accented">Quick Links</div>
          {hasAbout && <a href="#about">About</a>}
          {hasGallery && <a href="#gallery">Gallery</a>}
          {hasPricing && <a href="#pricing">Pricing</a>}
          {hasTestimonials && <a href="#testimonials">Reviews</a>}
        </div>
        <div className="ms-footer-contact">
          <div className="ms-footer-col-title ms-footer-col-title--accented">Contact</div>
          {site.contact_email && <a href={`mailto:${site.contact_email}`}>{site.contact_email}</a>}
          {site.contact_phone && <a href={`tel:${site.contact_phone}`}>{site.contact_phone}</a>}
          {site.contact_address && <p>{site.contact_address}</p>}
        </div>
      </div>
      <div className="ms-footer-bottom">
        <p>&copy; {new Date().getFullYear()} {site.studio_name || 'Photography'}</p>
      </div>
    </div>
  )
}

function FooterMinimal({ site, footerLogoKey, hasAbout, hasGallery, hasPricing, hasTestimonials }) {
  const hasContact = !!(site.contact_email || site.contact_phone || site.contact_address)
  return (
    <footer className="ms-footer ms-footer--minimal">
      <div className="ms-wrap ms-footer-minimal-inner">
        {site.logo_r2_key
          ? <img className="ms-footer-logo" src={previewUrl(footerLogoKey)} alt={site.studio_name || 'Photography'} />
          : <div className="ms-footer-name">{site.studio_name || 'Photography'}</div>}
        {site.tagline && <p className="ms-footer-tagline ms-footer-tagline--centered">{site.tagline}</p>}
        <div className="ms-footer-links-row">
          {hasAbout && <a href="#about">About</a>}
          {hasGallery && <a href="#gallery">Gallery</a>}
          {hasPricing && <a href="#pricing">Pricing</a>}
          {hasTestimonials && <a href="#testimonials">Reviews</a>}
          {hasContact && <a href="#contact">Contact</a>}
        </div>
        <SocialLinksRow socialLinks={site.social_links} />
      </div>
      <div className="ms-footer-bottom">
        <p>&copy; {new Date().getFullYear()} {site.studio_name || 'Photography'}</p>
      </div>
    </footer>
  )
}

function FooterDarkMinimal({ site, hasAbout, hasGallery, hasPricing, hasTestimonials }) {
  const hasContact = !!(site.contact_email || site.contact_phone || site.contact_address)
  return (
    <div className="ms-footer ms-footer--bold-dark ms-footer--minimal">
      <div className="ms-wrap ms-footer-minimal-inner">
        {site.logo_r2_key
          ? <img className="ms-footer-logo" src={previewUrl(site.logo_r2_key)} alt={site.studio_name || 'Photography'} />
          : <div className="ms-footer-name">{site.studio_name || 'Photography'}</div>}
        {site.tagline && <p className="ms-footer-tagline ms-footer-tagline--centered">{site.tagline}</p>}
        <div className="ms-footer-links-row">
          {hasAbout && <a href="#about">About</a>}
          {hasGallery && <a href="#gallery">Gallery</a>}
          {hasPricing && <a href="#pricing">Pricing</a>}
          {hasTestimonials && <a href="#testimonials">Reviews</a>}
          {hasContact && <a href="#contact">Contact</a>}
        </div>
        <SocialLinksRow socialLinks={site.social_links} />
      </div>
      <div className="ms-footer-bottom">
        <p>&copy; {new Date().getFullYear()} {site.studio_name || 'Photography'}</p>
      </div>
    </div>
  )
}

function HeroSection({ variant, site, hasHero, hasGallery, galleryKeys }) {
  if (variant === 'zoom') return <HeroZoom site={site} hasHero={hasHero} hasGallery={hasGallery} />
  if (variant === 'cycle') return <HeroCycle site={site} hasGallery={hasGallery} />
  if (variant === 'mosaic') return <HeroMosaic site={site} hasGallery={hasGallery} />
  return <HeroSingle site={site} hasHero={hasHero} hasGallery={hasGallery} />
}

function HeroButtons({ site, hasGallery }) {
  const showPrimary = site.hero_show_primary_btn !== false && !!site.contact_email
  const showSecondary = site.hero_show_secondary_btn !== false && !!hasGallery

  // Live (via get_site_by_hostname) already resolves this token
  // server-side. Preview doesn't -- it gets the raw editor state via
  // postMessage, which only has booking_signup_page_id -- so resolve
  // it client-side here whenever the token is missing but the id is
  // present. Falls back to #contact if the lookup fails or finds
  // nothing, same as when no signup page is linked at all.
  const [resolvedToken, setResolvedToken] = useState(site.booking_signup_page_token || null)
  useEffect(() => {
    if (site.booking_signup_page_token) {
      setResolvedToken(site.booking_signup_page_token)
      return
    }
    if (!site.booking_signup_page_id) {
      setResolvedToken(null)
      return
    }
    let cancelled = false
    supabase
      .rpc('get_signup_page_token', { p_id: site.booking_signup_page_id })
      .then(({ data }) => { if (!cancelled && data) setResolvedToken(data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [site.booking_signup_page_token, site.booking_signup_page_id])

  if (!showPrimary && !showSecondary) return null
  return (
    <div className="ms-hero-cta">
      {showPrimary && <a href={resolvedToken ? `/book/${resolvedToken}` : "#contact"} className="ms-btn ms-btn--primary">Book a Shoot</a>}
      {showSecondary && <a href="#gallery" className="ms-btn ms-btn--outline">View Gallery</a>}
    </div>
  )
}

function HeroSingle({ site, hasHero, hasGallery }) {
  return (
    <section className="ms-hero ms-hero--fullbleed ms-hero--centered">
      {hasHero && <img className="ms-hero-bg" src={previewUrl(site.hero_image_key)} alt="" style={{ objectPosition: `${(site.hero_focus_x ?? 0.5) * 100}% ${(site.hero_focus_y ?? 0.5) * 100}%` }} />}
      <div className="ms-hero-overlay" />
      <div className="ms-hero-content">
        {site.tagline && <div className="ms-eyebrow">{site.tagline}</div>}
        <h1>{site.hero_heading || site.studio_name || 'Photography'}</h1>
        {site.hero_subheading && <p className="ms-hero-sub">{site.hero_subheading}</p>}
        <HeroButtons site={site} hasGallery={hasGallery} />
      </div>
    </section>
  )
}

function HeroZoom({ site, hasHero, hasGallery }) {
  return (
    <section className="ms-hero ms-hero--fullbleed ms-hero--centered">
      {hasHero && <img className="ms-hero-bg ms-hero-zoom" src={previewUrl(site.hero_image_key)} alt="" style={{ objectPosition: `${(site.hero_focus_x ?? 0.5) * 100}% ${(site.hero_focus_y ?? 0.5) * 100}%` }} />}
      <div className="ms-hero-overlay" />
      <div className="ms-hero-content">
        {site.tagline && <div className="ms-eyebrow">{site.tagline}</div>}
        <h1>{site.hero_heading || site.studio_name || 'Photography'}</h1>
        {site.hero_subheading && <p className="ms-hero-sub">{site.hero_subheading}</p>}
        <HeroButtons site={site} hasGallery={hasGallery} />
      </div>
    </section>
  )
}

function HeroCycle({ site, hasGallery }) {
  const keys = Array.isArray(site.hero_cycle_image_keys) ? site.hero_cycle_image_keys.filter(Boolean) : []
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (keys.length < 2) return
    const id = setInterval(() => setIndex(i => (i + 1) % keys.length), 3500)
    return () => clearInterval(id)
  }, [keys.length])

  if (keys.length === 0) return <HeroSingle site={site} hasHero={false} hasGallery={hasGallery} />

  return (
    <section className="ms-hero ms-hero--fullbleed ms-hero--centered">
      {keys.map((key, i) => (
        <img key={key + i} className={`ms-hero-bg ms-hero-cycle-img${i === index ? ' showing' : ''}`} src={previewUrl(key)} alt=""
          style={{ objectPosition: `${((site.hero_cycle_image_focus || {})[key]?.x ?? 0.5) * 100}% ${((site.hero_cycle_image_focus || {})[key]?.y ?? 0.5) * 100}%` }} />
      ))}
      <div className="ms-hero-overlay" />
      <div className="ms-hero-content">
        {site.tagline && <div className="ms-eyebrow">{site.tagline}</div>}
        <h1>{site.hero_heading || site.studio_name || 'Photography'}</h1>
        {site.hero_subheading && <p className="ms-hero-sub">{site.hero_subheading}</p>}
        <HeroButtons site={site} hasGallery={hasGallery} />
      </div>
    </section>
  )
}

function HeroMosaic({ site, hasGallery }) {
  const keys = Array.isArray(site.hero_mosaic_image_keys) ? site.hero_mosaic_image_keys.filter(Boolean).slice(0, 15) : []
  // Size the grid to the actual photo count instead of always assuming
  // 15, then cycle (repeat) the available photos to fill every cell
  // exactly -- no empty gaps regardless of how many photos are picked.
  const count = keys.length
  const cols = count >= 12 ? 5 : count >= 6 ? 4 : count >= 3 ? 3 : count >= 2 ? 2 : 1
  const rows = count > 0 ? Math.max(1, Math.ceil(count / cols)) : 0
  const totalCells = cols * rows
  const filledKeys = count > 0 ? Array.from({ length: totalCells }, (_, i) => keys[i % count]) : []
  return (
    <section className="ms-hero ms-hero--fullbleed ms-hero--centered">
      {keys.length > 0 && (
        <div className="ms-hero-mosaic" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
          {filledKeys.map((key, i) => (
            <img key={key + i} src={previewUrl(key)} alt=""
              style={{ objectPosition: `${((site.hero_mosaic_image_focus || {})[key]?.x ?? 0.5) * 100}% ${((site.hero_mosaic_image_focus || {})[key]?.y ?? 0.5) * 100}%` }} />
          ))}
        </div>
      )}
      <div className="ms-hero-overlay ms-hero-overlay--mosaic" />
      <div className="ms-hero-content">
        {site.tagline && <div className="ms-eyebrow">{site.tagline}</div>}
        <h1>{site.hero_heading || site.studio_name || 'Photography'}</h1>
        {site.hero_subheading && <p className="ms-hero-sub">{site.hero_subheading}</p>}
        <HeroButtons site={site} hasGallery={hasGallery} />
      </div>
    </section>
  )
}

function TestimonialsSection({ variant, testimonials }) {
  if (variant === 'spotlight') return <TestimonialsSpotlight testimonials={testimonials} />
  if (variant === 'ticker') return <TestimonialsTicker testimonials={testimonials} />
  if (variant === 'paired') return <TestimonialsPaired testimonials={testimonials} />
  return <TestimonialsStack testimonials={testimonials} />
}

function TestimonialsStack({ testimonials }) {
  return (
    <div className="ms-t-grid">
      {testimonials.map((t, i) => (
        <div className="ms-t-card" key={i}>
          <p>&ldquo;{t.quote}&rdquo;</p>
          <div className="ms-t-who-row">
            {t.photo_gallery_image_key && (
              <img className="ms-t-avatar" src={previewUrl(t.photo_gallery_image_key)} alt=""
                style={{ objectPosition: `${(t.photo_focus_x ?? 0.5) * 100}% ${(t.photo_focus_y ?? 0.5) * 100}%` }} />
            )}
            <div className="ms-t-who">— {t.name}{t.session_type ? `, ${t.session_type}` : ''}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function TestimonialsSpotlight({ testimonials }) {
  const [i, setI] = useState(0)
  const t = testimonials[i % testimonials.length]
  const hasMultiple = testimonials.length > 1
  function prevT() { setI(idx => (idx - 1 + testimonials.length) % testimonials.length) }
  function nextT() { setI(idx => (idx + 1) % testimonials.length) }
  return (
    <div className="ms-t-spotlight">
      {hasMultiple && (
        <button className="ms-t-spotlight-nav ms-t-spotlight-prev" onClick={prevT} aria-label="Previous testimonial"><ChevronLeft size={22} /></button>
      )}
      {t.photo_gallery_image_key && (
        <img className="ms-t-avatar ms-t-avatar--large" src={previewUrl(t.photo_gallery_image_key)} alt=""
          style={{ objectPosition: `${(t.photo_focus_x ?? 0.5) * 100}% ${(t.photo_focus_y ?? 0.5) * 100}%` }} />
      )}
      <blockquote>&ldquo;{t.quote}&rdquo;</blockquote>
      <div className="ms-t-who">{t.name}{t.session_type ? ` — ${t.session_type}` : ''}</div>
      {hasMultiple && (
        <>
          <button className="ms-t-spotlight-nav ms-t-spotlight-next" onClick={nextT} aria-label="Next testimonial"><ChevronRight size={22} /></button>
          <div className="ms-t-dots">
            {testimonials.map((_, idx) => (
              <span key={idx} className={idx === i ? 'active' : ''} onClick={() => setI(idx)} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function TestimonialsTicker({ testimonials }) {
  const doubled = [...testimonials, ...testimonials]
  return (
    <div className="ms-t-ticker-wrap">
      <div className="ms-t-ticker-track">
        {doubled.map((t, i) => (
          <div className="ms-t-ticker-item" key={i}>
            <p>&ldquo;{t.quote}&rdquo;</p>
            <div className="ms-t-who-row">
              {t.photo_gallery_image_key && (
                <img className="ms-t-avatar ms-t-avatar--small" src={previewUrl(t.photo_gallery_image_key)} alt=""
                  style={{ objectPosition: `${(t.photo_focus_x ?? 0.5) * 100}% ${(t.photo_focus_y ?? 0.5) * 100}%` }} />
              )}
              <div className="ms-t-who">{t.name}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TestimonialsPaired({ testimonials }) {
  return (
    <div className="ms-t-paired-grid">
      {testimonials.map((t, i) => (
        <div className="ms-t-paired" key={i}>
          {t.photo_gallery_image_key && (
            <figure><img src={previewUrl(t.photo_gallery_image_key)} alt=""
              style={{ objectPosition: `${(t.photo_focus_x ?? 0.5) * 100}% ${(t.photo_focus_y ?? 0.5) * 100}%` }} /></figure>
          )}
          <div className="ms-t-paired-body">
            <p>&ldquo;{t.quote}&rdquo;</p>
            <div className="ms-t-who">{t.name}{t.session_type ? ` — ${t.session_type}` : ''}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
