#!/usr/bin/env python3
"""
Patch v1.5.11 -- step 17: follow-up fixes to step 16's testimonial work,
from Nick's hands-on testing feedback. Four items, all still testimonials
(no new Session Adjustments/General UI scope creep -- those stay
v1.5.12):

  1. Editor: once you clicked "Add testimonial" there was no way out --
     the "Done" button is disabled while the entry is incomplete
     (by design, so an unfinished entry can't be marked done), but
     nothing else let you back out either, so it just sat there
     demanding input. Added a "Cancel" button next to Done: for a
     never-completed entry it removes it outright (matching the
     "falls off" behavior below); for a previously-saved entry you
     reopened to edit, it just closes the editor without deleting it.
     Also: saving the microsite now drops any still-incomplete
     testimonial from what actually gets persisted, same completeness
     rule (quote AND name) the public renderer already uses to filter
     what it shows -- so an entry left half-filled and never explicitly
     removed doesn't linger in the saved data either.
  2. Spotlight: the prev/next arrows were absolutely positioned at
     top:50% of the WHOLE .ms-t-spotlight container -- which includes
     the avatar, quote, name, AND the dots row below, whose combined
     height changes with every testimonial's quote length. That's what
     read as the buttons "moving around" while paging through -- their
     anchor point had nothing to do with where the text actually was.
     Restructured to a flex row (prev button | content | next button)
     so the arrows are always centered against just the current
     testimonial's own content, not a variable-height anchor that
     includes unrelated stuff below it. Also restyled them as filled
     circles with a visible background/border (previously bare icons
     that only got an opacity bump on hover) and gave them real gap
     spacing from the content instead of a -10px overlap.
  3. Ticker: no way to pause it to actually read a review before it
     scrolled past. Added the straightforward fix Nick suggested --
     hover pauses the animation (animation-play-state), resumes on
     mouse-out.
  4. Stack/Photo-Paired grids: step 16 switched these from CSS Grid to
     flex-wrap so an incomplete last row centers instead of hugging the
     left edge, but used flex-grow:1 on each card -- which meant a
     short last row (1-2 real cards) didn't just center, it also
     STRETCHED those remaining cards to fill the leftover row width,
     which for Photo-Paired blew its photo up huge (aspect-ratio 4/5
     scales with width). Setting flex-grow to 0 keeps every card at its
     normal one-third-row size and lets justify-content: center do the
     centering, without expanding anything to fill the gap.

Two files:

  MODIFIED src/routes/MicrositeEditor.jsx -- item 1.
  MODIFIED src/components/microsite/MicrositeRenderer.jsx -- item 2's
  markup restructure.
  MODIFIED src/components/microsite/MicrositeRenderer.css -- items 2, 3, 4.

Requires step 16 already applied. Run from the repo root. Idempotent --
safe to run twice.

Next steps after patching:
  1. npx eslint src/routes/MicrositeEditor.jsx src/components/microsite/MicrositeRenderer.jsx
  2. npm run build
  3. Manually check: start a new testimonial and confirm Cancel removes
     it; open an existing one and confirm Cancel keeps it but closes the
     form; leave one half-filled and click "Save changes" and confirm it
     doesn't end up in the saved list. Spotlight with testimonials of
     very different quote lengths -- arrows should stay put relative to
     the text instead of jumping. Ticker: hover over it and confirm it
     stops, mouse away and confirms it resumes. Stack/Photo-Paired with
     a count that leaves 1-2 in the last row -- should center at normal
     size, no oversized card/photo.
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
# 1. MicrositeEditor.jsx -- Cancel button + drop incomplete on save
# ---------------------------------------------------------------------------

patch_file("src/routes/MicrositeEditor.jsx", [
    (
        '''  function remove(i) {
    onChange(testimonials.filter((_, idx) => idx !== i))
    if (editingIndex === i) setEditingIndex(null)
  }
  function add() {
    onChange([...testimonials, { quote: '', name: '', session_type: '' }])
    setEditingIndex(testimonials.length)
  }''',
        '''  function remove(i) {
    onChange(testimonials.filter((_, idx) => idx !== i))
    if (editingIndex === i) setEditingIndex(null)
  }
  function add() {
    onChange([...testimonials, { quote: '', name: '', session_type: '' }])
    setEditingIndex(testimonials.length)
  }
  function cancel(i) {
    const t = testimonials[i]
    // A never-finished entry (started via "Add testimonial", still
    // missing a quote or name) has nothing worth keeping -- Cancel
    // removes it outright, same as if it'd never been added. A
    // previously-saved entry reopened for editing just closes back up;
    // whatever's already there stays as it was.
    if (!(t?.quote && t?.name)) {
      remove(i)
    } else {
      setEditingIndex(null)
    }
  }''',
        1,
    ),
    (
        '''            <EntryDoneButton isComplete={isComplete} onClick={() => setEditingIndex(null)} />
          </div>
        )
      })}''',
        '''            <div className="flex items-center gap-2">
              <EntryDoneButton isComplete={isComplete} onClick={() => setEditingIndex(null)} />
              <button onClick={() => cancel(i)} className="text-sm font-medium px-3 py-1.5 rounded-lg"
                style={{ background: 'none', color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        )
      })}''',
        1,
    ),
    (
        '''      const saved = await updateMyMicrosite({
        studio_name, tagline, bio, hero_image_key, contact_email,
        contact_phone, contact_address, contact_hours,
        gallery_source_type, gallery_source_gallery_id, gallery_source_image_keys,
        show_pricing, packages, pricing_note,
        testimonials, enabled, logo_r2_key,''',
        '''      // Same completeness rule (quote AND name) the public renderer
      // already applies when deciding what to show -- an entry left
      // half-filled in the editor (started, never finished, never
      // explicitly removed) shouldn't get persisted at all, not just
      // hidden on render.
      const completeTestimonials = (testimonials || []).filter(t => t && t.quote && t.name)
      const saved = await updateMyMicrosite({
        studio_name, tagline, bio, hero_image_key, contact_email,
        contact_phone, contact_address, contact_hours,
        gallery_source_type, gallery_source_gallery_id, gallery_source_image_keys,
        show_pricing, packages, pricing_note,
        testimonials: completeTestimonials, enabled, logo_r2_key,''',
        1,
    ),
])


# ---------------------------------------------------------------------------
# 2. MicrositeRenderer.jsx -- Spotlight markup restructure (prev button |
#    content | next button, all in one flex row; dots stay below the row)
# ---------------------------------------------------------------------------

patch_file("src/components/microsite/MicrositeRenderer.jsx", [
    (
        '''  return (
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
}''',
        '''  return (
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
        <div className="ms-t-spotlight-content" key={i}>
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
            <span key={idx} className={idx === i ? 'active' : ''} onClick={() => setI(idx)} />
          ))}
        </div>
      )}
    </div>
  )
}''',
        1,
    ),
])


# ---------------------------------------------------------------------------
# 3. MicrositeRenderer.css -- items 2 (row layout + circle nav buttons),
#    3 (ticker hover-pause), 4 (flex-grow: 0 on the grid cards)
# ---------------------------------------------------------------------------

patch_file("src/components/microsite/MicrositeRenderer.css", [
    (
        '''.ms-t-flex-item { flex: 1 1 calc((100% - 56px) / 3); min-width: 260px; }''',
        '''/* flex-grow: 0 (not 1) -- a short last row should CENTER via the
   parent's justify-content: center, not stretch its remaining cards to
   fill the leftover width. Photo-Paired especially: its figure is
   aspect-ratio 4/5, so growing the card's width also blows up the
   photo's height right along with it. */
.ms-t-flex-item { flex: 0 1 calc((100% - 56px) / 3); min-width: 260px; }''',
        1,
    ),
    (
        '''.ms-t-ticker-wrap { overflow: hidden; }
.ms-t-ticker-track { display: flex; width: max-content; animation: ms-t-scroll 30s linear infinite; }''',
        '''.ms-t-ticker-wrap { overflow: hidden; }
.ms-t-ticker-track { display: flex; width: max-content; animation: ms-t-scroll 30s linear infinite; }
/* Pause on hover so a reader can actually stop and finish a review
   instead of it scrolling out from under them -- resumes automatically
   on mouse-out. */
.ms-t-ticker-wrap:hover .ms-t-ticker-track { animation-play-state: paused; }''',
        1,
    ),
    (
        '''/* ---------- Spotlight nav arrows ---------- */
.ms-t-spotlight-nav {
  position: absolute; top: 50%; transform: translateY(-50%);
  background: none; border: none; cursor: pointer;
  color: var(--ms-ink); opacity: 0.5;
  display: flex; align-items: center; justify-content: center;
  width: 40px; height: 40px;
  transition: opacity .2s ease;
}
.ms-t-spotlight-nav:hover { opacity: 1; }
.ms-t-spotlight-prev { left: -10px; }
.ms-t-spotlight-next { right: -10px; }
@media (max-width: 760px) {
  .ms-t-spotlight-prev { left: 0; }
  .ms-t-spotlight-next { right: 0; }
}''',
        '''/* ---------- Spotlight nav arrows ---------- */
/* Prev button | content | next button, all one row, vertically centered
   against each other -- see the JSX comment for why this replaced the
   old absolute-positioned-against-the-whole-container approach. */
.ms-t-spotlight-row { display: flex; align-items: center; justify-content: center; gap: 28px; }
.ms-t-spotlight-content { flex: 1 1 auto; min-width: 0; max-width: 680px; }
.ms-t-spotlight-nav {
  position: static;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--ms-ink) 6%, transparent);
  border: 1px solid var(--ms-line);
  border-radius: 50%;
  cursor: pointer;
  color: var(--ms-ink); opacity: 0.7;
  display: flex; align-items: center; justify-content: center;
  width: 44px; height: 44px;
  transition: opacity .2s ease, background .2s ease;
}
.ms-t-spotlight-nav:hover { opacity: 1; background: color-mix(in srgb, var(--ms-ink) 12%, transparent); }
@media (max-width: 760px) {
  .ms-t-spotlight-row { gap: 12px; }
  .ms-t-spotlight-nav { width: 36px; height: 36px; }
}''',
        1,
    ),
])
