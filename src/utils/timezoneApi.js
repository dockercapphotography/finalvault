// Resolves the IANA timezone (e.g. "America/New_York") for a given
// coordinate pair, using the same Google Cloud project/API key already
// used for address autocomplete. Requires the Time Zone API to be
// enabled on that key -- if it isn't, this fails gracefully and the
// caller falls back to a manual timezone picker rather than blocking
// signup page creation entirely.
export async function resolveTimezone(lat, lng) {
  const key = import.meta.env.VITE_GOOGLE_PLACES_KEY
  if (!key || lat == null || lng == null) return null

  const timestamp = Math.floor(Date.now() / 1000)
  const url = `https://maps.googleapis.com/maps/api/timezone/json?location=${lat},${lng}&timestamp=${timestamp}&key=${key}`

  try {
    const res = await fetch(url)
    const data = await res.json()
    if (data.status !== 'OK' || !data.timeZoneId) return null
    return data.timeZoneId
  } catch {
    return null
  }
}

// A reasonably sized, US-focused list for the manual fallback picker --
// not exhaustive, but covers every timezone a US-based photographer is
// realistically booking a venue in.
export const COMMON_TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (New York)' },
  { value: 'America/Chicago', label: 'Central Time (Chicago)' },
  { value: 'America/Denver', label: 'Mountain Time (Denver)' },
  { value: 'America/Phoenix', label: 'Mountain Time, no DST (Phoenix)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (Los Angeles)' },
  { value: 'America/Anchorage', label: 'Alaska Time (Anchorage)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (Honolulu)' },
]
