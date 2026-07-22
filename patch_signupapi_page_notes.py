import pathlib

path = pathlib.Path("src/utils/signupApi.js")
src = path.read_text()

old_block = '''export async function updateSignupPage(id, updates) {
  const mapped = { updated_at: new Date().toISOString() }
  if (updates.title !== undefined) mapped.title = updates.title.trim()
  if (updates.venueAddress !== undefined) mapped.venue_address = updates.venueAddress?.trim() || null
  if (updates.venueLat !== undefined) mapped.venue_lat = updates.venueLat
  if (updates.venueLng !== undefined) mapped.venue_lng = updates.venueLng
  if (updates.timezone !== undefined) mapped.timezone = updates.timezone
  if (updates.isActive !== undefined) mapped.is_active = updates.isActive'''

assert src.count(old_block) == 1, "updateSignupPage anchor not found or not unique"

new_block = '''export async function updateSignupPage(id, updates) {
  const mapped = { updated_at: new Date().toISOString() }
  if (updates.title !== undefined) mapped.title = updates.title.trim()
  if (updates.venueAddress !== undefined) mapped.venue_address = updates.venueAddress?.trim() || null
  if (updates.venueLat !== undefined) mapped.venue_lat = updates.venueLat
  if (updates.venueLng !== undefined) mapped.venue_lng = updates.venueLng
  if (updates.timezone !== undefined) mapped.timezone = updates.timezone
  if (updates.isActive !== undefined) mapped.is_active = updates.isActive
  if (updates.confirmationNote !== undefined) mapped.confirmation_note = updates.confirmationNote?.trim() || null
  if (updates.notificationNote !== undefined) mapped.notification_note = updates.notificationNote?.trim() || null'''

src = src.replace(old_block, new_block)
path.write_text(src)
print("Extended updateSignupPage with per-page booking email note fields")
