import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { createGallery } from '../utils/galleryApi.js'
import GalleryForm from '../components/galleries/GalleryForm.jsx'
import Button from '../components/ui/Button.jsx'

export default function GalleryNew() {
  const navigate = useNavigate()
  const [values, setValues] = useState({ title: '', clientName: '', notes: '' })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit() {
    if (!values.title) return
    setIsSubmitting(true)
    setError(null)
    try {
      const gallery = await createGallery(values)
      navigate(`/galleries/${gallery.id}`)
    } catch (err) {
      setError(err.message)
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-xl">
      {/* Back */}
      <Button variant="ghost" onClick={() => navigate('/')} className="mb-6 -ml-2">
        <ArrowLeft size={15} />
        Back to galleries
      </Button>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>New Gallery</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Create a gallery to share with your client
        </p>
      </div>

      {error && (
        <div className="mb-5 px-4 py-3 rounded-lg text-sm"
          style={{ background: 'var(--danger-subtle)', color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      <div className="rounded-xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <GalleryForm
          values={values}
          onChange={setValues}
          onSubmit={handleSubmit}
          onCancel={() => navigate('/')}
          isSubmitting={isSubmitting}
          submitLabel="Create Gallery"
        />
      </div>
    </div>
  )
}
