import pathlib

path = pathlib.Path("src/routes/Sessions.jsx")
src = path.read_text()

# 1. Import: drop resolveTimezone, keep the manual dropdown list
old_import = "import { resolveTimezone, COMMON_TIMEZONES } from '../utils/timezoneApi.js'"
assert src.count(old_import) == 1, "timezoneApi import anchor not found or not unique"
new_import = "import { COMMON_TIMEZONES } from '../utils/timezoneApi.js'"
src = src.replace(old_import, new_import)

# 2. Drop the resolvingTz state entirely
old_state = "  const [resolvingTz, setResolvingTz] = useState(false)\n"
assert src.count(old_state) == 1, "resolvingTz state anchor not found or not unique"
src = src.replace(old_state, "")

# 3. Simplify handleAddressSelect -- venue address/coordinates still get
# saved (still useful data for the created sessions' own location fields),
# just no outbound API call to resolve a timezone from them. Timezone is
# now set purely via the manual dropdown, which was already built as the
# fallback and is now the only path.
old_handler = '''  async function handleAddressSelect({ address: streetAddress, city, state, lat, lng }) {
    const fullAddress = [streetAddress, city, state].filter(Boolean).join(', ')
    setAddress(fullAddress)
    let resolvedTz = timezone
    if (lat != null && lng != null) {
      setResolvingTz(true)
      const tz = await resolveTimezone(lat, lng)
      setResolvingTz(false)
      if (tz) { resolvedTz = tz; setTimezone(tz) }
    }
    const updated = await updateSignupPage(pageId, {
      venueAddress: fullAddress, venueLat: lat ?? null, venueLng: lng ?? null, timezone: resolvedTz,
    })
    setPage(updated)
    onChanged()
  }'''

assert src.count(old_handler) == 1, "handleAddressSelect anchor not found or not unique"

new_handler = '''  async function handleAddressSelect({ address: streetAddress, city, state, lat, lng }) {
    const fullAddress = [streetAddress, city, state].filter(Boolean).join(', ')
    setAddress(fullAddress)
    const updated = await updateSignupPage(pageId, {
      venueAddress: fullAddress, venueLat: lat ?? null, venueLng: lng ?? null,
    })
    setPage(updated)
    onChanged()
  }'''

src = src.replace(old_handler, new_handler)

# 4. Remove the now-dead "Detecting timezone..." indicator
old_indicator = '''              {resolvingTz && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Detecting timezone...</span>}
'''
assert src.count(old_indicator) == 1, "resolvingTz indicator anchor not found or not unique"
src = src.replace(old_indicator, "")

path.write_text(src)
print("Removed Google Time Zone API auto-resolve -- manual dropdown is now the only timezone-setting path")
