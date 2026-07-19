import pathlib

path = pathlib.Path("src/components/layout/PageWrapper.jsx")
src = path.read_text()

old_version = "const VERSION = '1.4.3'"
assert src.count(old_version) == 1, "VERSION const anchor not found or not unique"
new_version = "const VERSION = '1.4.4'"
src = src.replace(old_version, new_version)

old_section = '                <Section title="v1.4.3 — July 18, 2026">'
assert src.count(old_section) == 1, "v1.4.3 Section anchor not found or not unique"

new_section = '''                <Section title="v1.4.4 — July 19, 2026">
                  <Group label="Client Portal Password Protection">
                    <Item>Clients can now have an optional password protecting their entire portal</Item>
                    <Item>Escalating lockout after repeated wrong attempts, with a manual reset option</Item>
                    <Item>Regenerating a gallery's password now also revokes previously-unlocked access to it</Item>
                  </Group>
                  <Group label="Gallery Access Info">
                    <Item>Clients can now see a gallery's password/PIN directly in their portal, with one-click copy</Item>
                    <Item>Gallery links from the portal now open in a new tab</Item>
                  </Group>
                  <Group label="Bug Fixes">
                    <Item>Fixed the gallery "remembered password" flag resetting when opened in a new tab</Item>
                  </Group>
                </Section>
                <Section title="v1.4.3 — July 18, 2026">'''

src = src.replace(old_section, new_section)
path.write_text(src)
print("Bumped VERSION to 1.4.4 and added the in-app changelog Section")
