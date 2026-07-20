import pathlib

path = pathlib.Path("src/routes/ClientDetail.jsx")
src = path.read_text()

old_block = '''      <button onClick={() => setOpen(o => !o)} disabled={uploadingAvatar}
        className="relative w-10 h-10 rounded-full group"
        style={{ display: 'block', border: 'none', padding: 0, background: 'none', cursor: uploadingAvatar ? 'not-allowed' : 'pointer' }}>
        {avatarUrl ? ('''

assert src.count(old_block) == 1, "avatar trigger button anchor not found or not unique"

new_block = '''      <button onClick={() => setOpen(o => !o)} disabled={uploadingAvatar} aria-label="Change photo"
        className="relative w-10 h-10 rounded-full group"
        style={{ display: 'block', border: 'none', padding: 0, background: 'none', cursor: uploadingAvatar ? 'not-allowed' : 'pointer' }}>
        {avatarUrl ? ('''

src = src.replace(old_block, new_block)
path.write_text(src)
print("Added aria-label to the avatar menu trigger button")
