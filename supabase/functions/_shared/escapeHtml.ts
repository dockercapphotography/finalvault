// supabase/functions/_shared/escapeHtml.ts
//
// Every value that goes into an email's HTML goes through one of these.
// Client-entered text (names typed on public booking pages, a contract
// signer's typed name, gallery viewer names) and photographer-entered text
// (gallery and contract titles, business names, social links) used to be
// pasted into email HTML as-is, so anyone could put live links, buttons or
// hidden content into an email sent from FinalVault's domain.

/** Text placed between tags or inside a quoted attribute. */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * A URL placed in href/src: only http(s) links survive (no javascript:,
 * data: etc.), then it is escaped for the attribute.
 */
export function safeUrl(value: unknown): string {
  if (value === null || value === undefined) return ''
  const url = String(value).trim()
  if (!/^https?:\/\//i.test(url)) return '#'
  return escapeHtml(url)
}

/**
 * The display-name part of an email From header ("Name <noreply@...>").
 * Strips characters that would break or rewrite the address part.
 */
export function safeFromName(value: unknown, fallback = 'FinalVault'): string {
  const name = String(value ?? '')
    .replace(/[<>"\\,;:\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 70)
  return name || fallback
}
