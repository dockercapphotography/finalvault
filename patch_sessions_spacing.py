path = '/Users/nickporterfield/code/finalvault/src/routes/Sessions.jsx'

with open(path, 'r') as f:
    src = f.read()

old = '''    <NewSessionWrapper onClose={onClose} stepper={stepperEl} footer={footerEl}>
      <div>'''
new = '''    <NewSessionWrapper onClose={onClose} stepper={stepperEl} footer={footerEl}>
      <div className="space-y-4">'''
assert src.count(old) == 1, f"FAIL: {src.count(old)} matches"
src = src.replace(old, new)

with open(path, 'w') as f:
    f.write(src)

print("✅ Fixed: space-y-4 restored on content wrapper")
