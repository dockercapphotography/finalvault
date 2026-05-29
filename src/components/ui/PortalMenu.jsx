/**
 * PortalMenu — a self-contained context menu rendered via React portal.
 *
 * Renders into document.body so it's never clipped by overflow-hidden parents
 * or trapped by stacking contexts. Auto-flips left/up when near viewport edges.
 * Closes on outside click, Escape, and scroll.
 *
 * Usage:
 *   <PortalMenu trigger={<button>•••</button>} items={[
 *     { label: 'Download', icon: <Download size={13} />, onClick: () => {} },
 *     { label: 'Delete', icon: <Trash2 size={13} />, onClick: () => {}, danger: true },
 *     { type: 'divider' },
 *     { label: 'Move to Set', icon: <FolderInput size={13} />, children: [
 *       { label: 'Set A', onClick: () => {} },
 *     ]},
 *   ]} />
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

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

export default function PortalMenu({ trigger, items, triggerClassName, triggerStyle }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const [submenuLeft, setSubmenuLeft] = useState(false)
  const [activeSubmenu, setActiveSubmenu] = useState(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)

  const close = useCallback(() => {
    setOpen(false)
    setActiveSubmenu(null)
  }, [])

  useEffect(() => {
    if (!open) return
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
  }, [open, close])

  function handleTriggerClick(e) {
    e.stopPropagation()
    e.preventDefault()
    if (open) { close(); return }
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
    item.onClick?.()
    close()
  }

  return (
    <>
      <div
        ref={triggerRef}
        className={triggerClassName}
        style={triggerStyle}
        onClick={handleTriggerClick}
      >
        {trigger}
      </div>

      {open && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            width: MENU_WIDTH,
            zIndex: 9999,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            overflow: 'visible',
          }}
          onClick={e => e.stopPropagation()}
        >
          {items.map((item, i) => {
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
