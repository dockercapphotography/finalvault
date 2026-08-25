// Distinguishes FinalVault's own app domain(s) from a photographer's custom
// domain. Used exactly once, at the "/" route in App.jsx — everywhere else
// in the app remains token-based and doesn't need to know about hostnames
// at all (see docs/custom-domains-spec.md section 2).

const APP_HOSTS = ['final-vault.app', 'localhost', '127.0.0.1']

export function isAppHost(hostname = window.location.hostname) {
  if (APP_HOSTS.includes(hostname)) return true
  // Cloudflare Pages preview deployments (e.g. abc123.finalvault.pages.dev)
  if (hostname.endsWith('.pages.dev')) return true
  return false
}
