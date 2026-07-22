import pathlib

path = pathlib.Path("src/routes/Sessions.jsx")
src = path.read_text()

old_block = "      <button onClick={() => onDeleted(shootType.id)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 4 }}>"
assert src.count(old_block) == 1, "delete button anchor not found or not unique"
new_block = "      <button onClick={() => onDeleted(shootType.id)} aria-label={`Delete ${shootType.name}`} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 4 }}>"
src = src.replace(old_block, new_block)

path.write_text(src)
print("Added aria-label to the shoot type delete button")
