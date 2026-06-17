path = '/Users/nickporterfield/code/finalvault/src/routes/SessionDetail.jsx'

with open(path, 'r') as f:
    src = f.read()

old = '''    <EditSessionWrapper onClose={onClose} footer={footerEl}>
      <div>'''
new = '''    <EditSessionWrapper onClose={onClose} footer={footerEl}>
      <div className="space-y-4">'''
assert src.count(old) == 1, f"FAIL: {src.count(old)} matches"
src = src.replace(old, new)

with open(path, 'w') as f:
    f.write(src)

print("✅ Fixed: space-y-4 restored on EditSessionModal content wrapper")
