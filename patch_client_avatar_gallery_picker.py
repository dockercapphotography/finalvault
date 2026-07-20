import pathlib

path = pathlib.Path("src/routes/ClientDetail.jsx")
src = path.read_text()

# 1. Add ChevronLeft (for the picker's back button)
old_icons = """import {
  ArrowLeft, Mail, Phone, MapPin, Tag, FileText, ChevronRight, Camera,
  Pencil, Trash2, X, Plus, Clock, CheckCircle, Images,
  AlertCircle, Ban, CalendarDays, Link2, Copy, RefreshCw, Check, Search,
  Lock, Unlock, ShieldAlert
} from 'lucide-react'"""
assert src.count(old_icons) == 1, "icon import anchor not found or not unique"
new_icons = """import {
  ArrowLeft, Mail, Phone, MapPin, Tag, FileText, ChevronRight, ChevronLeft, Camera,
  Pencil, Trash2, X, Plus, Clock, CheckCircle, Images,
  AlertCircle, Ban, CalendarDays, Link2, Copy, RefreshCw, Check, Search,
  Lock, Unlock, ShieldAlert
} from 'lucide-react'"""
src = src.replace(old_icons, new_icons)

# 2. Import getImages (imageApi.js) and the shared usePreviewUrls hook --
# both already exist and are used by GalleryDetail.jsx for its own image
# grid, so the picker reuses the exact same authenticated-thumbnail
# machinery instead of reinventing it.
old_supabase_import = "import { supabase } from '../supabaseClient.js'"
assert src.count(old_supabase_import) == 1, "supabase import anchor not found or not unique"
new_supabase_import = """import { supabase } from '../supabaseClient.js'
import { getImages } from '../utils/imageApi.js'
import { usePreviewUrls } from '../hooks/usePreviewUrls.js'"""
src = src.replace(old_supabase_import, new_supabase_import)

# 3. New components: the image grid for a chosen gallery, and the two-step
# picker modal itself (gallery list -> image grid). Inserted right before
# EditClientModal since that's where the trigger button will live.
old_edit_modal_start = "function EditClientModal({ client, avatarUrl, uploadingAvatar, onAvatarUpload, onClose, onSaved, allTags = [] }) {"
assert src.count(old_edit_modal_start) == 1, "EditClientModal signature anchor not found or not unique"

new_picker_components = '''function AvatarGalleryImageGrid({ galleryId, onSelect }) {
  const [images, setImages] = useState([])
  const [loading, setLoading] = useState(true)
  const { previewUrls } = usePreviewUrls(images)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getImages(galleryId)
      .then(imgs => { if (!cancelled) setImages(imgs) })
      .catch(() => { if (!cancelled) setImages([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [galleryId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  if (images.length === 0) {
    return <p className="text-sm text-center py-16 px-5" style={{ color: 'var(--text-muted)' }}>This gallery has no images yet.</p>
  }

  return (
    <div className="grid grid-cols-4 gap-2 p-4 overflow-y-auto" style={{ maxHeight: 380 }}>
      {images.map(img => (
        <button key={img.id} onClick={() => previewUrls[img.id] && onSelect(previewUrls[img.id])}
          className="aspect-square rounded-lg overflow-hidden"
          style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', padding: 0, cursor: previewUrls[img.id] ? 'pointer' : 'default' }}>
          {previewUrls[img.id]
            ? <img src={previewUrls[img.id]} alt="" className="w-full h-full object-cover" />
            : <div className="w-full h-full animate-pulse" style={{ background: 'var(--surface-raised)' }} />}
        </button>
      ))}
    </div>
  )
}

// Two-step avatar source picker: choose a linked gallery, then choose one
// of its images. Selecting an image hands its already-fetched preview
// blob URL straight to the same crop modal/upload pipeline used for a
// local file upload (see handlePickFromGallery below) -- the chosen image
// becomes a real independent copy at that point, not a live reference to
// the gallery, so deleting it later from the gallery won't break the
// client's avatar.
function AvatarGalleryPickerModal({ galleries, onSelect, onClose }) {
  const [selectedGallery, setSelectedGallery] = useState(null)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 min-w-0">
            {selectedGallery && (
              <button onClick={() => setSelectedGallery(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', flexShrink: 0 }}>
                <ChevronLeft size={16} />
              </button>
            )}
            <h3 className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
              {selectedGallery ? selectedGallery.title : 'Choose from a gallery'}
            </h3>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', flexShrink: 0 }}>
            <X size={16} />
          </button>
        </div>

        {!selectedGallery ? (
          galleries.length === 0 ? (
            <p className="text-sm text-center py-16 px-5" style={{ color: 'var(--text-muted)' }}>No linked galleries yet.</p>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              {galleries.map(g => (
                <button key={g.id} onClick={() => setSelectedGallery(g)}
                  className="w-full flex items-center gap-3 px-5 py-3 text-left transition-colors"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <span className="text-sm font-medium flex-1 min-w-0 truncate" style={{ color: 'var(--text)' }}>{g.title}</span>
                  <ChevronRight size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                </button>
              ))}
            </div>
          )
        ) : (
          <AvatarGalleryImageGrid galleryId={selectedGallery.id} onSelect={onSelect} />
        )}
      </div>
    </div>
  )
}

function EditClientModal({ client, avatarUrl, uploadingAvatar, onAvatarUpload, onChooseFromGallery, onClose, onSaved, allTags = [] }) {'''

src = src.replace(old_edit_modal_start, new_picker_components)

# 4. Add the "Choose from gallery" button next to "Change photo" inside
# EditClientModal's avatar row.
old_avatar_row = '''              <label className="text-xs font-medium px-2.5 py-1.5 rounded-lg cursor-pointer flex-shrink-0"
                style={{ background: 'var(--surface-raised)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                <input type="file" accept="image/*" className="hidden" onChange={onAvatarUpload} disabled={uploadingAvatar} />
                {uploadingAvatar ? 'Uploading...' : 'Change photo'}
              </label>
            </div>'''
assert src.count(old_avatar_row) == 1, "EditClientModal avatar row anchor not found or not unique"
new_avatar_row = '''              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-xs font-medium px-2.5 py-1.5 rounded-lg cursor-pointer flex-shrink-0"
                  style={{ background: 'var(--surface-raised)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                  <input type="file" accept="image/*" className="hidden" onChange={onAvatarUpload} disabled={uploadingAvatar} />
                  {uploadingAvatar ? 'Uploading...' : 'Change photo'}
                </label>
                <button onClick={onChooseFromGallery} disabled={uploadingAvatar}
                  className="text-xs font-medium px-2.5 py-1.5 rounded-lg flex-shrink-0"
                  style={{ background: 'var(--surface-raised)', color: 'var(--text)', border: '1px solid var(--border)', cursor: uploadingAvatar ? 'not-allowed' : 'pointer' }}>
                  Choose from gallery
                </button>
              </div>
            </div>'''
src = src.replace(old_avatar_row, new_avatar_row)

# 5. Parent state: showGalleryPicker + handler that hands the chosen
# preview URL straight to the existing crop modal (same as a local upload
# would, from that point on).
old_state = "  const [showAttachGallery, setShowAttachGallery] = useState(false)"
assert src.count(old_state) == 1, "showAttachGallery state anchor not found or not unique"
new_state = """  const [showAttachGallery, setShowAttachGallery] = useState(false)
  const [showGalleryPicker, setShowGalleryPicker] = useState(false)"""
src = src.replace(old_state, new_state)

old_crop_save = "  async function handleCropSave(croppedAreaPixels) {"
assert src.count(old_crop_save) == 1, "handleCropSave anchor not found or not unique"
new_crop_save = """  function handlePickFromGallery(previewUrl) {
    setCropSrc(previewUrl)
    setShowGalleryPicker(false)
  }

  async function handleCropSave(croppedAreaPixels) {"""
src = src.replace(old_crop_save, new_crop_save)

# 6. Wire onChooseFromGallery into the EditClientModal call site, and
# render the picker modal alongside the other client-detail modals.
old_edit_modal_call = """        <EditClientModal
          client={client}
          avatarUrl={avatarUrl}
          uploadingAvatar={uploadingAvatar}
          onAvatarUpload={handleAvatarUpload}
          onClose={() => setShowEdit(false)}"""
assert src.count(old_edit_modal_call) == 1, "EditClientModal call site anchor not found or not unique"
new_edit_modal_call = """        <EditClientModal
          client={client}
          avatarUrl={avatarUrl}
          uploadingAvatar={uploadingAvatar}
          onAvatarUpload={handleAvatarUpload}
          onChooseFromGallery={() => setShowGalleryPicker(true)}
          onClose={() => setShowEdit(false)}"""
src = src.replace(old_edit_modal_call, new_edit_modal_call)

old_crop_modal_render = """      {cropSrc && (
        <ClientAvatarCropModal
          imageSrc={cropSrc}
          onSave={handleCropSave}
          onCancel={() => setCropSrc(null)}
          saving={uploadingAvatar}
        />
      )}"""
assert src.count(old_crop_modal_render) == 1, "crop modal render anchor not found or not unique"
new_crop_modal_render = """      {cropSrc && (
        <ClientAvatarCropModal
          imageSrc={cropSrc}
          onSave={handleCropSave}
          onCancel={() => setCropSrc(null)}
          saving={uploadingAvatar}
        />
      )}

      {showGalleryPicker && (
        <AvatarGalleryPickerModal
          galleries={galleries}
          onSelect={handlePickFromGallery}
          onClose={() => setShowGalleryPicker(false)}
        />
      )}"""
src = src.replace(old_crop_modal_render, new_crop_modal_render)

path.write_text(src)
print("Added gallery image picker for client avatars")
