import pathlib

path = pathlib.Path("src/components/layout/PageWrapper.jsx")
src = path.read_text()

old_version = "const VERSION = '1.4.4'"
assert src.count(old_version) == 1, "VERSION const anchor not found or not unique"
new_version = "const VERSION = '1.4.5'"
src = src.replace(old_version, new_version)

old_section = '                <Section title="v1.4.4 — July 19, 2026">'
assert src.count(old_section) == 1, "v1.4.4 Section anchor not found or not unique"

new_section = '''                <Section title="v1.4.5 — July 19, 2026">
                  <Group label="Client Avatars">
                    <Item>New "Choose from gallery" option -- pick a client's avatar straight from one of their linked galleries instead of only uploading a file</Item>
                    <Item>Same Upload photo / Choose from gallery menu now used consistently on both the client page and Edit Client modal</Item>
                  </Group>
                  <Group label="Bug Fixes">
                    <Item>Fixed expired galleries showing "Active" and a broken cover image on the Client page</Item>
                  </Group>
                  <Group label="UI Polish">
                    <Item>Desktop sidebar nav order now matches mobile (Bookmarked moved after Sessions)</Item>
                    <Item>Fixed mobile "+" button color and Activity page pills wrapping on narrow phones</Item>
                  </Group>
                </Section>
                <Section title="v1.4.4 — July 19, 2026">'''

src = src.replace(old_section, new_section)
path.write_text(src)
print("Bumped VERSION to 1.4.5 and added the in-app changelog Section")
