#!/usr/bin/env python3
"""
Patch v1.5.11 -- step 16: fix six live bugs on the current site, reported
by Nick, unrelated to the booking-page redesign arc itself (steps 1-15)
but folded into this same release since they're live issues, not new
features -- the actual new-feature asks from the same conversation
(testimonial listing redesign/pagination/reorder, testimonial photo
upload, delete/hide signups, recurring date-range slot generation, the
new inquiry-style signup type) are intentionally NOT in this patch --
those are v1.5.12 work.

Six fixes, all in the microsite renderer/editor (Testimonials + General
UI items) -- no Session Adjustments items are in this patch, those are
all v1.5.12 features, not bugs:

  1. Testimonials "Spotlight": abrupt slide swap -> CSS fade/slide-in
     transition, keyed on the active index so each swap re-triggers it.
  2. Testimonials "Ticker": fixed 30s scroll animation regardless of
     content length meant more testimonials = faster scroll (same
     distance-per-time, more distance to cover) -> duration now computed
     from the track's actual measured width so scroll SPEED stays
     constant instead of the total loop TIME.
  3. Testimonials "Stack"/"Photo-Paired": an incomplete testimonial
     (added via "Add testimonial" in the editor, never filled in with a
     quote + name, and never removed) was rendered on the PUBLIC site --
     showing an empty '""' quote and a bare '--' where the name would be.
     This wasn't a grid-padding artifact (there's no placeholder-padding
     logic in the renderer) -- it was real, incomplete data leaking
     through, since hasTestimonials/the render list only checked
     testimonials.length > 0, not completeness. Now filtered to only
     testimonials with both a quote and a name. Also converts both
     grids from a fixed 3-column CSS grid (which left-aligns a partial
     last row) to flex-wrap + centered, so a non-multiple-of-3 count
     (now only ever REAL testimonials, post-filter) centers its last
     row instead of hugging the left edge.
  4. "Choose from Gallery" pickers (testimonial photo, and the other
     gallery-image pickers sharing this pattern): thumbnails loaded
     slowly because each one was fetched with an authenticated
     fetch()+blob()+createObjectURL() call, one at a time in a serial
     loop -- N images meant N sequential round-trips, and blob: URLs
     bypass the browser's HTTP cache entirely. Not a missing
     thumbnail/resize endpoint (there isn't one -- the worker only ever
     serves the full preview). Switched both pickers to the same
     ?token=<jwt> <img src> pattern GalleryGrid.jsx already uses for the
     main dashboard grid (the worker's /preview/:key handler already
     supports a ?token= query param specifically for <img> tags) --
     the browser now loads every thumbnail in parallel with normal
     caching, and lazy-loads them.
  5. Testimonials section header (title/subheading) sat flush to the
     viewport edge on narrow screens while the content grid below it
     kept its 32px gutter -- Gallery/Pricing don't have this because
     their SectionHead shares a padded wrapper with their content;
     Testimonials' SectionHead is a direct child of the bare <section>.
     Scoped fix: give the testimonials section's header its own
     matching 32px horizontal padding.
  6. Several section containers maxed out around 640-680px while
     sibling containers (the shared .ms-wrap, the testimonial grids)
     already use 1180px -- widened the layout-container instances
     (Testimonials Spotlight, every section's header block, the
     Pricing list/compact layouts, the Contact grid) to 1180px to
     match. Left narrow body-text columns alone on purpose (About's
     paragraph text, the Contact card's text, footer tagline, etc.) --
     per Nick's own call: widening those would make single paragraphs
     stretch into much longer, harder-to-read lines instead of fixing
     anything. About's own two 680px containers are untouched for the
     same reason -- not in this patch's scope, revisit separately if
     they turn out to need it too.

Five files:

  MODIFIED src/components/microsite/MicrositeRenderer.jsx -- items 1, 2,
  3, 5's data-filtering half.
  MODIFIED src/components/microsite/MicrositeRenderer.css -- items 1
  (keyframes), 2 (n/a, duration is inline now), 3 (grid->flex), 5, 6.
  MODIFIED src/components/microsite/MicrositeGalleryImagesPicker.jsx --
  item 4.
  MODIFIED src/components/microsite/MicrositeImagePicker.jsx -- item 4.

Run from the repo root. Idempotent -- safe to run twice.

Next steps after patching:
  1. npx eslint src/components/microsite/MicrositeRenderer.jsx src/components/microsite/MicrositeRenderer.css src/components/microsite/MicrositeGalleryImagesPicker.jsx src/components/microsite/MicrositeImagePicker.jsx
  2. npm run build
  3. Manually check a microsite with each testimonial layout (Stack,
     Spotlight, Ticker, Photo-Paired), including one with an incomplete
     testimonial left in the editor, and the testimonial photo /
     cover-image "Choose from Gallery" picker's load speed.
  4. Playwright gate per dev-workflow.md before deploy.
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


# ---------------------------------------------------------------------------
# 1. MicrositeRenderer.jsx -- items 1 (spotlight transition), 2 (ticker
#    speed), 3 (filter incomplete testimonials + pass filtered list down)
# ---------------------------------------------------------------------------

patch_file("src/components/microsite/MicrositeRenderer.jsx", [
    (
        '''  const hasTestimonials = site.show_testimonials !== false && Array.isArray(site.testimonials) && site.testimonials.length > 0''',
        '''  // Only testimonials with BOTH a quote and a name count as real --
  // an incomplete one (added via "Add testimonial" in the editor, never
  // finished, never removed) used to render on the public site as an
  // empty '""' quote and a bare name line. Filtering here, once, means
  // every layout variant below (and the nav's Reviews link, and the
  // footer's) all agree on what "having testimonials" means.
  const visibleTestimonials = Array.isArray(site.testimonials)
    ? site.testimonials.filter(t => t && t.quote && t.name)
    : []
  const hasTestimonials = site.show_testimonials !== false && visibleTestimonials.length > 0''',
        1,
    ),
    (
        '''      {hasTestimonials && (
        <section className="ms-testimonials" id="testimonials">
          <SectionHead title={site.testimonials_title} subheading={site.testimonials_subheading} />
          <TestimonialsSection variant={testimonialVariant} testimonials={site.testimonials} />
        </section>
      )}''',
        '''      {hasTestimonials && (
        <section className="ms-testimonials" id="testimonials">
          <SectionHead title={site.testimonials_title} subheading={site.testimonials_subheading} />
          <TestimonialsSection variant={testimonialVariant} testimonials={visibleTestimonials} />
        </section>
      )}''',
        1,
    ),
    (
        '''function TestimonialsStack({ testimonials }) {
  return (
    <div className="ms-t-grid">
      {testimonials.map((t, i) => (
        <div className="ms-t-card" key={i}>''',
        '''function TestimonialsStack({ testimonials }) {
  return (
    <div className="ms-t-grid">
      {testimonials.map((t, i) => (
        <div className="ms-t-card ms-t-flex-item" key={i}>''',
        1,
    ),
    (
        '''function TestimonialsSpotlight({ testimonials }) {
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
      {hasMultiple && (''',
        '''function TestimonialsSpotlight({ testimonials }) {
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
      {/* key={i} remounts this on every slide change, which is what
          actually triggers the fade/slide-in CSS animation below --
          without a key change React just mutates the same DOM nodes'
          text/src in place and nothing animates. */}
      <div className="ms-t-spotlight-content" key={i}>
        {t.photo_gallery_image_key && (
          <img className="ms-t-avatar ms-t-avatar--large" src={previewUrl(t.photo_gallery_image_key)} alt=""
            style={{ objectPosition: `${(t.photo_focus_x ?? 0.5) * 100}% ${(t.photo_focus_y ?? 0.5) * 100}%` }} />
        )}
        <blockquote>&ldquo;{t.quote}&rdquo;</blockquote>
        <div className="ms-t-who">{t.name}{t.session_type ? ` — ${t.session_type}` : ''}</div>
      </div>
      {hasMultiple && (''',
        1,
    ),
    (
        '''function TestimonialsTicker({ testimonials }) {
  const doubled = [...testimonials, ...testimonials]
  return (
    <div className="ms-t-ticker-wrap">
      <div className="ms-t-ticker-track">
        {doubled.map((t, i) => (''',
        '''function TestimonialsTicker({ testimonials }) {
  const doubled = [...testimonials, ...testimonials]
  const trackRef = useRef(null)
  // A fixed 30s animation (see the CSS keyframe) covers a FIXED time
  // regardless of how much content there is -- since the track's width
  // grows with testimonials.length (doubled), more testimonials meant
  // more pixels covered in the same 30s, i.e. it visibly sped up. Basing
  // the duration on the track's actual measured width instead keeps the
  // scroll SPEED (px/sec) constant no matter how many testimonials there
  // are -- a short list and a long list both drift by at the same pace,
  // just for a proportionally longer loop.
  const [duration, setDuration] = useState(Math.max(20, testimonials.length * 6))
  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    const PX_PER_SECOND = 45
    // translateX(-50%) in the CSS keyframe travels exactly half of the
    // doubled track's width -- that's the true loop distance.
    const loopWidth = el.scrollWidth / 2
    if (loopWidth > 0) setDuration(Math.max(20, loopWidth / PX_PER_SECOND))
  }, [testimonials.length])
  return (
    <div className="ms-t-ticker-wrap">
      <div className="ms-t-ticker-track" ref={trackRef} style={{ animationDuration: `${duration}s` }}>
        {doubled.map((t, i) => (''',
        1,
    ),
    (
        '''function TestimonialsPaired({ testimonials }) {
  return (
    <div className="ms-t-paired-grid">
      {testimonials.map((t, i) => (
        <div className="ms-t-paired" key={i}>''',
        '''function TestimonialsPaired({ testimonials }) {
  return (
    <div className="ms-t-paired-grid">
      {testimonials.map((t, i) => (
        <div className="ms-t-paired ms-t-flex-item" key={i}>''',
        1,
    ),
])


# ---------------------------------------------------------------------------
# 2. MicrositeRenderer.css -- items 1 (spotlight fade keyframes), 3 (grid
#    -> flex-wrap + centered), 5 (testimonials header padding), 6
#    (640/680 -> 1180 for layout containers only)
# ---------------------------------------------------------------------------

patch_file("src/components/microsite/MicrositeRenderer.css", [
    (
        '''.ms-t-grid { max-width: 1180px; margin: 0 auto; padding: 0 32px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 28px; }''',
        '''.ms-t-grid { max-width: 1180px; margin: 0 auto; padding: 0 32px; display: flex; flex-wrap: wrap; justify-content: center; gap: 28px; }''',
        1,
    ),
    (
        '''.ms-t-spotlight { position: relative; max-width: 680px; margin: 0 auto; text-align: center; padding: 0 32px; }
.ms-t-spotlight blockquote { font-family: var(--ms-font-display); font-size: clamp(22px, 2.6vw, 30px); line-height: 1.5; color: var(--ms-ink); }
.ms-t-spotlight .ms-t-who { margin-top: 28px; }''',
        '''.ms-t-spotlight { position: relative; max-width: 1180px; margin: 0 auto; text-align: center; padding: 0 32px; }
.ms-t-spotlight blockquote { font-family: var(--ms-font-display); font-size: clamp(22px, 2.6vw, 30px); line-height: 1.5; color: var(--ms-ink); }
.ms-t-spotlight .ms-t-who { margin-top: 28px; }
/* Fade + slight rise on every slide change -- keyed on the active index
   in the JSX (key={i}), so React remounts this wrapper and the browser
   replays the animation each time, rather than the old instant swap. */
.ms-t-spotlight-content { animation: ms-t-spotlight-fade .45s ease; }
@keyframes ms-t-spotlight-fade {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}''',
        1,
    ),
    (
        '''.ms-t-paired-grid { max-width: 1180px; margin: 0 auto; padding: 0 32px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }''',
        '''.ms-t-paired-grid { max-width: 1180px; margin: 0 auto; padding: 0 32px; display: flex; flex-wrap: wrap; justify-content: center; gap: 24px; }
/* Both testimonial grids above are now flex-wrap (not CSS grid) so an
   incomplete last row (a testimonial count that isn't a multiple of 3)
   centers itself instead of hugging the left edge the way grid's default
   auto-placement did. Each card gets a 3-per-row flex-basis with a
   min-width floor so it still wraps sensibly on medium widths, and the
   760px mobile rule below switches to a full-width single column. */
.ms-t-flex-item { flex: 1 1 calc((100% - 56px) / 3); min-width: 260px; }''',
        1,
    ),
    (
        '''/* ---------- TESTIMONIALS ---------- */
.ms-testimonials { background: var(--ms-paper); color: var(--ms-ink); padding: 60px 0; border-top: 1px solid var(--ms-line); border-bottom: 1px solid var(--ms-line); }
.ms-testimonials .ms-eyebrow { color: #C9A96A; }
.ms-testimonials .ms-section-head h2 { color: #fff; }''',
        '''/* ---------- TESTIMONIALS ---------- */
.ms-testimonials { background: var(--ms-paper); color: var(--ms-ink); padding: 60px 0; border-top: 1px solid var(--ms-line); border-bottom: 1px solid var(--ms-line); }
.ms-testimonials .ms-eyebrow { color: #C9A96A; }
.ms-testimonials .ms-section-head h2 { color: #fff; }
/* Testimonials' SectionHead is a direct child of <section>, not wrapped
   in .ms-wrap the way Gallery/Pricing's headers are -- so on narrow
   screens it sat flush to the viewport edge while .ms-t-grid/
   .ms-t-paired-grid/.ms-t-spotlight (all padded 0 32px themselves) kept
   their gutter below it. Matching that same 32px here just for this
   section's header closes the gap without touching every other
   section's SectionHead. */
.ms-testimonials .ms-shead { padding: 0 32px; }''',
        1,
    ),
    (
        '''.ms-t-grid { max-width: 1180px; margin: 0 auto; padding: 0 32px; display: flex; flex-wrap: wrap; justify-content: center; gap: 28px; }
.ms-t-card { display: flex; flex-direction: column; background: color-mix(in srgb, var(--ms-ink) 4%, transparent); padding: 30px 26px; border: 1px solid var(--ms-line); border-radius: var(--ms-radius); }''',
        '''.ms-t-grid { max-width: 1180px; margin: 0 auto; padding: 0 32px; display: flex; flex-wrap: wrap; justify-content: center; gap: 28px; }
.ms-t-card { display: flex; flex-direction: column; background: color-mix(in srgb, var(--ms-ink) 4%, transparent); padding: 30px 26px; border: 1px solid var(--ms-line); border-radius: var(--ms-radius); box-sizing: border-box; }''',
        1,
    ),
    (
        '''.ms-t-paired { display: flex; flex-direction: column; background: color-mix(in srgb, var(--ms-ink) 3%, transparent); border: 1px solid var(--ms-line); border-radius: var(--ms-radius); overflow: hidden; }''',
        '''.ms-t-paired { display: flex; flex-direction: column; background: color-mix(in srgb, var(--ms-ink) 3%, transparent); border: 1px solid var(--ms-line); border-radius: var(--ms-radius); overflow: hidden; box-sizing: border-box; }''',
        1,
    ),
    (
        '''  .ms-t-grid, .ms-t-paired-grid { grid-template-columns: 1fr; }''',
        '''  .ms-t-flex-item { flex-basis: 100%; }''',
        1,
    ),
    (
        '''.ms-shead { text-align: center; max-width: 640px; margin: 0 auto 36px; }''',
        '''.ms-shead { text-align: center; max-width: 1180px; margin: 0 auto 36px; padding: 0; }''',
        1,
    ),
    (
        '''.ms-pricing-list { max-width: 640px; margin: 0 auto;''',
        '''.ms-pricing-list { max-width: 1180px; margin: 0 auto;''',
        1,
    ),
    (
        '''.ms-pricing-compact { max-width: 640px; margin: 0 auto;''',
        '''.ms-pricing-compact { max-width: 1180px; margin: 0 auto;''',
        1,
    ),
    (
        '''.ms-contact-grid { max-width: 640px; margin: 40px auto 0;''',
        '''.ms-contact-grid { max-width: 1180px; margin: 40px auto 0;''',
        1,
    ),
])


# ---------------------------------------------------------------------------
# 3. MicrositeGalleryImagesPicker.jsx -- item 4
# ---------------------------------------------------------------------------

patch_file("src/components/microsite/MicrositeGalleryImagesPicker.jsx", [
    (
        '''import { useState, useEffect, useRef } from 'react'
import { ChevronLeft, X, Check } from 'lucide-react'
import { getGalleries } from '../../utils/galleryApi.js'
import { getImages } from '../../utils/imageApi.js'
import { supabase } from '../../supabaseClient.js'
import SearchSelect from '../ui/SearchSelect.jsx'
import Button from '../ui/Button.jsx'

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL

async function fetchAuthedBlob(r2Key) {
  const { data: { session } } = await supabase.auth.getSession()
  const resp = await fetch(`${WORKER_URL}/preview/${encodeURIComponent(r2Key)}`, {
    headers: { Authorization: `Bearer ${session.access_token}` }
  })
  if (!resp.ok) throw new Error('Failed to fetch preview')
  return URL.createObjectURL(await resp.blob())
}''',
        '''import { useState, useEffect } from 'react'
import { ChevronLeft, X, Check } from 'lucide-react'
import { getGalleries } from '../../utils/galleryApi.js'
import { getImages } from '../../utils/imageApi.js'
import { supabase } from '../../supabaseClient.js'
import SearchSelect from '../ui/SearchSelect.jsx'
import Button from '../ui/Button.jsx'

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL''',
        1,
    ),
    (
        '''  const [images, setImages] = useState([])
  const [loadingImages, setLoadingImages] = useState(false)
  const [previewUrls, setPreviewUrls] = useState({})
  const [selectedKeys, setSelectedKeys] = useState(new Set(initialKeys))
  const blobUrlsRef = useRef([])

  useEffect(() => {
    getGalleries().then(setGalleries).catch(() => setGalleries([]))
    return () => {
      blobUrlsRef.current.forEach(url => URL.revokeObjectURL(url))
    }
  }, [])

  useEffect(() => {
    if (!selectedGallery) return
    let cancelled = false
    setLoadingImages(true)
    setImages([])

    getImages(selectedGallery).then(async imgs => {
      if (cancelled) return
      setImages(imgs)
      setLoadingImages(false)
      for (const img of imgs) {
        if (previewUrls[img.id]) continue
        try {
          const url = await fetchAuthedBlob(img.preview_r2_key)
          if (cancelled) { URL.revokeObjectURL(url); return }
          blobUrlsRef.current.push(url)
          setPreviewUrls(prev => ({ ...prev, [img.id]: url }))
        } catch { /* skip images that fail to load a preview */ }
      }
    }).catch(() => { if (!cancelled) setLoadingImages(false) })

    return () => { cancelled = true }
  }, [selectedGallery])''',
        '''  const [images, setImages] = useState([])
  const [loadingImages, setLoadingImages] = useState(false)
  const [token, setToken] = useState(null)
  const [selectedKeys, setSelectedKeys] = useState(new Set(initialKeys))

  useEffect(() => {
    getGalleries().then(setGalleries).catch(() => setGalleries([]))
    // A direct ?token=<jwt> <img src> (below) instead of an authenticated
    // fetch()+blob()+createObjectURL() per thumbnail -- same fix as
    // GalleryGrid.jsx already uses for the main dashboard grid. Fetching
    // one at a time via blob URLs was both serial (each image waited on
    // the previous one to finish before starting) and bypassed the
    // browser's HTTP cache entirely; a plain <img> URL lets the browser
    // load every thumbnail in parallel with normal caching.
    supabase.auth.getSession().then(({ data: { session } }) => {
      setToken(session?.access_token || null)
    })
  }, [])

  useEffect(() => {
    if (!selectedGallery) return
    let cancelled = false
    setLoadingImages(true)
    setImages([])

    getImages(selectedGallery).then(imgs => {
      if (cancelled) return
      setImages(imgs)
      setLoadingImages(false)
    }).catch(() => { if (!cancelled) setLoadingImages(false) })

    return () => { cancelled = true }
  }, [selectedGallery])''',
        1,
    ),
    (
        '''                {images.map(img => {
                  const isSelected = selectedKeys.has(img.preview_r2_key)
                  return (
                    <button
                      key={img.id}
                      onClick={() => toggle(img.preview_r2_key)}
                      className="relative aspect-square rounded-lg overflow-hidden"
                      style={{
                        background: 'var(--surface-raised)',
                        padding: 0,
                        cursor: previewUrls[img.id] ? 'pointer' : 'default',
                        outline: isSelected ? '2px solid #6366f1' : '2px solid transparent',
                        outlineOffset: 2,
                      }}
                    >
                      {previewUrls[img.id]
                        ? <img src={previewUrls[img.id]} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full animate-pulse" style={{ background: 'var(--surface-raised)' }} />}
                      {isSelected && (''',
        '''                {images.map(img => {
                  const isSelected = selectedKeys.has(img.preview_r2_key)
                  const previewSrc = token ? `${WORKER_URL}/preview/${encodeURIComponent(img.preview_r2_key)}?token=${token}` : null
                  return (
                    <button
                      key={img.id}
                      onClick={() => toggle(img.preview_r2_key)}
                      className="relative aspect-square rounded-lg overflow-hidden"
                      style={{
                        background: 'var(--surface-raised)',
                        padding: 0,
                        cursor: previewSrc ? 'pointer' : 'default',
                        outline: isSelected ? '2px solid #6366f1' : '2px solid transparent',
                        outlineOffset: 2,
                      }}
                    >
                      {previewSrc
                        ? <img src={previewSrc} alt="" loading="lazy" className="w-full h-full object-cover" />
                        : <div className="w-full h-full animate-pulse" style={{ background: 'var(--surface-raised)' }} />}
                      {isSelected && (''',
        1,
    ),
])


# ---------------------------------------------------------------------------
# 4. MicrositeImagePicker.jsx -- item 4
# ---------------------------------------------------------------------------

patch_file("src/components/microsite/MicrositeImagePicker.jsx", [
    (
        '''import { useState, useEffect, useRef } from 'react'
import { ChevronLeft, X } from 'lucide-react'
import { getGalleries } from '../../utils/galleryApi.js'
import { getImages } from '../../utils/imageApi.js'
import { supabase } from '../../supabaseClient.js'
import SearchSelect from '../ui/SearchSelect.jsx'

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL

// Same pattern as FolderCard.jsx's local fetchAuthedBlob — deliberately not
// shared, see that file's own reasoning for why these small per-component
// helpers aren't worth a forced abstraction.
async function fetchAuthedBlob(r2Key) {
  const { data: { session } } = await supabase.auth.getSession()
  const resp = await fetch(`${WORKER_URL}/preview/${encodeURIComponent(r2Key)}`, {
    headers: { Authorization: `Bearer ${session.access_token}` }
  })
  if (!resp.ok) throw new Error('Failed to fetch preview')
  return URL.createObjectURL(await resp.blob())
}''',
        '''import { useState, useEffect } from 'react'
import { ChevronLeft, X } from 'lucide-react'
import { getGalleries } from '../../utils/galleryApi.js'
import { getImages } from '../../utils/imageApi.js'
import { supabase } from '../../supabaseClient.js'
import SearchSelect from '../ui/SearchSelect.jsx'

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL''',
        1,
    ),
    (
        '''  const [images, setImages] = useState([])
  const [loadingImages, setLoadingImages] = useState(false)
  const [previewUrls, setPreviewUrls] = useState({})
  const blobUrlsRef = useRef([])

  useEffect(() => {
    getGalleries().then(setGalleries).catch(() => setGalleries([]))
    return () => {
      blobUrlsRef.current.forEach(url => URL.revokeObjectURL(url))
    }
  }, [])

  useEffect(() => {
    if (!selectedGallery) return
    let cancelled = false
    setLoadingImages(true)
    setImages([])
    setPreviewUrls({})

    getImages(selectedGallery).then(async imgs => {
      if (cancelled) return
      setImages(imgs)
      setLoadingImages(false)
      // Load previews progressively rather than blocking on all of them
      for (const img of imgs) {
        try {
          const url = await fetchAuthedBlob(img.preview_r2_key)
          if (cancelled) { URL.revokeObjectURL(url); return }
          blobUrlsRef.current.push(url)
          setPreviewUrls(prev => ({ ...prev, [img.id]: url }))
        } catch { /* skip images that fail to load a preview */ }
      }
    }).catch(() => { if (!cancelled) setLoadingImages(false) })

    return () => { cancelled = true }
  }, [selectedGallery])''',
        '''  const [images, setImages] = useState([])
  const [loadingImages, setLoadingImages] = useState(false)
  const [token, setToken] = useState(null)

  useEffect(() => {
    getGalleries().then(setGalleries).catch(() => setGalleries([]))
    // Direct ?token=<jwt> <img src> instead of an authenticated
    // fetch()+blob() per thumbnail -- see
    // MicrositeGalleryImagesPicker.jsx's identical fix for the full
    // reasoning (serial loading + no browser cache with blob URLs was
    // the actual cause of the slow thumbnails, not a missing
    // resize/thumbnail endpoint -- there isn't one).
    supabase.auth.getSession().then(({ data: { session } }) => {
      setToken(session?.access_token || null)
    })
  }, [])

  useEffect(() => {
    if (!selectedGallery) return
    let cancelled = false
    setLoadingImages(true)
    setImages([])

    getImages(selectedGallery).then(imgs => {
      if (cancelled) return
      setImages(imgs)
      setLoadingImages(false)
    }).catch(() => { if (!cancelled) setLoadingImages(false) })

    return () => { cancelled = true }
  }, [selectedGallery])''',
        1,
    ),
    (
        '''                {images.map(img => (
                  <button
                    key={img.id}
                    onClick={() => { onSelect(img.preview_r2_key); onClose() }}
                    className="aspect-square rounded-lg overflow-hidden"
                    style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', padding: 0, cursor: previewUrls[img.id] ? 'pointer' : 'default' }}
                  >
                    {previewUrls[img.id]
                      ? <img src={previewUrls[img.id]} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full animate-pulse" style={{ background: 'var(--surface-raised)' }} />}
                  </button>
                ))}''',
        '''                {images.map(img => {
                  const previewSrc = token ? `${WORKER_URL}/preview/${encodeURIComponent(img.preview_r2_key)}?token=${token}` : null
                  return (
                    <button
                      key={img.id}
                      onClick={() => { onSelect(img.preview_r2_key); onClose() }}
                      className="aspect-square rounded-lg overflow-hidden"
                      style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', padding: 0, cursor: previewSrc ? 'pointer' : 'default' }}
                    >
                      {previewSrc
                        ? <img src={previewSrc} alt="" loading="lazy" className="w-full h-full object-cover" />
                        : <div className="w-full h-full animate-pulse" style={{ background: 'var(--surface-raised)' }} />}
                    </button>
                  )
                })}''',
        1,
    ),
])
