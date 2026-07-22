import pathlib

path = pathlib.Path("src/utils/signupApi.js")
src = path.read_text()

old_block = '''  if (updates.confirmationNote !== undefined) mapped.confirmation_note = updates.confirmationNote?.trim() || null
  if (updates.notificationNote !== undefined) mapped.notification_note = updates.notificationNote?.trim() || null'''

assert src.count(old_block) == 1, "note-fields anchor not found or not unique"

new_block = '''  if (updates.confirmationNote !== undefined) mapped.confirmation_note = updates.confirmationNote?.trim() || null
  if (updates.notificationNote !== undefined) mapped.notification_note = updates.notificationNote?.trim() || null
  if (updates.bookingDescription !== undefined) mapped.booking_description = updates.bookingDescription?.trim() || null'''

src = src.replace(old_block, new_block)
path.write_text(src)
print("Added bookingDescription support to updateSignupPage")
