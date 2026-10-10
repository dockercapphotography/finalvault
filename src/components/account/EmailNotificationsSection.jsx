import { useState, useEffect } from 'react'
import SettingsSection from '../ui/SettingsSection.jsx'
import Toggle from '../ui/Toggle.jsx'
import { getEmailNotificationPreferences, updateEmailNotificationPreference } from '../../utils/push.js'

// Emails FinalVault sends the photographer (v1.5.17). Same row layout and
// optimistic toggle handling as BellNotificationsSection. Starts with the
// one worth switching off -- the "New review" email; more rows can be
// added here as columns land on email_notification_preferences (sql/094).
const EVENT_TYPES = [
  { key: 'testimonial', label: 'New review', desc: 'Email me when a client sends a review' },
]

export default function EmailNotificationsSection({ photographerId, onSaveState }) {
  const [preferences, setPreferences] = useState(null)
  const [prefBusy, setPrefBusy] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!photographerId) return
    getEmailNotificationPreferences(photographerId).then(setPreferences).catch(() => {})
  }, [photographerId])

  async function handleToggle(key, next) {
    if (prefBusy) return
    setPrefBusy(key)
    const previous = preferences
    setPreferences(p => ({ ...p, [key]: next }))
    try {
      await updateEmailNotificationPreference(photographerId, key, next)
      onSaveState?.('saved')
    } catch {
      setPreferences(previous)
      setError('Could not save that. Try again.')
      onSaveState?.('error')
    } finally {
      setPrefBusy(null)
    }
  }

  if (!preferences) return null

  return (
    <SettingsSection
      title="Email Notifications"
      description="Emails FinalVault sends you when something needs your attention.">
      {EVENT_TYPES.map((row, i) => (
        <div key={row.key} className="flex items-center justify-between px-5 py-4"
          style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none', borderBottom: 'none', background: 'var(--surface)' }}>
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{row.label}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{row.desc}</p>
          </div>
          <div style={{ opacity: prefBusy === row.key ? 0.5 : 1, pointerEvents: prefBusy === row.key ? 'none' : 'auto' }}>
            <Toggle checked={preferences[row.key]} onChange={next => handleToggle(row.key, next)} />
          </div>
        </div>
      ))}
      {error && <p className="text-xs mt-2 px-5" style={{ color: 'var(--error, #e5484d)' }}>{error}</p>}
    </SettingsSection>
  )
}
