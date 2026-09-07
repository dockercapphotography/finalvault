import { useState, useEffect, useCallback } from 'react'
import { Laptop, Smartphone, BellOff, X } from 'lucide-react'
import SettingsSection from '../ui/SettingsSection.jsx'
import Toggle from '../ui/Toggle.jsx'
import {
  pushSupported, permissionState, getSubscriptions, getThisDeviceEndpoint,
  subscribe, unsubscribeThisDevice, removeDeviceById, isIOS, isInstalledStandalone,
  getPushNotificationPreferences, updatePushNotificationPreference,
} from '../../utils/push.js'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

const EVENT_TYPES = [
  { key: 'claim', label: 'New booking', desc: 'Get notified when a client claims a signup slot' },
  { key: 'inquiry', label: 'New inquiry', desc: 'Get notified when a client submits an inquiry' },
  { key: 'contract_signed', label: 'Contract signed', desc: 'Get notified when a client signs a contract' },
  { key: 'questionnaire_response', label: 'Questionnaire response', desc: 'Get notified when a client submits a questionnaire' },
  { key: 'favorite', label: 'Client favorites', desc: 'Get notified when a client favorites images (batched)' },
  { key: 'comment', label: 'Client comments', desc: 'Get notified when a client leaves a comment' },
  { key: 'download', label: 'Client downloads', desc: 'Get notified when a client downloads images (batched)' },
]

export default function PushNotificationsSection({ photographerId, onSaveState }) {
  const [loaded, setLoaded] = useState(false)
  const [permission, setPermission] = useState('default')
  const [thisDeviceEndpoint, setThisDeviceEndpoint] = useState(null)
  const [devices, setDevices] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [preferences, setPreferences] = useState(null)
  const [prefBusy, setPrefBusy] = useState(null)
  const [batchMinutes, setBatchMinutes] = useState('')

  const refresh = useCallback(async () => {
    if (!photographerId) return
    const [subs, endpoint] = await Promise.all([
      getSubscriptions(photographerId),
      getThisDeviceEndpoint(),
    ])
    setDevices(subs)
    setThisDeviceEndpoint(endpoint)
  }, [photographerId])

  useEffect(() => {
    if (!photographerId || !pushSupported()) { setLoaded(true); return }
    setPermission(permissionState())
    refresh().finally(() => setLoaded(true))
    getPushNotificationPreferences(photographerId).then(setPreferences).catch(() => {})
  }, [photographerId, refresh])

  useEffect(() => {
    if (preferences) setBatchMinutes(String(preferences.activity_batch_minutes ?? 5))
  }, [preferences])

  async function handlePreferenceToggle(key, next) {
    if (prefBusy) return
    setPrefBusy(key)
    const previous = preferences
    setPreferences(p => ({ ...p, [key]: next }))
    try {
      await updatePushNotificationPreference(photographerId, key, next)
      onSaveState?.('saved')
    } catch {
      setPreferences(previous)
      setError('Could not save that. Try again.')
      onSaveState?.('error')
    } finally {
      setPrefBusy(null)
    }
  }

  // Batch minutes is a plain number, not a toggle -- saved on blur
  // rather than on every keystroke. Clamped to >= 1; anything invalid
  // falls back to 5 rather than saving a broken value.
  async function handleBatchMinutesBlur() {
    const parsed = parseInt(batchMinutes, 10)
    const value = Number.isFinite(parsed) && parsed >= 1 ? parsed : 5
    setBatchMinutes(String(value))
    if (value === preferences?.activity_batch_minutes) return
    const previous = preferences
    setPreferences(p => ({ ...p, activity_batch_minutes: value }))
    try {
      await updatePushNotificationPreference(photographerId, 'activity_batch_minutes', value)
      onSaveState?.('saved')
    } catch {
      setPreferences(previous)
      setBatchMinutes(String(previous.activity_batch_minutes))
      setError('Could not save that. Try again.')
      onSaveState?.('error')
    }
  }

  const enabledOnThisDevice = !!thisDeviceEndpoint

  async function handleToggle(next) {
    if (busy) return
    setError('')
    setBusy(true)
    try {
      if (next) {
        const result = await subscribe(photographerId, VAPID_PUBLIC_KEY)
        if (!result.ok) {
          if (result.reason === 'service-worker-unavailable') {
            setError('Push notifications aren\u2019t available right now. Try refreshing the page.')
          } else {
            // requestPermission() resolved to 'denied' or was dismissed --
            // re-read the real permission state rather than assuming, since
            // the browser won't let us re-prompt after a denial.
            setPermission(permissionState())
          }
        }
      } else {
        await unsubscribeThisDevice(photographerId)
      }
      await refresh()
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function handleRemoveDevice(id) {
    setError('')
    try {
      await removeDeviceById(id)
      await refresh()
    } catch {
      setError('Could not remove that device.')
    }
  }

  if (!loaded) return null
  if (!pushSupported()) return null

  return (
    <SettingsSection
      title="Push Notifications"
      description="Get notified the instant a client claims a signup slot, even if this tab is closed."
      action={
        <div style={{ opacity: busy ? 0.5 : 1, pointerEvents: busy ? 'none' : 'auto' }}>
          <Toggle checked={enabledOnThisDevice} onChange={handleToggle} />
        </div>
      }>
      {permission === 'denied' ? (
        <div className="flex items-start gap-2.5 px-5 py-4" style={{ background: 'var(--surface)' }}>
          <BellOff size={18} style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: 1 }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Notifications are blocked in your browser's site settings. Enable them there, then reload this page.
          </p>
        </div>
      ) : (
        <>
          {!enabledOnThisDevice && (
            <div className="px-5 py-4" style={{ borderBottom: 'none', background: 'var(--surface)' }}>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>You'll be asked to allow notifications.</p>
            </div>
          )}

          {devices.length > 0 && (
            <div className="px-5 py-3" style={{ borderTop: !enabledOnThisDevice ? '1px solid var(--border)' : 'none', borderBottom: 'none', background: 'var(--surface)' }}>
              <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Subscribed devices</p>
              {devices.map(d => {
                const isThisDevice = d.endpoint === thisDeviceEndpoint
                const Icon = /iPhone|Android|mobile/i.test(d.user_agent || '') ? Smartphone : Laptop
                return (
                  <div key={d.id} className="flex items-center justify-between py-1.5">
                    <div className="flex items-center gap-2">
                      <Icon size={16} style={{ color: 'var(--text-muted)' }} />
                      <span className="text-sm" style={{ color: 'var(--text)' }}>
                        {isThisDevice ? 'This device' : (d.user_agent || 'Unknown device')}
                      </span>
                    </div>
                    <button
                      onClick={() => handleRemoveDevice(d.id)}
                      aria-label="Remove device"
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}>
                      <X size={15} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {enabledOnThisDevice && preferences && EVENT_TYPES.map(row => (
            <div key={row.key} className="flex items-center justify-between px-5 py-4"
              style={{ borderTop: '1px solid var(--border)', borderBottom: 'none', background: 'var(--surface)' }}>
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{row.label}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{row.desc}</p>
              </div>
              <div style={{ opacity: prefBusy === row.key ? 0.5 : 1, pointerEvents: prefBusy === row.key ? 'none' : 'auto' }}>
                <Toggle checked={preferences[row.key]} onChange={next => handlePreferenceToggle(row.key, next)} />
              </div>
            </div>
          ))}

          {enabledOnThisDevice && preferences && (preferences.favorite || preferences.download) && (
            <div className="flex items-center justify-between px-5 py-4"
              style={{ borderTop: '1px solid var(--border)', borderBottom: 'none', background: 'var(--surface)' }}>
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>Batch favorites & downloads</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Wait this long after their last click before sending one combined notification</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  value={batchMinutes}
                  onChange={e => setBatchMinutes(e.target.value)}
                  onBlur={handleBatchMinutesBlur}
                  className="text-sm text-right"
                  style={{ width: 48, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                />
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>min</span>
              </div>
            </div>
          )}
        </>
      )}

      {error && <p className="text-xs mt-2" style={{ color: 'var(--error, #e5484d)' }}>{error}</p>}

      {isIOS() && !isInstalledStandalone() && (
        <div className="rounded-xl px-4 py-3 mt-3 flex items-start gap-2.5" style={{ background: 'var(--surface)' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            On iPhone or iPad, push notifications only work after adding FinalVault to your home screen.
          </p>
        </div>
      )}
    </SettingsSection>
  )
}
