import pathlib

path = pathlib.Path("src/routes/Sessions.jsx")
src = path.read_text()

# 1. Import Link (aliased to avoid any confusion with the Link2 icon already used here)
old_import = "import { useNavigate } from 'react-router-dom'"
assert src.count(old_import) == 1, "useNavigate import anchor not found or not unique"
new_import = "import { useNavigate, Link as RouterLink } from 'react-router-dom'"
src = src.replace(old_import, new_import)

# 2. Add the Live status link next to the existing Copy link button
old_block = '''            <Link2 size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <span className="text-xs flex-1 min-w-0 truncate" style={{ color: 'var(--text-muted)' }}>{bookingUrl}</span>
            <button onClick={handleCopyLink} className="text-xs font-medium px-2.5 py-1.5 rounded-lg flex items-center gap-1 shrink-0"
              style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer' }}>
              {copied ? <Check size={12} /> : <Copy size={12} />}{copied ? 'Copied' : 'Copy'}
            </button>
            <Toggle checked={page.is_active} onChange={handleToggleActive} label={page.is_active ? 'Active' : 'Inactive'} />
          </div>'''

assert src.count(old_block) == 1, "link row anchor not found or not unique"

new_block = '''            <Link2 size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <span className="text-xs flex-1 min-w-0 truncate" style={{ color: 'var(--text-muted)' }}>{bookingUrl}</span>
            <button onClick={handleCopyLink} className="text-xs font-medium px-2.5 py-1.5 rounded-lg flex items-center gap-1 shrink-0"
              style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer' }}>
              {copied ? <Check size={12} /> : <Copy size={12} />}{copied ? 'Copied' : 'Copy'}
            </button>
            <RouterLink to={`/sessions/signups/${page.id}/status`} target="_blank" rel="noopener noreferrer"
              className="text-xs font-medium px-2.5 py-1.5 rounded-lg flex items-center gap-1 shrink-0"
              style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', textDecoration: 'none' }}>
              Live status
            </RouterLink>
            <Toggle checked={page.is_active} onChange={handleToggleActive} label={page.is_active ? 'Active' : 'Inactive'} />
          </div>'''

src = src.replace(old_block, new_block)
path.write_text(src)
print("Added Live status link to the Signup Page Detail modal")
