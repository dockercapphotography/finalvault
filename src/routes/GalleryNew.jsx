import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, Check, X } from 'lucide-react'
import { createGallery, linkGalleriesToClient } from '../utils/galleryApi.js'
import { getClients } from '../utils/crmApi.js'
import { createSet } from '../utils/gallerySetApi.js'
import { getGalleryTemplates } from '../utils/galleryTemplateApi.js'
import { THEMES, getTheme } from '../utils/themes.js'
import Button from '../components/ui/Button.jsx'
import ClientPicker from '../components/ui/ClientPicker.jsx'
import ClientAvatarCircle from '../components/ui/ClientAvatarCircle.jsx'
import Input from '../components/ui/Input.jsx'
import { generatePin, generatePassword } from '../utils/secretGenerators.js'

export default function GalleryNew() {
  const navigate = useNavigate()
  const location = useLocation()
  // folderId passed via router state when "New Gallery" is clicked from inside a folder
  const folderId = location.state?.folderId ?? null

  const [step, setStep] = useState('template') // 'template' | 'info' | 'sets'
  const [templates, setTemplates] = useState([])
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [values, setValues] = useState({ title: '', clientName: '', eventName: '', notes: '', eventDate: '' })
  const [clients, setClients] = useState([])
  const [selectedClientIds, setSelectedClientIds] = useState([])
  const [sets, setSets] = useState([{ name: '' }])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [loadingTemplates, setLoadingTemplates] = useState(true)

  useEffect(() => {
    getGalleryTemplates()
      .then(data => { setTemplates(data); setLoadingTemplates(false) })
      .catch(() => setLoadingTemplates(false))
    getClients().then(setClients).catch(() => {})
  }, [])

  function handleSelectTemplate(template) {
    setSelectedTemplate(template)
    setSets(template.sets.map(name => ({ name })))
  }

  function handleSkipTemplate() {
    setSelectedTemplate(null)
    setSets([{ name: '' }])
    setStep('info')
  }

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
      const requirePassword = selectedTemplate?.require_password ?? false
      const requireDownloadPin = selectedTemplate?.require_download_pin ?? false
      const gallery = await createGallery({
        title: values.title,
        clientName: values.clientName,
        eventName: values.eventName,
        notes: values.notes,
        eventDate: values.eventDate,
        clientId: selectedClientIds[0] || null,
        themeColor: selectedTemplate?.theme_color || 'light',
        gridSize: selectedTemplate?.grid_size || 'medium',
        gridSpacing: selectedTemplate?.grid_spacing || 'tight',
        allowDownloads: selectedTemplate?.allow_downloads ?? true,
        downloadWatermarked: selectedTemplate?.download_watermarked ?? false,
        allowHiresDownload: selectedTemplate?.allow_hires_download ?? false,
        allowFavorites: selectedTemplate?.allow_favorites ?? true,
        allowComments: selectedTemplate?.allow_comments ?? true,
        requirePassword,
        requireDownloadPin,
        // A template can default these requirements to ON, but there's no
        // UI at creation time to set the actual secret -- generate one
        // automatically (same as Settings does when the toggle is flipped
        // on there) so the gallery isn't left requiring a PIN/password
        // that doesn't exist yet.
        password: requirePassword ? generatePassword() : null,
        downloadPin: requireDownloadPin ? generatePin() : null,
        watermarkId: selectedTemplate?.watermark_id || null,
        folderId,
      })
      // createGallery already links the first client (if any) via
      // gallery_clients. Link any additional selected clients the same way.
      for (const clientId of selectedClientIds.slice(1)) {
        await linkGalleriesToClient([gallery.id], clientId)
      }
      for (let i = 0; i < validSets.length; i++) {
        await createSet(gallery.id, validSets[i].name)
      }
      navigate(`/galleries/${gallery.id}`)
    } catch (err) {
      setError(err.message)
      setIsSubmitting(false)
    }
  }

  const STEPS = ['template', 'info', 'sets']
  const STEP_LABELS = { template: 'Template', info: 'Gallery Info', sets: 'Photo Sets' }

  return (
    <div className="max-w-xl">
      <Button variant="ghost" onClick={() => {
        if (step === 'sets') setStep('info')
        else if (step === 'info') setStep('template')
        else navigate('/')
      }} className="mb-6 -ml-2">
        <ArrowLeft size={15} />
        {step === 'sets' ? 'Back to gallery info' : step === 'info' ? 'Back to template' : 'Back to galleries'}
      </Button>

      <div className="mb-8">
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>New Gallery</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          {step === 'template' ? 'Start from a template or build from scratch' : step === 'info' ? 'Fill in the gallery details' : 'Define the sets for this gallery'}
        </p>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mt-4">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold"
                style={{
                  background: step === s ? '#6366f1'
                    : STEPS.indexOf(step) > i ? 'var(--success)'
                    : 'var(--surface-raised)',
                  color: step === s || STEPS.indexOf(step) > i ? '#fff' : 'var(--text-muted)',
                }}>
                {STEPS.indexOf(step) > i ? '✓' : i + 1}
              </div>
              <span className="text-xs font-medium" style={{ color: step === s ? 'var(--text)' : 'var(--text-muted)' }}>
                {STEP_LABELS[s]}
              </span>
              {i < STEPS.length - 1 && <div className="w-8 h-px" style={{ background: 'var(--border)' }} />}
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

      {/* ── Step 1: Template ── */}
      {step === 'template' && (
        <div className="space-y-4">
          {loadingTemplates ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {templates.map(template => {
                const theme = getTheme(template.theme_color)
                const isSelected = selectedTemplate?.id === template.id
                return (
                  <button
                    key={template.id}
                    onClick={() => handleSelectTemplate(template)}
                    className="w-full text-left rounded-xl p-4 transition-all"
                    style={{
                      background: 'var(--surface)',
                      border: isSelected ? '2px solid #6366f1' : '1px solid var(--border)',
                      cursor: 'pointer',
                      outline: 'none',
                    }}>
                    <div className="flex items-center gap-4">
                      <div className="shrink-0 flex gap-1.5 items-center justify-center w-16 h-10 rounded-lg"
                        style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}>
                        <div className="w-3.5 h-3.5 rounded-full border" style={{ background: theme.bg, borderColor: 'var(--border)' }} />
                        <div className="w-3.5 h-3.5 rounded-full border" style={{ background: theme.surface, borderColor: 'var(--border)' }} />
                        <div className="w-3.5 h-3.5 rounded-full border" style={{ background: theme.accent, borderColor: 'var(--border)' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{template.name}</p>
                          {template.is_builtin && (
                            <span className="text-xs px-1.5 py-0.5 rounded font-medium"
                              style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}>
                              Built-in
                            </span>
                          )}
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          {theme.label} · {template.sets.join(', ')}
                        </p>
                      </div>
                      {isSelected && (
                        <div className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
                          style={{ background: '#6366f1' }}>
                          <Check size={11} color="#fff" />
                        </div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={() => { if (selectedTemplate) setStep('info') }}
              disabled={!selectedTemplate}>
              Use Template →
            </Button>
            <Button variant="ghost" onClick={handleSkipTemplate}>
              Start from scratch
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 2: Gallery Info ── */}
      {step === 'info' && (
        <div className="rounded-xl p-6 space-y-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div>
            <label className="text-sm font-medium block mb-1" style={{ color: 'var(--text)' }}>
              Gallery title <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              type="text"
              value={values.title}
              onChange={e => setValues(v => ({ ...v, title: e.target.value }))}
              placeholder="e.g. The Smith Wedding"
              autoFocus
              className="w-full text-sm rounded-lg px-3 py-2.5"
              style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none' }}
              onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
          </div>

          {clients.length > 0 && (
            <div>
              <label className="text-sm font-medium block mb-1" style={{ color: 'var(--text)' }}>
                Link to clients <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>(optional)</span>
              </label>
              {selectedClientIds.length > 0 && (
                <div className="rounded-xl overflow-hidden mb-2" style={{ border: '1px solid var(--border)' }}>
                  {selectedClientIds.map((clientId, i) => {
                    const c = clients.find(c => c.id === clientId)
                    if (!c) return null
                    return (
                      <div
                        key={clientId}
                        className="flex items-center gap-2.5 px-3 py-2.5"
                        style={{ borderBottom: i < selectedClientIds.length - 1 ? '1px solid var(--border)' : 'none' }}
                      >
                        <ClientAvatarCircle client={c} size={30} />
                        <span className="flex-1 min-w-0">
                          <span className="text-sm block truncate" style={{ color: 'var(--text)' }}>
                            {[c.first_name, c.last_name].filter(Boolean).join(' ') || c.email}
                          </span>
                          {c.email && (
                            <span className="text-xs block truncate" style={{ color: 'var(--text-muted)' }}>{c.email}</span>
                          )}
                        </span>
                        <button
                          onClick={() => setSelectedClientIds(prev => prev.filter(id => id !== clientId))}
                          style={{ cursor: 'pointer', color: 'var(--text-muted)', background: 'none', border: 'none', flexShrink: 0 }}
                          title="Remove"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
              <ClientPicker
                clients={clients.filter(c => !selectedClientIds.includes(c.id))}
                value=""
                onChange={clientId => {
                  if (!clientId) return
                  setSelectedClientIds(prev => [...prev, clientId])
                  const c = clients.find(c => c.id === clientId)
                  if (c && !values.clientName) {
                    setValues(v => ({ ...v, clientName: `${c.first_name} ${c.last_name}` }))
                  }
                }}
                placeholder={selectedClientIds.length > 0 ? 'Add another client...' : 'Select a client...'}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium block mb-1" style={{ color: 'var(--text)' }}>Client name</label>
              <input
                type="text"
                value={values.clientName}
                onChange={e => setValues(v => ({ ...v, clientName: e.target.value }))}
                placeholder="e.g. Sarah & James"
                className="w-full text-sm rounded-lg px-3 py-2.5"
                style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none' }}
                onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1" style={{ color: 'var(--text)' }}>Event date</label>
              <input
                type="date"
                value={values.eventDate}
                onChange={e => setValues(v => ({ ...v, eventDate: e.target.value }))}
                className="w-full text-sm rounded-lg px-3 py-2.5"
                style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none' }}
                onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1" style={{ color: 'var(--text)' }}>Event name</label>
            <input
              type="text"
              value={values.eventName}
              onChange={e => setValues(v => ({ ...v, eventName: e.target.value }))}
              placeholder="e.g. Sarah & James Smith Wedding"
              className="w-full text-sm rounded-lg px-3 py-2.5"
              style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none' }}
              onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Shown to clients in their gallery</p>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1" style={{ color: 'var(--text)' }}>Internal notes</label>
            <textarea
              value={values.notes}
              onChange={e => setValues(v => ({ ...v, notes: e.target.value }))}
              placeholder="Not visible to clients"
              rows={3}
              className="w-full text-sm rounded-lg px-3 py-2.5 resize-none"
              style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none', fontFamily: 'inherit' }}
              onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button onClick={() => { if (values.title.trim()) setStep('sets') }} disabled={!values.title.trim()}>
              Next: Define Sets →
            </Button>
            <Button variant="ghost" onClick={() => navigate('/')}>Cancel</Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Sets ── */}
      {step === 'sets' && (
        <div className="space-y-4">
          <div className="rounded-xl p-6 space-y-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div>
              <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>Photo Sets</h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Sets organize your images into groups. Clients navigate between sets as tabs. At least one set is required.
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
                      style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none' }}
                      onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
                      onBlur={e => e.target.style.borderColor = 'var(--border)'}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddSet() } }}
                    />
                  </div>
                  <button
                    onClick={() => handleRemoveSet(i)}
                    disabled={sets.length === 1}
                    className="p-2 rounded-lg transition-colors"
                    style={{ color: sets.length === 1 ? 'var(--border)' : 'var(--text-muted)', cursor: sets.length === 1 ? 'not-allowed' : 'pointer' }}>
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
            <Button onClick={handleSubmit} disabled={!sets.some(s => s.name.trim()) || isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Gallery'}
            </Button>
            <Button variant="ghost" onClick={() => setStep('info')}>Back</Button>
          </div>
        </div>
      )}
    </div>
  )
}
