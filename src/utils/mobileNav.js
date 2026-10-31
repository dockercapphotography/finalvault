import { Images, Settings, Bookmark, Users, CalendarDays, Receipt } from 'lucide-react'
import { supabase } from '../supabaseClient.js'

// ── App navigation + the customizable mobile bar (v1.6.0) ────────────────
// One list of destinations drives both the desktop sidebar (all of them, in
// this order) and the mobile bottom bar (up to 4 picked by the photographer
// plus "More", which holds the rest). The picked keys are saved on
// photographers.mobile_nav_items (sql/113); null there = DEFAULT_MOBILE_NAV.

export const NAV_DESTINATIONS = [
  { key: 'galleries', to: '/', label: 'Galleries', icon: Images, end: true },
  { key: 'clients', to: '/clients', label: 'Clients', icon: Users },
  { key: 'sessions', to: '/sessions', label: 'Sessions', icon: CalendarDays },
  { key: 'financials', to: '/financials', label: 'Financials', icon: Receipt },
  { key: 'bookmarked', to: '/bookmarked', label: 'Bookmarked', icon: Bookmark },
  { key: 'account', to: '/account', label: 'Account', icon: Settings },
]

export const MAX_MOBILE_NAV = 4
export const DEFAULT_MOBILE_NAV = ['galleries', 'sessions', 'clients', 'financials']

const VALID_KEYS = new Set(NAV_DESTINATIONS.map(d => d.key))
const STORAGE_KEY = 'fv_mobile_nav_items'

export function destinationByKey(key) {
  return NAV_DESTINATIONS.find(d => d.key === key) || null
}

// Known keys only, no repeats, at most 4. Anything unusable -> the default.
export function normalizeMobileNav(keys) {
  if (!Array.isArray(keys)) return DEFAULT_MOBILE_NAV
  const out = []
  for (const k of keys) {
    if (VALID_KEYS.has(k) && !out.includes(k)) out.push(k)
    if (out.length === MAX_MOBILE_NAV) break
  }
  return out.length ? out : DEFAULT_MOBILE_NAV
}

// Which destination a path belongs to (Session Detail -> sessions, an
// invoice -> financials), so the bar can highlight "More" when the current
// page lives in the More sheet.
export function destinationForPath(pathname) {
  if (pathname === '/' || pathname.startsWith('/galleries')) return 'galleries'
  if (pathname.startsWith('/clients') || pathname.startsWith('/contracts')) return 'clients'
  if (pathname.startsWith('/sessions')) return 'sessions'
  if (pathname.startsWith('/financials') || pathname.startsWith('/invoices')) return 'financials'
  if (pathname.startsWith('/bookmarked')) return 'bookmarked'
  if (pathname.startsWith('/account')) return 'account'
  return null
}

// The sidebar remounts on every route change (each route renders its own
// PageWrapper), so the choice is kept in a module cache and in
// localStorage: the bar draws the right items immediately, and the account
// copy is fetched once per page load to pick up a change made on another
// device.
let cached = null
let fetchPromise = null

function readStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeStorage(keys) {
  try {
    if (keys) localStorage.setItem(STORAGE_KEY, JSON.stringify(keys))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Private mode / blocked storage: the module cache still works.
  }
}

export function getCachedMobileNav() {
  if (!cached) cached = normalizeMobileNav(readStorage())
  return cached
}

// Resolves to the account's choice (normalized). Only hits the database
// once per page load; later calls reuse the same promise.
export function loadMobileNav() {
  if (!fetchPromise) {
    fetchPromise = (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return getCachedMobileNav()
      const { data, error } = await supabase
        .from('photographers')
        .select('mobile_nav_items')
        .eq('id', user.id)
        .single()
      if (error) throw error
      const saved = data?.mobile_nav_items ?? null
      cached = normalizeMobileNav(saved)
      writeStorage(saved ? cached : null)
      return cached
    })().catch(err => {
      fetchPromise = null
      console.error('Could not load the mobile menu choice:', err)
      return getCachedMobileNav()
    })
  }
  return fetchPromise
}

// keys = the picked destination keys in bar order. Saving exactly the
// default stores null, so a future default change still reaches this
// account.
export async function saveMobileNav(keys) {
  const normalized = normalizeMobileNav(keys)
  const isDefault = normalized.join(',') === DEFAULT_MOBILE_NAV.join(',')
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('photographers')
    .update({ mobile_nav_items: isDefault ? null : normalized })
    .eq('id', user.id)
  if (error) throw error
  cached = normalized
  fetchPromise = Promise.resolve(normalized)
  writeStorage(isDefault ? null : normalized)
  return normalized
}
