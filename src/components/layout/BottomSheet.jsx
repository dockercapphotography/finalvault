import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useScrollLock } from '../../hooks/useScrollLock.js'

/**
 * BottomSheet — shared mobile bottom sheet component.
 *
 * Props:
 *   open        {boolean}   — controls visibility
 *   onClose     {function}  — called when user dismisses
 *   maxHeight   {string}    — CSS max-height (default '85vh')
 *   children    {node}      — sheet content
 *
 * Usage:
 *   <BottomSheet open={open} onClose={() => setOpen(false)}>
 *     <div>...content...</div>
 *   </BottomSheet>
 *
 * The sheet handles:
 *   - Slide-up/slide-down animation
 *   - Swipe-down-to-close from the drag handle
 *   - Scroll lock on the body (overflow: hidden)
 *   - overscrollBehavior: contain on the content area
 *   - Blocking touchmove on non-scrollable areas (prevents background scroll)
 *   - Backdrop click to close
 */
export default function BottomSheet({ open, onClose, maxHeight = '85vh', children }) {
  const [visible, setVisible] = useState(false)
  const sheetRef = useRef(null)
  const touchStartY = useRef(null)
  const dragY = useRef(0)

  useScrollLock(open)

  useEffect(() => {
    if (open) requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
    else setVisible(false)
  }, [open])

  // Block touchmove on non-scrollable areas to prevent background scroll
  useEffect(() => {
    if (!open || !sheetRef.current) return
    function blockTouch(e) {
      // Only block if it's actually a move (not a tap)
      if (e.cancelable === false) return
      let el = e.target
      while (el && el !== sheetRef.current) {
        const style = window.getComputedStyle(el)
        if (style.overflowY === 'auto' || style.overflowY === 'scroll') return
        el = el.parentElement
      }
      e.preventDefault()
    }
    const el = sheetRef.current
    el.addEventListener('touchmove', blockTouch, { passive: false })
    return () => el.removeEventListener('touchmove', blockTouch)
  }, [open])

  function handleClose() {
setVisible(false)
    setTimeout(onClose, 300)
  }

  if (!open) return null

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{
          background: visible ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0)',
          transition: 'background 0.3s ease',
        }}
        onClick={handleClose}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="fixed left-0 right-0 bottom-0 z-50 flex flex-col rounded-t-2xl"
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderBottom: 'none',
          maxHeight,
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        {/* Drag handle — swipe-to-close target */}
        <div
          style={{ flexShrink: 0, touchAction: 'none', paddingTop: 4, paddingBottom: 12 }}
          onTouchStart={e => {
            touchStartY.current = e.touches[0].clientY
            dragY.current = 0
            if (sheetRef.current) sheetRef.current.style.transition = 'none'
          }}
          onTouchMove={e => {
            const dy = Math.max(0, e.touches[0].clientY - (touchStartY.current ?? e.touches[0].clientY))
            dragY.current = dy
            if (sheetRef.current) sheetRef.current.style.transform = `translateY(${dy}px)`
          }}
          onTouchEnd={() => {
            if (sheetRef.current) sheetRef.current.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)'
            if (dragY.current > 80) {
              if (sheetRef.current) sheetRef.current.style.transform = 'translateY(100%)'
              setTimeout(onClose, 300)
            } else {
              if (sheetRef.current) sheetRef.current.style.transform = 'translateY(0)'
            }
            touchStartY.current = null
            dragY.current = 0
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10 }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border-strong)' }} />
          </div>
        </div>

        {/* Scrollable content area */}
        <div style={{ overflowY: 'auto', flex: 1, overscrollBehavior: 'contain' }} onTouchStart={e => e.stopPropagation()}>
          {children}
        </div>
      </div>
    </>,
    document.body
  )
}
