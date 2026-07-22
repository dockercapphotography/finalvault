import pathlib

path = pathlib.Path("src/routes/Sessions.jsx")
src = path.read_text()

# 1. State + load population + save handlers
old_state_load = '''  const [address, setAddress] = useState('')
  const [timezone, setTimezone] = useState('America/New_York')
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
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }'''

assert src.count(old_state_load) == 1, "state/load anchor not found or not unique"

new_state_load = '''  const [address, setAddress] = useState('')
  const [timezone, setTimezone] = useState('America/New_York')
  const [confirmationNote, setConfirmationNote] = useState('')
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
  }

  async function handleSaveConfirmationNote() {
    const updated = await updateSignupPage(pageId, { confirmationNote })
    setPage(updated ? { ...page, ...updated, signup_shoot_types: page.signup_shoot_types } : page)
  }

  async function handleSaveNotificationNote() {
    const updated = await updateSignupPage(pageId, { notificationNote })
    setPage(updated ? { ...page, ...updated, signup_shoot_types: page.signup_shoot_types } : page)
  }'''

src = src.replace(old_state_load, new_state_load)

# 2. New "Booking emails" section between Venue and Shoot types -- per-page
# rather than account-wide, so different events can each carry their own
# note (parking, arrival instructions, etc.) instead of sharing one
# global message.
old_boundary = '''                {COMMON_TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
              </select>
            </div>
          </div>

          {/* Shoot types */}'''

assert src.count(old_boundary) == 1, "Venue/Shoot types boundary anchor not found or not unique"

new_boundary = '''                {COMMON_TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
              </select>
            </div>
          </div>

          {/* Booking emails -- per-page, so different events (different
              venues/instructions) can each have their own note rather
              than sharing one account-wide message */}
          <div>
            <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }}>Booking emails</label>
            <div className="space-y-2.5">
              <div>
                <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Client confirmation note (optional)</p>
                <textarea value={confirmationNote} onChange={e => setConfirmationNote(e.target.value)} onBlur={handleSaveConfirmationNote}
                  placeholder="e.g. Please arrive 10 minutes early. Parking is available on the 3rd floor."
                  rows={2}
                  style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', resize: 'vertical' }} />
              </div>
              <div>
                <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Your notification note (optional)</p>
                <textarea value={notificationNote} onChange={e => setNotificationNote(e.target.value)} onBlur={handleSaveNotificationNote}
                  placeholder="e.g. Remember to confirm equipment availability for this event."
                  rows={2}
                  style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', resize: 'vertical' }} />
              </div>
            </div>
          </div>

          {/* Shoot types */}'''

src = src.replace(old_boundary, new_boundary)

path.write_text(src)
print("Moved booking email notes to per-signup-page fields with a new UI section")
