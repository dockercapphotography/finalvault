#!/usr/bin/env python3
"""
Patch v1.5.11 -- step 18: swap the Testimonials Spotlight transition from
a plain fade to a directional slide.

Nick's read after living with step 17's fade for a bit: it still feels a
bit jerky, and he'd rather it slide in from the direction of whichever
arrow (or dot, past vs. future) was actually clicked -- right-to-left
motion for "next", left-to-right for "prev" -- rather than a same-every-
time fade. He's also flagged that the arrows still shift position between
slides of very different quote lengths, but explicitly doesn't want that
chased further right now (there's no real fix short of reserving a fixed
height regardless of content, which would leave a lot of dead space for
short quotes) -- so this patch is the slide-direction change only.

One file (JS + CSS in the same component, same commit as always):

  MODIFIED src/components/microsite/MicrositeRenderer.jsx -- tracks which
  direction the visitor navigated (prev/next arrow, or a dot to an
  earlier/later index) and applies a --next or --prev class alongside
  the existing key={i} remount-trigger.
  MODIFIED src/components/microsite/MicrositeRenderer.css -- replaces the
  single fade keyframe with two directional slide-in keyframes, and adds
  overflow: hidden to the row so the slide-in motion doesn't visually
  spill past the row's edges.

Requires step 17 already applied. Run from the repo root. Idempotent --
safe to run twice.

Next steps after patching:
  1. npx eslint src/components/microsite/MicrositeRenderer.jsx
  2. npm run build
  3. Check a Spotlight testimonial section with 3+ reviews: clicking
     "next" should slide the new one in from the right, "prev" from the
     left, and clicking a dot for an earlier/later review should slide
     in from the matching direction.
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
  const t = testimonials[i % testimonials.length]
  const hasMultiple = testimonials.length > 1
  function prevT() { setI(idx => (idx - 1 + testimonials.length) % testimonials.length) }
  function nextT() { setI(idx => (idx + 1) % testimonials.length) }''',
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
  function nextT() { setDir(1); setI(idx => (idx + 1) % testimonials.length) }''',
        1,
    ),
    (
        '''        <div className="ms-t-spotlight-content" key={i}>''',
        '''        <div className={`ms-t-spotlight-content ms-t-spotlight-content--${dir === 1 ? 'next' : 'prev'}`} key={i}>''',
        1,
    ),
    (
        '''          {testimonials.map((_, idx) => (
            <span key={idx} className={idx === i ? 'active' : ''} onClick={() => setI(idx)} />
          ))}''',
        '''          {testimonials.map((_, idx) => (
            <span key={idx} className={idx === i ? 'active' : ''} onClick={() => { setDir(idx > i ? 1 : -1); setI(idx) }} />
          ))}''',
        1,
    ),
])

patch_file("src/components/microsite/MicrositeRenderer.css", [
    (
        '''/* Fade + slight rise on every slide change -- keyed on the active index
   in the JSX (key={i}), so React remounts this wrapper and the browser
   replays the animation each time, rather than the old instant swap. */
.ms-t-spotlight-content { animation: ms-t-spotlight-fade .45s ease; }
@keyframes ms-t-spotlight-fade {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}''',
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
}''',
        1,
    ),
    (
        '''.ms-t-spotlight-row { display: flex; align-items: center; justify-content: center; gap: 28px; }''',
        '''/* overflow: hidden so the slide-in motion doesn't visually spill past
   the row's edges (into/over the nav buttons) mid-animation. */
.ms-t-spotlight-row { display: flex; align-items: center; justify-content: center; gap: 28px; overflow: hidden; }''',
        1,
    ),
])
