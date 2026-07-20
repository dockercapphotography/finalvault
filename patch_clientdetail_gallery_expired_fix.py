import pathlib

path = pathlib.Path("src/routes/ClientDetail.jsx")
src = path.read_text()

old_component = '''function GalleryRow({ gallery, onUnlink }) {
  const coverKey = gallery.cover_r2_key || gallery.gallery_images?.preview_r2_key
  const isActive = gallery.is_active
  return (
    <Link
      to={`/galleries/${gallery.id}`}
      className="flex items-center gap-3 px-4 py-3 transition-colors"
      style={{ textDecoration: 'none' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {/* Thumbnail */}
      <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0"
        style={{ background: 'var(--surface-raised)' }}>
        {coverKey ? (
          <img
            src={`${WORKER_URL}/preview/${encodeURIComponent(coverKey)}?share_token=${gallery.share_token}`}
            alt={gallery.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <FileText size={14} style={{ color: 'var(--text-muted)' }} />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{gallery.title}</p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {gallery.event_date ? formatDate(gallery.event_date) : formatDate(gallery.created_at)}
          {gallery.event_name && ` · ${gallery.event_name}`}
        </p>
      </div>
      <Badge variant={isActive ? 'success' : 'default'}>{isActive ? 'Active' : 'Inactive'}</Badge>'''

assert src.count(old_component) == 1, "GalleryRow anchor not found or not unique"

new_component = '''function GalleryRow({ gallery, onUnlink }) {
  const coverKey = gallery.cover_r2_key || gallery.gallery_images?.preview_r2_key
  // Distinct from a manual is_active=false toggle -- a date-expired gallery
  // is still "active" in the DB, it's just past its expires_at. Both cases
  // are unavailable to clients, but which one applies is meaningful to the
  // photographer specifically (did I turn this off, or did time just pass?),
  // so unlike the client portal's GalleryRow (which collapses both into one
  // generic "Expired" label since a client doesn't need the distinction),
  // this one keeps them separate.
  const isDateExpired = gallery.expires_at && new Date(gallery.expires_at) < new Date()
  const isUnavailable = !gallery.is_active || isDateExpired
  const badgeLabel = !gallery.is_active ? 'Inactive' : isDateExpired ? 'Expired' : 'Active'
  const badgeVariant = !gallery.is_active ? 'default' : isDateExpired ? 'warning' : 'success'
  return (
    <Link
      to={`/galleries/${gallery.id}`}
      className="flex items-center gap-3 px-4 py-3 transition-colors"
      style={{ textDecoration: 'none' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {/* Thumbnail */}
      <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0"
        style={{ background: 'var(--surface-raised)' }}>
        {coverKey ? (
          <img
            src={`${WORKER_URL}/preview/${encodeURIComponent(coverKey)}?share_token=${gallery.share_token}${isUnavailable ? '&allow_expired=1' : ''}`}
            alt={gallery.title}
            className="w-full h-full object-cover"
            style={{ filter: isUnavailable ? 'grayscale(1) brightness(0.85)' : 'none' }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <FileText size={14} style={{ color: 'var(--text-muted)' }} />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{gallery.title}</p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {gallery.event_date ? formatDate(gallery.event_date) : formatDate(gallery.created_at)}
          {gallery.event_name && ` · ${gallery.event_name}`}
        </p>
      </div>
      <Badge variant={badgeVariant}>{badgeLabel}</Badge>'''

src = src.replace(old_component, new_component)
path.write_text(src)
print("Fixed ClientDetail.jsx's GalleryRow: correct expired badge + working cover image for expired galleries")
