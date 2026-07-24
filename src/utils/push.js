import { supabase } from '../supabaseClient.js'

// Converts the VAPID public key (base64url, as printed by `web-push
// generate-vapid-keys`) into the Uint8Array PushManager.subscribe expects.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from(rawData, char => char.charCodeAt(0))
}

// Human-friendly device label from the user agent, e.g. "Chrome, macOS" or
// "Safari, iOS". Deliberately coarse -- just enough to tell devices apart
// in a list, not a full UA parse.
export function describeDevice() {
  const ua = navigator.userAgent
  let browser = 'Browser'
  if (/Edg\//.test(ua)) browser = 'Edge'
  else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = 'Chrome'
  else if (/Firefox\//.test(ua)) browser = 'Firefox'
  else if (/Safari\//.test(ua)) browser = 'Safari'

  let os = ''
  if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS'
  else if (/Mac OS X/.test(ua)) os = 'macOS'
  else if (/Android/.test(ua)) os = 'Android'
  else if (/Windows/.test(ua)) os = 'Windows'
  else if (/Linux/.test(ua)) os = 'Linux'

  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true

  if (isStandalone) return `${os || browser} — installed app`
  return os ? `${browser}, ${os}` : browser
}

// iOS only receives push when installed to the home screen (iOS 16.4+).
// A plain Safari tab -- even left open -- cannot receive push, full stop.
export function isIOS() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent)
}

export function isInstalledStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true
}

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

// Current permission state: 'default' | 'granted' | 'denied'
export function permissionState() {
  if (!('Notification' in window)) return 'unsupported'
  return Notification.permission
}

export async function getSubscriptions(photographerId) {
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, user_agent, created_at')
    .eq('photographer_id', photographerId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

// Returns the endpoint of this device's current subscription, if any --
// used to highlight "this device" in the list without a server round trip.
export async function getThisDeviceEndpoint() {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  return sub?.endpoint || null
}

export async function subscribe(photographerId, vapidPublicKey) {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return { ok: false, reason: permission }
  }

  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  })

  const json = sub.toJSON()
  const { error } = await supabase.from('push_subscriptions').insert({
    photographer_id: photographerId,
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    user_agent: describeDevice(),
  })
  if (error) {
    // Roll back the browser-side subscription if we couldn't store it --
    // otherwise the device thinks it's subscribed but no push will ever
    // arrive, and toggling doesn't fix it since PushManager.subscribe()
    // returns the same existing subscription on re-call.
    await sub.unsubscribe().catch(() => {})
    throw error
  }

  return { ok: true }
}

// Unsubscribes this device specifically (used by the toggle).
export async function unsubscribeThisDevice(photographerId) {
  if (!pushSupported()) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  const endpoint = sub.endpoint
  await sub.unsubscribe()
  await supabase.from('push_subscriptions').delete().eq('photographer_id', photographerId).eq('endpoint', endpoint)
}

// Removes a different device's subscription row by id (the ✕ button in the
// device list) -- can't call sub.unsubscribe() on a device that isn't this
// one, so this is just a row delete. The next push to that endpoint will
// 404/410 from the push service regardless; this just cleans it up early.
export async function removeDeviceById(subscriptionId) {
  const { error } = await supabase.from('push_subscriptions').delete().eq('id', subscriptionId)
  if (error) throw error
}
