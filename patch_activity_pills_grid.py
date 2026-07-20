import pathlib

path = pathlib.Path("src/routes/GalleryActivity.jsx")
src = path.read_text()

old_block = '''      <div className="flex items-center gap-1.5 md:gap-2 flex-nowrap">
        {[
          { id: 'all',      label: 'All' },
          { id: 'view',     label: 'Views' },
          { id: 'favorite', label: 'Favorites' },
          { id: 'download', label: 'Downloads' },
          { id: 'comment',  label: 'Comments' },
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className="px-2 py-1 md:px-3 md:py-1.5 rounded-lg text-xs md:text-sm font-medium transition-colors flex-shrink-0 whitespace-nowrap"
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

# Below md: a 5-column grid divides the row's actual available width evenly
# among the pills, every time -- structurally can't overflow regardless of
# phone width, unlike guessing at fixed padding/font sizes that happen to
# fit today's phones. `truncate` is just a safety net for the rare device
# where even an even split is too tight for a label like "Favorites".
# At md+: back to the original flex row with auto-sized, comfortably
# padded pills, since there's room to spare on desktop.
new_block = '''      <div className="grid grid-cols-5 gap-1.5 md:flex md:items-center md:gap-2">
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

src = src.replace(old_block, new_block)
path.write_text(src)
print("Switched mobile activity pills to a 5-column grid that always fills available width")
