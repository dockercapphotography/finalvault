import pathlib

path = pathlib.Path("src/routes/Sessions.jsx")
src = path.read_text()

old_block = '''function GenerateSlotsForm({ page, shootTypes, onGenerated }) {
  const [shootTypeId, setShootTypeId] = useState(shootTypes[0]?.id || '')
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('10:00')
  const [endTime, setEndTime] = useState('18:00')
  const [buffer, setBuffer] = useState('5')
  const [generating, setGenerating] = useState(false)
  const [lastCount, setLastCount] = useState(null)

  const selectedType = shootTypes.find(t => t.id === shootTypeId)

  async function handleGenerate() {
    if (!shootTypeId || !date || !selectedType) return
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
    } catch (err) { console.error(err) }
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
      <div className="flex items-center gap-3">
        <Button variant="secondary" onClick={handleGenerate} disabled={!date || generating}>
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

assert src.count(old_block) == 1, "GenerateSlotsForm anchor not found or not unique"

new_block = '''function GenerateSlotsForm({ page, shootTypes, onGenerated }) {
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

src = src.replace(old_block, new_block)
path.write_text(src)
print("Fixed the stale shootTypeId state bug and added visible error feedback")
