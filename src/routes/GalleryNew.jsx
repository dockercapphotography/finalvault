import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { createGallery } from '../utils/galleryApi.js'
import { createSet } from '../utils/gallerySetApi.js'
import GalleryForm from '../components/galleries/GalleryForm.jsx'
import Button from '../components/ui/Button.jsx'
import Input from '../components/ui/Input.jsx'

export default function GalleryNew() {
  const navigate = useNavigate()
  const [step, setStep] = useState('info') // 'info' | 'sets'
  const [values, setValues] = useState({ title: '', clientName: '', notes: '', eventDate: '', eventName: '', template: 'classic' })
  const [sets, setSets] = useState([{ name: '' }])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState(null)

  function handleAddSet() {
    setSets(prev => [...prev, { name: '' }])
  }

  function handleSetName(index, value) {
    setSets(prev => prev.map((s, i) => i === index ? { ...s, name: value } : s))
  }

  function handleRemoveSet(index) {
    if (sets.length === 1) return
    setSets(prev => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit() {
    const validSets = sets.filter(s => s.name.trim())
    if (!validSets.length) { setError('At least one set name is required.'); return }
    setIsSubmitting(true)
    setError(null)
    try {
      const gallery = await createGallery(values)
      // Create sets in order
      for (let i = 0; i < validSets.length; i++) {
        await createSet(gallery.id, validSets[i].name)
      }
      navigate(`/galleries/${gallery.id}`)
    } catch (err) {
      setError(err.message)
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-xl">
      <Button variant="ghost" onClick={() => step === 'sets' ? setStep('info') : navigate('/')} className="mb-6 -ml-2">
        <ArrowLeft size={15} />
        {step === 'sets' ? 'Back to gallery info' : 'Back to galleries'}
      </Button>

      <div className="mb-8">
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>New Gallery</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          {step === 'info' ? 'Create a gallery to share with your client' : 'Define the sets for this gallery'}
        </p>
        {/* Step indicator */}
        <div className="flex items-center gap-2 mt-4">
          {['info', 'sets'].map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold"
                style={{
                  background: step === s ? '#6366f1' : s === 'info' && step === 'sets' ? 'var(--success)' : 'var(--surface-raised)',
                  color: step === s || (s === 'info' && step === 'sets') ? '#fff' : 'var(--text-muted)',
                }}>
                {s === 'info' && step === 'sets' ? '✓' : i + 1}
              </div>
              <span className="text-xs font-medium" style={{ color: step === s ? 'var(--text)' : 'var(--text-muted)' }}>
                {s === 'info' ? 'Gallery Info' : 'Photo Sets'}
              </span>
              {i === 0 && <div className="w-8 h-px" style={{ background: 'var(--border)' }} />}
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-5 px-4 py-3 rounded-lg text-sm"
          style={{ background: 'var(--danger-subtle)', color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      {step === 'info' && (
        <div className="rounded-xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <GalleryForm
            values={values}
            onChange={setValues}
            onSubmit={() => { if (values.title) setStep('sets') }}
            onCancel={() => navigate('/')}
            isSubmitting={false}
            submitLabel="Next: Define Sets →"
          />
        </div>
      )}

      {step === 'sets' && (
        <div className="space-y-4">
          <div className="rounded-xl p-6 space-y-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div>
              <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>Photo Sets</h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Sets organize your images into groups — e.g. "Previews", "Edited - Standard", "Social Media". Clients navigate between sets as tabs. At least one set is required.
              </p>
            </div>

            <div className="space-y-2">
              {sets.map((set, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex-1">
                    <input
                      type="text"
                      value={set.name}
                      onChange={e => handleSetName(i, e.target.value)}
                      placeholder={i === 0 ? 'e.g. Edited - Standard' : 'e.g. Social Media'}
                      autoFocus={i === sets.length - 1 && i > 0}
                      className="w-full text-sm rounded-lg px-3 py-2.5"
                      style={{
                        background: 'var(--bg-subtle)',
                        border: '1px solid var(--border)',
                        color: 'var(--text)',
                        outline: 'none',
                      }}
                      onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
                      onBlur={e => e.target.style.borderColor = 'var(--border)'}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); handleAddSet() }
                      }}
                    />
                  </div>
                  <button
                    onClick={() => handleRemoveSet(i)}
                    disabled={sets.length === 1}
                    className="p-2 rounded-lg transition-colors"
                    style={{
                      color: sets.length === 1 ? 'var(--border)' : 'var(--text-muted)',
                      cursor: sets.length === 1 ? 'not-allowed' : 'pointer',
                    }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={handleAddSet}
              className="flex items-center gap-1.5 text-sm font-medium"
              style={{ color: '#6366f1', cursor: 'pointer' }}>
              <Plus size={14} />
              Add another set
            </button>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={handleSubmit}
              disabled={!sets.some(s => s.name.trim()) || isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Gallery'}
            </Button>
            <Button variant="ghost" onClick={() => setStep('info')}>
              Back
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
