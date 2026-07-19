import pathlib

path = pathlib.Path("README.md")
src = path.read_text()

old_photographer_bullet = "- **Client Portal** — generate a single, durable link for each client showing all their galleries, contracts, and outstanding questionnaires in one place; regenerate anytime to revoke an old link"
assert src.count(old_photographer_bullet) == 1, "photographer-facing Client Portal bullet not found or not unique"
new_photographer_bullet = "- **Client Portal** — generate a single, durable link for each client showing all their galleries, contracts, and outstanding questionnaires in one place; regenerate anytime to revoke an old link; optionally protect the whole portal with a password, with automatic escalating lockout after repeated wrong attempts and a manual reset if a client gets stuck"
src = src.replace(old_photographer_bullet, new_photographer_bullet)

old_client_bullet = "- **Client Portal** — a single link showing all of your galleries (grouped by session, with search/sort/filter once you have several), contracts awaiting or already signed with downloadable PDFs, and any outstanding questionnaires"
assert src.count(old_client_bullet) == 1, "client-facing Client Portal bullet not found or not unique"
new_client_bullet = "- **Client Portal** — a single link showing all of your galleries (grouped by session, with search/sort/filter once you have several), contracts awaiting or already signed with downloadable PDFs, and any outstanding questionnaires; password- or PIN-protected galleries show their access code directly in the portal with one-click copy, and open in a new tab so the code stays visible while you browse"
src = src.replace(old_client_bullet, new_client_bullet)

path.write_text(src)
print("Updated both Client Portal README bullets for v1.4.4")
