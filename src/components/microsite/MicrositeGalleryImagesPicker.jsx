import { useState, useEffect } from 'react'
import { ChevronLeft, X, Check } from 'lucide-react'
import { getGalleries } from '../../utils/galleryApi.js'
import { getImages } from '../../utils/imageApi.js'
import { supabase } from '../../supabaseClient.js'
import SearchSelect from '../ui/SearchSelect.jsx'
import Button from '../ui/Button.jsx'

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL

/**
 * MicrositeGalleryImagesPicker — multi-select, spans any gallery.
 * Selections persist while switching between galleries (state lives here,
 * not per-gallery), unlike MicrositeImagePicker's single-select/close-on-pick.
 * Calls onDone(keys) with the full selected key array when the photographer
 * clicks Done; onClose() alone (no selection change) on cancel/backdrop.
 */
export default function MicrositeGalleryImagesPicker({ initialKeys = [], onDone, onClose }) {
  const [galleries, setGalleries] = useState([])
  const [selectedGallery, setSelectedGallery] = useState(null)
  const [images, setImages] = useState([])
  const [loadingImages, setLoadingImages] = useState(false)
  const [token, setToken] = useState(null)
  const [selectedKeys, setSelectedKeys] = useState(new Set(initialKeys))

  useEffect(() => {
    getGalleries().then(setGalleries).catch(() => setGalleries([]))
    // A direct ?token=<jwt> <img src> (below) instead of an authenticated
    // fetch()+blob()+createObjectURL() per thumbnail -- same fix as
    // GalleryGrid.jsx already uses for the main dashboard grid. Fetching
    // one at a time via blob URLs was both serial (each image waited on
    // the previous one to finish before starting) and bypassed the
    // browser's HTTP cache entirely; a plain <img> URL lets the browser
    // load every thumbnail in parallel with normal caching.
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

  function toggle(key) {
    setSelectedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const galleryOptions = galleries.map(g => ({
    id: g.id,
    label: g.title,
    sublabel: g.event_name || undefined,
  }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden flex flex-col" style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '85vh' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 min-w-0">
            {selectedGallery && (
              <button onClick={() => setSelectedGallery(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', flexShrink: 0 }}>
                <ChevronLeft size={16} />
              </button>
            )}
            <h3 className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
              {selectedGallery ? 'Select photos' : 'Choose a gallery'}
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
          <div className="overflow-y-auto p-4 flex-1">
            {loadingImages ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
              </div>
            ) : images.length === 0 ? (
              <p className="text-sm text-center py-16" style={{ color: 'var(--text-muted)' }}>This gallery has no images yet.</p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {images.map(img => {
                  const isSelected = selectedKeys.has(img.preview_r2_key)
                  const previewSrc = token ? `${WORKER_URL}/preview/${encodeURIComponent(img.preview_r2_key)}?token=${token}` : null
                  return (
                    <button
                      key={img.id}
                      onClick={() => toggle(img.preview_r2_key)}
                      className="relative aspect-square rounded-lg overflow-hidden"
                      style={{
                        background: 'var(--surface-raised)',
                        padding: 0,
                        cursor: previewSrc ? 'pointer' : 'default',
                        outline: isSelected ? '2px solid #6366f1' : '2px solid transparent',
                        outlineOffset: 2,
                      }}
                    >
                      {previewSrc
                        ? <img src={previewSrc} alt="" loading="lazy" className="w-full h-full object-cover" />
                        : <div className="w-full h-full animate-pulse" style={{ background: 'var(--surface-raised)' }} />}
                      {isSelected && (
                        <div className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: '#6366f1' }}>
                          <Check size={12} color="#fff" />
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{selectedKeys.size} selected</p>
          <Button onClick={() => onDone(Array.from(selectedKeys))}>Done</Button>
        </div>
      </div>
    </div>
  )
}
