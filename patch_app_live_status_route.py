import pathlib

path = pathlib.Path("src/App.jsx")
src = path.read_text()

old_import = "import PageWrapper from './components/layout/PageWrapper.jsx'"
assert src.count(old_import) == 1, "PageWrapper import anchor not found or not unique"
new_import = "import PageWrapper from './components/layout/PageWrapper.jsx'\nimport SignupLiveStatus from './routes/SignupLiveStatus.jsx'"
src = src.replace(old_import, new_import)

old_route = '''      <Route path="/sessions/:id" element={
        <ProtectedRoute session={session}>
          <PageWrapper session={session}><SessionDetail /></PageWrapper>
        </ProtectedRoute>
      } />'''
assert src.count(old_route) == 1, "sessions/:id route anchor not found or not unique"

# Deliberately NOT wrapped in PageWrapper -- full-screen, no sidebar, so it
# doesn't waste phone screen space and behaves well when pinned to a home
# screen as its own PWA-style shortcut. Still wrapped in ProtectedRoute,
# since it shows real client PII and needs the photographer's own session.
new_route = old_route + '''
      <Route path="/sessions/signups/:id/status" element={
        <ProtectedRoute session={session}>
          <SignupLiveStatus />
        </ProtectedRoute>
      } />'''

src = src.replace(old_route, new_route)

path.write_text(src)
print("Wired /sessions/signups/:id/status into App.jsx (no PageWrapper -- full-screen)")
