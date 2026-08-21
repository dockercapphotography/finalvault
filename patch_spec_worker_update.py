def patch(path, old, new, expected_count=1):
    with open(path, 'r') as f:
        src = f.read()
    count = src.count(old)
    assert count == expected_count, f"{path}: expected {expected_count} occurrence(s) of {old!r}, found {count}"
    src = src.replace(old, new)
    with open(path, 'w') as f:
        f.write(src)
    print(f"OK  {path}: replaced {expected_count}x")

path = 'docs/custom-domains-spec.md'

# --- Stale domain references: finalvault.dockercapphotography.com -> final-vault.app ---
patch(path,
"""https://finalvault.dockercapphotography.com/g/69d77f4622f34cb281cea...
https://finalvault.dockercapphotography.com/book/9f3a1c...
https://finalvault.dockercapphotography.com/client/8e21b0...""",
"""https://final-vault.app/g/69d77f4622f34cb281cea...
https://final-vault.app/book/9f3a1c...
https://final-vault.app/client/8e21b0...""")

patch(path,
"   `finalvault.dockercapphotography.com/g/abc123` resolve identically once they reach",
"   `final-vault.app/g/abc123` resolve identically once they reach")

patch(path,
"   `finalvault.dockercapphotography.com` that would break under a different host.",
"   `final-vault.app` that would break under a different host.")

patch(path,
"- One-time setup on the `dockercapphotography.com` zone: enable Cloudflare for SaaS,",
"- One-time setup on the `final-vault.app` zone: enable Cloudflare for SaaS,")

patch(path,
"`finalvault.dockercapphotography.com`, because that's the domain the photographer's",
"`final-vault.app`, because that's the domain the photographer's")

# --- Note (Aug 2026 domain migration): superseded by the domain migration ---
patch(path,
"**Date:** August 17, 2026",
"""**Date:** August 17, 2026
**Update (Aug 2026):** FinalVault's primary domain has since migrated from
`finalvault.dockercapphotography.com` to `final-vault.app` (see Phase 0 of the
v1.5.6 build). Domain references below have been updated to match; the
underlying design is unchanged.""")

# --- Resolve open question 1 (CNAME target naming) ---
patch(path,
"""1. **CNAME target naming.** Something like `customers.finalvault.dockercapphotography.com`
   (a dedicated, documented target) vs. pointing directly at the Cloudflare Pages
   fallback origin. A dedicated target is slightly more setup but more flexible if
   the underlying hosting ever changes.""",
"""1. ~~**CNAME target naming.**~~ **Resolved.** `customers.final-vault.app` — a
   dedicated indirection target, per the reasoning above (decoupled from
   hosting internals). Photographers CNAME to this; it is never shown as the
   literal serving domain. See §3.6 for what this target actually is under
   the hood (not a direct Pages record — see below).""")

# --- New section 3.6: Fallback origin must be a Worker, not Pages directly ---
patch(path,
"""### 3.5 Registrar-guided setup instructions
""",
"""### 3.6 Fallback origin: requires a Worker bridge, not direct Pages

**Discovered during Phase 1 end-to-end testing (Aug 2026), not anticipated in
the original design above.** Pointing the Cloudflare for SaaS Fallback Origin
directly at the Pages-served domain (`final-vault.app`) does not work — it
produces a Cloudflare 522 (connection timed out) for any custom hostname
other than `final-vault.app` itself.

**Why:** Cloudflare Pages only accepts requests whose Host header matches one
of its own configured Custom Domains. It has no way to know about
photographers' individual custom domains (e.g. `book.janesmithphotography.com`)
since those exist only as Cloudflare for SaaS Custom Hostnames on the
`final-vault.app` zone, never registered with Pages itself.

**Fix (Cloudflare's own documented pattern for this exact combination):**
a small Worker (`saas-proxy-worker/`) sits as the actual Fallback Origin and
forwards every request — regardless of which hostname it arrived on — to the
Pages deployment's own `*.pages.dev` hostname, which Pages always accepts
regardless of Host header. Concretely:

- An "originless" DNS record (`origin.final-vault.app`, `AAAA 100::`,
  proxied) — Cloudflare's documented convention for "no real server, a
  Worker handles this."
- Fallback Origin (SSL/TLS → Custom Hostnames) set to `origin.final-vault.app`,
  not `final-vault.app`.
- The `customers.final-vault.app` CNAME target (§5, open question 1) also
  points to `origin.final-vault.app`, matching Cloudflare's own recommended
  pattern of CNAME target → fallback origin.
- A zone-wide Worker Route (`*/*` → `finalvault-saas-proxy`) — this
  necessarily applies to *all* traffic on the zone, not just custom-hostname
  traffic, since Cloudflare for SaaS routing can't be scoped more narrowly
  than the zone.

Since FinalVault's own routing is entirely token-based (§2), this Worker is
purely a network-level bridge — no app logic runs in it.

### 3.5 Registrar-guided setup instructions
""")

# --- Update build sequence to reflect the Worker requirement ---
patch(path,
"""1. Cloudflare account-level setup (enable Cloudflare for SaaS on the zone, fallback
   origin) — one-time, manual, not app code.""",
"""1. Cloudflare account-level setup (enable Cloudflare for SaaS on the zone,
   fallback origin) — one-time, manual, not app code. Requires the Worker
   bridge in §3.6, not a direct Pages fallback origin.""")

print("\nAll patches applied successfully.")
