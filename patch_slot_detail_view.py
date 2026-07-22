import pathlib

path = pathlib.Path("src/routes/Sessions.jsx")
src = path.read_text()

# 1. Group actual slot objects per day, not just counts
old_grouping = '''  const slotsByDay = {}
  for (const s of slots) {
    const day = new Date(s.start_time).toLocaleDateString('en-US', { timeZone: page?.timezone, weekday: 'short', month: 'short', day: 'numeric' })
    if (!slotsByDay[day]) slotsByDay[day] = { total: 0, claimed: 0 }
    slotsByDay[day].total++
    if (s.claimed_at) slotsByDay[day].claimed++
  }'''

assert src.count(old_grouping) == 1, "slotsByDay grouping anchor not found or not unique"

new_grouping = '''  const slotsByDay = {}
  for (const s of slots) {
    const day = new Date(s.start_time).toLocaleDateString('en-US', { timeZone: page?.timezone, weekday: 'short', month: 'short', day: 'numeric' })
    if (!slotsByDay[day]) slotsByDay[day] = { total: 0, claimed: 0, slots: [] }
    slotsByDay[day].total++
    if (s.claimed_at) slotsByDay[day].claimed++
    slotsByDay[day].slots.push(s)
  }

  async function handleDeleteSlot(slotId) {
    await deleteSlot(slotId)
    setSlots(prev => prev.filter(s => s.id !== slotId))
  }'''

src = src.replace(old_grouping, new_grouping)

# 2. Replace the render block with an expandable per-day list of real slots
old_render = '''              <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }}>Slots by day</label>
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                {Object.entries(slotsByDay).map(([day, counts], i) => (
                  <div key={day} className="flex items-center justify-between px-4 py-2.5 text-sm"
                    style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none', color: 'var(--text)' }}>
                    <span>{day}</span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{counts.claimed} of {counts.total} claimed</span>
                  </div>
                ))}
              </div>
            </div>
          )}'''

assert src.count(old_render) == 1, "slot summary render anchor not found or not unique"

new_render = '''              <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }}>Slots by day</label>
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                {Object.entries(slotsByDay).map(([day, dayData], i) => (
                  <SlotDayRow key={day} day={day} dayData={dayData} isFirst={i === 0}
                    timezone={page.timezone} shootTypes={page.signup_shoot_types}
                    onDeleteSlot={handleDeleteSlot} />
                ))}
              </div>
            </div>
          )}'''

src = src.replace(old_render, new_render)

# 3. New SlotDayRow component, inserted right before SignupPageDetailModal
old_anchor = "function SignupPageDetailModal({ pageId, onClose, onChanged }) {"
assert src.count(old_anchor) == 1, "SignupPageDetailModal anchor not found or not unique"

new_component = '''function SlotDayRow({ day, dayData, isFirst, timezone, shootTypes, onDeleteSlot }) {
  const [expanded, setExpanded] = useState(false)
  const sorted = [...dayData.slots].sort((a, b) => new Date(a.start_time) - new Date(b.start_time))

  return (
    <div style={{ borderTop: isFirst ? 'none' : '1px solid var(--border)' }}>
      <button onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)' }}>
        <span>{day}</span>
        <span className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{dayData.claimed} of {dayData.total} claimed</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 11, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▾</span>
        </span>
      </button>
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
          {sorted.map(slot => {
            const shootType = shootTypes.find(t => t.id === slot.shoot_type_id)
            const time = new Date(slot.start_time).toLocaleTimeString('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit' })
            return (
              <div key={slot.id} className="flex items-center justify-between px-4 py-2.5 text-xs" style={{ borderTop: '1px solid var(--border)' }}>
                <div className="min-w-0">
                  <span className="font-medium" style={{ color: 'var(--text)' }}>{time}</span>
                  <span style={{ color: 'var(--text-muted)' }}> · {shootType?.name || 'Unknown'}</span>
                  {slot.claimed_at ? (
                    <div style={{ color: 'var(--text-muted)' }}>
                      {slot.client_name}{slot.client_pronouns && ` (${slot.client_pronouns})`} · {slot.client_email}
                      {slot.client_phone && ` · ${slot.client_phone}`}
                    </div>
                  ) : (
                    <div style={{ color: 'var(--text-muted)' }}>Open</div>
                  )}
                </div>
                {!slot.claimed_at && (
                  <button onClick={() => onDeleteSlot(slot.id)} title="Delete this open slot"
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 4, flexShrink: 0 }}>
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SignupPageDetailModal({ pageId, onClose, onChanged }) {'''

src = src.replace(old_anchor, new_component)

path.write_text(src)
print("Replaced aggregate slot summary with an expandable per-day, per-slot view")
