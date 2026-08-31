/**
 * PortalMenu — a self-contained context menu.
 *
 * Desktop: renders as a portal-positioned dropdown, unchanged from before --
 * auto-flips left/up when near viewport edges, closes on outside click,
 * Escape, and scroll.
 *
 * Mobile (< 768px): renders as a BottomSheet instead of a dropdown, since a
 * fixed-width dropdown can still run out of room to flip on a narrow
 * viewport. Items with a `children` submenu (e.g. "Move to Set", "Download"
 * -> Web Size/Original) don't expand inline -- tapping one closes the sheet
 * and opens a PickerModal (same reliable centered-modal pattern already
 * used for MovePickerModal's folder picker) with that item's children as
 * a flat option list.
 *
 * Usage (unchanged):
 *   <PortalMenu trigger={<button>•••</button>} items={[
 *     { label: 'Download', icon: <Download size={13} />, onClick: () => {} },
 *     { label: 'Delete', icon: <Trash2 size={13} />, onClick: () => {}, danger: true },
 *     { type: 'divider' },
 *     { label: 'Move to Set', icon: <FolderInput size={13} />, children: [
 *       { label: 'Set A', onClick: () => {} },
 *     ]},
 *   ]} />
 */

import { useState, useRef, useEffect, useCallback, cloneElement } from 'react'
import { createPortal } from 'react-dom'
import { useMediaQuery } from '../../hooks/useMediaQuery.js'
import BottomSheet from '../layout/BottomSheet.jsx'
import PickerModal from './PickerModal.jsx'

const MENU_WIDTH = 168
const ITEM_HEIGHT = 38
const DIVIDER_HEIGHT = 9
const PADDING = 8

function calcPosition(triggerRect, itemCount, dividers = 0) {
  const menuHeight = itemCount * ITEM_HEIGHT + dividers * DIVIDER_HEIGHT + 8
  const spaceBelow = window.innerHeight - triggerRect.bottom - PADDING
  const spaceRight = window.innerWidth - triggerRect.left - PADDING

  const left = spaceRight >= MENU_WIDTH
    ? triggerRect.left
    : Math.max(PADDING, triggerRect.right - MENU_WIDTH)

  const top = spaceBelow >= menuHeight
    ? triggerRect.bottom + 4
    : Math.max(PADDING, triggerRect.top - menuHeight - 4)

  return { top, left }
}

export default function PortalMenu({ trigger, items, triggerClassName, triggerStyle, triggerLabel }) {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const [submenuLeft, setSubmenuLeft] = useState(false)
  const [activeSubmenu, setActiveSubmenu] = useState(null)
  const [mobileSubmenuItem, setMobileSubmenuItem] = useState(null)
  const [confirmingItem, setConfirmingItem] = useState(null)
  // Resolved { title, message, confirmLabel, cancelLabel, onConfirm }
  // once an async confirm() function has finished loading -- null while
  // still loading (confirmingItem is truthy but this isn't yet).
  const [confirmData, setConfirmData] = useState(null)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const confirmRequestRef = useRef(0)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)

  const close = useCallback(() => {
    setOpen(false)
    setActiveSubmenu(null)
    setConfirmingItem(null)
    setConfirmData(null)
    setConfirmLoading(false)
    confirmRequestRef.current++
  }, [])

  useEffect(() => {
    if (!open || !isDesktop) return
    const onDown = (e) => {
      if (!menuRef.current?.contains(e.target) && !triggerRef.current?.contains(e.target)) close()
    }
    const onKey = (e) => { if (e.key === 'Escape') close() }
    const onScroll = () => close()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, isDesktop, close])

  function handleTriggerClick(e) {
    e.stopPropagation()
    e.preventDefault()
    if (open) { close(); return }
    if (!isDesktop) { setOpen(true); return }
    const rect = triggerRef.current.getBoundingClientRect()
    const itemCount = items.filter(i => i.type !== 'divider').length
    const dividers = items.filter(i => i.type === 'divider').length
    const menuLeft = calcPosition(rect, itemCount, dividers).left
    // Determine if submenus should open left (not enough space on right)
    setSubmenuLeft(menuLeft + MENU_WIDTH * 2 > window.innerWidth - PADDING)
    setPos(calcPosition(rect, itemCount, dividers))
    setOpen(true)
  }

  function handleItemClick(e, item) {
    e.stopPropagation()
    if (item.children) {
      setActiveSubmenu(activeSubmenu === item.label ? null : item.label)
      return
    }
    if (item.confirm) {
      setConfirmingItem(item)
      if (typeof item.confirm === "function") {
        const requestId = ++confirmRequestRef.current
        setConfirmLoading(true)
        setConfirmData(null)
        Promise.resolve(item.confirm())
          .then(resolved => {
            if (confirmRequestRef.current !== requestId) return // stale/cancelled
            setConfirmData(resolved)
            setConfirmLoading(false)
          })
          .catch(err => {
            if (confirmRequestRef.current !== requestId) return
            console.error("PortalMenu: confirm() failed", err)
            setConfirmLoading(false)
            setConfirmingItem(null)
          })
      } else {
        setConfirmData(item.confirm)
      }
      return
    }
    item.onClick?.()
    close()
  }

  function handleMobileItemClick(item) {
    if (item.children) {
      // Close the sheet, then open the flat-list picker modal for this
      // item's children -- matches the existing MovePickerModal pattern
      // (a reliable centered modal) rather than a cramped inline flyout.
      setOpen(false)
      setMobileSubmenuItem(item)
      return
    }
    if (item.confirm) {
      // Swap this same open sheet's content to a confirm view, rather
      // than closing and showing a separate confirm UI elsewhere.
      setConfirmingItem(item)
      if (typeof item.confirm === 'function') {
        const requestId = ++confirmRequestRef.current
        setConfirmLoading(true)
        setConfirmData(null)
        Promise.resolve(item.confirm())
          .then(resolved => {
            if (confirmRequestRef.current !== requestId) return // stale/cancelled
            setConfirmData(resolved)
            setConfirmLoading(false)
          })
          .catch(err => {
            if (confirmRequestRef.current !== requestId) return
            console.error('PortalMenu: confirm() failed', err)
            setConfirmLoading(false)
            setConfirmingItem(null) // fall back to the item list
          })
      } else {
        setConfirmData(item.confirm)
      }
      return
    }
    item.onClick?.()
    close()
  }

  function handleCancelConfirm() {
    confirmRequestRef.current++ // invalidate any in-flight confirm() call
    setConfirmingItem(null)
    setConfirmData(null)
    setConfirmLoading(false)
  }

  function handleConfirm() {
    const data = confirmData
    close()
    data?.onConfirm?.()
  }

  const trigger_ = (
    <div
      ref={triggerRef}
      className={triggerClassName}
      style={triggerStyle}
      onClick={handleTriggerClick}
      role="button"
      tabIndex={0}
      aria-label={triggerLabel}
      aria-haspopup="menu"
      aria-expanded={open}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleTriggerClick(e) } }}
    >
      {trigger}
    </div>
  )

  if (!isDesktop) {
    const gridItems = items.filter(item => item.type !== 'divider')
    return (
      <>
        {trigger_}
        <BottomSheet open={open} onClose={close}>
          {confirmingItem && confirmLoading ? (
            <div className="flex items-center justify-center" style={{ padding: '32px 16px' }}>
              <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--text-muted)', borderTopColor: 'transparent' }} />
            </div>
          ) : confirmingItem && confirmData ? (
            <div style={{ padding: '4px 16px 16px' }}>
              <p className="text-sm font-medium mb-1" style={{ color: confirmingItem.danger ? 'var(--danger)' : 'var(--text)' }}>
                {confirmData.title}
              </p>
              {confirmData.message && (
                <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>{confirmData.message}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleConfirm}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                  style={{
                    background: confirmingItem.danger ? 'var(--danger)' : 'var(--text)',
                    color: '#fff', border: 'none', cursor: 'pointer',
                  }}>
                  {confirmData.confirmLabel || 'Confirm'}
                </button>
                <button
                  onClick={handleCancelConfirm}
                  className="flex-1 py-2.5 rounded-xl text-sm"
                  style={{ background: 'var(--surface-raised)', color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                  {confirmData.cancelLabel || 'Cancel'}
                </button>
              </div>
            </div>
          ) : gridItems.length === 1 ? (
            <div style={{ padding: '4px 16px 16px' }}>
              <button
                onClick={() => handleMobileItemClick(gridItems[0])}
                className="w-full flex items-center gap-3 py-3.5 px-4 rounded-xl"
                style={{
                  background: gridItems[0].danger ? 'var(--danger-subtle)' : 'var(--bg-subtle)',
                  border: '1px solid var(--border)', cursor: 'pointer',
                }}
              >
                {gridItems[0].icon && cloneElement(gridItems[0].icon, { size: 18, style: { color: gridItems[0].danger ? 'var(--danger)' : 'var(--text)' } })}
                <span className="text-sm font-medium" style={{ color: gridItems[0].danger ? 'var(--danger)' : 'var(--text)' }}>{gridItems[0].label}</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3" style={{ padding: '4px 16px 16px' }}>
              {gridItems.map(item => (
                <button
                  key={item.label}
                  onClick={() => handleMobileItemClick(item)}
                  className="flex flex-col items-center gap-2 py-4 rounded-xl"
                  style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', cursor: 'pointer' }}
                >
                  {item.icon && cloneElement(item.icon, { size: 22, style: { color: item.danger ? 'var(--danger)' : 'var(--text)' } })}
                  <span className="text-xs font-medium text-center" style={{ color: item.danger ? 'var(--danger)' : 'var(--text-muted)' }}>{item.label}</span>
                </button>
              ))}
            </div>
          )}
        </BottomSheet>
        <PickerModal
          open={!!mobileSubmenuItem}
          onClose={() => setMobileSubmenuItem(null)}
          title={mobileSubmenuItem?.label}
          options={mobileSubmenuItem?.children ?? []}
        />
      </>
    )
  }

  return (
    <>
      {trigger_}

      {open && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            width: confirmingItem ? 240 : MENU_WIDTH,
            zIndex: 9999,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            overflow: 'visible',
          }}
          onClick={e => e.stopPropagation()}
        >
          {confirmingItem ? (
            confirmLoading ? (
              <div className="flex items-center justify-center" style={{ padding: '20px 14px' }}>
                <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--text-muted)', borderTopColor: 'transparent' }} />
              </div>
            ) : confirmData ? (
              <div style={{ padding: '12px 14px' }}>
                <p className="text-sm font-medium mb-1" style={{ color: confirmingItem.danger ? 'var(--danger)' : 'var(--text)' }}>
                  {confirmData.title}
                </p>
                {confirmData.message && (
                  <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>{confirmData.message}</p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={handleConfirm}
                    className="flex-1 py-2 rounded-lg text-xs font-medium"
                    style={{ background: confirmingItem.danger ? 'var(--danger)' : 'var(--text)', color: '#fff', border: 'none', cursor: 'pointer' }}>
                    {confirmData.confirmLabel || 'Confirm'}
                  </button>
                  <button
                    onClick={handleCancelConfirm}
                    className="flex-1 py-2 rounded-lg text-xs"
                    style={{ background: 'var(--surface-raised)', color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                    {confirmData.cancelLabel || 'Cancel'}
                  </button>
                </div>
              </div>
            ) : null
          ) : items.map((item, i) => {
            if (item.type === 'divider') {
              return <div key={i} style={{ borderTop: '1px solid var(--border)', margin: '2px 0' }} />
            }

            const isActive = activeSubmenu === item.label
            const isFirst = i === 0
            const isLast = i === items.length - 1

            return (
              <div key={item.label} className="relative">
                <button
                  onClick={e => handleItemClick(e, item)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left"
                  style={{
                    color: item.danger ? 'var(--danger)' : 'var(--text)',
                    background: isActive ? 'var(--surface-raised)' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    borderRadius: isFirst ? '10px 10px 0 0' : isLast ? '0 0 10px 10px' : 0,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = item.danger ? 'var(--danger-subtle)' : 'var(--surface-raised)'}
                  onMouseLeave={e => e.currentTarget.style.background = isActive ? 'var(--surface-raised)' : 'transparent'}
                >
                  {item.icon && (
                    <span style={{ color: item.danger ? 'var(--danger)' : 'var(--text-muted)', display: 'flex' }}>
                      {item.icon}
                    </span>
                  )}
                  <span className="flex-1">{item.label}</span>
                </button>

                {/* Submenu — opens right by default, left when near right edge */}
                {item.children && isActive && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      ...(submenuLeft
                        ? { right: '100%', marginRight: 4 }
                        : { left: '100%', marginLeft: 4 }),
                      width: MENU_WIDTH,
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                      zIndex: 10000,
                      overflow: 'hidden',
                    }}
                    onClick={e => e.stopPropagation()}
                  >
                    {item.children.map((child) => (
                      <button
                        key={child.label}
                        onClick={e => { e.stopPropagation(); child.onClick?.(); close() }}
                        className="w-full flex items-center px-3 py-2.5 text-sm text-left truncate"
                        style={{
                          color: 'var(--text)',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        {child.icon && (
                          <span style={{ marginRight: 8, display: 'flex', color: 'var(--text-muted)' }}>
                            {child.icon}
                          </span>
                        )}
                        {child.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>,
        document.body
      )}
    </>
  )
}
