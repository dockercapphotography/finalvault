import pathlib

path = pathlib.Path("src/routes/GalleryActivity.jsx")
src = path.read_text()

old_block = '''      <div className="grid grid-cols-5 gap-1.5 md:flex md:items-center md:gap-2">
        {[
          { id: 'all',      label: 'All' },
          { id: 'view',     label: 'Views' },
          { id: 'favorite', label: 'Favorites' },
          { id: 'download', label: 'Downloads' },
          { id: 'comment',  label: 'Comments' },
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className="px-1 py-1 md:px-3 md:py-1.5 rounded-lg text-[11px] md:text-sm font-medium transition-colors truncate text-center md:flex-shrink-0"
            style={{
              background: filter === f.id ? '#6366f1' : 'var(--surface)',
              color: filter === f.id ? '#fff' : 'var(--text-muted)',
              border: `1px solid ${filter === f.id ? '#6366f1' : 'var(--border)'}`,
              cursor: 'pointer',
            }}>
            {f.label}
          </button>
        ))}
      </div>'''

assert src.count(old_block) == 1, "activity filter pills anchor not found or not unique"

# A 5-column grid forced every pill to the exact same width, which fixed
# the overflow but wasted space on short labels ("All") while starving
# long ones ("Downloads") into truncating even when the row as a whole had
# room to spare. A flex row is more like what you'd actually want: every
# button starts at its own natural content width, and only shrinks -- all
# proportionally, via the browser's default flex-shrink behavior -- if the
# total genuinely exceeds the available width. min-w-0 is required for
# that shrinking to work at all (flex items don't shrink below their
# content's natural width by default); truncate is the last-resort
# fallback for a device narrow enough that even proportional shrinking
# isn't enough.
new_block = '''      <div className="flex items-center gap-1.5 md:gap-2 w-full">
        {[
          { id: 'all',      label: 'All' },
          { id: 'view',     label: 'Views' },
          { id: 'favorite', label: 'Favorites' },
          { id: 'download', label: 'Downloads' },
          { id: 'comment',  label: 'Comments' },
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className="px-2 py-1 md:px-3 md:py-1.5 rounded-lg text-[11px] md:text-sm font-medium transition-colors truncate min-w-0"
            style={{
              background: filter === f.id ? '#6366f1' : 'var(--surface)',
              color: filter === f.id ? '#fff' : 'var(--text-muted)',
              border: `1px solid ${filter === f.id ? '#6366f1' : 'var(--border)'}`,
              cursor: 'pointer',
            }}>
            {f.label}
          </button>
        ))}
      </div>'''

src = src.replace(old_block, new_block)
path.write_text(src)
print("Switched activity pills to proportional flex shrinking instead of forced-equal grid columns")
