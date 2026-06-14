import { useState, useEffect, useRef } from 'react'
import {
  DndContext, rectIntersection, PointerSensor, useSensor, useSensors,
  DragOverlay, useDroppable, useDraggable,
} from '@dnd-kit/core'

function KanbanColumn({ column, items, renderCard }) {
  const colId = column.id || column.value
  const { setNodeRef, isOver } = useDroppable({ id: colId })

  return (
    <div style={{ flex: 1, minWidth: 160, display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div className="flex items-center justify-between px-3 py-2.5 rounded-xl mb-2"
        style={{ background: column.color + '15', border: `1px solid ${column.color}30` }}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: column.color }} />
          <span className="text-xs font-semibold" style={{ color: column.color }}>{column.label}</span>
        </div>
        <span className="text-xs font-medium px-1.5 py-0.5 rounded-full"
          style={{ background: column.color + '20', color: column.color }}>
          {items.length}
        </span>
      </div>
      <div ref={setNodeRef} style={{
        flex: 1, minHeight: 120, borderRadius: 12, padding: '6px',
        background: isOver ? column.color + '08' : 'transparent',
        border: isOver ? `2px dashed ${column.color}40` : '2px dashed transparent',
        transition: 'background 0.15s, border 0.15s',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {items.map(item => (
          <div key={item.id}>
            <DraggableCard item={item} renderCard={renderCard} />
          </div>
        ))}
        {items.length === 0 && !isOver && (
          <div className="flex items-center justify-center py-6 rounded-lg"
            style={{ border: '1px dashed var(--border)' }}>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No sessions</p>
          </div>
        )}
      </div>
    </div>
  )
}

function DraggableCard({ item, renderCard }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id })
  return (
    <div ref={setNodeRef} {...listeners} {...attributes}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        opacity: isDragging ? 0 : 1,
        cursor: 'grab', touchAction: 'none', transition: 'none',
      }}>
      {renderCard(item)}
    </div>
  )
}

export default function KanbanBoard({ columns, items, onStatusChange, renderCard }) {
  const [localItems, setLocalItems] = useState(items)
  const [activeItem, setActiveItem] = useState(null)
  const isDraggingRef = useRef(false)

  // Only sync from parent when NOT dragging
  useEffect(() => {
    if (!isDraggingRef.current) {
      setLocalItems(items)
    }
  }, [items])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  function handleDragStart(event) {
    isDraggingRef.current = true
    const item = localItems.find(i => i.id === event.active.id)
    setActiveItem(item || null)
  }

  function handleDragEnd(event) {
    const { active, over } = event

    if (!over) {
      isDraggingRef.current = false
      setActiveItem(null)
      return
    }

    const newStatus = over.id
    const item = localItems.find(i => i.id === active.id)

    if (!item || item.status === newStatus || !columns.find(c => (c.id || c.value) === newStatus)) {
      isDraggingRef.current = false
      setActiveItem(null)
      return
    }

    // Update local state optimistically first
    setLocalItems(prev => prev.map(i => i.id === active.id ? { ...i, status: newStatus } : i))
    setActiveItem(null)
    isDraggingRef.current = false

    // Persist to server
    onStatusChange(active.id, newStatus)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={rectIntersection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 16, paddingTop: 4 }}>
        {columns.map(column => {
          const colId = column.id || column.value
          return (
            <KanbanColumn
              key={colId}
              column={column}
              items={localItems.filter(i => i.status === colId)}
              renderCard={renderCard}
            />
          )
        })}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeItem ? (
          <div style={{ opacity: 0.9, transform: 'rotate(1deg)', cursor: 'grabbing' }}>
            {renderCard(activeItem)}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
