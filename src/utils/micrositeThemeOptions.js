// Curated microsite design options -- imported by both MicrositeEditor.jsx
// (to render the pickers) and MicrositeRenderer.jsx (to resolve a stored
// value to an actual font/color/radius). Living in one file means the two
// can never drift out of sync the way two independently-maintained lists
// could (and did, before this refactor).

export const ACCENT_SWATCHES = [
  { hex: '#B5651D', name: 'Amber' },
  { hex: '#7C5CBF', name: 'Violet' },
  { hex: '#2E7D6B', name: 'Teal' },
  { hex: '#C23B3B', name: 'Crimson' },
  { hex: '#2F5D8A', name: 'Slate Blue' },
  { hex: '#A8456B', name: 'Rose' },
  { hex: '#3F6B4A', name: 'Forest' },
  { hex: '#C08A2E', name: 'Ochre' },
  { hex: '#2A3B5C', name: 'Navy' },
  { hex: '#6B4A7A', name: 'Plum' },
]

// Tuned specifically for dark-family themes (Dark, Deep Jewel, High
// Contrast) -- brighter and warmer than the general palette above so
// they read as vibrant, intentional accents against near-black
// backgrounds instead of blending into them.
export const ACCENT_SWATCHES_DARK = [
  { hex: '#E0A639', name: 'Bright Gold' },
  { hex: '#E8735A', name: 'Coral' },
  { hex: '#4FB8A6', name: 'Cyan Teal' },
  { hex: '#A78BDB', name: 'Lavender' },
  { hex: '#D68FA0', name: 'Rose Gold' },
  { hex: '#5B9BD5', name: 'Sky Blue' },
  { hex: '#7FB88F', name: 'Sage Green' },
  { hex: '#E8956B', name: 'Warm Peach' },
  { hex: '#C77DC7', name: 'Orchid' },
  { hex: '#E8C55E', name: 'Butter Yellow' },
]

export const FONT_PAIRINGS = {
  caslon_worksans: {
    name: 'Caslon / Work Sans',
    display: "'Libre Caslon Display', serif",
    body: "'Work Sans', sans-serif",
    mono: "'Space Mono', monospace",
    googleFonts: 'family=Libre+Caslon+Display&family=Work+Sans:wght@400;500;600;700&family=Space+Mono:wght@400;700',
  },
  fraunces_nunito: {
    name: 'Fraunces / Nunito',
    display: "'Fraunces', serif",
    body: "'Nunito Sans', sans-serif",
    mono: "'Space Mono', monospace",
    googleFonts: 'family=Fraunces:opsz,wght@9..144,400;9..144,500&family=Nunito+Sans:wght@400;500;600;700&family=Space+Mono:wght@400;700',
  },
  archivo_nunito: {
    name: 'Archivo / Nunito',
    display: "'Archivo', sans-serif",
    body: "'Nunito Sans', sans-serif",
    mono: "'Space Mono', monospace",
    googleFonts: 'family=Archivo:wght@400;500;600;700&family=Nunito+Sans:wght@400;500;600;700&family=Space+Mono:wght@400;700',
  },
  cormorant_worksans: {
    name: 'Cormorant / Work Sans',
    display: "'Cormorant Garamond', serif",
    body: "'Work Sans', sans-serif",
    mono: "'Space Mono', monospace",
    googleFonts: 'family=Cormorant+Garamond:wght@500;600&family=Work+Sans:wght@400;500;600;700&family=Space+Mono:wght@400;700',
  },
  playfair_inter: {
    name: 'Playfair / Inter',
    display: "'Playfair Display', serif",
    body: "'Inter', sans-serif",
    mono: "'Space Mono', monospace",
    googleFonts: 'family=Playfair+Display:wght@500;600;700&family=Inter:wght@400;500;600;700&family=Space+Mono:wght@400;700',
  },
  bebas_dmsans: {
    name: 'Bebas / DM Sans',
    display: "'Bebas Neue', sans-serif",
    body: "'DM Sans', sans-serif",
    mono: "'Space Mono', monospace",
    googleFonts: 'family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&family=Space+Mono:wght@400;700',
  },
  ibmplex: {
    name: 'IBM Plex Serif / Sans',
    display: "'IBM Plex Serif', serif",
    body: "'IBM Plex Sans', sans-serif",
    mono: "'Space Mono', monospace",
    googleFonts: 'family=IBM+Plex+Serif:wght@500;600&family=IBM+Plex+Sans:wght@400;500;600;700&family=Space+Mono:wght@400;700',
  },
  spacegrotesk_sourcesans: {
    name: 'Space Grotesk / Source Sans',
    display: "'Space Grotesk', sans-serif",
    body: "'Source Sans 3', sans-serif",
    mono: "'Space Mono', monospace",
    googleFonts: 'family=Space+Grotesk:wght@500;600;700&family=Source+Sans+3:wght@400;500;600;700&family=Space+Mono:wght@400;700',
  },
  anton_inter: {
    name: 'Anton / Inter',
    display: "'Anton', sans-serif",
    body: "'Inter', sans-serif",
    mono: "'Space Mono', monospace",
    googleFonts: 'family=Anton&family=Inter:wght@400;500;600;700&family=Space+Mono:wght@400;700',
  },
  oswald_poppins: {
    name: 'Oswald / Poppins',
    display: "'Oswald', sans-serif",
    body: "'Poppins', sans-serif",
    mono: "'Space Mono', monospace",
    googleFonts: 'family=Oswald:wght@400;500;600;700&family=Poppins:wght@400;500;600;700&family=Space+Mono:wght@400;700',
  },
  anton_montserrat: {
    name: 'Anton / Montserrat',
    display: "'Anton', sans-serif",
    body: "'Montserrat', sans-serif",
    mono: "'Space Mono', monospace",
    googleFonts: 'family=Anton&family=Montserrat:wght@400;500;600;700&family=Space+Mono:wght@400;700',
  },
}

// Curated pools for Custom font mode -- pick a Display font and a Body
// font independently, rather than only the fixed pairings above. Still
// bounded to fonts already vetted for legibility/licensing, not an open
// search across all of Google Fonts.
export const DISPLAY_FONT_OPTIONS = [
  { id: 'caslon', name: 'Libre Caslon Display', family: "'Libre Caslon Display', serif", googleFonts: 'family=Libre+Caslon+Display' },
  { id: 'fraunces', name: 'Fraunces', family: "'Fraunces', serif", googleFonts: 'family=Fraunces:opsz,wght@9..144,400;9..144,500' },
  { id: 'cormorant', name: 'Cormorant Garamond', family: "'Cormorant Garamond', serif", googleFonts: 'family=Cormorant+Garamond:wght@500;600' },
  { id: 'playfair', name: 'Playfair Display', family: "'Playfair Display', serif", googleFonts: 'family=Playfair+Display:wght@500;600;700' },
  { id: 'archivo', name: 'Archivo', family: "'Archivo', sans-serif", googleFonts: 'family=Archivo:wght@400;500;600;700' },
  { id: 'bebas', name: 'Bebas Neue', family: "'Bebas Neue', sans-serif", googleFonts: 'family=Bebas+Neue' },
  { id: 'ibmplex_serif', name: 'IBM Plex Serif', family: "'IBM Plex Serif', serif", googleFonts: 'family=IBM+Plex+Serif:wght@500;600' },
  { id: 'spacegrotesk', name: 'Space Grotesk', family: "'Space Grotesk', sans-serif", googleFonts: 'family=Space+Grotesk:wght@500;600;700' },
  { id: 'anton', name: 'Anton', family: "'Anton', sans-serif", googleFonts: 'family=Anton' },
  { id: 'oswald', name: 'Oswald', family: "'Oswald', sans-serif", googleFonts: 'family=Oswald:wght@400;500;600;700' },
]

export const BODY_FONT_OPTIONS = [
  { id: 'worksans', name: 'Work Sans', family: "'Work Sans', sans-serif", googleFonts: 'family=Work+Sans:wght@400;500;600;700' },
  { id: 'nunito', name: 'Nunito Sans', family: "'Nunito Sans', sans-serif", googleFonts: 'family=Nunito+Sans:wght@400;500;600;700' },
  { id: 'inter', name: 'Inter', family: "'Inter', sans-serif", googleFonts: 'family=Inter:wght@400;500;600;700' },
  { id: 'dmsans', name: 'DM Sans', family: "'DM Sans', sans-serif", googleFonts: 'family=DM+Sans:wght@400;500;600;700' },
  { id: 'ibmplex_sans', name: 'IBM Plex Sans', family: "'IBM Plex Sans', sans-serif", googleFonts: 'family=IBM+Plex+Sans:wght@400;500;600;700' },
  { id: 'sourcesans', name: 'Source Sans 3', family: "'Source Sans 3', sans-serif", googleFonts: 'family=Source+Sans+3:wght@400;500;600;700' },
  { id: 'poppins', name: 'Poppins', family: "'Poppins', sans-serif", googleFonts: 'family=Poppins:wght@400;500;600;700' },
  { id: 'montserrat', name: 'Montserrat', family: "'Montserrat', sans-serif", googleFonts: 'family=Montserrat:wght@400;500;600;700' },
  { id: 'lato', name: 'Lato', family: "'Lato', sans-serif", googleFonts: 'family=Lato:wght@400;700' },
]

export const DEFAULT_CUSTOM_DISPLAY = 'caslon'
export const DEFAULT_CUSTOM_BODY = 'worksans'

export const DEFAULT_FONT_PAIRING = 'caslon_worksans'

// One combined Google Fonts request covering every pairing above, for the
// editor's Design tab -- loaded once so every option can render a real
// preview of its own typeface simultaneously, not just the selected one.
export const ALL_FONTS_HREF =
  `https://fonts.googleapis.com/css2?${[
    ...Object.values(FONT_PAIRINGS).map(p => p.googleFonts),
    ...DISPLAY_FONT_OPTIONS.map(f => f.googleFonts),
    ...BODY_FONT_OPTIONS.map(f => f.googleFonts),
  ].join('&')}&display=swap`

export const FOOTER_VARIANT_OPTIONS = [
  { id: 'accented', name: 'Theme-Matched Accented', desc: 'Follows the site theme, with accent underlines and icons' },
  { id: 'bold-dark', name: 'Bold Dark', desc: 'Always-dark footer regardless of theme, high contrast' },
  { id: 'minimal', name: 'Minimal Centered', desc: 'Quieter single-row layout, everything centered' },
  { id: 'dark-minimal', name: 'Dark Minimal Centered', desc: 'Always-dark, centered single-row layout' },
]

export const MOBILE_MENU_VARIANT_OPTIONS = [
  { id: 'fullscreen', name: 'Full-Screen Overlay', desc: 'Menu takes over the whole screen' },
  { id: 'drawer', name: 'Slide-In Drawer', desc: 'Panel slides in from the right' },
  { id: 'dropdown', name: 'Dropdown Panel', desc: 'Expands directly below the nav bar' },
]

export const THEME_OPTIONS = [
  { id: 'light', name: 'Light', bg: '#FFFFFF', ink: '#17171A', paper: '#FFFFFF', slate: '#333F3E', line: '#E7E8EC', muted: '#666A73', dark: false },
  { id: 'slate', name: 'Cool Slate', bg: '#F3F5F8', ink: '#14171C', paper: '#FFFFFF', slate: '#2A2E36', line: '#DDE1E8', muted: '#6B7280', dark: false },
  { id: 'dark', name: 'Dark', bg: '#12151F', ink: '#F5F6FA', paper: '#1A1E2B', slate: '#2A2F3F', line: '#262B3A', muted: '#B4B8C6', dark: true },
  { id: 'jewel', name: 'Deep Jewel', bg: '#14201C', ink: '#EDE7DD', paper: '#1B2B25', slate: '#26362F', line: '#26362F', muted: '#8FA396', dark: true },
  { id: 'contrast', name: 'High Contrast', bg: '#0A0A0A', ink: '#FFFFFF', paper: '#000000', slate: '#1A1A1A', line: '#FFFFFF', muted: '#8A8A8A', dark: true },
  { id: 'warm', name: 'Warm Muted', bg: '#EFE6DA', ink: '#2E241C', paper: '#F7F1E8', slate: '#4A3D30', line: '#DCCFBB', muted: '#7A6A56', dark: false },
  { id: 'blush', name: 'Blush Soft', bg: '#F7EEEC', ink: '#2B1F1D', paper: '#FFFFFF', slate: '#4A3735', line: '#E8D6D2', muted: '#8A7370', dark: false },
]
export const DEFAULT_THEME = 'light'

export const RADIUS_OPTIONS = [
  { id: 'sharp', name: 'Sharp', px: '2px' },
  { id: 'soft', name: 'Soft', px: '10px' },
  { id: 'round', name: 'Round', px: '22px' },
]
export const RADIUS_MAP = Object.fromEntries(RADIUS_OPTIONS.map(o => [o.id, o.px]))
export const DEFAULT_RADIUS = 'sharp'

export const HERO_VARIANT_OPTIONS = [
  { id: 'single', name: 'Single Image', desc: 'One photo fills the screen' },
  { id: 'zoom', name: 'Slow Zoom', desc: 'One photo with a subtle continuous zoom' },
  { id: 'cycle', name: 'Cycling Slideshow', desc: 'A few photos crossfading in sequence' },
  { id: 'mosaic', name: 'Mosaic', desc: 'A grid of your gallery photos as the backdrop' },
]

export const GALLERY_VARIANT_OPTIONS = [
  { id: 'grid', name: 'Grid', desc: 'Even 3-column grid' },
  { id: 'masonry', name: 'Masonry', desc: 'Staggered columns, natural image heights' },
  { id: 'carousel', name: 'Carousel', desc: 'Horizontal scrolling strip' },
  { id: 'featured', name: 'Featured', desc: 'One large photo, rest in a grid below' },
]

export const ABOUT_VARIANT_OPTIONS = [
  { id: 'split', name: 'Split', desc: 'Photo one side, bio and stats the other' },
  { id: 'centered', name: 'Centered', desc: 'Text and stats centered, no photo needed' },
  { id: 'banner', name: 'Banner', desc: 'Full-width photo above, content centered below' },
  { id: 'cards', name: 'Cards', desc: 'Small circular photo, stats as individual cards' },
]

export const PRICING_VARIANT_OPTIONS = [
  { id: 'list', name: 'List', desc: 'Stacked rows with a divider' },
  { id: 'cards', name: 'Cards', desc: 'Each package as its own card' },
  { id: 'featured', name: 'Featured', desc: 'Cards with the middle tier highlighted' },
  { id: 'compact', name: 'Compact', desc: 'Tight single-line entries' },
]

export const CONTACT_VARIANT_OPTIONS = [
  { id: 'simple', name: 'Simple', desc: 'Heading with an email button' },
  { id: 'grid', name: 'Info Grid', desc: 'Email, phone, address, and hours as labeled rows' },
  { id: 'card', name: 'Card', desc: 'All contact info boxed in a card' },
  { id: 'split', name: 'Split', desc: 'Info one side, a large call-to-action the other' },
]

export const TESTIMONIAL_VARIANT_OPTIONS = [
  { id: 'stack', name: 'Stack', desc: '3-card grid' },
  { id: 'spotlight', name: 'Spotlight', desc: 'One large quote with navigation dots' },
  { id: 'ticker', name: 'Ticker', desc: 'Scrolling marquee' },
  { id: 'paired', name: 'Photo-Paired', desc: "Quote beside the client's session photo" },
]
