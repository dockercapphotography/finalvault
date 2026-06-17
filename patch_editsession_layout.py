path = '/Users/nickporterfield/code/finalvault/src/routes/SessionDetail.jsx'

with open(path, 'r') as f:
    src = f.read()

# ── 1. Type + Date side by side (Date was full-width alone) ──────────────────
old = '''          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium block mb-1" style={{ color: 'var(--text)' }}>Type</label>
              <select value={type} onChange={e => setType(e.target.value)}
                style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none', cursor: 'pointer' }}>
                {SESSION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1" style={{ color: 'var(--text)' }}>Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)}
                style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none', cursor: 'pointer' }}>
                {SESSION_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input label="Date" value={sessionDate} onChange={setSessionDate} type="date" />
            <div />
          </div>'''
new = '''          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium block mb-1" style={{ color: 'var(--text)' }}>Type</label>
              <select value={type} onChange={e => setType(e.target.value)}
                style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none', cursor: 'pointer' }}>
                {SESSION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1" style={{ color: 'var(--text)' }}>Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)}
                style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none', cursor: 'pointer' }}>
                {SESSION_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input label="Date" value={sessionDate} onChange={setSessionDate} type="date" />
            <TimeSelect label="Start time" value={startTime} onChange={setStartTime} />
          </div>'''
assert src.count(old) == 1, f"FAIL 1: {src.count(old)}"
src = src.replace(old, new)

# ── 2. Remove the now-redundant Start/End time row and replace with End time only ──
old = '''          <div className="grid grid-cols-2 gap-3">
            <TimeSelect label="Start time" value={startTime} onChange={setStartTime} />
            <TimeSelect label="End time" value={endTime} onChange={setEndTime} />
          </div>'''
new = '''          <div className="grid grid-cols-2 gap-3">
            <TimeSelect label={<>End time <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>(opt.)</span></>} value={endTime} onChange={setEndTime} />
            <div />
          </div>'''
assert src.count(old) == 1, f"FAIL 2: {src.count(old)}"
src = src.replace(old, new)

# ── 3. Compact questionnaire items ────────────────────────────────────────────
old = '''                    <button key={q.id} type="button"
                      onClick={() => setQuestionnaireIds(prev =>
                        selected ? prev.filter(id => id !== q.id) : [...prev, q.id]
                      )}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left"
                      style={{
                        border: selected ? '2px solid #6366f1' : '2px solid var(--border)',
                        background: selected ? 'rgba(99,102,241,0.05)' : 'var(--surface)',
                        cursor: 'pointer',
                      }}>
                      <div className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                        style={{ background: selected ? '#6366f1' : 'var(--surface-raised)', border: selected ? 'none' : '1.5px solid var(--border)' }}>
                        {selected && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </div>
                      <span className="text-sm" style={{ color: selected ? '#6366f1' : 'var(--text)', fontWeight: selected ? '500' : '400' }}>{q.name}</span>
                    </button>'''
new = '''                    <button key={q.id} type="button"
                      onClick={() => setQuestionnaireIds(prev =>
                        selected ? prev.filter(id => id !== q.id) : [...prev, q.id]
                      )}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left"
                      style={{
                        border: `1.5px solid ${selected ? '#6366f1' : 'var(--border)'}`,
                        background: selected ? 'rgba(99,102,241,0.05)' : 'var(--surface)',
                        cursor: 'pointer',
                      }}>
                      <div className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                        style={{ background: selected ? '#6366f1' : 'var(--surface-raised)', border: selected ? 'none' : '1.5px solid var(--border)' }}>
                        {selected && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </div>
                      <span className="text-sm truncate" style={{ color: selected ? '#6366f1' : 'var(--text)', fontWeight: selected ? '500' : '400' }}>{q.name}</span>
                    </button>'''
assert src.count(old) == 1, f"FAIL 3: {src.count(old)}"
src = src.replace(old, new)

# ── 4. Shorten "Balance due date" label ───────────────────────────────────────
old = '                <Input label="Balance due date" value={balanceDueDate} onChange={setBalanceDueDate} type="date" />'
new = '''                <div>
                  <label className="text-sm font-medium block mb-1" style={{ color: 'var(--text)' }}>Due date <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>(opt.)</span></label>
                  <input type="date" value={balanceDueDate} onChange={e => setBalanceDueDate(e.target.value)}
                    style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                    onFocus={e => e.target.style.borderColor = 'var(--border-strong)'} onBlur={e => e.target.style.borderColor = 'var(--border)'} />
                </div>'''
assert src.count(old) == 1, f"FAIL 4: {src.count(old)}"
src = src.replace(old, new)

assert src.count('function EditSessionModal') == 1, "FAIL: EditSessionModal missing"
assert src.count('export default function SessionDetail') == 1, "FAIL: SessionDetail export missing"

with open(path, 'w') as f:
    f.write(src)

print("✅ EditSessionModal patched:")
print("   - Date moved next to Type, Start time next to Date")
print("   - End time (opt.) in its own row")
print("   - Compact questionnaire items")
print("   - Due date (opt.) label shortened")
