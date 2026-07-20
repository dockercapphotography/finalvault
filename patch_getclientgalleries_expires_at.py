import pathlib

path = pathlib.Path("src/utils/crmApi.js")
src = path.read_text()

old_select = ".select('id, title, event_name, event_date, is_active, share_token, created_at, cover_image_id, cover_r2_key, gallery_images!cover_image_id(preview_r2_key), gallery_clients!inner(client_id)')"
assert src.count(old_select) == 1, "getClientGalleries select anchor not found or not unique"
new_select = ".select('id, title, event_name, event_date, is_active, expires_at, share_token, created_at, cover_image_id, cover_r2_key, gallery_images!cover_image_id(preview_r2_key), gallery_clients!inner(client_id)')"
src = src.replace(old_select, new_select)

path.write_text(src)
print("Added expires_at to getClientGalleries' select list")
