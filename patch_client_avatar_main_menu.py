import pathlib

path = pathlib.Path("src/routes/ClientDetail.jsx")
src = path.read_text()

# New small menu component -- replaces the old direct-to-file-dialog
# <label> on the main client page. Uses a hidden file input triggered via
# ref (rather than a wrapping <label>, which can only ever do one thing on
# click) so the circle itself can offer both "Upload photo" and "Choose
# from gallery" instead of hardcoding the upload path. Same click-outside
# pattern as PageHeader's MobileActionMenu.
old_anchor = "function EditClientModal({ client, avatarUrl, uploadingAvatar, onAvatarUpload, onChooseFromGallery, onClose, onSaved, allTags = [] }) {"
assert src.count(old_anchor) == 1, "EditClientModal signature anchor not found or not unique"

new_component = '''function AvatarChangeControl({ client, avatarUrl, uploadingAvatar, onAvatarUpload, onChooseFromGallery }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const h = e => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
        onChange={e => { setOpen(false); onAvatarUpload(e) }} disabled={uploadingAvatar} />
      <button onClick={() => setOpen(o => !o)} disabled={uploadingAvatar}
        className="relative w-10 h-10 rounded-full group"
        style={{ display: 'block', border: 'none', padding: 0, background: 'none', cursor: uploadingAvatar ? 'not-allowed' : 'pointer' }}>
        {avatarUrl ? (
          <img src={avatarUrl} alt={client.first_name} className="w-10 h-10 rounded-full object-cover" />
        ) : (
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
            style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}>
            {client.first_name[0]}{client.last_name[0]}
          </div>
        )}
        <div className="absolute inset-0 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: 'rgba(0,0,0,0.45)' }}>
          {uploadingAvatar
            ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : <Camera size={14} style={{ color: '#fff' }} />}
        </div>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 rounded-xl shadow-lg z-30 overflow-hidden"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 170 }}>
          <button onClick={() => { setOpen(false); fileInputRef.current?.click() }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            Upload photo
          </button>
          <button onClick={() => { setOpen(false); onChooseFromGallery() }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            Choose from gallery
          </button>
        </div>
      )}
    </div>
  )
}

function EditClientModal({ client, avatarUrl, uploadingAvatar, onAvatarUpload, onChooseFromGallery, onClose, onSaved, allTags = [] }) {'''

src = src.replace(old_anchor, new_component)

# Replace the old direct-upload <label> on the main page with the new menu control
old_main_avatar = '''          <label className="relative w-10 h-10 rounded-full flex-shrink-0 cursor-pointer group" style={{ display: 'block' }}>
            <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploadingAvatar} />
            {avatarUrl ? (
              <img src={avatarUrl} alt={client.first_name} className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}>
                {client.first_name[0]}{client.last_name[0]}
              </div>
            )}
            <div className="absolute inset-0 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: 'rgba(0,0,0,0.45)' }}>
              {uploadingAvatar
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Camera size={14} style={{ color: '#fff' }} />}
            </div>
          </label>'''

assert src.count(old_main_avatar) == 1, "main-page avatar label anchor not found or not unique"

new_main_avatar = '''          <AvatarChangeControl
            client={client}
            avatarUrl={avatarUrl}
            uploadingAvatar={uploadingAvatar}
            onAvatarUpload={handleAvatarUpload}
            onChooseFromGallery={() => setShowGalleryPicker(true)}
          />'''

src = src.replace(old_main_avatar, new_main_avatar)

path.write_text(src)
print("Converted main-page avatar into a menu offering Upload photo / Choose from gallery")
