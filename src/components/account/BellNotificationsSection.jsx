import { useState, useEffect } from 'react'
import SettingsSection from '../ui/SettingsSection.jsx'
import Toggle from '../ui/Toggle.jsx'
import { getBellNotificationPreferences, updateBellNotificationPreference } from '../../utils/push.js'

const EVENT_TYPES = [
  { key: 'claim', label: 'New booking', desc: 'Show in the bell when a client claims a signup slot' },
  { key: 'inquiry', label: 'New inquiry', desc: 'Show in the bell when a client submits an inquiry' },
  { key: 'contract_signed', label: 'Contract signed', desc: 'Show in the bell when a client signs a contract' },
  { key: 'questionnaire_response', label: 'Questionnaire response', desc: 'Show in the bell when a client submits a questionnaire' },
  { key: 'view', label: 'Gallery views', desc: 'Show in the bell when a client views a gallery' },
  { key: 'favorite', label: 'Client favorites', desc: 'Show in the bell when a client favorites an image' },
  { key: 'comment', label: 'Client comments', desc: 'Show in the bell when a client leaves a comment' },
  { key: 'download', label: 'Client downloads', desc: 'Show in the bell when a client downloads images' },
]

export default function BellNotificationsSection({ photographerId, onSaveState }) {
  const [preferences, setPreferences] = useState(null)
  const [prefBusy, setPrefBusy] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!photographerId) return
    getBellNotificationPreferences(photographerId).then(setPreferences).catch(() => {})
  }, [photographerId])

  async function handleToggle(key, next) {
    if (prefBusy) return
    setPrefBusy(key)
    const previous = preferences
    setPreferences(p => ({ ...p, [key]: next }))
    try {
      await updateBellNotificationPreference(photographerId, key, next)
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
      title="Bell Notifications"
      description="Control what shows up in the notification bell itself, separate from push."
      action={
        <div style={{ opacity: prefBusy === 'enabled' ? 0.5 : 1, pointerEvents: prefBusy === 'enabled' ? 'none' : 'auto' }}>
          <Toggle checked={preferences.enabled} onChange={next => handleToggle('enabled', next)} />
        </div>
      }>
      {preferences.enabled && EVENT_TYPES.map((row, i) => (
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
