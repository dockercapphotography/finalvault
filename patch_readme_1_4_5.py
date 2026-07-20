import pathlib

path = pathlib.Path("README.md")
src = path.read_text()

old_bullet = "- **Client CRM** — create and manage client records with contact info, avatars, pronouns, tags, and linked galleries (a gallery can be linked to multiple clients, e.g. both spouses in a wedding, each with full portal access); Google Places address autocomplete; chip+typeahead tag input with autocomplete; search, tag filtering (multi-select), and Sort By (Name, Recently added)"
assert src.count(old_bullet) == 1, "Client CRM bullet not found or not unique"
new_bullet = "- **Client CRM** — create and manage client records with contact info, avatars (upload a photo or pick straight from one of the client's linked galleries), pronouns, tags, and linked galleries (a gallery can be linked to multiple clients, e.g. both spouses in a wedding, each with full portal access); Google Places address autocomplete; chip+typeahead tag input with autocomplete; search, tag filtering (multi-select), and Sort By (Name, Recently added)"
src = src.replace(old_bullet, new_bullet)

path.write_text(src)
print("Updated README's Client CRM bullet for v1.4.5")
