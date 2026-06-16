path = '/Users/nickporterfield/code/finalvault/src/routes/Clients.jsx'

with open(path, 'r') as f:
    src = f.read()

old = "    address: '', city: '', state: '', zip: '', notes: '', tags: '', pronouns: '',"
new = "    address: '', city: '', state: '', zip: '', notes: '', tags: [], pronouns: '',"
assert src.count(old) == 1, f"FAIL: {src.count(old)} matches"
src = src.replace(old, new)

with open(path, 'w') as f:
    f.write(src)

print("✅ Fixed: tags initial state changed from '' to [] in ClientFormModal")
