import pathlib

path = pathlib.Path("CHANGELOG.md")
src = path.read_text()

old_anchor = """# Changelog

All notable changes to FinalVault are documented here.

---

## v1.4.3 — July 18, 2026"""

assert src.count(old_anchor) == 1, "changelog anchor not found or not unique"

new_anchor = """# Changelog

All notable changes to FinalVault are documented here.

---

## v1.4.4 — July 19, 2026

### New Features

**Client Portal Password Protection**
- Clients can now have an optional password protecting their entire portal, set from the client's page -- gates galleries, contracts, and questionnaires all at once, not just individual galleries
- Escalating lockout after repeated wrong attempts (5 free attempts, then a doubling delay capped at 24 hours) -- makes brute-forcing the portal password impractical without punishing a client who mistypes it a few times
- Manual "Reset lockout" action lets you clear a client's lockout immediately instead of waiting it out
- Regenerating a gallery's password (already possible from Gallery Settings) now also revokes previously-unlocked access to that specific gallery on other devices, without disabling the gallery for anyone else

**Gallery Access Info in the Portal**
- Clients can now see a gallery's password and/or download PIN directly in their portal gallery list, each with its own one-click copy button -- no more asking the photographer for the code
- Gallery links from the portal now open in a new tab, so the portal (with the codes still visible) stays open behind it instead of navigating away

### Bug Fixes

- Fixed the gallery "remembered password" flag resetting every time a gallery link was opened in a new tab -- it now persists the same way the portal already remembers a client's identity
- Fixed a portal password lockout not showing the correct "too many attempts" message on the exact attempt that triggered it -- the message previously only appeared starting on the *next* attempt after the lock had already taken effect

### Security

- Fixed an ownership-check gap in `set_client_portal_password` where a `NULL` caller identity could silently pass the authorization check instead of being rejected
- Fixed `get_client_portal_data`'s lockout response not reflecting the newly-triggered lock state on the same call that caused it (see Bug Fixes above)

### Notes

- Deferred: real per-tag colors and live usage counts for client tags (matching the existing gallery tag system) -- scoped as its own schema change for v1.5.0 rather than folded into this release, since it needs a proper `client_tags` table rather than a UI-only patch
- 15 new or extended Playwright tests added this release, covering the password gate, escalating lockout, photographer-side password management, portal gallery access info, and the persistence/revocation fixes

---

## v1.4.3 — July 18, 2026"""

src = src.replace(old_anchor, new_anchor)
path.write_text(src)
print("Added v1.4.4 entry to CHANGELOG.md")
