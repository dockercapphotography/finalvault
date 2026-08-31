#!/usr/bin/env python3
"""
Patch v1.5.11 -- four small UI fixes from the v1.5.10 follow-up list:

1. CustomDomainSection.jsx, MicrositeSection.jsx: the domain-name link and
   its action button overlapped on narrow screens (row had no wrap, no
   truncation). Stack the row on mobile (flex-col -> flex-row at sm:) and
   truncate the domain text as a safety net against very long domains.
2. MicrositeEditor.jsx: add a "View live site" icon next to the Website
   header title once a custom domain is active, so getting to the live
   site doesn't require backing out to Account and clicking the domain
   there.
3. functions/index.js: reorder the social-share description fallback
   chain. Was about_subheading -> tagline -> bio -> generic; now
   tagline -> hero_subheading -> about_subheading -> generic, since not
   every photographer enables the About section but a tagline (and the
   Hero subheading, which is front-and-center on the page) are more
   likely to actually be set.
4. MicrositeRenderer.css: widen .ms-hero-content from 640px to 880px --
   640px was cramped on anything wider than a phone.

Run from the repo root. Idempotent -- safe to run twice.
"""
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent


def patch_file(rel_path, replacements):
    path = ROOT / rel_path
    text = path.read_text()
    changed = False
    for old, new, expected_count in replacements:
        if new in text:
            continue
        count = text.count(old)
        assert count == expected_count, (
            f"{rel_path}: expected {expected_count} occurrence(s) of a block, found {count}.\n"
            f"--- block ---\n{old}\n-------------"
        )
        text = text.replace(old, new)
        changed = True
    if not changed:
        print(f"  (no changes needed -- {rel_path} already patched)")
        return
    path.write_text(text)
    print(f"Patched {rel_path}")


# ── 1a. CustomDomainSection.jsx -- mobile overlap ──────────────────────────
patch_file("src/components/account/CustomDomainSection.jsx", [
    (
        '        {uiState === \'active\' && domain && (\n'
        '          <div className="flex items-center justify-between gap-4">\n'
        '            <div className="min-w-0">\n'
        '              <div className="flex items-center gap-2">\n'
        '                <Globe size={15} style={{ color: \'var(--text-muted)\', flexShrink: 0 }} />\n'
        '                <a href={`https://${domain.domain}`} target="_blank" rel="noopener noreferrer"\n'
        '                  className="text-sm font-medium" style={{ color: \'var(--text)\', textDecoration: \'none\' }}>\n',
        '        {uiState === \'active\' && domain && (\n'
        '          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">\n'
        '            <div className="min-w-0 w-full sm:w-auto">\n'
        '              <div className="flex items-center gap-2 min-w-0">\n'
        '                <Globe size={15} style={{ color: \'var(--text-muted)\', flexShrink: 0 }} />\n'
        '                <a href={`https://${domain.domain}`} target="_blank" rel="noopener noreferrer"\n'
        '                  className="text-sm font-medium truncate" style={{ color: \'var(--text)\', textDecoration: \'none\' }}>\n',
        1,
    ),
])

# ── 1b. MicrositeSection.jsx -- same mobile overlap fix ────────────────────
patch_file("src/components/account/MicrositeSection.jsx", [
    (
        '      <div className="px-5 py-4 flex items-center justify-between gap-4" style={{ background: \'var(--surface)\' }}>\n'
        '        <div className="min-w-0">\n'
        '          {hasDomain ? (\n'
        '            <>\n'
        '              <div className="flex items-center gap-2">\n'
        '                <Globe size={15} style={{ color: \'var(--text-muted)\', flexShrink: 0 }} />\n'
        '                <a href={`https://${domain.domain}`} target="_blank" rel="noopener noreferrer"\n'
        '                  className="text-sm font-medium" style={{ color: \'var(--text)\', textDecoration: \'none\' }}>\n',
        '      <div className="px-5 py-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4" style={{ background: \'var(--surface)\' }}>\n'
        '        <div className="min-w-0 w-full sm:w-auto">\n'
        '          {hasDomain ? (\n'
        '            <>\n'
        '              <div className="flex items-center gap-2 min-w-0">\n'
        '                <Globe size={15} style={{ color: \'var(--text-muted)\', flexShrink: 0 }} />\n'
        '                <a href={`https://${domain.domain}`} target="_blank" rel="noopener noreferrer"\n'
        '                  className="text-sm font-medium truncate" style={{ color: \'var(--text)\', textDecoration: \'none\' }}>\n',
        1,
    ),
])

# ── 2. MicrositeEditor.jsx -- "View live site" link ────────────────────────
patch_file("src/routes/MicrositeEditor.jsx", [
    (
        "import { ArrowLeft, Plus, Trash2, ImageIcon, X, Crosshair, MoreVertical, Pencil, Check, Eye, FileText, Palette } from 'lucide-react'\n"
        "import { getMyMicrosite, updateMyMicrosite } from '../utils/micrositeApi.js'\n",
        "import { ArrowLeft, Plus, Trash2, ImageIcon, X, Crosshair, MoreVertical, Pencil, Check, Eye, FileText, Palette, ExternalLink } from 'lucide-react'\n"
        "import { getMyMicrosite, updateMyMicrosite } from '../utils/micrositeApi.js'\n"
        "import { callManageCustomDomain } from '../components/account/CustomDomainSection.jsx'\n",
        1,
    ),
    (
        "  const [accountAllSessionsToken, setAccountAllSessionsToken] = useState(null)\n"
        "  const [uploadingLogo, setUploadingLogo] = useState(false)\n",
        "  const [accountAllSessionsToken, setAccountAllSessionsToken] = useState(null)\n"
        "  const [liveDomain, setLiveDomain] = useState(null)\n"
        "  const [uploadingLogo, setUploadingLogo] = useState(false)\n",
        1,
    ),
    (
        "    load()\n"
        "    getGalleries().then(setGalleries).catch(() => setGalleries([]))\n"
        "    getSignupPages().then(setSignupPages).catch(() => setSignupPages([]))\n"
        "  }, [])\n",
        "    load()\n"
        "    getGalleries().then(setGalleries).catch(() => setGalleries([]))\n"
        "    getSignupPages().then(setSignupPages).catch(() => setSignupPages([]))\n"
        "    // Only used to decide whether \"View live site\" has anywhere to link\n"
        "    // to -- a missing/pending domain just hides the affordance below.\n"
        "    callManageCustomDomain('GET').then(setLiveDomain).catch(() => setLiveDomain(null))\n"
        "  }, [])\n",
        1,
    ),
    (
        "          <h1 className=\"text-base font-semibold\" style={{ color: 'var(--text)' }}>Website</h1>\n"
        "        </div>\n",
        "          <h1 className=\"text-base font-semibold\" style={{ color: 'var(--text)' }}>Website</h1>\n"
        "          {liveDomain?.status === 'active' && site.enabled && (\n"
        "            <a href={`https://${liveDomain.domain}`} target=\"_blank\" rel=\"noopener noreferrer\" title=\"View live site\"\n"
        "              style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)', flexShrink: 0 }}>\n"
        "              <ExternalLink size={15} />\n"
        "            </a>\n"
        "          )}\n"
        "        </div>\n",
        1,
    ),
])

# ── 3. functions/index.js -- share-description fallback order ─────────────
patch_file("functions/index.js", [
    (
        "  const title = site.studio_name || 'Photography'\n"
        "  const description = truncate(\n"
        "    site.about_subheading || site.tagline || site.bio || `Professional photography by ${title}`,\n"
        "    160\n"
        "  )\n",
        "  const title = site.studio_name || 'Photography'\n"
        "  // Priority order per Nick: not every photographer turns on the About\n"
        "  // section, but a tagline is the most likely thing to actually be set,\n"
        "  // followed by the Hero subheading (also front-and-center on the page),\n"
        "  // then the About section's own subheading, before falling back to a\n"
        "  // generic message.\n"
        "  const description = truncate(\n"
        "    site.tagline || site.hero_subheading || site.about_subheading || `Professional photography by ${title}`,\n"
        "    160\n"
        "  )\n",
        1,
    ),
])

# ── 4. MicrositeRenderer.css -- widen hero content ─────────────────────────
patch_file("src/components/microsite/MicrositeRenderer.css", [
    (
        ".ms-hero-content { position: relative; z-index: 2; color: #fff; max-width: 640px; padding: 0 32px; margin: 0 auto; width: 100%; }\n",
        ".ms-hero-content { position: relative; z-index: 2; color: #fff; max-width: 880px; padding: 0 32px; margin: 0 auto; width: 100%; }\n",
        1,
    ),
])

print("\nDone. Run `npm run build` (or your dev server) and check:")
print("  1. Account -> Custom Domain and Website rows on a narrow viewport (no overlap, domain truncates)")
print("  2. Website management page header shows a 'View live site' icon once a custom domain is active")
print("  3. Share a booking/microsite link and confirm the og:description now prefers Tagline > Hero Sub-Heading > About Sub-Heading > generic")
print("  4. Microsite hero content max-width is now 880px, not 640px")
