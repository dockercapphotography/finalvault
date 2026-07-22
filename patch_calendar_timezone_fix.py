import pathlib

path = pathlib.Path("src/routes/SignupBooking.jsx")
src = path.read_text()

old_buggy = "const fmt = iso => iso.replace(/[-:]/g, '').replace(/\\.\\d{3}/, '')"
count = src.count(old_buggy)
assert count == 2, f"expected exactly 2 occurrences of the buggy fmt function, found {count}"

# The old version glued a raw offset (e.g. "+00:00" -> "+0000") directly
# onto the digits after stripping separators -- a format Google Calendar's
# parser doesn't recognize, so it fell back to reading the digits as local
# time in the viewer's own calendar zone instead of converting from UTC.
# Parsing into a real Date first and using toISOString() guarantees a
# proper "Z"-suffixed UTC string regardless of what offset format the
# input originally had.
new_fixed = "const fmt = iso => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\\.\\d{3}Z$/, 'Z')"

src = src.replace(old_buggy, new_fixed)
path.write_text(src)
print(f"Fixed the calendar timestamp formatting bug in both locations")
