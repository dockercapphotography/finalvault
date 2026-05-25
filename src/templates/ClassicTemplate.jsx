export default function ClassicTemplate({ gallery, images, viewer, onFavorite, onComment, onDownload }) {
  return (
    <div className="min-h-screen" style={{ background: '#fff', color: '#111' }}>
      {/* Header */}
      <header className="px-8 py-6 border-b" style={{ borderColor: '#e5e7eb' }}>
        <h1 className="font-semibold text-lg" style={{ fontFamily: 'Geist, sans-serif' }}>
          {gallery.title}
        </h1>
        {gallery.clientName && (
          <p className="text-sm mt-0.5" style={{ color: '#6b7280' }}>{gallery.clientName}</p>
        )}
      </header>

      {/* Grid */}
      <main className="p-8">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {images.map(image => (
            <div key={image.id} className="aspect-square overflow-hidden rounded-lg bg-gray-100">
              <div className="w-full h-full bg-gray-200" />
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
