import pathlib

path = pathlib.Path("src/components/layout/PageWrapper.jsx")
src = path.read_text()

old_version = "const VERSION = '1.4.5'"
assert src.count(old_version) == 1, "VERSION anchor not found or not unique"
src = src.replace(old_version, "const VERSION = '1.5.0'")

old_section = '                <Section title="v1.4.5 — July 19, 2026">'
assert src.count(old_section) == 1, "v1.4.5 Section anchor not found or not unique"

new_section = '''                <Section title="v1.5.0 — July 21, 2026">
                  <Group label="Session Signup Pages">
                    <Item>New "Sign-ups" workspace on the Sessions page -- create public booking pages per event, with venue, timezone, shoot types, and time slots</Item>
                    <Item>Public booking page with day-grouped, venue-local-time slots; database-enforced double-booking prevention across overlapping shoot types</Item>
                    <Item>Booking auto-creates (or matches) the client and a real session -- no separate approval step -- and can auto-assign linked questionnaires</Item>
                    <Item>Client confirmation + photographer notification emails, both with a calendar link and .ics attachment; per-page custom note fields</Item>
                    <Item>Live status page for checking bookings on your phone, with real-time updates and a claimed/open progress view</Item>
                    <Item>Slot generator supports single-day or multi-day ranges, plus manual single-slot add and a clear-all-open-slots action</Item>
                  </Group>
                  <Group label="Bug Fixes">
                    <Item>Fixed a crash selecting a venue address on a signup page</Item>
                    <Item>Fixed slot times using the browser's timezone instead of the venue's</Item>
                    <Item>Fixed incorrect times on the "Add to Google Calendar" link and .ics file</Item>
                    <Item>Fixed a Gmail inline-preview error and an email crash on venue addresses with commas</Item>
                    <Item>Fixed the booking page showing slots already blocked by an overlapping claim</Item>
                    <Item>Removed a stale duplicate database function left from an earlier update</Item>
                  </Group>
                  <Group label="UI Polish">
                    <Item>Redesigned Sign-ups overview cards, the booking page flow, and the live status page</Item>
                  </Group>
                </Section>
                <Section title="v1.4.5 — July 19, 2026">'''

src = src.replace(old_section, new_section)
path.write_text(src)
print("Bumped VERSION to 1.5.0 and added condensed in-app changelog entry")
