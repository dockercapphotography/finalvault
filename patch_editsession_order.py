path = '/Users/nickporterfield/code/finalvault/src/routes/SessionDetail.jsx'

with open(path, 'r') as f:
    src = f.read()

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
            <TimeSelect label="Start time" value={startTime} onChange={setStartTime} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TimeSelect label={<>End time <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>(opt.)</span></>} value={endTime} onChange={setEndTime} />
            <div />
          </div>'''
new = '''          <div>
            <label className="text-sm font-medium block mb-1" style={{ color: 'var(--text)' }}>Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)}
              style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none', cursor: 'pointer' }}>
              {SESSION_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium block mb-1" style={{ color: 'var(--text)' }}>Type</label>
              <select value={type} onChange={e => setType(e.target.value)}
                style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '9px 12px', fontSize: 14, outline: 'none', cursor: 'pointer' }}>
                {SESSION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <Input label="Date" value={sessionDate} onChange={setSessionDate} type="date" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <TimeSelect label="Start time" value={startTime} onChange={setStartTime} />
            <TimeSelect label={<>End time <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>(opt.)</span></>} value={endTime} onChange={setEndTime} />
          </div>'''
assert src.count(old) == 1, f"FAIL: {src.count(old)}"
src = src.replace(old, new)

assert src.count('function EditSessionModal') == 1, "FAIL: EditSessionModal missing"

with open(path, 'w') as f:
    f.write(src)

print("✅ Patched: Status full-width, Type+Date side by side, Start+End time side by side")
