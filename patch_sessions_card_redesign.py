import pathlib

path = pathlib.Path("src/routes/Sessions.jsx")
src = path.read_text()

# 1. Add Camera icon import
old_import = "import { Plus, CalendarDays, X, LayoutList, Columns, Link2, Copy, Check, Trash2, MapPin, Ticket as TicketIcon,"
assert src.count(old_import) == 1, "icon import anchor not found or not unique"
new_import = "import { Plus, CalendarDays, X, LayoutList, Columns, Link2, Copy, Check, Trash2, MapPin, Ticket as TicketIcon, Camera,"
src = src.replace(old_import, new_import)

# 2. Rebuild SignupPageCard
old_card = '''function SignupPageCard({ page, onOpen }) {
  const openCount = page.slot_total - page.slot_claimed
  return (
    <button onClick={onOpen} className="w-full text-left rounded-2xl p-4 transition-colors"
      style={{ border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
      onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}>
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{page.title}</p>
        {!page.is_active && (
          <span className="text-xs px-2 py-0.5 rounded-full shrink-0" style={{ background: 'var(--surface-raised)', color: 'var(--text-muted)' }}>Inactive</span>
        )}
      </div>
      <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
        {page.venue_address || 'No venue set yet'}
      </p>
      <div className="flex items-center gap-4 mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
        <span>{page.shoot_type_count} shoot type{page.shoot_type_count === 1 ? '' : 's'}</span>
        <span>{page.slot_claimed} of {page.slot_total} claimed</span>
        {page.slot_total > 0 && <span>{openCount} open</span>}
      </div>'''

assert src.count(old_card) == 1, "SignupPageCard anchor not found or not unique"

new_card = '''function SignupPageCard({ page, onOpen }) {
  const pct = page.slot_total > 0 ? Math.round((page.slot_claimed / page.slot_total) * 100) : 0
  const active = page.is_active
  return (
    <button onClick={onOpen} className="w-full text-left rounded-2xl p-4 transition-colors"
      style={{ border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
      onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}>
      <div className="flex items-start gap-3 mb-3.5">
        <div className="flex items-center justify-center rounded-lg flex-shrink-0"
          style={{ width: 40, height: 40, background: active ? 'rgba(99,102,241,0.1)' : 'var(--surface-raised)' }}>
          <TicketIcon size={19} style={{ color: active ? '#6366f1' : 'var(--text-muted)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{page.title}</p>
          <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{page.venue_address || 'No venue set yet'}</p>
        </div>
        <span className="text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0"
          style={{
            background: active ? 'var(--success-subtle)' : 'var(--surface-raised)',
            color: active ? 'var(--success)' : 'var(--text-muted)',
          }}>
          {active ? 'Active' : 'Inactive'}
        </span>
      </div>

      {page.slot_total > 0 && (
        <>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{page.slot_claimed} of {page.slot_total} slots claimed</span>
            <span className="text-xs font-medium" style={{ color: active ? '#6366f1' : 'var(--text-muted)' }}>{pct}%</span>
          </div>
          <div className="rounded-full overflow-hidden" style={{ height: 6, background: 'var(--surface-raised)' }}>
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: active ? '#6366f1' : 'var(--text-muted)' }} />
          </div>
        </>
      )}

      <div className="flex items-center gap-4 mt-3 pt-3 text-xs" style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
        <span className="flex items-center gap-1"><Camera size={13} />{page.shoot_type_count} shoot type{page.shoot_type_count === 1 ? '' : 's'}</span>
        {page.day_count > 0 && <span className="flex items-center gap-1"><CalendarDays size={13} />{page.day_count} day{page.day_count === 1 ? '' : 's'}</span>}
      </div>'''

src = src.replace(old_card, new_card)
path.write_text(src)
print("Rebuilt SignupPageCard with icon, badge, progress bar, and footer stats")
