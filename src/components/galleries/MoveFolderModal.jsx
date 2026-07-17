import { useState, useMemo } from 'react'
import { X, Folder, FolderTree, ChevronRight } from 'lucide-react'

// Picker modal for moving a folder (and its whole subtree) to a new parent.
// allFolders: flat list from getFolders() -- must include id, name,
// parent_id, path for every folder owned by the photographer.
// folder: the folder being moved.
// onMove(newParentId): called with the chosen parent id (or null for top
// level) when the user confirms.
export default function MoveFolderModal({ folder, allFolders, onMove, onClose }) {
  const [selected, setSelected] = useState('__unset__')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // A folder can't be moved into itself or into any of its own
  // descendants -- exclude the whole subtree from the picker rather than
  // just disabling it, since letting people click into an excluded branch
  // to then hit a server error is a worse experience than not showing it.
  const invalidIds = useMemo(() => {
    const invalid = new Set([folder.id])
    if (folder.path) {
      for (const f of allFolders) {
        if (f.path === folder.path || f.path?.startsWith(`${folder.path}.`)) {
          invalid.add(f.id)
        }
      }
    }
    return invalid
  }, [folder, allFolders])

  const validFolders = useMemo(
    () => allFolders.filter(f => !invalidIds.has(f.id)),
    [allFolders, invalidIds]
  )

  const childrenByParent = useMemo(() => {
    const map = new Map()
    for (const f of validFolders) {
      const key = f.parent_id || '__root__'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(f)
    }
    return map
  }, [validFolders])

  const currentParentId = folder.parent_id || null

  async function handleMove() {
    if (selected === '__unset__') return
    const newParentId = selected === '__root__' ? null : selected
    setSaving(true)
    setError(null)
    try {
      await onMove(newParentId)
      onClose()
    } catch (err) {
      console.error('Failed to move folder:', err)
      setError(err.message || 'Failed to move folder')
    } finally {
      setSaving(false)
    }
  }

  function renderRow(f, depth) {
    const isSelected = selected === f.id
    const isCurrent = (f.id || null) === currentParentId
    return (
      <div key={f.id}>
        <button
          onClick={() => setSelected(f.id)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors"
          style={{
            paddingLeft: 12 + depth * 20,
            background: isSelected ? 'rgba(99,102,241,0.12)' : 'transparent',
            color: isSelected ? '#6366f1' : 'var(--text)',
            border: 'none',
            cursor: 'pointer',
          }}
          onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--surface-raised)' }}
          onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
        >
          <Folder size={14} style={{ flexShrink: 0, opacity: 0.7 }} />
          <span className="truncate flex-1">{f.name}</span>
          {isCurrent && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Current</span>}
        </button>
        {(childrenByParent.get(f.id) || []).map(child => renderRow(child, depth + 1))}
      </div>
    )
  }

  const rootFolders = childrenByParent.get('__root__') || []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <div
        className="w-full rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: 'var(--surface)', maxWidth: 440, width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="font-semibold text-base flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <FolderTree size={16} />
            Move "{folder.name}"
          </h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3" style={{ minHeight: 120 }}>
          <button
            onClick={() => setSelected('__root__')}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left mb-1 transition-colors"
            style={{
              background: selected === '__root__' ? 'rgba(99,102,241,0.12)' : 'transparent',
              color: selected === '__root__' ? '#6366f1' : 'var(--text)',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 500,
            }}
            onMouseEnter={e => { if (selected !== '__root__') e.currentTarget.style.background = 'var(--surface-raised)' }}
            onMouseLeave={e => { if (selected !== '__root__') e.currentTarget.style.background = 'transparent' }}
          >
            <ChevronRight size={14} style={{ flexShrink: 0, opacity: 0.7 }} />
            <span className="flex-1">Top Level</span>
            {currentParentId === null && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Current</span>}
          </button>

          {rootFolders.length === 0 ? (
            <p className="text-sm px-3 py-4" style={{ color: 'var(--text-muted)' }}>
              No other folders to move into.
            </p>
          ) : (
            rootFolders.map(f => renderRow(f, 0))
          )}
        </div>

        {error && (
          <div className="px-6 py-2 text-xs" style={{ color: 'var(--danger)' }}>{error}</div>
        )}

        <div className="flex items-center justify-end gap-2 px-6 py-4" style={{ borderTop: '1px solid var(--border)' }}>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: 'var(--surface-raised)', color: 'var(--text)', border: 'none', cursor: 'pointer' }}>
            Cancel
          </button>
          <button
            onClick={handleMove}
            disabled={selected === '__unset__' || saving}
            className="px-5 py-2 rounded-xl text-sm font-medium"
            style={{
              background: '#6366f1', color: '#fff',
              opacity: (selected === '__unset__' || saving) ? 0.6 : 1,
              cursor: (selected === '__unset__' || saving) ? 'not-allowed' : 'pointer',
            }}>
            {saving ? 'Moving…' : 'Move'}
          </button>
        </div>
      </div>
    </div>
  )
}
