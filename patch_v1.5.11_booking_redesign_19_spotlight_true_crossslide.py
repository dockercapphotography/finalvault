#!/usr/bin/env python3
"""
Patch v1.5.11 -- step 19: replace the Spotlight transition's whole
mechanism, not just its timing/easing.

Nick pointed at https://photography-website-theme.netlify.app/ as the
feel he's after. That site's testimonial section turned out to be a
stock Bootstrap Carousel (`class="carousel slide"`, `data-bs-ride`) --
confirmed by fetching its HTML and CSS directly rather than guessing.
Bootstrap's carousel gets its smoothness from a fundamentally different
technique than what steps 16-18 built: it keeps BOTH the outgoing and
incoming slide in the DOM at once, side by side in a track twice the
viewport width, and animates a single `transform: translateX(...)` on
that track over the whole transition -- so the old slide visibly and
fully travels off one edge as the new one arrives from the other, both
moving together the entire time.

Steps 16-18 instead used React's key={i} to REMOUNT the content on every
change -- the outgoing testimonial's DOM node was destroyed instantly
(no exit animation at all) while only the incoming one played an
entrance animation. No amount of duration/easing tuning fixes that,
because the actual defect is architectural: there was never a real
"outgoing" element to animate in the first place. That's this patch --
a genuine two-panel cross-slide, matching the reference site's technique
rather than approximating its look:

  - On next/prev (or a dot jump), the track temporarily holds exactly
    the two testimonials involved (old + new), positioned instantly
    (no transition) so the old one is exactly where it already was --
    then, two animation frames later (so the browser has painted that
    starting position first), the track's transform animates to the
    resting position for the new pair over 600ms with an ease-in-out
    curve, matching Bootstrap's own carousel timing. Both testimonials
    are visibly on screen and moving for the full 600ms.
  - When that transform transition ends, the component drops back to
    holding just the one current testimonial (track back to a single
    100%-wide slide, no transition) -- so it's not carrying a second,
    invisible copy around at rest.
  - Rapid clicking mid-transition is ignored (matching how most
    carousels, Bootstrap's included, behave) rather than trying to
    interrupt and re-target an in-flight animation.

One file:

  MODIFIED src/components/microsite/MicrositeRenderer.jsx --
  TestimonialsSpotlight rewritten around this track mechanism.
  MODIFIED src/components/microsite/MicrositeRenderer.css -- replaces
  step 18's keyframe-based slide-in with the track/wrap/slide layout
  rules the new mechanism needs.

Requires step 18 already applied. Run from the repo root. Idempotent --
safe to run twice.

Next steps after patching:
  1. npx eslint src/components/microsite/MicrositeRenderer.jsx
  2. npm run build
  3. Check a Spotlight testimonial section with 3+ reviews of noticeably
     different lengths: next/prev/dots should now show BOTH the outgoing
     and incoming review sliding together for the full transition, with
     the outgoing one fully leaving the visible area rather than
     vanishing. Try clicking again rapidly mid-slide -- should just be
     ignored until the current transition finishes, not glitch.
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


patch_file("src/components/microsite/MicrositeRenderer.jsx", [
    (
        '''function TestimonialsSpotlight({ testimonials }) {
  const [i, setI] = useState(0)
  // Which way the content should slide in from -- 1 (from the right)
  // for "next", -1 (from the left) for "prev" -- set right before the
  // index change that triggers it, so the CSS class below (applied
  // alongside key={i}, which is what actually triggers the animation
  // by remounting the content) matches whichever direction the visitor
  // navigated, rather than always animating the same way.
  const [dir, setDir] = useState(1)
  const t = testimonials[i % testimonials.length]
  const hasMultiple = testimonials.length > 1
  function prevT() { setDir(-1); setI(idx => (idx - 1 + testimonials.length) % testimonials.length) }
  function nextT() { setDir(1); setI(idx => (idx + 1) % testimonials.length) }
  return (
    <div className="ms-t-spotlight">
      {/* Prev/next used to be absolutely positioned against the WHOLE
          container below (avatar+quote+name+dots), whose total height
          changes with every testimonial's quote length -- that's what
          made the arrows visibly jump between slides. Making them flex
          siblings of just the content block means they're always
          centered against the current testimonial's own content, not
          an anchor that includes the dots row underneath it. */}
      <div className="ms-t-spotlight-row">
        {hasMultiple && (
          <button className="ms-t-spotlight-nav ms-t-spotlight-prev" onClick={prevT} aria-label="Previous testimonial"><ChevronLeft size={20} /></button>
        )}
        {/* key={i} remounts this on every slide change, which is what
            actually triggers the fade/slide-in CSS animation below --
            without a key change React just mutates the same DOM nodes'
            text/src in place and nothing animates. */}
        <div className={`ms-t-spotlight-content ms-t-spotlight-content--${dir === 1 ? 'next' : 'prev'}`} key={i}>
          {t.photo_gallery_image_key && (
            <img className="ms-t-avatar ms-t-avatar--large" src={previewUrl(t.photo_gallery_image_key)} alt=""
              style={{ objectPosition: `${(t.photo_focus_x ?? 0.5) * 100}% ${(t.photo_focus_y ?? 0.5) * 100}%` }} />
          )}
          <blockquote>&ldquo;{t.quote}&rdquo;</blockquote>
          <div className="ms-t-who">{t.name}{t.session_type ? ` — ${t.session_type}` : ''}</div>
        </div>
        {hasMultiple && (
          <button className="ms-t-spotlight-nav ms-t-spotlight-next" onClick={nextT} aria-label="Next testimonial"><ChevronRight size={20} /></button>
        )}
      </div>
      {hasMultiple && (
        <div className="ms-t-dots">
          {testimonials.map((_, idx) => (
            <span key={idx} className={idx === i ? 'active' : ''} onClick={() => { setDir(idx > i ? 1 : -1); setI(idx) }} />
          ))}
        </div>
      )}
    </div>
  )
}''',
        '''function TestimonialsSpotlight({ testimonials }) {
  const [index, setIndex] = useState(0)
  // Non-null exactly while a slide transition is in flight: the two
  // testimonials involved (fromT = the one being left, toT = the one
  // arriving), which direction, and whether the "animate" flip has
  // happened yet (see goTo below for why that's a separate step).
  const [transition, setTransition] = useState(null)
  const trackRef = useRef(null)
  const hasMultiple = testimonials.length > 1
  const current = testimonials[index % testimonials.length]

  function renderCard(t) {
    return (
      <div className="ms-t-spotlight-content">
        {t.photo_gallery_image_key && (
          <img className="ms-t-avatar ms-t-avatar--large" src={previewUrl(t.photo_gallery_image_key)} alt=""
            style={{ objectPosition: `${(t.photo_focus_x ?? 0.5) * 100}% ${(t.photo_focus_y ?? 0.5) * 100}%` }} />
        )}
        <blockquote>&ldquo;{t.quote}&rdquo;</blockquote>
        <div className="ms-t-who">{t.name}{t.session_type ? ` — ${t.session_type}` : ''}</div>
      </div>
    )
  }

  function goTo(nextIndex, dir) {
    if (transition) return // a transition's already running -- ignore, don't try to interrupt/re-target it
    const fromT = current
    const toT = testimonials[nextIndex % testimonials.length]
    setTransition({ fromT, toT, dir, animate: false })
    setIndex(nextIndex)
    // Two animation frames before flipping to the "end" position: the
    // first commits the "start" position (transition disabled, so it's
    // just a plain instant style change matching what was already on
    // screen) and lets the browser actually PAINT it; only then do we
    // turn the transition on and move to the end position. Flipping
    // both in the same tick risks the browser coalescing them into one
    // paint with no visible animation at all.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTransition(prev => (prev ? { ...prev, animate: true } : prev))
      })
    })
  }

  function prevT() { goTo((index - 1 + testimonials.length) % testimonials.length, -1) }
  function nextT() { goTo((index + 1) % testimonials.length, 1) }

  function onTrackTransitionEnd(e) {
    if (e.target !== trackRef.current || e.propertyName !== 'transform') return
    setTransition(null)
  }

  // Exactly 2 slides while transitioning (old + new, ordered so the
  // visible motion matches the arrow/dot used), 1 at rest -- both
  // testimonials are actually on screen and moving together for the
  // whole transition, matching how the reference site's Bootstrap
  // carousel does it, rather than the outgoing one just vanishing.
  const slides = transition
    ? (transition.dir === 1 ? [transition.fromT, transition.toT] : [transition.toT, transition.fromT])
    : [current]
  const trackStyle = transition
    ? {
        width: '200%',
        transform: transition.animate
          ? (transition.dir === 1 ? 'translateX(-50%)' : 'translateX(0%)')
          : (transition.dir === 1 ? 'translateX(0%)' : 'translateX(-50%)'),
        transition: transition.animate ? 'transform .6s cubic-bezier(0.25, 0.46, 0.45, 0.94)' : 'none',
      }
    : { width: '100%', transform: 'translateX(0%)', transition: 'none' }

  return (
    <div className="ms-t-spotlight">
      {/* Prev/next are flex siblings of the track (not absolutely
          positioned against the whole section), so they stay centered
          against the current testimonial's own content rather than a
          taller anchor that also includes the dots row below. */}
      <div className="ms-t-spotlight-row">
        {hasMultiple && (
          <button className="ms-t-spotlight-nav ms-t-spotlight-prev" onClick={prevT} aria-label="Previous testimonial"><ChevronLeft size={20} /></button>
        )}
        <div className="ms-t-spotlight-track-wrap">
          <div className="ms-t-spotlight-track" ref={trackRef} style={trackStyle} onTransitionEnd={onTrackTransitionEnd}>
            {slides.map((t, idx) => (
              <div className="ms-t-spotlight-slide" key={idx} style={{ flex: `0 0 ${100 / slides.length}%` }}>
                {renderCard(t)}
              </div>
            ))}
          </div>
        </div>
        {hasMultiple && (
          <button className="ms-t-spotlight-nav ms-t-spotlight-next" onClick={nextT} aria-label="Next testimonial"><ChevronRight size={20} /></button>
        )}
      </div>
      {hasMultiple && (
        <div className="ms-t-dots">
          {testimonials.map((_, idx) => (
            <span key={idx} className={idx === index ? 'active' : ''} onClick={() => idx !== index && goTo(idx, idx > index ? 1 : -1)} />
          ))}
        </div>
      )}
    </div>
  )
}''',
        1,
    ),
])

patch_file("src/components/microsite/MicrositeRenderer.css", [
    (
        '''/* Directional slide on every slide change -- keyed on the active index
   in the JSX (key={i}), so React remounts this wrapper and the browser
   replays the animation, with the direction (--next slides in from the
   right, --prev from the left) matching whichever arrow or dot the
   visitor actually used. */
.ms-t-spotlight-content--next { animation: ms-t-spotlight-slide-next .4s ease; }
.ms-t-spotlight-content--prev { animation: ms-t-spotlight-slide-prev .4s ease; }
@keyframes ms-t-spotlight-slide-next {
  from { opacity: 0; transform: translateX(28px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes ms-t-spotlight-slide-prev {
  from { opacity: 0; transform: translateX(-28px); }
  to { opacity: 1; transform: translateX(0); }
}
.ms-t-dots { display: flex; justify-content: center; gap: 8px; margin-top: 36px; }''',
        '''.ms-t-dots { display: flex; justify-content: center; gap: 8px; margin-top: 36px; }''',
        1,
    ),
    (
        '''.ms-t-spotlight-row { display: flex; align-items: center; justify-content: center; gap: 28px; overflow: hidden; }
.ms-t-spotlight-content { flex: 1 1 auto; min-width: 0; max-width: 680px; }''',
        '''.ms-t-spotlight-row { display: flex; align-items: center; justify-content: center; gap: 28px; }
/* The actual cross-slide: track-wrap is the visible window (clips the
   off-screen slide, holds the reading-width cap), track is what
   JS/inline styles resize to 200% and translate during a transition,
   and each slide gets an inline flex-basis of 100%/slides.length so
   the math works whether there's 1 slide (rest) or 2 (mid-transition)
   without a separate CSS rule per state. */
.ms-t-spotlight-track-wrap { flex: 1 1 auto; min-width: 0; max-width: 680px; overflow: hidden; }
.ms-t-spotlight-track { display: flex; }
.ms-t-spotlight-slide { min-width: 0; }
.ms-t-spotlight-content { width: 100%; }''',
        1,
    ),
])
