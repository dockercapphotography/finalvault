import { useEffect } from 'react'

// Locks background scroll while `active` is true.
//
// `overflow: hidden` on <body> alone is NOT sufficient on mobile Safari --
// iOS still allows touch-driven scrolling of the document underneath a
// fixed-position overlay even when body reports overflow: hidden. This
// hook additionally blocks touchmove at the document level unless the
// touch's target sits inside a genuinely scrollable ancestor (an element
// with overflow-y: auto/scroll AND actual overflow content), so a modal's
// own internal scrollable list/body still scrolls normally while
// everything behind it is truly locked. Centralized here so every
// consumer (BottomSheet, PickerModal, MovePickerModal, etc.) gets real
// scroll-lock automatically instead of each needing its own workaround.
export function useScrollLock(active) {
  useEffect(() => {
    if (!active) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function isWithinScrollable(target) {
      let el = target
      while (el && el !== document.body) {
        const style = window.getComputedStyle(el)
        if (
          (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
          el.scrollHeight > el.clientHeight
        ) {
          return true
        }
        el = el.parentElement
      }
      return false
    }

    function blockTouch(e) {
      // Only block if it's actually a move (not a tap)
      if (e.cancelable === false) return
      if (isWithinScrollable(e.target)) return
      e.preventDefault()
    }

    document.addEventListener('touchmove', blockTouch, { passive: false })

    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('touchmove', blockTouch)
    }
  }, [active])
}
