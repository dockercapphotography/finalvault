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

  useEffect(() => {
    loadGalleries()
  }, [])

  async function loadGalleries() {
    try {
      setLoading(true)
      const data = await getGalleries()
      setGalleries(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleCopyLink(shareToken) {
    const url = `${window.location.origin}/g/${shareToken}`
    navigator.clipboard.writeText(url)
    setToast({ message: 'Gallery link copied!', type: 'success' })
  }

  const filtered = galleries.filter(g =>
    !search ||
    g.title.toLowerCase().includes(search.toLowerCase()) ||
    g.client_name?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-white text-xl font-semibold">Galleries</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {galleries.length} {galleries.length === 1 ? 'gallery' : 'galleries'}
          </p>
        </div>
        <Button onClick={() => navigate('/galleries/new')}>
          <Plus size={16} />
          New Gallery
        </Button>
      </div>

      {/* Search */}
      {galleries.length > 0 && (
        <div className="relative max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search galleries..."
            className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 text-sm pl-9 pr-4 py-2 rounded-lg focus:outline-none focus:border-slate-500"
          />
        </div>
      )}

      {/* States */}
      {loading && (
        <div className="flex items-center justify-center py-24">
          <div className="w-6 h-6 border-2 border-slate-700 border-t-slate-400 rounded-full animate-spin" />
        </div>
      )}

      {!loading && error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl text-sm">
          Failed to load galleries: {error}
        </div>
      )}

      {!loading && !error && galleries.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mb-4">
            <Plus size={24} className="text-slate-600" />
          </div>
          <h2 className="text-white font-medium mb-1">No galleries yet</h2>
          <p className="text-slate-500 text-sm mb-6">Create your first gallery to get started</p>
          <Button onClick={() => navigate('/galleries/new')}>
            <Plus size={16} />
            Create Gallery
          </Button>
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <GalleryGrid galleries={filtered} onCopyLink={handleCopyLink} />
      )}

      {!loading && !error && galleries.length > 0 && filtered.length === 0 && (
        <p className="text-slate-500 text-sm py-12 text-center">
          No galleries match &ldquo;{search}&rdquo;
        </p>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50">
          <Toast
            message={toast.message}
            type={toast.type}
            onDismiss={() => setToast(null)}
          />
        </div>
      )}
    </div>
  )
}
