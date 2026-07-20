import pathlib

path = pathlib.Path("src/routes/GalleryActivity.jsx")
src = path.read_text()

old_block = '''      <div className="flex items-center gap-2 flex-wrap">
        {[
          { id: 'all',      label: 'All' },
          { id: 'view',     label: 'Views' },
          { id: 'favorite', label: 'Favorites' },
          { id: 'download', label: 'Downloads' },
          { id: 'comment',  label: 'Comments' },
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
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

new_block = '''      <div className="flex items-center gap-2 flex-nowrap overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {[
          { id: 'all',      label: 'All' },
          { id: 'view',     label: 'Views' },
          { id: 'favorite', label: 'Favorites' },
          { id: 'download', label: 'Downloads' },
          { id: 'comment',  label: 'Comments' },
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex-shrink-0 whitespace-nowrap"
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
print("Fixed Activity page filter pills: single scrollable row instead of wrapping")
