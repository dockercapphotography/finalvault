path = '/Users/nickporterfield/code/finalvault/src/routes/SessionDetail.jsx'

with open(path, 'r') as f:
    src = f.read()

old = '''        </div>

      </div>
    </EditSessionWrapper>'''
new = '''        </div>
    </EditSessionWrapper>'''
assert src.count(old) == 1, f"FAIL: {src.count(old)} matches"
src = src.replace(old, new)

with open(path, 'w') as f:
    f.write(src)

print("✅ Fixed: removed extra closing div in EditSessionModal")
