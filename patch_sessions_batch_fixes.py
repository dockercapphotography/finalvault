import pathlib

path = pathlib.Path("src/routes/Sessions.jsx")
src = path.read_text()

# 1. Import the two new signupApi functions
old_import = '''import {
  getSignupPages, getSignupPage, createSignupPage, updateSignupPage, deleteSignupPage,
  createShootType, updateShootType, deleteShootType, generateSlots, getSlots, deleteSlot,
} from '../utils/signupApi.js\''''
assert src.count(old_import) == 1, "signupApi import anchor not found or not unique"
new_import = '''import {
  getSignupPages, getSignupPage, createSignupPage, updateSignupPage, deleteSignupPage,
  createShootType, updateShootType, deleteShootType, generateSlots, getSlots, deleteSlot,
  createManualSlot, deleteAllOpenSlots,
} from '../utils/signupApi.js\''''
src = src.replace(old_import, new_import)

# 2. Rebuild GenerateSlotsForm (multi-day range) and add ManualAddSlotForm
old_generate_form = '''function GenerateSlotsForm({ page, shootTypes, onGenerated }) {
  const [shootTypeId, setShootTypeId] = useState(shootTypes[0]?.id || '')
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('10:00')
  const [endTime, setEndTime] = useState('18:00')
  const [buffer, setBuffer] = useState('5')
  const [generating, setGenerating] = useState(false)
  const [lastCount, setLastCount] = useState(null)
  const [formError, setFormError] = useState(null)

  // shootTypeId's initial value only gets set once, on mount -- if this
  // form rendered before any shoot type existed (the common case, since
  // it's shown right below the shoot-types section), that initial value
  // locks in as '' and never gets refreshed just because shootTypes later
  // changes. This keeps the selection valid whenever the list changes:
  // covers "the list started empty," "the selected type got deleted,"
  // and "a new list just loaded."
  useEffect(() => {
    if (shootTypes.length > 0 && !shootTypes.some(t => t.id === shootTypeId)) {
      setShootTypeId(shootTypes[0].id)
    }
  }, [shootTypes, shootTypeId])

  const selectedType = shootTypes.find(t => t.id === shootTypeId)

  async function handleGenerate() {
    if (!shootTypeId || !selectedType) {
      setFormError('Pick a shoot type first.')
      return
    }
    if (!date) {
      setFormError('Pick a date first.')
      return
    }
    setFormError(null)
    setGenerating(true)
    setLastCount(null)
    try {
      const created = await generateSlots({
        signupPageId: page.id, shootTypeId, date, startTime, endTime,
        durationMinutes: selectedType.duration_minutes,
        bufferMinutes: parseInt(buffer, 10) || 0,
        timezone: page.timezone,
      })
      setLastCount(created.length)
      onGenerated()
    } catch (err) {
      console.error(err)
      setFormError('Something went wrong generating slots. Try again.')
    }
    finally { setGenerating(false) }
  }

  if (shootTypes.length === 0) {
    return <p className="text-xs px-4 py-3" style={{ color: 'var(--text-muted)' }}>Add a shoot type above before generating slots.</p>
  }

  return (
    <div className="px-4 py-3 space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        <select value={shootTypeId} onChange={e => setShootTypeId(e.target.value)}
          style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}>
          {shootTypes.map(t => <option key={t.id} value={t.id}>{t.name} ({t.duration_minutes} min)</option>)}
        </select>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13 }} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
          style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13 }} />
        <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
          style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13 }} />
        <div className="flex items-center gap-1.5">
          <input type="number" min="0" step="5" value={buffer} onChange={e => setBuffer(e.target.value)}
            style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13 }} />
          <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>min buffer</span>
        </div>
      </div>
      {formError && <p className="text-xs" style={{ color: 'var(--danger)' }}>{formError}</p>}
      <div className="flex items-center gap-3">
        <Button variant="secondary" onClick={handleGenerate} disabled={generating}>
          {generating ? 'Generating...' : 'Generate slots for this day'}
        </Button>
        {lastCount !== null && (
          <span className="text-xs" style={{ color: lastCount > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
            {lastCount > 0 ? `${lastCount} slots created` : 'No slots fit that window'}
          </span>
        )}
      </div>
    </div>
  )
}'''

assert src.count(old_generate_form) == 1, "GenerateSlotsForm anchor not found or not unique"

new_generate_form = '''function GenerateSlotsForm({ page, shootTypes, onGenerated }) {
  const [shootTypeId, setShootTypeId] = useState(shootTypes[0]?.id || '')
  const [date, setDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [startTime, setStartTime] = useState('10:00')
  const [endTime, setEndTime] = useState('18:00')
  const [buffer, setBuffer] = useState('5')
  const [generating, setGenerating] = useState(false)
  const [lastCount, setLastCount] = useState(null)
  const [formError, setFormError] = useState(null)

  useEffect(() => {
    if (shootTypes.length > 0 && !shootTypes.some(t => t.id === shootTypeId)) {
      setShootTypeId(shootTypes[0].id)
    }
  }, [shootTypes, shootTypeId])

  const selectedType = shootTypes.find(t => t.id === shootTypeId)

  async function handleGenerate() {
    if (!shootTypeId || !selectedType) {
      setFormError('Pick a shoot type first.')
      return
    }
    if (!date) {
      setFormError('Pick a start date first.')
      return
    }
    if (endDate && endDate < date) {
      setFormError('End date is before the start date.')
      return
    }
    setFormError(null)
    setGenerating(true)
    setLastCount(null)
    try {
      const dates = []
      let cursor = date
      while (cursor <= (endDate || date)) {
        dates.push(cursor)
        const [y, m, d] = cursor.split('-').map(Number)
        cursor = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
      }

      let total = 0
      for (const d of dates) {
        const created = await generateSlots({
          signupPageId: page.id, shootTypeId, date: d, startTime, endTime,
          durationMinutes: selectedType.duration_minutes,
          bufferMinutes: parseInt(buffer, 10) || 0,
          timezone: page.timezone,
        })
        total += created.length
      }
      setLastCount(total)
      onGenerated()
    } catch (err) {
      console.error(err)
      setFormError('Something went wrong generating slots. Try again.')
    }
    finally { setGenerating(false) }
  }

  if (shootTypes.length === 0) {
    return <p className="text-xs px-4 py-3" style={{ color: 'var(--text-muted)' }}>Add a shoot type above before generating slots.</p>
  }

  return (
    <div className="px-4 py-3 space-y-2.5">
      <select value={shootTypeId} onChange={e => setShootTypeId(e.target.value)}
        style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}>
        {shootTypes.map(t => <option key={t.id} value={t.id}>{t.name} ({t.duration_minutes} min)</option>)}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Start date</p>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13 }} />
        </div>
        <div>
          <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>End date (optional)</p>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} min={date || undefined}
            style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13 }} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
          style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13 }} />
        <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
          style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13 }} />
        <div className="flex items-center gap-1.5">
          <input type="number" min="0" step="5" value={buffer} onChange={e => setBuffer(e.target.value)}
            style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13 }} />
          <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>min buffer</span>
        </div>
      </div>
      {formError && <p className="text-xs" style={{ color: 'var(--danger)' }}>{formError}</p>}
      <div className="flex items-center gap-3">
        <Button variant="secondary" onClick={handleGenerate} disabled={generating}>
          {generating ? 'Generating...' : endDate && endDate !== date ? 'Generate slots for these days' : 'Generate slots for this day'}
        </Button>
        {lastCount !== null && (
          <span className="text-xs" style={{ color: lastCount > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
            {lastCount > 0 ? `${lastCount} slots created` : 'No slots fit that window'}
          </span>
        )}
      </div>
    </div>
  )
}

function ManualAddSlotForm({ page, shootTypes, onAdded }) {
  const [open, setOpen] = useState(false)
  const [shootTypeId, setShootTypeId] = useState('')
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('10:00')
  const [adding, setAdding] = useState(false)
  const [formError, setFormError] = useState(null)

  useEffect(() => {
    if (shootTypes.length > 0 && !shootTypeId) setShootTypeId(shootTypes[0].id)
  }, [shootTypes, shootTypeId])

  const selectedType = shootTypes.find(t => t.id === shootTypeId)

  async function handleAdd() {
    if (!selectedType || !date) {
      setFormError('Pick a shoot type and date first.')
      return
    }
    setFormError(null)
    setAdding(true)
    try {
      await createManualSlot({
        signupPageId: page.id, shootTypeId, date, startTime,
        durationMinutes: selectedType.duration_minutes, timezone: page.timezone,
      })
      setOpen(false)
      setDate('')
      onAdded()
    } catch (err) {
      console.error(err)
      setFormError('Something went wrong adding that slot.')
    } finally {
      setAdding(false)
    }
  }

  if (shootTypes.length === 0) return null

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs font-medium" style={{ color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer' }}>
        + Add a single slot manually
      </button>
    )
  }

  return (
    <div className="rounded-xl p-3 space-y-2" style={{ border: '1px solid var(--border)' }}>
      <select value={shootTypeId} onChange={e => setShootTypeId(e.target.value)}
        style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}>
        {shootTypes.map(t => <option key={t.id} value={t.id}>{t.name} ({t.duration_minutes} min)</option>)}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13 }} />
        <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
          style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13 }} />
      </div>
      {selectedType && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Ends automatically after {selectedType.duration_minutes} minutes.</p>}
      {formError && <p className="text-xs" style={{ color: 'var(--danger)' }}>{formError}</p>}
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={handleAdd} disabled={adding}>{adding ? 'Adding...' : 'Add slot'}</Button>
        <Button variant="secondary" size="sm" onClick={() => setOpen(false)} disabled={adding}>Cancel</Button>
      </div>
    </div>
  )
}'''

src = src.replace(old_generate_form, new_generate_form)

# 3. Clear-all state + handler
old_state = '''  const [bookingDescription, setBookingDescription] = useState('')
  const [copied, setCopied] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => { load() }, [pageId])
'''
assert src.count(old_state) == 1, "modal state anchor not found or not unique"
new_state = '''  const [bookingDescription, setBookingDescription] = useState('')
  const [copied, setCopied] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmClearAll, setConfirmClearAll] = useState(false)
  const [clearingAll, setClearingAll] = useState(false)

  useEffect(() => { load() }, [pageId])

  async function handleClearAllOpenSlots() {
    setClearingAll(true)
    try {
      await deleteAllOpenSlots(pageId)
      setConfirmClearAll(false)
      await load()
    } catch (err) { console.error(err) }
    finally { setClearingAll(false) }
  }
'''
src = src.replace(old_state, new_state)

# 4. Fix the address/timezone/active-toggle crash -- these three handlers
# were replacing the entire page state with just the raw update result,
# which lacks the signup_shoot_types join, unlike the note-save handlers
# which already merged correctly.
old_handlers = '''  async function handleAddressSelect({ address: streetAddress, city, state, lat, lng }) {
    const fullAddress = [streetAddress, city, state].filter(Boolean).join(', ')
    setAddress(fullAddress)
    const updated = await updateSignupPage(pageId, {
      venueAddress: fullAddress, venueLat: lat ?? null, venueLng: lng ?? null,
    })
    setPage(updated)
    onChanged()
  }

  async function handleTimezoneChange(tz) {
    setTimezone(tz)
    const updated = await updateSignupPage(pageId, { timezone: tz })
    setPage(updated)
  }

  async function handleToggleActive() {
    const updated = await updateSignupPage(pageId, { isActive: !page.is_active })
    setPage(updated)
    onChanged()
  }'''
assert src.count(old_handlers) == 1, "buggy handlers anchor not found or not unique"
new_handlers = '''  async function handleAddressSelect({ address: streetAddress, city, state, lat, lng }) {
    const fullAddress = [streetAddress, city, state].filter(Boolean).join(', ')
    setAddress(fullAddress)
    const updated = await updateSignupPage(pageId, {
      venueAddress: fullAddress, venueLat: lat ?? null, venueLng: lng ?? null,
    })
    setPage(updated ? { ...page, ...updated, signup_shoot_types: page.signup_shoot_types } : page)
    onChanged()
  }

  async function handleTimezoneChange(tz) {
    setTimezone(tz)
    const updated = await updateSignupPage(pageId, { timezone: tz })
    setPage(updated ? { ...page, ...updated, signup_shoot_types: page.signup_shoot_types } : page)
  }

  async function handleToggleActive() {
    const updated = await updateSignupPage(pageId, { isActive: !page.is_active })
    setPage(updated ? { ...page, ...updated, signup_shoot_types: page.signup_shoot_types } : page)
    onChanged()
  }'''
src = src.replace(old_handlers, new_handlers)

# 5. Wire ManualAddSlotForm + Clear all open slots into the render, right
# after the generator
old_generator_render = '''          {/* Slot generator */}
          <div>
            <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }}>Generate time slots</label>
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              <GenerateSlotsForm page={page} shootTypes={page.signup_shoot_types} onGenerated={load} />
            </div>
          </div>
'''
assert src.count(old_generator_render) == 1, "generator render anchor not found or not unique"
new_generator_render = '''          {/* Slot generator */}
          <div>
            <label className="text-sm font-medium block mb-1.5" style={{ color: 'var(--text)' }}>Generate time slots</label>
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              <GenerateSlotsForm page={page} shootTypes={page.signup_shoot_types} onGenerated={load} />
            </div>
            <div className="mt-2.5 flex items-center justify-between">
              <ManualAddSlotForm page={page} shootTypes={page.signup_shoot_types} onAdded={load} />
              {slots.some(s => !s.claimed_at) && (
                confirmClearAll ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: 'var(--danger)' }}>Remove all open slots?</span>
                    <Button variant="danger" size="sm" onClick={handleClearAllOpenSlots} disabled={clearingAll}>
                      {clearingAll ? 'Clearing...' : 'Confirm'}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setConfirmClearAll(false)}>Cancel</Button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmClearAll(true)} className="text-xs font-medium" style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}>
                    Clear all open slots
                  </button>
                )
              )}
            </div>
          </div>
'''
src = src.replace(old_generator_render, new_generator_render)

# 6. Contextual header primary action
old_primary = "        primaryAction={{ label: 'New Session', icon: Plus, onClick: () => setShowNew(true) }}"
assert src.count(old_primary) == 1, "primaryAction anchor not found or not unique"
new_primary = '''        primaryAction={view === 'signups'
          ? { label: 'New signup page', icon: Plus, onClick: () => setShowNewSignup(true) }
          : { label: 'New Session', icon: Plus, onClick: () => setShowNew(true) }}'''
src = src.replace(old_primary, new_primary)

# 7. Remove the now-redundant standalone New signup page button
old_signups_body = '''      {/* Sign-ups view */}
      {view === 'signups' && (
        <div className="max-w-4xl">
          <div className="flex justify-end mb-3">
            <Button variant="primary" size="sm" onClick={() => setShowNewSignup(true)}>
              <Plus size={13} />New signup page
            </Button>
          </div>
          <SignupPagesView
            pages={signupPages}
            loading={loadingSignups}
            onCreate={() => setShowNewSignup(true)}
            onOpen={setOpenSignupPageId}
          />
        </div>'''
assert src.count(old_signups_body) == 1, "signups body anchor not found or not unique"
new_signups_body = '''      {/* Sign-ups view */}
      {view === 'signups' && (
        <div className="max-w-4xl">
          <SignupPagesView
            pages={signupPages}
            loading={loadingSignups}
            onCreate={() => setShowNewSignup(true)}
            onOpen={setOpenSignupPageId}
          />
        </div>'''
src = src.replace(old_signups_body, new_signups_body)

path.write_text(src)
print("Applied all Sessions.jsx fixes/additions: crash fix, contextual header, multi-day generator, manual add, clear-all")
