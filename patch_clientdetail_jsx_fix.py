path = '/Users/nickporterfield/code/finalvault/src/routes/ClientDetail.jsx'

with open(path, 'r') as f:
    src = f.read()

old = '''          </div>

          <div style={{display:'none'}}>
          </div>
      </div>
    </EditClientWrapper>'''
new = '''          </div>
      </div>
    </EditClientWrapper>'''
assert src.count(old) == 1, f"FAIL: {src.count(old)} matches"
src = src.replace(old, new)

with open(path, 'w') as f:
    f.write(src)

print("✅ Fixed: removed extra closing div in EditClientModal")
