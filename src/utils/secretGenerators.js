// Shared secret generators for gallery access controls.
// Extracted from GallerySettings.jsx so gallery creation (GalleryNew.jsx)
// can generate the same kind of values when a template defaults
// require_download_pin/require_password to true -- previously only
// Settings could generate these, so a gallery created from such a
// template ended up with the requirement ON but no actual PIN/password
// set, silently locking downloads/access until someone manually
// generated one in Settings.

export function generatePin() {
  return String(Math.floor(1000 + Math.random() * 9000))
}

export function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}
