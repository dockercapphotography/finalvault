import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Bookmark, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { getBookmarkedGalleries, getBookmarkedImages } from '../utils/bookmarkApi.js'
import { supabase } from '../supabaseClient.js'
import { fetchPreviewObjectUrl } from '../utils/r2.js'
import GalleryGrid from '../components/galleries/GalleryGrid.jsx'
import ImageCard from '../components/images/ImageCard.jsx'

export default function Bookmarked() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState(searchParams.get('tab') || 'galleries')
  const [galleries, setGalleries] = useState([])
  const [images, setImages] = useState([])
  const [previewUrls, setPreviewUrls] = useState({})
  const [loading, setLoading] = useState(true)
  const [lightboxIndex, setLightboxIndex] = useState(null)

  function handleTabChange(t) {
    setTab(t)
    setSearchParams(t === 'galleries' ? {} : { tab: t }, { replace: true })
  }

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [g, i] = await Promise.all([getBookmarkedGalleries(), getBookmarkedImages()])
        setGalleries(g)
        setImages(i)
        if (i.length) {
          const { data: { session } } = await supabase.auth.getSession()
          const token = session?.access_token
          const urls = {}
          await Promise.all(i.map(async img => {
            if (!img.preview_r2_key) return
            try { urls[img.id] = await fetchPreviewObjectUrl({ key: img.preview_r2_key, token }) } catch {}
          }))
          setPreviewUrls(urls)
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="space-y-5 max-w-7xl">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Bookmarked</h1>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Your saved galleries and photos</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1" style={{ borderBottom: '1px solid var(--border)' }}>
        {[
          { id: 'galleries', label: 'Galleries', count: galleries.length },
          { id: 'photos',    label: 'Photos',    count: images.length },
        ].map(t => (
          <button key={t.id} onClick={() => handleTabChange(t.id)}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium -mb-px"
            style={{
              color: tab === t.id ? '#6366f1' : 'var(--text-muted)',
              borderTop: 'none', borderLeft: 'none', borderRight: 'none',
              borderBottom: tab === t.id ? '2px solid #6366f1' : '2px solid transparent',
              background: 'none', cursor: 'pointer',
            }}>
            {t.label}
            {t.count > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded-full"
                style={{ background: tab === t.id ? 'rgba(99,102,241,0.1)' : 'var(--surface-raised)', color: tab === t.id ? '#6366f1' : 'var(--text-muted)' }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-24">
          <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
        </div>
      )}

      {/* Galleries tab */}
      {!loading && tab === 'galleries' && (
        galleries.length === 0
          ? <EmptyState message="No bookmarked galleries yet" sub="Click the bookmark icon on any gallery to save it here" />
          : <GalleryGrid galleries={galleries} onCopyLink={() => {}} bookmarkedIds={new Set(galleries.map(g => g.id))} />
      )}

      {/* Photos tab */}
      {!loading && tab === 'photos' && (
        images.length === 0
          ? <EmptyState message="No bookmarked photos yet" sub="Click the bookmark icon on any image to save it here" />
          : (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
              {images.map((img, idx) => (
                <div key={img.id} className="space-y-1">
                  <ImageCard
                    image={img}
                    previewUrl={previewUrls[img.id]}
                    onDelete={() => {}}
                    isCover={false}
                    selected={false}
                    onSelect={() => setLightboxIndex(idx)}
                    selectionMode={false}
                    sets={[]}
                    isBookmarked={true}
                    simplified={true}
                    onUnbookmark={() => setImages(prev => prev.filter(i => i.id !== img.id))}
                    onOpen={() => setLightboxIndex(idx)}
                  />
                  <p className="text-xs truncate px-0.5" style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                    {img.galleryTitle}
                  </p>
                </div>
              ))}
            </div>
          )
      )}

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <BookmarkedLightbox
          images={images}
          index={lightboxIndex}
          previewUrls={previewUrls}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
          onViewGallery={galleryId => navigate(`/galleries/${galleryId}`, { state: { from: `/bookmarked?tab=photos` } })}
        />
      )}
    </div>
  )
}

function BookmarkedLightbox({ images, index, previewUrls, onClose, onNavigate, onViewGallery }) {
  const img = images[index]
  if (!img) return null
  const total = images.length
  const goPrev = () => onNavigate((index - 1 + total) % total)
  const goNext = () => onNavigate((index + 1) % total)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.95)' }}
      onClick={onClose}
      onKeyDown={e => { if (e.key === 'ArrowLeft') goPrev(); if (e.key === 'ArrowRight') goNext(); if (e.key === 'Escape') onClose() }}
      tabIndex={0}
      ref={el => el?.focus()}>

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 z-10"
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)' }}
        onClick={e => e.stopPropagation()}>
        <p className="text-sm font-medium truncate" style={{ color: 'rgba(255,255,255,0.85)' }}>{img.file_name}</p>
        <div className="flex items-center gap-2">
          <button onClick={() => onViewGallery(img.galleryId)}
            className="text-xs px-3 py-1.5 rounded-lg font-medium"
            style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', cursor: 'pointer' }}>
            View Gallery
          </button>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', cursor: 'pointer' }}>
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Prev */}
      {total > 1 && (
        <button onClick={e => { e.stopPropagation(); goPrev() }}
          className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center z-10"
          style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', cursor: 'pointer' }}>
          <ChevronLeft size={20} />
        </button>
      )}

      {/* Next */}
      {total > 1 && (
        <button onClick={e => { e.stopPropagation(); goNext() }}
          className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center z-10"
          style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', cursor: 'pointer' }}>
          <ChevronRight size={20} />
        </button>
      )}

      {/* Image */}
      <img
        src={previewUrls[img.id]}
        alt={img.file_name}
        draggable={false}
        onClick={e => e.stopPropagation()}
        style={{ maxHeight: '90vh', maxWidth: '80vw', objectFit: 'contain', borderRadius: 4, userSelect: 'none' }}
      />

      {/* Counter */}
      {total > 1 && (
        <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs"
          style={{ color: 'rgba(255,255,255,0.4)' }}>
          {index + 1} of {total}
        </p>
      )}
    </div>
  )
}

function EmptyState({ message, sub }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
        style={{ background: 'var(--surface-raised)' }}>
        <Bookmark size={22} style={{ color: 'var(--text-muted)' }} />
      </div>
      <h2 className="font-medium mb-1" style={{ color: 'var(--text)' }}>{message}</h2>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{sub}</p>
    </div>
  )
}
