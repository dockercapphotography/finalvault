import pathlib

files = [
    "src/routes/ClientPortalGalleries.jsx",
    "src/routes/ClientPortalContracts.jsx",
    "src/routes/ClientPortalQuestionnaires.jsx",
    "src/routes/ClientPortalContractDetail.jsx",
]

old_import = "import { getPortalData } from '../utils/clientApi.js'"
new_import = "import { getPortalData } from '../utils/clientApi.js'\nimport PortalPasswordGate from '../components/layout/PortalPasswordGate.jsx'"

old_state = "  const [notFound, setNotFound] = useState(false)"
new_state = "  const [notFound, setNotFound] = useState(false)\n  const [gateResult, setGateResult] = useState(null)"

old_load = """      const result = await getPortalData(token)
      if (!result) {
        setNotFound(true)
        return
      }
      setData(result)"""

new_load = """      const result = await getPortalData(token)
      if (result?.password_required) {
        setGateResult(result)
        return
      }
      if (!result) {
        setNotFound(true)
        return
      }
      setData(result)"""

old_notfound_block = '''  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
        <div className="text-center max-w-sm">
          <p className="text-base font-medium" style={{ color: 'var(--text)' }}>This link isn't valid</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            The link may have been regenerated. Contact your photographer for an updated link.
          </p>
        </div>
      </div>
    )
  }'''

new_notfound_block = '''  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
        <div className="text-center max-w-sm">
          <p className="text-base font-medium" style={{ color: 'var(--text)' }}>This link isn't valid</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            The link may have been regenerated. Contact your photographer for an updated link.
          </p>
        </div>
      </div>
    )
  }

  if (gateResult) {
    return (
      <PortalPasswordGate
        token={token}
        gateResult={gateResult}
        onUnlock={result => { setGateResult(null); setData(result) }}
      />
    )
  }'''

for filepath in files:
    path = pathlib.Path(filepath)
    src = path.read_text()

    assert src.count(old_import) == 1, f"{filepath}: import anchor not found or not unique"
    assert src.count(old_state) == 1, f"{filepath}: state anchor not found or not unique"
    assert src.count(old_load) == 1, f"{filepath}: load() anchor not found or not unique"
    assert src.count(old_notfound_block) == 1, f"{filepath}: notFound block anchor not found or not unique"

    src = src.replace(old_import, new_import)
    src = src.replace(old_state, new_state)
    src = src.replace(old_load, new_load)
    src = src.replace(old_notfound_block, new_notfound_block)

    path.write_text(src)
    print(f"Patched {filepath}")

print("All 4 portal pages patched successfully")
