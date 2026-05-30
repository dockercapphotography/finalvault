import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bookmark } from 'lucide-react'
import { getBookmarkedGalleries, getBookmarkedImages } from '../utils/bookmarkApi.js'
import { supabase } from '../supabaseClient.js'
import { fetchPreviewObjectUrl } from '../utils/r2.js'
import GalleryGrid from '../components/galleries/GalleryGrid.jsx'
import ImageCard from '../components/images/ImageCard.jsx'

export default function Bookmarked() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('galleries')
  const [galleries, setGalleries] = useState([])
  const [images, setImages] = useState([])
  const [previewUrls, setPreviewUrls] = useState({})
  const [loading, setLoading] = useState(true)

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

  // When a bookmark is removed from this page, remove it from the list
  function handleUnbookmarkImage(imageId) {
    setImages(prev => prev.filter(i => i.id !== imageId))
  }

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
          <button key={t.id} onClick={() => setTab(t.id)}
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
            <div>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                {images.map(img => (
                  <div key={img.id} className="space-y-1">
                    <ImageCard
                      image={img}
                      previewUrl={previewUrls[img.id]}
                      onDelete={() => {}}
                      isCover={false}
                      selected={false}
                      onSelect={() => navigate(`/galleries/${img.galleryId}`)}
                      selectionMode={false}
                      sets={[]}
                      isBookmarked={true}
                      onOpen={() => navigate(`/galleries/${img.galleryId}`)}
                    />
                    <p className="text-xs truncate px-0.5" style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                      {img.galleryTitle}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )
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
