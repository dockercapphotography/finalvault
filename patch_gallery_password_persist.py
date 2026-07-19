import pathlib

path = pathlib.Path("src/routes/ClientGallery.jsx")
src = path.read_text()

old_check = "          const pwVerified = sessionStorage.getItem(`fv-pw-${g.id}`)"
assert src.count(old_check) == 1, "pwVerified check anchor not found or not unique"
new_check = "          const pwVerified = localStorage.getItem(`fv-pw-${g.id}`)"
src = src.replace(old_check, new_check)

old_set = "        sessionStorage.setItem(`fv-pw-${gallery.id}`, '1')"
assert src.count(old_set) == 1, "pwVerified set anchor not found or not unique"
new_set = "        localStorage.setItem(`fv-pw-${gallery.id}`, '1')"
src = src.replace(old_set, new_set)

path.write_text(src)
print("Switched gallery password-verified flag from sessionStorage to localStorage")
