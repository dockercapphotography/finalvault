import pathlib

path = pathlib.Path("src/routes/ClientGallery.jsx")
src = path.read_text()

# 1. On load: compare the stored value against the CURRENT correct password
# (freshly fetched this load, via g.plain_password) rather than just
# checking presence. A stale flag from a since-changed password no longer
# matches, so the client falls through to the password prompt instead of
# silently bypassing it -- this is what lets regenerating a gallery's
# password (already a one-click action in GallerySettings) double as a
# "revoke access" tool, without disabling the gallery for anyone else.
old_check = """        if (g.require_password) {
          const pwVerified = localStorage.getItem(`fv-pw-${g.id}`)
          if (pwVerified) { navigate(`/g/${token}/view${window.location.search}`, { replace: true }); return }
          setStage('password')"""

assert src.count(old_check) == 1, "pwVerified check anchor not found or not unique"

new_check = """        if (g.require_password) {
          const storedPw = localStorage.getItem(`fv-pw-${g.id}`)
          if (storedPw && storedPw === g.plain_password) { navigate(`/g/${token}/view${window.location.search}`, { replace: true }); return }
          setStage('password')"""

src = src.replace(old_check, new_check)

# 2. On successful verification: store the actual password that was
# confirmed correct, not just a boolean marker -- that's the value the
# check above compares against on future visits.
old_set = "        localStorage.setItem(`fv-pw-${gallery.id}`, '1')"
assert src.count(old_set) == 1, "pwVerified set anchor not found or not unique"
new_set = "        localStorage.setItem(`fv-pw-${gallery.id}`, password)"
src = src.replace(old_set, new_set)

path.write_text(src)
print("Password-verified flag now tracks which password was used -- a changed password revokes stale access automatically")
