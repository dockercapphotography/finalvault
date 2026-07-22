import pathlib

path = pathlib.Path("src/routes/Sessions.jsx")
src = path.read_text()

# 1. Import the two new signupApi functions
old_import = '''import {
  getSignupPages, getSignupPage, createSignupPage, updateSignupPage, deleteSignupPage,
  createShootType, updateShootType, deleteShootType, generateSlots, getSlots, deleteSlot,
  createManualSlot, deleteAllOpenSlots,
} from '../utils/signupApi.js\''''
assert src.count(old_import) == 1, "signupApi import anchor not found or not unique"
new_import = '''import {
  getSignupPages, getSignupPage, createSignupPage, updateSignupPage, deleteSignupPage,
  createShootType, updateShootType, deleteShootType, generateSlots, getSlots, deleteSlot,
  createManualSlot, deleteAllOpenSlots, getShootTypeQuestionnaires, setShootTypeQuestionnaires,
} from '../utils/signupApi.js\''''
src = src.replace(old_import, new_import)

# 2. Rebuild ShootTypeRow with a questionnaire multi-select in its edit form
old_row = '''function ShootTypeRow({ shootType, onUpdated, onDeleted }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(shootType.name)
  const [duration, setDuration] = useState(String(shootType.duration_minutes))
  const [sessionType, setSessionType] = useState(shootType.session_type)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      const updated = await updateShootType(shootType.id, {
        name, durationMinutes: parseInt(duration, 10) || shootType.duration_minutes, sessionType,
      })
      onUpdated(updated)
      setEditing(false)
    } catch (err) { console.error(err) }
    finally { setSaving(false) }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderTop: '1px solid var(--border)' }}>
        <input value={name} onChange={e => setName(e.target.value)}
          style={{ flex: 2, background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '7px 10px', fontSize: 13 }} />
        <input type="number" min="5" step="5" value={duration} onChange={e => setDuration(e.target.value)}
          style={{ width: 64, background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '7px 10px', fontSize: 13 }} />
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>min</span>
        <select value={sessionType} onChange={e => setSessionType(e.target.value)}
          style={{ flex: 1, background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '7px 10px', fontSize: 13 }}>
          {SESSION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={handleSave} disabled={saving} className="text-xs font-medium px-2.5 py-1.5 rounded-lg"
          style={{ background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer' }}>
          {saving ? '...' : 'Save'}
        </button>
        <button onClick={() => setEditing(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}>
          <X size={15} />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid var(--border)' }}>
      <button onClick={() => setEditing(true)} className="text-left flex-1 min-w-0" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
        <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{shootType.name}</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{shootType.duration_minutes} min · {shootType.session_type}</p>
      </button>
      <button onClick={() => onDeleted(shootType.id)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 4 }}>
        <Trash2 size={14} />
      </button>
    </div>
  )
}'''

assert src.count(old_row) == 1, "ShootTypeRow anchor not found or not unique"

new_row = '''function ShootTypeRow({ shootType, allQuestionnaires, onUpdated, onDeleted }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(shootType.name)
  const [duration, setDuration] = useState(String(shootType.duration_minutes))
  const [sessionType, setSessionType] = useState(shootType.session_type)
  const [questionnaireIds, setQuestionnaireIds] = useState([])
  const [loadingQuestionnaires, setLoadingQuestionnaires] = useState(false)
  const [saving, setSaving] = useState(false)

  async function startEditing() {
    setEditing(true)
    setLoadingQuestionnaires(true)
    try {
      setQuestionnaireIds(await getShootTypeQuestionnaires(shootType.id))
    } catch (err) { console.error(err) }
    finally { setLoadingQuestionnaires(false) }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const updated = await updateShootType(shootType.id, {
        name, durationMinutes: parseInt(duration, 10) || shootType.duration_minutes, sessionType,
      })
      await setShootTypeQuestionnaires(shootType.id, questionnaireIds)
      onUpdated(updated)
      setEditing(false)
    } catch (err) { console.error(err) }
    finally { setSaving(false) }
  }

  if (editing) {
    return (
      <div className="px-4 py-3 space-y-2.5" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <input value={name} onChange={e => setName(e.target.value)}
            style={{ flex: 2, background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '7px 10px', fontSize: 13 }} />
          <input type="number" min="5" step="5" value={duration} onChange={e => setDuration(e.target.value)}
            style={{ width: 64, background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '7px 10px', fontSize: 13 }} />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>min</span>
          <select value={sessionType} onChange={e => setSessionType(e.target.value)}
            style={{ flex: 1, background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '7px 10px', fontSize: 13 }}>
            {SESSION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div>
          <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Questionnaires assigned automatically when someone books this shoot type</p>
          {loadingQuestionnaires ? (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading...</p>
          ) : allQuestionnaires.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No questionnaire templates yet. Create one in Account → Questionnaires.</p>
          ) : (
            <div className="space-y-1">
              {allQuestionnaires.map(q => {
                const selected = questionnaireIds.includes(q.id)
                return (
                  <button key={q.id} type="button"
                    onClick={() => setQuestionnaireIds(prev => selected ? prev.filter(id => id !== q.id) : [...prev, q.id])}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left"
                    style={{ border: `1.5px solid ${selected ? '#6366f1' : 'var(--border)'}`, background: selected ? 'rgba(99,102,241,0.05)' : 'var(--surface)', cursor: 'pointer' }}>
                    <div className="w-3.5 h-3.5 rounded flex items-center justify-center shrink-0"
                      style={{ background: selected ? '#6366f1' : 'var(--surface-raised)', border: selected ? 'none' : '1.5px solid var(--border)' }}>
                      {selected && <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                    <span className="text-xs truncate" style={{ color: selected ? '#6366f1' : 'var(--text)', fontWeight: selected ? '500' : '400' }}>{q.name}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={handleSave} disabled={saving} className="text-xs font-medium px-2.5 py-1.5 rounded-lg"
            style={{ background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer' }}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button onClick={() => setEditing(false)} className="text-xs font-medium px-2.5 py-1.5 rounded-lg"
            style={{ background: 'var(--surface-raised)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid var(--border)' }}>
      <button onClick={startEditing} className="text-left flex-1 min-w-0" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
        <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{shootType.name}</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{shootType.duration_minutes} min · {shootType.session_type}</p>
      </button>
      <button onClick={() => onDeleted(shootType.id)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 4 }}>
        <Trash2 size={14} />
      </button>
    </div>
  )
}'''

src = src.replace(old_row, new_row)

# 3. Pass allQuestionnaires prop down
old_render = '<ShootTypeRow key={t.id} shootType={t} onUpdated={handleUpdateShootType} onDeleted={handleDeleteShootType} />'
assert src.count(old_render) == 1, "ShootTypeRow render anchor not found or not unique"
new_render = '<ShootTypeRow key={t.id} shootType={t} allQuestionnaires={questionnaires} onUpdated={handleUpdateShootType} onDeleted={handleDeleteShootType} />'
src = src.replace(old_render, new_render)

# 4. questionnaires state
old_state = '''  const [confirmClearAll, setConfirmClearAll] = useState(false)
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
assert src.count(old_state) == 1, "clear-all state anchor not found or not unique"
new_state = '''  const [confirmClearAll, setConfirmClearAll] = useState(false)
  const [clearingAll, setClearingAll] = useState(false)
  const [questionnaires, setQuestionnaires] = useState([])

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

# 5. Fetch questionnaire templates alongside page/slots
old_load = '''      const [p, s] = await Promise.all([getSignupPage(pageId), getSlots(pageId)])
      setPage(p)
      setSlots(s)
      setAddress(p.venue_address || '')
      setTimezone(p.timezone)
      setConfirmationNote(p.confirmation_note || '')
      setNotificationNote(p.notification_note || '')
      setBookingDescription(p.booking_description || '')
    } catch (err) { console.error(err) }
    finally { setLoading(false) }'''
assert src.count(old_load) == 1, "load() anchor not found or not unique"
new_load = '''      const [p, s, q] = await Promise.all([getSignupPage(pageId), getSlots(pageId), getQuestionnaireTemplates()])
      setPage(p)
      setSlots(s)
      setQuestionnaires(q)
      setAddress(p.venue_address || '')
      setTimezone(p.timezone)
      setConfirmationNote(p.confirmation_note || '')
      setNotificationNote(p.notification_note || '')
      setBookingDescription(p.booking_description || '')
    } catch (err) { console.error(err) }
    finally { setLoading(false) }'''
src = src.replace(old_load, new_load)

path.write_text(src)
print("Wired questionnaire-to-shoot-type linking into the Signup Page Detail modal")
