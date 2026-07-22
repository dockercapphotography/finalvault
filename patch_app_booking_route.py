import pathlib

path = pathlib.Path("src/App.jsx")
src = path.read_text()

old_imports = "import ClientPortalRedirect from './routes/ClientPortalRedirect.jsx'"
assert src.count(old_imports) == 1, "import anchor not found or not unique"
new_imports = "import ClientPortalRedirect from './routes/ClientPortalRedirect.jsx'\nimport SignupBooking from './routes/SignupBooking.jsx'"
src = src.replace(old_imports, new_imports)

old_route = '      <Route path="/client/:token" element={<ClientPortalRedirect />} />'
assert src.count(old_route) == 1, "route anchor not found or not unique"
new_route = '      <Route path="/client/:token" element={<ClientPortalRedirect />} />\n      <Route path="/book/:token" element={<SignupBooking />} />'
src = src.replace(old_route, new_route)

path.write_text(src)
print("Wired /book/:token into App.jsx")
