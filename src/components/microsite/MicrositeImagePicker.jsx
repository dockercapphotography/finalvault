import { useState, useEffect } from 'react'
import { ChevronLeft, X } from 'lucide-react'
import { getGalleries } from '../../utils/galleryApi.js'
import { getImages } from '../../utils/imageApi.js'
import { supabase } from '../../supabaseClient.js'
import SearchSelect from '../ui/SearchSelect.jsx'

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL

/**
 * MicrositeImagePicker — two-step modal: pick a gallery, then pick one
 * image from it. Calls onSelect(r2Key) with the chosen image's preview
 * R2 key, then onClose().
 */
export default function MicrositeImagePicker({ onSelect, onClose }) {
  const [galleries, setGalleries] = useState([])
  const [selectedGallery, setSelectedGallery] = useState(null)
  const [images, setImages] = useState([])
  const [loadingImages, setLoadingImages] = useState(false)
  const [token, setToken] = useState(null)

  useEffect(() => {
    getGalleries().then(setGalleries).catch(() => setGalleries([]))
    // Direct ?token=<jwt> <img src> instead of an authenticated
    // fetch()+blob() per thumbnail -- see
    // MicrositeGalleryImagesPicker.jsx's identical fix for the full
    // reasoning (serial loading + no browser cache with blob URLs was
    // the actual cause of the slow thumbnails, not a missing
    // resize/thumbnail endpoint -- there isn't one).
    supabase.auth.getSession().then(({ data: { session } }) => {
      setToken(session?.access_token || null)
    })
  }, [])

  useEffect(() => {
    if (!selectedGallery) return
    let cancelled = false
    setLoadingImages(true)
    setImages([])

    getImages(selectedGallery).then(imgs => {
      if (cancelled) return
      setImages(imgs)
      setLoadingImages(false)
    }).catch(() => { if (!cancelled) setLoadingImages(false) })

    return () => { cancelled = true }
  }, [selectedGallery])

  const galleryOptions = galleries.map(g => ({
    id: g.id,
    label: g.title,
    sublabel: g.event_name || undefined,
  }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden flex flex-col" style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '80vh' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 min-w-0">
            {selectedGallery && (
              <button onClick={() => setSelectedGallery(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', flexShrink: 0 }}>
                <ChevronLeft size={16} />
              </button>
            )}
            <h3 className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
              {selectedGallery ? 'Choose an image' : 'Choose a gallery'}
            </h3>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)', cursor: 'pointer', background: 'none', border: 'none' }}>
            <X size={18} />
          </button>
        </div>

        {!selectedGallery && (
          <div className="p-4 overflow-y-auto">
            <SearchSelect
              options={galleryOptions}
              value={null}
              onChange={id => setSelectedGallery(id)}
              placeholder="Search galleries..."
              emptyText="No galleries yet"
            />
          </div>
        )}

        {selectedGallery && (
          <div className="overflow-y-auto p-4">
            {loadingImages ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
              </div>
            ) : images.length === 0 ? (
              <p className="text-sm text-center py-16" style={{ color: 'var(--text-muted)' }}>This gallery has no images yet.</p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {images.map(img => {
                  const previewSrc = token ? `${WORKER_URL}/preview/${encodeURIComponent(img.preview_r2_key)}?token=${token}` : null
                  return (
                    <button
                      key={img.id}
                      onClick={() => { onSelect(img.preview_r2_key); onClose() }}
                      className="aspect-square rounded-lg overflow-hidden"
                      style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', padding: 0, cursor: previewSrc ? 'pointer' : 'default' }}
                    >
                      {previewSrc
                        ? <img src={previewSrc} alt="" loading="lazy" className="w-full h-full object-cover" />
                        : <div className="w-full h-full animate-pulse" style={{ background: 'var(--surface-raised)' }} />}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
