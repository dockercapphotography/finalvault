import pathlib

path = pathlib.Path("src/routes/ClientPortalGalleries.jsx")
src = path.read_text()

# 1. Add the icons this needs
old_icons = "import { Images, ChevronRight, Search, SlidersHorizontal } from 'lucide-react'"
assert src.count(old_icons) == 1, "icon import anchor not found or not unique"
new_icons = "import { Images, ChevronRight, ChevronDown, Search, SlidersHorizontal, Lock, Copy, Check } from 'lucide-react'"
src = src.replace(old_icons, new_icons)

# 2. Replace GalleryRow with a version that adds a collapsible Access info
#    panel below the row (as a sibling of the <a>, not inside it, so
#    clicking the toggle doesn't also trigger navigation), plus a small
#    AccessInfoRow helper for the actual password/PIN display + copy.
old_gallery_row = '''function GalleryRow({ gallery, isNew }) {
  const isExpired = !gallery.is_active || (gallery.expires_at && new Date(gallery.expires_at) < new Date())
  return (
    <a
      href={`/g/${gallery.share_token}`}
      className="flex items-center rounded-xl overflow-hidden"
      style={{
        border: '1px solid var(--border)', textDecoration: 'none',
        opacity: isExpired ? 0.55 : 1,
        pointerEvents: isExpired ? 'none' : 'auto',
      }}
    >
      <div style={{ position: 'relative', width: 76, height: 76, background: 'var(--surface-raised)', overflow: 'hidden', flexShrink: 0 }}>
        {gallery.cover_r2_key && (
          <img
            src={`${WORKER_URL}/preview/${encodeURIComponent(gallery.cover_r2_key)}?share_token=${gallery.share_token}${isExpired ? '&allow_expired=1' : ''}`}
            alt=""
            style={{
              display: 'block', width: '100%', height: '100%', objectFit: 'cover',
              objectPosition: `${(gallery.cover_focus_x ?? 0.5) * 100}% ${(gallery.cover_focus_y ?? 0.5) * 100}%`,
              filter: isExpired ? 'grayscale(1) brightness(0.85)' : 'none',
            }}
            onError={e => { e.currentTarget.style.display = 'none' }}
          />
        )}
        {isNew && !isExpired && (
          <span style={{
            position: 'absolute', top: 4, right: 4, background: '#6366f1', color: '#fff',
            fontSize: 9, fontWeight: 500, padding: '1px 6px', borderRadius: 7,
          }}>
            New
          </span>
        )}
      </div>
      <div className="px-4 py-3 flex-1 min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{gallery.title}</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {isExpired ? 'Expired' : gallery.event_date
            ? new Date(gallery.event_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : ''}
        </p>
      </div>
      {!isExpired && <ChevronRight size={16} style={{ color: '#c4c4c4', marginRight: 16, flexShrink: 0 }} />}
    </a>
  )
}'''

assert src.count(old_gallery_row) == 1, "GalleryRow anchor not found or not unique"

new_gallery_row = '''function AccessInfoRow({ label, value }) {
  const [copied, setCopied] = useState(false)
  function handleCopy() {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{label}</p>
        <p className="text-sm font-mono font-medium truncate" style={{ color: 'var(--text)' }}>{value}</p>
      </div>
      <button type="button" onClick={handleCopy}
        className="flex items-center gap-1 text-xs px-2 py-1 rounded-md font-medium shrink-0"
        style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer' }}>
        {copied ? <Check size={11} /> : <Copy size={11} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

function GalleryRow({ gallery, isNew }) {
  const isExpired = !gallery.is_active || (gallery.expires_at && new Date(gallery.expires_at) < new Date())
  const hasAccessInfo = !isExpired && (gallery.require_password || gallery.require_download_pin)
  const [showAccess, setShowAccess] = useState(false)

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', opacity: isExpired ? 0.55 : 1 }}>
      <a
        href={`/g/${gallery.share_token}`}
        className="flex items-center"
        style={{ textDecoration: 'none', pointerEvents: isExpired ? 'none' : 'auto' }}
      >
        <div style={{ position: 'relative', width: 76, height: 76, background: 'var(--surface-raised)', overflow: 'hidden', flexShrink: 0 }}>
          {gallery.cover_r2_key && (
            <img
              src={`${WORKER_URL}/preview/${encodeURIComponent(gallery.cover_r2_key)}?share_token=${gallery.share_token}${isExpired ? '&allow_expired=1' : ''}`}
              alt=""
              style={{
                display: 'block', width: '100%', height: '100%', objectFit: 'cover',
                objectPosition: `${(gallery.cover_focus_x ?? 0.5) * 100}% ${(gallery.cover_focus_y ?? 0.5) * 100}%`,
                filter: isExpired ? 'grayscale(1) brightness(0.85)' : 'none',
              }}
              onError={e => { e.currentTarget.style.display = 'none' }}
            />
          )}
          {isNew && !isExpired && (
            <span style={{
              position: 'absolute', top: 4, right: 4, background: '#6366f1', color: '#fff',
              fontSize: 9, fontWeight: 500, padding: '1px 6px', borderRadius: 7,
            }}>
              New
            </span>
          )}
        </div>
        <div className="px-4 py-3 flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{gallery.title}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {isExpired ? 'Expired' : gallery.event_date
              ? new Date(gallery.event_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              : ''}
          </p>
        </div>
        {!isExpired && <ChevronRight size={16} style={{ color: '#c4c4c4', marginRight: 16, flexShrink: 0 }} />}
      </a>

      {hasAccessInfo && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <button type="button" onClick={() => setShowAccess(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2"
            style={{ background: 'var(--bg-subtle)', border: 'none', cursor: 'pointer' }}>
            <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: '#6366f1' }}>
              <Lock size={11} />Access info
            </span>
            <ChevronDown size={13} style={{ color: '#6366f1', transform: showAccess ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
          </button>
          {showAccess && (
            <div className="px-4 py-3 space-y-2.5" style={{ background: 'var(--bg-subtle)', borderTop: '1px solid var(--border)' }}>
              {gallery.require_password && <AccessInfoRow label="Password" value={gallery.plain_password} />}
              {gallery.require_download_pin && <AccessInfoRow label="Download PIN" value={gallery.plain_download_pin} />}
            </div>
          )}
        </div>
      )}
    </div>
  )
}'''

src = src.replace(old_gallery_row, new_gallery_row)
path.write_text(src)
print("Added Access info panel to ClientPortalGalleries.jsx")
