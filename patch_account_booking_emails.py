import pathlib

path = pathlib.Path("src/routes/Account.jsx")
src = path.read_text()

# 1. New state
old_state = "  const [businessPhone, setBusinessPhone] = useState('')"
assert src.count(old_state) == 1, "businessPhone state anchor not found or not unique"
new_state = """  const [businessPhone, setBusinessPhone] = useState('')
  const [bookingConfirmationNote, setBookingConfirmationNote] = useState('')
  const [bookingNotificationNote, setBookingNotificationNote] = useState('')"""
src = src.replace(old_state, new_state)

# 2. Include the new columns in the initial select
old_select = "supabase.from('photographers').select('display_name, business_name, business_address, business_city, business_state, business_zip, business_email, business_phone, governing_state, avatar_r2_key, logo_r2_key').eq('id', user.id).single(),"
assert src.count(old_select) == 1, "photographers select anchor not found or not unique"
new_select = "supabase.from('photographers').select('display_name, business_name, business_address, business_city, business_state, business_zip, business_email, business_phone, governing_state, avatar_r2_key, logo_r2_key, booking_confirmation_note, booking_notification_note').eq('id', user.id).single(),"
src = src.replace(old_select, new_select)

# 3. Populate state from the loaded row
old_populate = "        setBusinessPhone(data?.business_phone || '')"
assert src.count(old_populate) == 1, "businessPhone populate anchor not found or not unique"
new_populate = """        setBusinessPhone(data?.business_phone || '')
        setBookingConfirmationNote(data?.booking_confirmation_note || '')
        setBookingNotificationNote(data?.booking_notification_note || '')"""
src = src.replace(old_populate, new_populate)

# 4. Save both fields alongside everything else
old_save = "          business_phone: businessPhone || null,"
assert src.count(old_save) == 1, "businessPhone save anchor not found or not unique"
new_save = """          business_phone: businessPhone || null,
          booking_confirmation_note: bookingConfirmationNote || null,
          booking_notification_note: bookingNotificationNote || null,"""
src = src.replace(old_save, new_save)

# 5. New "Booking emails" section, right after the existing Business info
# SettingsSection closes. The actual booking details (date/time/venue/
# shoot type) stay hardcoded in the claim_signup_slot function -- these
# fields are purely the surrounding prose, so future wording tweaks are a
# type-and-save in this UI instead of another SQL round trip.
old_section_close = '''        </div>
      </SettingsSection>

      {storageInfo && ('''

assert src.count(old_section_close) == 1, "SettingsSection close anchor not found or not unique"

new_section_close = '''        </div>
      </SettingsSection>

      <SettingsSection title="Booking emails" description="Custom text included in the emails sent when someone books a session signup slot. Leave blank to omit.">
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="text-sm font-medium block mb-1" style={{ color: 'var(--text)' }}>Client confirmation note</label>
            <p className="text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Shown in the confirmation email sent to the client, above the booking details.</p>
            <textarea value={bookingConfirmationNote} onChange={e => setBookingConfirmationNote(e.target.value)} onBlur={save}
              placeholder="e.g. Please arrive 10 minutes early. Parking is available on the 3rd floor."
              rows={3}
              style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none', resize: 'vertical' }} />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1" style={{ color: 'var(--text)' }}>Photographer notification note</label>
            <p className="text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Shown in the notification email sent to you when a booking comes in.</p>
            <textarea value={bookingNotificationNote} onChange={e => setBookingNotificationNote(e.target.value)} onBlur={save}
              placeholder="e.g. Remember to confirm equipment availability for convention shoots."
              rows={3}
              style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none', resize: 'vertical' }} />
          </div>
        </div>
      </SettingsSection>

      {storageInfo && ('''

src = src.replace(old_section_close, new_section_close)

path.write_text(src)
print("Added editable Booking emails section to Account.jsx")
