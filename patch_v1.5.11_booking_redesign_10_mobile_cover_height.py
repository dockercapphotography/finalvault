#!/usr/bin/env python3
"""
Patch v1.5.11 -- booking-page redesign, step 10: taller mobile cover.

Requires steps 1 through 9 already applied.

Feedback on step 9's overlay treatment: on mobile the cover strip (170px)
was too short to let much of a real cover photo actually show through
once the logo and its top scrim sat over it. Bumps the mobile cover's
height to 250px so there's more breathing room to see the photo. Desktop
is unaffected -- its rail already fills the full viewport height.

One file, one line:

1. MODIFIED src/components/booking/BookingHero.jsx -- the mobile
   BookingCover call's `height` prop goes from 170 to 250.

Run from the repo root, after steps 1 through 9. Idempotent -- safe to
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


patch_file("src/components/booking/BookingHero.jsx", [
    (
        "          <BookingCover pattern={pattern} imageKey={imageKey} focusX={focusX} focusY={focusY} height={170} />\n",
        "          <BookingCover pattern={pattern} imageKey={imageKey} focusX={focusX} focusY={focusY} height={250} />\n",
        1,
    ),
])
