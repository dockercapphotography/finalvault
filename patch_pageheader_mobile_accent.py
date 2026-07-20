import pathlib

path = pathlib.Path("src/components/ui/PageHeader.jsx")
src = path.read_text()

old_style = '''  const iconButtonStyle = {
    width: 44, height: 44, background: 'var(--surface)', border: '1px solid var(--border)',
    color: 'var(--text-muted)', cursor: 'pointer', borderRadius: 12,
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  }'''

assert src.count(old_style) == 1, "iconButtonStyle anchor not found or not unique"

# Was flat neutral gray regardless of context -- meant this mobile "+"
# never matched the purple accent the desktop primary Button (variant=
# "primary") already uses for the exact same create action. Same accent
# colors Button.jsx's primary variant uses, so the mobile trigger visually
# matches its desktop counterpart whether it's a single action (triggers
# directly) or opens the dropdown for multiple.
new_style = '''  const iconButtonStyle = {
    width: 44, height: 44, background: 'var(--accent)', border: 'none',
    color: 'var(--accent-fg)', cursor: 'pointer', borderRadius: 12,
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  }'''

src = src.replace(old_style, new_style)
path.write_text(src)
print("Fixed PageHeader's mobile create-action button to use the brand purple accent")
