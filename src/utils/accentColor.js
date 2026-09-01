// Accent-contrast helpers, shared by the public booking pages
// (SignupBooking.jsx, AllSessionsBooking.jsx) for the branded look a
// photographer's microsite theme produces there.
//
// This is the same math MicrositeRenderer.jsx already uses for its own
// accent-contrast handling -- pulled out here rather than imported
// directly from that file so the booking pages don't take on a dependency
// on the (much larger, editor-adjacent) microsite renderer just for five
// small color functions. Keep any future fix to this math in both places
// in sync by hand if MicrositeRenderer.jsx's copy changes.

export function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return { r: parseInt(h.substring(0, 2), 16), g: parseInt(h.substring(2, 4), 16), b: parseInt(h.substring(4, 6), 16) }
}

export function rgbToHex(r, g, b) {
  const toHex = n => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

export function blendToward(hex, targetHex, amount) {
  const c = hexToRgb(hex)
  const t = hexToRgb(targetHex)
  return rgbToHex(c.r + (t.r - c.r) * amount, c.g + (t.g - c.g) * amount, c.b + (t.b - c.b) * amount)
}

// Text color guaranteed readable when the accent itself is used as text
// color (not as a button/badge background with fixed white text on top).
export function getAccentTextColor(accentHex, isDarkTheme) {
  if (!/^#[0-9a-fA-F]{6}$/.test(accentHex)) return accentHex
  const { r, g, b } = hexToRgb(accentHex)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  if (isDarkTheme && luminance < 0.55) return blendToward(accentHex, '#FFFFFF', 0.55)
  if (!isDarkTheme && luminance > 0.8) return blendToward(accentHex, '#000000', 0.35)
  return accentHex
}

// Text color for content sitting on a solid accent-colored background
// (buttons, badges) -- just needs black-vs-white, not a blended tone.
export function getAccentButtonTextColor(accentHex) {
  if (!/^#[0-9a-fA-F]{6}$/.test(accentHex)) return '#fff'
  const { r, g, b } = hexToRgb(accentHex)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? '#17171A' : '#fff'
}
