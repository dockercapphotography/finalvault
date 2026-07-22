import pathlib

path = pathlib.Path("README.md")
src = path.read_text()

old_badge = "![Tests](https://img.shields.io/badge/tests-321%20passing-22c55e?style=flat-square)"
assert src.count(old_badge) == 1, "test badge anchor not found or not unique"
src = src.replace(old_badge, "![Tests](https://img.shields.io/badge/tests-355%20passing-22c55e?style=flat-square)")

old_bullet = "- **Client Portal** — generate a single, durable link for each client showing all their galleries, contracts, and outstanding questionnaires in one place; regenerate anytime to revoke an old link; optionally protect the whole portal with a password, with automatic escalating lockout after repeated wrong attempts and a manual reset if a client gets stuck"
assert src.count(old_bullet) == 1, "Client Portal bullet anchor not found or not unique"

new_bullet = old_bullet + "\n- **Session Signup Pages** — create a public, shareable booking page per event with its own venue, timezone, and shoot types; clients pick a time and book themselves, which atomically creates the client (or matches an existing one) and a real session, with automatic questionnaire assignment, database-enforced double-booking prevention across overlapping shoot types, calendar-ready confirmation emails (Google Calendar link + .ics), and a live status page for checking bookings on the go"

src = src.replace(old_bullet, new_bullet)
path.write_text(src)
print("Updated README test badge and added Session Signup Pages feature bullet")
