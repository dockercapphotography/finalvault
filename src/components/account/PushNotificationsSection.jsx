import { useState, useEffect, useCallback } from 'react'
import { Laptop, Smartphone, BellOff, X } from 'lucide-react'
import SettingsSection from '../ui/SettingsSection.jsx'
import Toggle from '../ui/Toggle.jsx'
import {
  pushSupported, permissionState, getSubscriptions, getThisDeviceEndpoint,
  subscribe, unsubscribeThisDevice, removeDeviceById, isIOS, isInstalledStandalone,
} from '../../utils/push.js'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

export default function PushNotificationsSection({ photographerId }) {
  const [loaded, setLoaded] = useState(false)
  const [permission, setPermission] = useState('default')
  const [thisDeviceEndpoint, setThisDeviceEndpoint] = useState(null)
  const [devices, setDevices] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

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
  }, [photographerId, refresh])

  const enabledOnThisDevice = !!thisDeviceEndpoint

  async function handleToggle(next) {
    if (busy) return
    setError('')
    setBusy(true)
    try {
      if (next) {
        const result = await subscribe(photographerId, VAPID_PUBLIC_KEY)
        if (!result.ok) {
          // requestPermission() resolved to 'denied' or was dismissed --
          // re-read the real permission state rather than assuming, since
          // the browser won't let us re-prompt after a denial.
          setPermission(permissionState())
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
      description="Get notified the instant a client claims a signup slot, even if this tab is closed.">
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        {permission === 'denied' ? (
          <div className="flex items-start gap-2.5 px-5 py-4" style={{ background: 'var(--surface)' }}>
            <BellOff size={18} style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: 1 }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Notifications are blocked in your browser's site settings. Enable them there, then reload this page.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-5 py-4" style={{ background: 'var(--surface)' }}>
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>Enable on this device</p>
                {!enabledOnThisDevice && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>You'll be asked to allow notifications.</p>
                )}
              </div>
              <div style={{ opacity: busy ? 0.5 : 1, pointerEvents: busy ? 'none' : 'auto' }}>
                <Toggle checked={enabledOnThisDevice} onChange={handleToggle} />
              </div>
            </div>

            {devices.length > 0 && (
              <div className="px-5 py-3" style={{ borderTop: '1px solid var(--border)' }}>
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
          </>
        )}
      </div>

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
