"""
Patches src/App.jsx to add hostname-aware root routing:
  - final-vault.app (+ dev/preview hosts): unchanged, protected Dashboard
  - any other hostname: renders CustomDomainRoot (microsite / placeholder / not_found)

Run from the repo root:
    python3 patch_app_jsx.py
"""
import pathlib

path = pathlib.Path("src/App.jsx")
src = path.read_text()

# ── 1. Add the new import, right after the PageWrapper import ──
old_import = "import PageWrapper from './components/layout/PageWrapper.jsx'\nimport SignupLiveStatus from './routes/SignupLiveStatus.jsx'"
new_import = (
    "import PageWrapper from './components/layout/PageWrapper.jsx'\n"
    "import SignupLiveStatus from './routes/SignupLiveStatus.jsx'\n"
    "import CustomDomainRoot from './routes/CustomDomainRoot.jsx'\n"
    "import { isAppHost } from './utils/isAppHost.js'"
)
assert src.count(old_import) == 1, "import anchor not found or not unique"
src = src.replace(old_import, new_import)

# ── 2. Make the "/" route hostname-aware ──
old_route = """      <Route path="/" element={
        <ProtectedRoute session={session}>
          <PageWrapper session={session}><Dashboard /></PageWrapper>
        </ProtectedRoute>
      } />"""
new_route = """      <Route path="/" element={
        isAppHost()
          ? <ProtectedRoute session={session}>
              <PageWrapper session={session}><Dashboard /></PageWrapper>
            </ProtectedRoute>
          : <CustomDomainRoot />
      } />"""
assert src.count(old_route) == 1, "route anchor not found or not unique"
src = src.replace(old_route, new_route)

path.write_text(src)
print("Patched src/App.jsx successfully.")
