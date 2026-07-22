import pathlib

path = pathlib.Path("src/routes/Sessions.jsx")
src = path.read_text()

# 1. State + load/save
old_state_load = '''  const [confirmationNote, setConfirmationNote] = useState('')
  const [notificationNote, setNotificationNote] = useState('')
  const [copied, setCopied] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => { load() }, [pageId])

  async function load() {
    setLoading(true)
    try {
      const [p, s] = await Promise.all([getSignupPage(pageId), getSlots(pageId)])
      setPage(p)
      setSlots(s)
      setAddress(p.venue_address || '')
      setTimezone(p.timezone)
      setConfirmationNote(p.confirmation_note || '')
      setNotificationNote(p.notification_note || '')
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }'''

assert src.count(old_state_load) == 1, "state/load anchor not found or not unique"

new_state_load = '''  const [confirmationNote, setConfirmationNote] = useState('')
  const [notificationNote, setNotificationNote] = useState('')
  const [bookingDescription, setBookingDescription] = useState('')
  const [copied, setCopied] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => { load() }, [pageId])

  async function load() {
    setLoading(true)
    try {
      const [p, s] = await Promise.all([getSignupPage(pageId), getSlots(pageId)])
      setPage(p)
      setSlots(s)
      setAddress(p.venue_address || '')
      setTimezone(p.timezone)
      setConfirmationNote(p.confirmation_note || '')
      setNotificationNote(p.notification_note || '')
      setBookingDescription(p.booking_description || '')
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  async function handleSaveBookingDescription() {
    const updated = await updateSignupPage(pageId, { bookingDescription })
    setPage(updated ? { ...page, ...updated, signup_shoot_types: page.signup_shoot_types } : page)
  }'''

src = src.replace(old_state_load, new_state_load)

# 2. UI field between the link/active row and Venue
old_boundary = '''            <Toggle checked={page.is_active} onChange={handleToggleActive} label={page.is_active ? 'Active' : 'Inactive'} />
          </div>

          {/* Venue + timezone */}
          <div>
            <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }}>Venue</label>'''

assert src.count(old_boundary) == 1, "link-row/Venue boundary anchor not found or not unique"

new_boundary = '''            <Toggle checked={page.is_active} onChange={handleToggleActive} label={page.is_active ? 'Active' : 'Inactive'} />
          </div>

          {/* Booking page description -- shown to clients on the public
              booking page itself, right below the title/venue header.
              Per-page like the email notes, since a welcome message for
              GenCon shouldn't have to be the same one shown for every
              other event. */}
          <div>
            <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }}>Booking page description</label>
            <p className="text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Shown to clients on the public booking page, above the shoot type options.</p>
            <textarea value={bookingDescription} onChange={e => setBookingDescription(e.target.value)} onBlur={handleSaveBookingDescription}
              placeholder="Thank you for your interest in booking a session! Select a shoot type below, then pick an available time."
              rows={3}
              style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', resize: 'vertical' }} />
          </div>

          {/* Venue + timezone */}
          <div>
            <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }}>Venue</label>'''

src = src.replace(old_boundary, new_boundary)
path.write_text(src)
print("Added Booking page description field to the Signup Page Detail modal")
