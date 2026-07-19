import pathlib

path = pathlib.Path("src/routes/ClientPortalGalleries.jsx")
src = path.read_text()

# The 92px left offset was meant to visually align the strip under the
# title text next to the thumbnail. On narrow phone widths that offset
# eats a large fraction of the available row width, so Password/PIN wrap
# onto separate lines with a much bigger vertical gap than intended (gap-4
# applies to both axes). Simpler and robust at every width: match the
# same 16px padding the rest of the card uses instead of trying to align
# under the thumbnail -- and tighten the wrap gap so wrapped lines (still
# possible on very narrow phones with both password and PIN present)
# sit close together rather than looking like a layout bug.
old_strip = '''      {hasAccessInfo && (
        <div className="flex items-center gap-4 flex-wrap" style={{ padding: '8px 16px 10px 92px', borderTop: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
          <Lock size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          {gallery.require_password && <AccessInfoItem label="Password" value={gallery.plain_password} />}
          {gallery.require_download_pin && <AccessInfoItem label="PIN" value={gallery.plain_download_pin} />}
        </div>
      )}'''

assert src.count(old_strip) == 1, "access info strip anchor not found or not unique"

new_strip = '''      {hasAccessInfo && (
        <div className="flex items-center flex-wrap gap-x-4 gap-y-1.5 px-4 py-2.5" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
          <Lock size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          {gallery.require_password && <AccessInfoItem label="Password" value={gallery.plain_password} />}
          {gallery.require_download_pin && <AccessInfoItem label="PIN" value={gallery.plain_download_pin} />}
        </div>
      )}'''

src = src.replace(old_strip, new_strip)
path.write_text(src)
print("Fixed mobile wrapping in the gallery access info strip")
