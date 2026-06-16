path = '/Users/nickporterfield/code/finalvault/src/routes/Clients.jsx'

with open(path, 'r') as f:
    src = f.read()

old = '    <div className="max-w-4xl space-y-5">'
new = '    <div className="space-y-5">'
assert src.count(old) == 1, f"FAIL: {src.count(old)} matches"
src = src.replace(old, new)

with open(path, 'w') as f:
    f.write(src)

print("✅ Removed max-w-4xl from Clients page container")
