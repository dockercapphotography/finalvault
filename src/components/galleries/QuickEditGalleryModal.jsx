import { useState } from 'react'
import { useScrollLock } from '../../hooks/useScrollLock.js'
import { X } from 'lucide-react'
import Input from '../ui/Input.jsx'
import Button from '../ui/Button.jsx'
import { updateGallery } from '../../utils/galleryApi.js'

// Quick Edit -- lets the title/client name/event name/event date/notes
// (the same fields as GallerySettings.jsx's "Gallery Info" section) be
// edited directly from the gallery page, without navigating to full
// Settings. Explicit Save/Cancel, not autosave-on-blur -- Settings' save()
// is a shared function tied to many other settings fields this modal
// doesn't load, so this does its own scoped partial update instead of
// reusing that function directly.
export default function QuickEditGalleryModal({ gallery, onClose, onSaved }) {
  useScrollLock(true)
  const [title, setTitle] = useState(gallery.title || '')
  const [clientName, setClientName] = useState(gallery.client_name || '')
  const [eventName, setEventName] = useState(gallery.event_name || '')
  const [eventDate, setEventDate] = useState(gallery.event_date || '')
  const [notes, setNotes] = useState(gallery.notes || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!title.trim()) {
      setError('Gallery title is required.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const updated = await updateGallery(gallery.id, {
        title: title.trim(),
        client_name: clientName.trim() || null,
        event_name: eventName.trim() || null,
        event_date: eventDate || null,
        notes: notes.trim() || null,
      })
      onSaved(updated)
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to save changes.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl p-6 space-y-4"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm uppercase tracking-wider" style={{ color: 'var(--text)' }}>Quick Edit</h3>
          <button onClick={onClose} style={{ color: 'var(--text-muted)', cursor: 'pointer', background: 'none', border: 'none' }}><X size={16} /></button>
        </div>

        <Input label="Gallery title" value={title} onChange={setTitle} placeholder="e.g. Smith Wedding — June 2026" required error={error && !title.trim() ? error : ''} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Client name" value={clientName} onChange={setClientName} placeholder="e.g. Sarah & James" />
          <Input label="Event date" value={eventDate} onChange={setEventDate} type="date" />
        </div>
        <Input label="Event name" value={eventName} onChange={setEventName} placeholder="e.g. PopCon Indy 2026" hint="Shown in the client gallery header" />
        <Input label="Internal notes" value={notes} onChange={setNotes} placeholder="Not visible to clients" type="textarea" />

        {error && title.trim() && (
          <p className="text-xs" style={{ color: 'var(--danger)' }}>{error}</p>
        )}

        <div className="flex items-center gap-2 justify-end pt-1">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
        </div>
      </div>
    </div>
  )
}
