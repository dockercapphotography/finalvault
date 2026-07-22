import pathlib

path = pathlib.Path("src/routes/Sessions.jsx")
src = path.read_text()

old_load = '''  async function load() {
    setLoading(true)
    try {
      const [p, s, q] = await Promise.all([getSignupPage(pageId), getSlots(pageId), getQuestionnaireTemplates()])
      setPage(p)
      setSlots(s)
      setQuestionnaires(q)
      setAddress(p.venue_address || '')
      setTimezone(p.timezone)
      setConfirmationNote(p.confirmation_note || '')
      setNotificationNote(p.notification_note || '')
      setBookingDescription(p.booking_description || '')
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }
'''

assert src.count(old_load) == 1, "load() anchor not found or not unique"

new_load = '''  async function load({ silent = false } = {}) {
    // silent=true refreshes the underlying data without swapping the whole
    // modal to a loading spinner -- used after in-modal actions (slot
    // generation, manual add) where a full remount would wipe out that
    // action's own local success/error feedback (e.g. GenerateSlotsForm's
    // "X slots created" message) before the person ever sees it. The
    // genuine first-open load still shows the spinner normally.
    if (!silent) setLoading(true)
    try {
      const [p, s, q] = await Promise.all([getSignupPage(pageId), getSlots(pageId), getQuestionnaireTemplates()])
      setPage(p)
      setSlots(s)
      setQuestionnaires(q)
      setAddress(p.venue_address || '')
      setTimezone(p.timezone)
      setConfirmationNote(p.confirmation_note || '')
      setNotificationNote(p.notification_note || '')
      setBookingDescription(p.booking_description || '')
    } catch (err) { console.error(err) }
    finally { if (!silent) setLoading(false) }
  }
'''

src = src.replace(old_load, new_load)

old_gen = 'onGenerated={load}'
assert src.count(old_gen) == 1, "GenerateSlotsForm onGenerated anchor not found or not unique"
src = src.replace(old_gen, "onGenerated={() => load({ silent: true })}")

old_manual = 'onAdded={load}'
assert src.count(old_manual) == 1, "ManualAddSlotForm onAdded anchor not found or not unique"
src = src.replace(old_manual, "onAdded={() => load({ silent: true })}")

path.write_text(src)
print("Fixed load() to support a silent refresh mode, used after slot generation and manual slot add")
