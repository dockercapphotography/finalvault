import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { getGalleries } from '../utils/galleryApi.js'
import GalleryGrid from '../components/galleries/GalleryGrid.jsx'
import Button from '../components/ui/Button.jsx'
import Toast from '../components/ui/Toast.jsx'

export default function Dashboard() {
  const navigate = useNavigate()
  const [galleries, setGalleries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState(null)

  useEffect(() => { loadGalleries() }, [])

  async function loadGalleries() {
    try {
      setLoading(true)
      setGalleries(await getGalleries())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleCopyLink(shareToken) {
    navigator.clipboard.writeText(`${window.location.origin}/g/${shareToken}`)
    setToast({ message: 'Gallery link copied!', type: 'success' })
  }

  const filtered = galleries.filter(g =>
    !search ||
    g.title.toLowerCase().includes(search.toLowerCase()) ||
    g.client_name?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Galleries</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {galleries.length} {galleries.length === 1 ? 'gallery' : 'galleries'}
          </p>
        </div>
        <Button onClick={() => navigate('/galleries/new')}>
          <Plus size={15} />
          New Gallery
        </Button>
      </div>

      {/* Search */}
      {galleries.length > 0 && (
        <div className="relative max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search galleries..."
            className="w-full text-sm pl-9 pr-4 py-2 rounded-lg outline-none transition-colors"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
            }}
            onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'}
          />
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-24">
          <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: 'var(--border-strong)', borderTopColor: 'transparent' }} />
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="px-4 py-3 rounded-xl text-sm"
          style={{ background: 'var(--danger-subtle)', color: 'var(--danger)', border: '1px solid var(--danger)' }}>
          Failed to load galleries: {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && galleries.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: 'var(--surface-raised)' }}>
            <Plus size={22} style={{ color: 'var(--text-muted)' }} />
          </div>
          <h2 className="font-medium mb-1" style={{ color: 'var(--text)' }}>No galleries yet</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
            Create your first gallery to get started
          </p>
          <Button onClick={() => navigate('/galleries/new')}>
            <Plus size={15} />
            Create Gallery
          </Button>
        </div>
      )}

      {/* Gallery grid */}
      {!loading && !error && filtered.length > 0 && (
        <GalleryGrid galleries={filtered} onCopyLink={handleCopyLink} />
      )}

      {/* No search results */}
      {!loading && !error && galleries.length > 0 && filtered.length === 0 && (
        <p className="text-sm py-12 text-center" style={{ color: 'var(--text-muted)' }}>
          No galleries match &ldquo;{search}&rdquo;
        </p>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50">
          <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
        </div>
      )}
    </div>
  )
}
