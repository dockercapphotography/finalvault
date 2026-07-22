import pathlib

path = pathlib.Path("src/routes/SignupBooking.jsx")
src = path.read_text()

old_header = '''        <div className="text-center mb-6">
          <p className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{pageData.title}</p>
          {pageData.venue_address && (
            <p className="text-xs mt-1 flex items-center justify-center gap-1" style={{ color: 'var(--text-muted)' }}>
              <MapPin size={11} />{pageData.venue_address}
            </p>
          )}
        </div>'''

assert src.count(old_header) == 1, "header block anchor not found or not unique"

new_header = '''        <div className="text-center mb-6">
          <p className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{pageData.title}</p>
          {pageData.venue_address && (
            <p className="text-xs mt-1 flex items-center justify-center gap-1" style={{ color: 'var(--text-muted)' }}>
              <MapPin size={11} />{pageData.venue_address}
            </p>
          )}
          {pageData.description && !result && (
            <p className="text-sm mt-4 text-left" style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>{pageData.description}</p>
          )}
        </div>'''

src = src.replace(old_header, new_header)
path.write_text(src)
print("Added booking page description display, shown below the header on every step except the success screen")
