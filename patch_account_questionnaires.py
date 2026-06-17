path = '/Users/nickporterfield/code/finalvault/src/routes/Account.jsx'

with open(path, 'r') as f:
    src = f.read()

# ── 1. Remove questionnaires from BASE_ACCOUNT_TABS ──────────────────────────
old = '''  { id: 'templates',       label: 'Templates' },
  { id: 'questionnaires',  label: 'Questionnaires' },
  { id: 'social',          label: 'Social' },'''
new = '''  { id: 'templates',       label: 'Templates' },
  { id: 'social',          label: 'Social' },'''
assert src.count(old) == 1, f"FAIL 1: {src.count(old)}"
src = src.replace(old, new)

# ── 2. Add QuestionnairesTab inside templates tab ─────────────────────────────
old = '''      {activeTab === 'templates'     && (
        <div className="space-y-6">
          <GalleryTemplatesTab onSaveState={setSaveState} />
          <EmailTemplatesTab onSaveState={setSaveState} />
          <ContractTemplatesTab onSaveState={setSaveState} />
        </div>
      )}'''
new = '''      {activeTab === 'templates'     && (
        <div className="space-y-6">
          <GalleryTemplatesTab onSaveState={setSaveState} />
          <EmailTemplatesTab onSaveState={setSaveState} />
          <ContractTemplatesTab onSaveState={setSaveState} />
          <QuestionnairesTab onSaveState={setSaveState} />
        </div>
      )}'''
assert src.count(old) == 1, f"FAIL 2: {src.count(old)}"
src = src.replace(old, new)

# ── 3. Remove standalone questionnaires tab render ────────────────────────────
old = "      {activeTab === 'questionnaires'  && <QuestionnairesTab onSaveState={setSaveState} />}\n"
new = ""
assert src.count(old) == 1, f"FAIL 3: {src.count(old)}"
src = src.replace(old, new)

assert src.count('QuestionnairesTab') >= 2, "FAIL: QuestionnairesTab missing"
assert src.count("{ id: 'questionnaires'") == 0, "FAIL: questionnaires tab still in list"

with open(path, 'w') as f:
    f.write(src)

print("✅ Questionnaires moved under Templates tab")
