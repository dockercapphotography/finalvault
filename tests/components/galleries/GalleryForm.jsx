import Input from '../ui/Input.jsx'
import Button from '../ui/Button.jsx'

const TEMPLATES = [
  { id: 'classic',   name: 'Classic',   description: 'Clean grid, similar to Pixieset' },
  { id: 'minimal',   name: 'Minimal',   description: 'Full bleed, minimal UI chrome' },
  { id: 'editorial', name: 'Editorial', description: 'Magazine-style with typography' },
  { id: 'bold',      name: 'Bold',      description: 'Large hero image, dramatic' },
]

const selectStyle = {
  width: '100%',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  borderRadius: '8px',
  padding: '9px 12px',
  fontSize: '14px',
  outline: 'none',
  cursor: 'pointer',
  appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  paddingRight: '36px',
}

export default function GalleryForm({ values, onChange, onSubmit, onCancel, isSubmitting, submitLabel = 'Create Gallery' }) {
  const { title = '', clientName = '', notes = '', eventDate = '', template = 'classic' } = values

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Input
        label="Gallery title"
        value={title}
        onChange={val => onChange({ ...values, title: val })}
        placeholder="e.g. Smith Wedding — June 2026"
        required
      />

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Client name"
          value={clientName}
          onChange={val => onChange({ ...values, clientName: val })}
          placeholder="e.g. Sarah & James"
          hint="Shown to clients in their gallery"
        />
        <Input
          label="Event date"
          value={eventDate}
          onChange={val => onChange({ ...values, eventDate: val })}
          type="date"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>
          Gallery template
        </label>
        <select
          value={template}
          onChange={e => onChange({ ...values, template: e.target.value })}
          style={selectStyle}
        >
          {TEMPLATES.map(t => (
            <option key={t.id} value={t.id}>{t.name} — {t.description}</option>
          ))}
        </select>
      </div>

      <Input
        label="Internal notes"
        value={notes}
        onChange={val => onChange({ ...values, notes: val })}
        placeholder="Not visible to clients"
        type="textarea"
      />

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={!title || isSubmitting}>
          {isSubmitting ? 'Saving...' : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}
