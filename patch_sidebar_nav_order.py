import pathlib

path = pathlib.Path("src/components/layout/Sidebar.jsx")
src = path.read_text()

old_order = '''const baseNavItems = [
  { to: '/', label: 'Galleries', icon: Images, end: true },
  { to: '/bookmarked', label: 'Bookmarked', icon: Bookmark },
  { to: '/clients', label: 'Clients', icon: Users },
  { to: '/sessions', label: 'Sessions', icon: CalendarDays },
  { to: '/account', label: 'Account', icon: Settings },
]'''

assert src.count(old_order) == 1, "desktop nav order anchor not found or not unique"

# Matches the mobile bottom nav's order (further down this same file), which
# already had Bookmarked after Sessions -- the two navs had drifted apart,
# this just brings desktop in line with what mobile already does.
new_order = '''const baseNavItems = [
  { to: '/', label: 'Galleries', icon: Images, end: true },
  { to: '/clients', label: 'Clients', icon: Users },
  { to: '/sessions', label: 'Sessions', icon: CalendarDays },
  { to: '/bookmarked', label: 'Bookmarked', icon: Bookmark },
  { to: '/account', label: 'Account', icon: Settings },
]'''

src = src.replace(old_order, new_order)
path.write_text(src)
print("Reordered desktop sidebar nav to match mobile's order")
