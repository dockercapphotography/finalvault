import { useState, useEffect, useRef } from 'react'
import { useScrollLock } from '../../hooks/useScrollLock.js'
import { X, Upload } from 'lucide-react'
import { supabase } from '../../supabaseClient.js'

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL

async function fetchAuthedBlob(r2Key) {
  const { data: { session } } = await supabase.auth.getSession()
  const resp = await fetch(`${WORKER_URL}/preview/${encodeURIComponent(r2Key)}`, {
    headers: { Authorization: `Bearer ${session.access_token}` }
  })
  if (!resp.ok) throw new Error('Failed to fetch preview')
  return URL.createObjectURL(await resp.blob())
}

function extractR2Key(workerUrl) {
  const match = workerUrl.match(/\/preview\/(.+)/)
  return match ? decodeURIComponent(match[1].split('?')[0]) : null
}

export default function CoverPickerModal({
  images, previewUrls, onSelect, onUpload, onClose,
  existingCoverUrl, existingFocusX = 0.5, existingFocusY = 0.5,
  preSelectedImage = null,  // jump straight to focal with this image pre-chosen
}) {
  useScrollLock(true)
  const [stage, setStage] = useState(
    preSelectedImage ? 'focal' : existingCoverUrl ? 'focal' : 'pick'
  )
  const [chosen, setChosen] = useState(null)
  const [focusX, setFocusX] = useState(existingFocusX)
  const [focusY, setFocusY] = useState(existingFocusY)
  const [saving, setSaving] = useState(false)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const fileInputRef = useRef(null)
  const focalRef = useRef(null)
  const isDragging = useRef(false)
  const ownedBlobsRef = useRef([])

  useEffect(() => {
    // If a specific image was pre-selected (from "Set as Cover" context menu),
    // load it directly and skip the pick stage
    if (preSelectedImage) {
      setLoadingPreview(true)
      setFocusX(0.5)
      setFocusY(0.5)
      fetchAuthedBlob(preSelectedImage.preview_r2_key)
        .then(url => {
          ownedBlobsRef.current.push(url)
          setChosen({ type: 'gallery', image: preSelectedImage, url })
        })
        .catch(err => console.error('Failed to load pre-selected image:', err))
        .finally(() => setLoadingPreview(false))
      return
    }

    // Otherwise load existing cover as before
    if (!existingCoverUrl) return
    if (existingCoverUrl.startsWith('blob:')) {
      setChosen({ type: 'existing', url: existingCoverUrl })
      return
    }
    const r2Key = extractR2Key(existingCoverUrl)
    if (!r2Key) { setChosen({ type: 'existing', url: existingCoverUrl }); return }
    setLoadingPreview(true)
    fetchAuthedBlob(r2Key)
      .then(url => {
        ownedBlobsRef.current.push(url)
        setChosen({ type: 'existing', url })
      })
      .catch(() => setChosen({ type: 'existing', url: existingCoverUrl }))
      .finally(() => setLoadingPreview(false))
  }, [])

  async function handlePickGallery(image) {
    setLoadingPreview(true)
    setFocusX(0.5)
    setFocusY(0.5)
    try {
      const url = await fetchAuthedBlob(image.preview_r2_key)
      ownedBlobsRef.current.push(url)
      setChosen({ type: 'gallery', image, url })
      setStage('focal')
    } catch (err) {
      console.error('Failed to load cover preview:', err)
    } finally {
      setLoadingPreview(false)
    }
  }

  function handleBrowse(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    ownedBlobsRef.current.push(url)
    setChosen({ type: 'upload', file, url })
    setFocusX(0.5)
    setFocusY(0.5)
    setStage('focal')
    e.target.value = ''
  }

  function updateFocal(e) {
    e.preventDefault()
    const rect = focalRef.current?.getBoundingClientRect()
    if (!rect) return
    const clientX = e.clientX ?? e.touches?.[0]?.clientX
    const clientY = e.clientY ?? e.touches?.[0]?.clientY
    if (clientX == null) return
    setFocusX(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)))
    setFocusY(Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)))
  }

  function handlePointerDown(e) {
    e.preventDefault()
    isDragging.current = true
    focalRef.current?.setPointerCapture(e.pointerId)
    updateFocal(e)
  }

  function handlePointerMove(e) {
    if (!isDragging.current) return
    e.preventDefault()
    updateFocal(e)
  }

  function handlePointerUp() {
    isDragging.current = false
  }

  async function handleSave() {
    setSaving(true)
    try {
      if (chosen.type === 'existing') {
        await onSelect(null, focusX, focusY, true)
      } else if (chosen.type === 'gallery') {
        await onSelect(chosen.image, focusX, focusY)
      } else {
        await onUpload(chosen.file, focusX, focusY)
      }
      ownedBlobsRef.current.forEach(u => URL.revokeObjectURL(u))
      onClose()
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <div
        className="w-full rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: 'var(--surface)', maxWidth: 720, width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="font-semibold text-base" style={{ color: 'var(--text)' }}>
            {stage === 'pick' ? 'Change Cover' : 'Adjust Focus Point'}
          </h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        {/* Loading state while fetching existing cover or pre-selected image */}
        {stage === 'focal' && !chosen && (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
          </div>
        )}

        {/* Pick stage */}
        {stage === 'pick' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div
              className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center py-8 gap-3 transition-colors"
              style={{ borderColor: 'var(--border)', cursor: 'pointer' }}
              onClick={() => fileInputRef.current?.click()}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#6366f1'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
              <Upload size={24} style={{ color: 'var(--text-muted)' }} />
              <p className="font-medium text-sm" style={{ color: 'var(--text)' }}>Drag photo here to upload</p>
              <button
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: '#6366f1', color: '#fff', cursor: 'pointer' }}
                onClick={e => { e.stopPropagation(); fileInputRef.current?.click() }}>
                Browse files
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="sr-only" onChange={handleBrowse} />
            </div>

            {images.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-3 uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                  Select from Gallery
                </p>
                {loadingPreview ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
                      style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-2">
                    {images.map(image => (
                      <div
                        key={image.id}
                        className="aspect-square rounded-lg overflow-hidden cursor-pointer"
                        style={{ outline: '2px solid transparent', outlineOffset: 2, transition: 'outline 0.1s' }}
                        onClick={() => handlePickGallery(image)}
                        onMouseEnter={e => e.currentTarget.style.outline = '2px solid #6366f1'}
                        onMouseLeave={e => e.currentTarget.style.outline = '2px solid transparent'}>
                        {previewUrls[image.id] && (
                          <img src={previewUrls[image.id]} alt={image.file_name}
                            className="w-full h-full" style={{ objectFit: 'cover' }} draggable={false} />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Focal stage */}
        {stage === 'focal' && chosen && (
          <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4" style={{ minHeight: 0 }}>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Drag the circle to set the focal point — this part will always be visible in the hero.
            </p>
            <div
              ref={focalRef}
              className="relative rounded-xl overflow-hidden"
              style={{ cursor: 'crosshair', touchAction: 'none', userSelect: 'none' }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}>
              <img
                src={chosen.url}
                alt="Cover preview"
                style={{ display: 'block', width: '100%', height: 'auto', maxHeight: '55vh', objectFit: 'contain', pointerEvents: 'none', userSelect: 'none' }}
                draggable={false}
              />
              <div
                className="absolute pointer-events-none"
                style={{
                  left: `${focusX * 100}%`,
                  top: `${focusY * 100}%`,
                  transform: 'translate(-50%, -50%)',
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  border: '3px solid white',
                  background: 'rgba(99,102,241,0.5)',
                  boxShadow: '0 0 0 1px #6366f1, 0 2px 8px rgba(0,0,0,0.5)',
                }} />
            </div>
            <div className="flex items-center justify-between">
              {/* Only show "Change image" if not pre-selected from context menu */}
              {!preSelectedImage ? (
                <button
                  onClick={() => { setStage('pick'); setChosen(null) }}
                  className="text-sm font-medium"
                  style={{ color: 'var(--text-muted)', cursor: 'pointer' }}>
                  ← Change image
                </button>
              ) : <div />}
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 rounded-xl text-sm font-medium"
                style={{ background: '#6366f1', color: '#fff', opacity: saving ? 0.6 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Saving…' : 'Set Cover'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
