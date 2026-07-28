import { useMemo } from 'react'

// Vertical hour-scale timeline for the Live Status page. Renders whatever
// slots it's given (already filtered by the parent's search/status/shoot-type
// controls) positioned and sized by actual clock time, rather than the flat
// chronological list. Deliberately stateless -- all interaction (walk-up
// registration, the claimed-slot actions sheet/popover, the auto-scroll-to-now
// behavior) stays owned by SignupLiveStatus.jsx and is just wired in via props,
// so this is purely a different way of laying out the same data and clicks.

const PX_PER_HOUR = 120
// Purely a visibility/tap-target floor now -- NOT sized to fit text.
// A block's actual height always reflects its real duration; content
// below adapts to whatever height that produces (see TWO_LINE_MIN /
// ONE_LINE_MIN) rather than the block being stretched to fit content.
// This is what keeps gaps between shoots visually honest.
const TINY_BLOCK_HEIGHT = 6
const TWO_LINE_MIN = 44
const ONE_LINE_MIN = 20
// Hide window for the hour-tick label when the now-line is close, expressed
// in minutes rather than a fixed px value so it stays correct across zoom levels.
const NOW_LABEL_HIDE_WINDOW_MIN = 10
// Extra real-time padding before the first slot and after the last, so the
// first/last blocks of the day aren't flush against the top/bottom edge.
const FRAME_PAD_MS = 20 * 60 * 1000
const GUTTER_WIDTH = 52
const NOW_LINE_COLOR = '#E24B4A'
// The rail sits in the empty gap between the hour-label text (which ends
// at -8px, right-aligned) and the inset block column (BLOCK_INSET) -- a
// small POSITIVE offset so it never overlaps the label text itself, with
// a dot marking each block's start. This is what ties the floating blocks
// to one continuous timeline instead of each sitting at an unconnected
// vertical position.
const RAIL_X = 2
const RAIL_WIDTH = 2
// Exactly where the rail ends -- blocks start here so they touch the rail
// flush, instead of starting at x=0 and painting over it.
const BLOCK_START = RAIL_X + RAIL_WIDTH

function formatHourLabel(ms, timezone) {
  return new Date(ms).toLocaleTimeString('en-US', { timeZone: timezone, hour: 'numeric' })
}

function formatClockLabel(ms, timezone) {
  return new Date(ms).toLocaleTimeString('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit' })
}

function splitClock(ms, timezone) {
  const str = new Date(ms).toLocaleTimeString('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit', hour12: true })
  const [time, period] = str.split(' ')
  return [time.replace(':00', ''), period.toLowerCase()]
}

function formatRangeLabel(startMs, endMs, timezone) {
  const [startTime, startPeriod] = splitClock(startMs, timezone)
  const [endTime, endPeriod] = splitClock(endMs, timezone)
  if (startPeriod === endPeriod) return `${startTime} \u2013 ${endTime}${endPeriod}`
  return `${startTime}${startPeriod} \u2013 ${endTime}${endPeriod}`
}

// Groups overlapping blocks (a connected sweep over sorted intervals) and
// assigns each block a column within its own group, so two open slots for
// different shoot types that overlap in time render side-by-side instead of
// stacking on top of each other -- while a block with nothing overlapping it
// still gets the full row width.
function layoutColumns(blocks) {
  const sorted = [...blocks].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs)
  const groups = []
  let current = []
  let currentEnd = -Infinity
  for (const b of sorted) {
    if (current.length === 0 || b.startMs < currentEnd) {
      current.push(b)
      currentEnd = Math.max(currentEnd, b.endMs)
    } else {
      groups.push(current)
      current = [b]
      currentEnd = b.endMs
    }
  }
  if (current.length) groups.push(current)

  const positioned = []
  for (const group of groups) {
    const columnEnds = []
    const colOf = new Map()
    for (const b of group) {
      let placed = false
      for (let i = 0; i < columnEnds.length; i++) {
        if (columnEnds[i] <= b.startMs) {
          columnEnds[i] = b.endMs
          colOf.set(b.id, i)
          placed = true
          break
        }
      }
      if (!placed) {
        columnEnds.push(b.endMs)
        colOf.set(b.id, columnEnds.length - 1)
      }
    }
    const colCount = columnEnds.length
    for (const b of group) positioned.push({ ...b, col: colOf.get(b.id), colCount })
  }
  return positioned
}

export default function LiveStatusTimeline({
  slots, daySlots, shootTypes, timezone, now, isToday,
  registerRef, onOpenWalkup, onOpenActions,
}) {
  const nowMs = now.getTime()

  const { frameStartMs, frameEndMs, hourTicks, blocks } = useMemo(() => {
    if (!daySlots || daySlots.length === 0) {
      return { frameStartMs: 0, frameEndMs: 0, hourTicks: [], blocks: [] }
    }
    const starts = daySlots.map(s => new Date(s.start_time).getTime())
    const ends = daySlots.map(s => new Date(s.end_time).getTime())
    const rawStart = Math.min(...starts) - FRAME_PAD_MS
    const rawEnd = Math.max(...ends) + FRAME_PAD_MS
    // Round the frame to clean 30-minute marks so gridlines land on tidy
    // real-time boundaries rather than an arbitrary padded offset.
    const start = Math.floor(rawStart / (30 * 60 * 1000)) * (30 * 60 * 1000)
    const end = Math.ceil(rawEnd / (30 * 60 * 1000)) * (30 * 60 * 1000)

    const ticks = []
    for (let t = start; t <= end; t += 60 * 60 * 1000) ticks.push(t)

    const rawBlocks = slots.map(s => ({
      id: s.id,
      slot: s,
      startMs: new Date(s.start_time).getTime(),
      endMs: new Date(s.end_time).getTime(),
    }))

    return { frameStartMs: start, frameEndMs: end, hourTicks: ticks, blocks: layoutColumns(rawBlocks) }
  }, [slots, daySlots])

  if (frameEndMs === frameStartMs) return null

  const pxPerMs = PX_PER_HOUR / (60 * 60 * 1000)
  const totalHeight = (frameEndMs - frameStartMs) * pxPerMs
  const showNowLine = isToday && nowMs >= frameStartMs && nowMs <= frameEndMs

  return (
    <div className="relative" style={{ height: totalHeight, marginLeft: GUTTER_WIDTH }}>
      {/* Alternating hour bands, extended left into the gutter so each hour
          label visually belongs to its band rather than floating on its own. */}
      {hourTicks.slice(0, -1).map((t, i) => {
        if (i % 2 !== 0) return null
        const bandTop = (t - frameStartMs) * pxPerMs
        const bandBottom = (hourTicks[i + 1] - frameStartMs) * pxPerMs
        return (
          <div key={t} className="absolute" style={{ left: -9999, right: -9999, top: bandTop, height: bandBottom - bandTop, background: 'var(--bg-subtle)' }} />
        )
      })}

      {/* The connecting rail -- a single line the full height of the
          timeline, tying the blocks to one continuous object. */}
      <div className="absolute" style={{ left: RAIL_X, top: 0, bottom: 0, width: RAIL_WIDTH, background: 'var(--border-strong)' }} />

      {/* Hour gridlines + labels, labels sit in the gutter to the left.
          A tick's label is suppressed (gridline stays) when the current-time
          label sits close enough to collide with it -- the now-line is the
          more useful of the two to keep legible when they'd overlap. */}
      {hourTicks.map(t => {
        const tickY = (t - frameStartMs) * pxPerMs
        const nowY = showNowLine ? (nowMs - frameStartMs) * pxPerMs : null
        const hideLabel = nowY !== null && Math.abs(tickY - nowY) < NOW_LABEL_HIDE_WINDOW_MIN * 60 * 1000 * pxPerMs
        return (
          <div key={t} className="absolute left-0 right-0" style={{ top: tickY }}>
            {!hideLabel && (
              <span className="absolute text-xs" style={{ left: -GUTTER_WIDTH, top: -7, width: GUTTER_WIDTH - 8, textAlign: 'right', color: 'var(--text-muted)' }}>
                {formatHourLabel(t, timezone)}
              </span>
            )}
            <div style={{ borderTop: '1px solid var(--border)' }} />
          </div>
        )
      })}

      {showNowLine && (
        <div className="absolute left-0 right-0 z-10" style={{ top: (nowMs - frameStartMs) * pxPerMs }}>
          <span className="absolute text-xs font-medium px-1.5 py-0.5 rounded" style={{ left: -GUTTER_WIDTH, top: -9, width: GUTTER_WIDTH - 8, textAlign: 'right', color: NOW_LINE_COLOR, background: 'transparent' }}>
            {formatClockLabel(nowMs, timezone)}
          </span>
          <div style={{ borderTop: `2px solid ${NOW_LINE_COLOR}`, position: 'relative' }}>
            <div style={{ position: 'absolute', left: RAIL_X - 5, top: -5, width: 10, height: 10, borderRadius: '50%', background: NOW_LINE_COLOR, border: '2px solid var(--surface)' }} />
          </div>
        </div>
      )}

      {blocks.map(({ id, slot, startMs, endMs, col, colCount }) => {
        const shootType = shootTypes.find(t => t.id === slot.shoot_type_id)
        const isPast = endMs < nowMs
        const isOpen = !slot.claimed_at
        const isRegisterable = isOpen && !isPast
        const top = (startMs - frameStartMs) * pxPerMs
        const height = Math.max(TINY_BLOCK_HEIGHT, (endMs - startMs) * pxPerMs)
        const showTwoLines = height >= TWO_LINE_MIN
        const showOneLine = !showTwoLines && height >= ONE_LINE_MIN
        const widthPct = 100 / colCount
        const gap = 4

        return (
          <div key={id}
            ref={el => registerRef(id, el)}
            onClick={isRegisterable ? () => onOpenWalkup(slot) : slot.claimed_at ? (e => onOpenActions(e, slot)) : undefined}
            className="absolute rounded-lg overflow-hidden flex"
            style={{
              top, height,
              left: `calc(${col * widthPct}% + ${BLOCK_START}px + ${col === 0 ? 0 : gap / 2}px)`,
              width: `calc(${widthPct}% - ${BLOCK_START}px - ${gap}px)`,
              opacity: isOpen && isPast ? 0.45 : 1,
              cursor: isRegisterable || slot.claimed_at ? 'pointer' : 'default',
            }}>
            <div className="flex-1 min-w-0 px-3 flex flex-col justify-center" style={{
              background: slot.claimed_at ? '#6366f1' : '#EEEDFE',
              border: slot.claimed_at ? 'none' : '1px dashed var(--border-strong)',
            }}>
              {showTwoLines ? (
                <>
                  <p className="text-xs font-semibold truncate" style={{ color: slot.claimed_at ? '#fff' : 'var(--text)', lineHeight: 1.3 }}>
                    {slot.claimed_at ? slot.client_name : (shootType?.name || 'Open')}
                  </p>
                  <p className="text-xs truncate" style={{ color: slot.claimed_at ? 'rgba(255,255,255,0.85)' : 'var(--text-muted)', lineHeight: 1.2 }}>
                    {formatRangeLabel(startMs, endMs, timezone)}
                  </p>
                </>
              ) : showOneLine ? (
                <p className="text-xs font-semibold truncate" style={{ color: slot.claimed_at ? '#fff' : 'var(--text)', lineHeight: 1.2 }}>
                  {slot.claimed_at ? slot.client_name : (shootType?.name || 'Open')}
                </p>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}
