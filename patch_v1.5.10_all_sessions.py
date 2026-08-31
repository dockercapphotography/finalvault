#!/usr/bin/env python3
"""
Patch v1.5.10 -- "All active sessions" aggregate booking link.

Touches five existing files:
  - src/App.jsx                          (new route)
  - src/utils/signupApi.js               (new getMyAllSessionsToken())
  - src/routes/MicrositeEditor.jsx       (Links-to dropdown + save + preview)
  - src/components/microsite/MicrositeRenderer.jsx  (HeroButtons href)
  - src/routes/Sessions.jsx              (copyable link card)

Run from the repo root. Each block is checked for its FINISHED (already-
patched) form first and skipped if found -- safe to run twice. Otherwise
it's guarded by an assert on the expected match count of the original
text, so it fails loudly (and changes nothing) rather than silently
mismatching if the file has drifted from what this patch expects.
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent


def patch_file(rel_path, replacements):
    path = ROOT / rel_path
    text = path.read_text()
    changed = False
    for old, new, expected_count in replacements:
        # Idempotency: the new form is a superset of the old form in every
        # one of this patch's blocks (it always contains the old text plus
        # an addition), so checking for the old text's count alone would
        # still "match" on a second run and double-apply. Check for the
        # finished form first and skip that block if it's already there.
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


# ── 1. src/App.jsx ───────────────────────────────────────────────────────

patch_file("src/App.jsx", [
    (
        "import SignupBooking from './routes/SignupBooking.jsx'\n",
        "import SignupBooking from './routes/SignupBooking.jsx'\n"
        "import AllSessionsBooking from './routes/AllSessionsBooking.jsx'\n",
        1,
    ),
    (
        '      <Route path="/book/:token" element={<SignupBooking />} />\n',
        '      <Route path="/book/:token" element={<SignupBooking />} />\n'
        '      <Route path="/book/all/:token" element={<AllSessionsBooking />} />\n',
        1,
    ),
])

# ── 2. src/utils/signupApi.js ────────────────────────────────────────────

patch_file("src/utils/signupApi.js", [
    (
        "\nexport async function getSignupPage(id) {\n",
        "\n"
        "export async function getMyAllSessionsToken() {\n"
        "  const { data: { user } } = await supabase.auth.getUser()\n"
        "  const { data, error } = await supabase\n"
        "    .from('photographers')\n"
        "    .select('all_sessions_token')\n"
        "    .eq('id', user.id)\n"
        "    .single()\n"
        "  if (error) throw error\n"
        "  return data.all_sessions_token\n"
        "}\n"
        "\n"
        "export async function getSignupPage(id) {\n",
        1,
    ),
])

# ── 3. src/routes/MicrositeEditor.jsx ────────────────────────────────────

patch_file("src/routes/MicrositeEditor.jsx", [
    (
        "  const [accountLogoKey, setAccountLogoKey] = useState(null)\n",
        "  const [accountLogoKey, setAccountLogoKey] = useState(null)\n"
        "  const [accountAllSessionsToken, setAccountAllSessionsToken] = useState(null)\n",
        1,
    ),
    (
        "        if (user) {\n"
        "          const { data: photographer } = await supabase\n"
        "            .from('photographers').select('logo_r2_key, social_links').eq('id', user.id).maybeSingle()\n"
        "          setAccountLogoKey(photographer?.logo_r2_key || null)\n",
        "        if (user) {\n"
        "          const { data: photographer } = await supabase\n"
        "            .from('photographers').select('logo_r2_key, social_links, all_sessions_token').eq('id', user.id).maybeSingle()\n"
        "          setAccountLogoKey(photographer?.logo_r2_key || null)\n"
        "          setAccountAllSessionsToken(photographer?.all_sessions_token || null)\n",
        1,
    ),
    (
        "    const previewPayload = { ...site, logo_r2_key: site.logo_r2_key || accountLogoKey }\n"
        "    previewIframeRef.current?.contentWindow?.postMessage(\n"
        "      { type: 'microsite-preview-update', site: previewPayload },\n"
        "      window.location.origin\n"
        "    )\n"
        "  }, [site, accountLogoKey])\n",
        "    const previewPayload = { ...site, logo_r2_key: site.logo_r2_key || accountLogoKey, all_sessions_token: accountAllSessionsToken }\n"
        "    previewIframeRef.current?.contentWindow?.postMessage(\n"
        "      { type: 'microsite-preview-update', site: previewPayload },\n"
        "      window.location.origin\n"
        "    )\n"
        "  }, [site, accountLogoKey, accountAllSessionsToken])\n",
        1,
    ),
    (
        "        booking_signup_page_id,\n",
        "        booking_signup_page_id,\n"
        "        booking_show_all_sessions,\n",
        2,
    ),
    (
        '              <div className="pl-1">\n'
        '                <label className="text-xs block mb-1" style={{ color: \'var(--text-muted)\' }}>Links to</label>\n'
        "                <select\n"
        "                  value={site.booking_signup_page_id || ''}\n"
        "                  onChange={e => patch({ booking_signup_page_id: e.target.value || null })}\n"
        "                  style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}\n"
        "                >\n"
        '                  <option value="">Contact section (default)</option>\n'
        "                  {signupPages.map(p => (\n"
        '                    <option key={p.id} value={p.id}>{p.title}{p.is_active === false ? \' (inactive)\' : \'\'}</option>\n'
        "                  ))}\n"
        "                </select>\n"
        '                <p className="text-xs mt-1" style={{ color: \'var(--text-muted)\' }}>\n'
        "                  {signupPages.length === 0\n"
        "                    ? 'No signup pages yet — create one under Sessions to link here.'\n"
        '                    : "Links straight to that signup page\'s public booking link instead of scrolling to Contact."}\n'
        "                </p>\n"
        "              </div>\n",
        '              <div className="pl-1">\n'
        '                <label className="text-xs block mb-1" style={{ color: \'var(--text-muted)\' }}>Links to</label>\n'
        "                <select\n"
        "                  value={site.booking_show_all_sessions ? '__all__' : (site.booking_signup_page_id || '')}\n"
        "                  onChange={e => {\n"
        "                    const v = e.target.value\n"
        "                    if (v === '__all__') {\n"
        "                      patch({ booking_signup_page_id: null, booking_show_all_sessions: true })\n"
        "                    } else {\n"
        "                      patch({ booking_signup_page_id: v || null, booking_show_all_sessions: false })\n"
        "                    }\n"
        "                  }}\n"
        "                  style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}\n"
        "                >\n"
        '                  <option value="">Contact section (default)</option>\n'
        '                  <option value="__all__">All active sessions</option>\n'
        "                  {signupPages.map(p => (\n"
        '                    <option key={p.id} value={p.id}>{p.title}{p.is_active === false ? \' (inactive)\' : \'\'}</option>\n'
        "                  ))}\n"
        "                </select>\n"
        '                <p className="text-xs mt-1" style={{ color: \'var(--text-muted)\' }}>\n'
        "                  {site.booking_show_all_sessions\n"
        "                    ? 'Links to a page listing every active session — jumps straight to it instead if only one is active.'\n"
        "                    : signupPages.length === 0\n"
        "                      ? 'No signup pages yet — create one under Sessions to link here.'\n"
        '                      : "Links straight to that signup page\'s public booking link instead of scrolling to Contact."}\n'
        "                </p>\n"
        "              </div>\n",
        1,
    ),
])

# ── 4. src/components/microsite/MicrositeRenderer.jsx ───────────────────

patch_file("src/components/microsite/MicrositeRenderer.jsx", [
    (
        "function HeroButtons({ site, hasGallery }) {\n"
        "  const showPrimary = site.hero_show_primary_btn !== false && !!site.contact_email\n"
        "  const showSecondary = site.hero_show_secondary_btn !== false && !!hasGallery\n"
        "\n"
        "  // Live (via get_site_by_hostname) already resolves this token\n"
        "  // server-side. Preview doesn't -- it gets the raw editor state via\n"
        "  // postMessage, which only has booking_signup_page_id -- so resolve\n"
        "  // it client-side here whenever the token is missing but the id is\n"
        "  // present. Falls back to #contact if the lookup fails or finds\n"
        "  // nothing, same as when no signup page is linked at all.\n"
        "  const [resolvedToken, setResolvedToken] = useState(site.booking_signup_page_token || null)\n"
        "  useEffect(() => {\n"
        "    if (site.booking_signup_page_token) {\n"
        "      setResolvedToken(site.booking_signup_page_token)\n"
        "      return\n"
        "    }\n"
        "    if (!site.booking_signup_page_id) {\n"
        "      setResolvedToken(null)\n"
        "      return\n"
        "    }\n"
        "    let cancelled = false\n"
        "    supabase\n"
        "      .rpc('get_signup_page_token', { p_id: site.booking_signup_page_id })\n"
        "      .then(({ data }) => { if (!cancelled && data) setResolvedToken(data) })\n"
        "      .catch(() => {})\n"
        "    return () => { cancelled = true }\n"
        "  }, [site.booking_signup_page_token, site.booking_signup_page_id])\n"
        "\n"
        "  if (!showPrimary && !showSecondary) return null\n"
        "  return (\n"
        '    <div className="ms-hero-cta">\n'
        '      {showPrimary && <a href={resolvedToken ? `/book/${resolvedToken}` : "#contact"} className="ms-btn ms-btn--primary">Book a Shoot</a>}\n'
        '      {showSecondary && <a href="#gallery" className="ms-btn ms-btn--outline">View Gallery</a>}\n'
        "    </div>\n"
        "  )\n"
        "}\n",
        "function HeroButtons({ site, hasGallery }) {\n"
        "  const showPrimary = site.hero_show_primary_btn !== false && !!site.contact_email\n"
        "  const showSecondary = site.hero_show_secondary_btn !== false && !!hasGallery\n"
        "\n"
        "  // Live (via get_site_by_hostname) already resolves this token\n"
        "  // server-side. Preview doesn't -- it gets the raw editor state via\n"
        "  // postMessage, which only has booking_signup_page_id -- so resolve\n"
        "  // it client-side here whenever the token is missing but the id is\n"
        "  // present. Falls back to #contact if the lookup fails or finds\n"
        "  // nothing, same as when no signup page is linked at all. Skipped\n"
        "  // entirely when booking_show_all_sessions is set -- that mode links\n"
        "  // to the standalone /book/all/:token page instead of any one page.\n"
        "  const [resolvedToken, setResolvedToken] = useState(site.booking_signup_page_token || null)\n"
        "  useEffect(() => {\n"
        "    if (site.booking_show_all_sessions) return\n"
        "    if (site.booking_signup_page_token) {\n"
        "      setResolvedToken(site.booking_signup_page_token)\n"
        "      return\n"
        "    }\n"
        "    if (!site.booking_signup_page_id) {\n"
        "      setResolvedToken(null)\n"
        "      return\n"
        "    }\n"
        "    let cancelled = false\n"
        "    supabase\n"
        "      .rpc('get_signup_page_token', { p_id: site.booking_signup_page_id })\n"
        "      .then(({ data }) => { if (!cancelled && data) setResolvedToken(data) })\n"
        "      .catch(() => {})\n"
        "    return () => { cancelled = true }\n"
        "  }, [site.booking_signup_page_token, site.booking_signup_page_id, site.booking_show_all_sessions])\n"
        "\n"
        "  const primaryHref = site.booking_show_all_sessions\n"
        "    ? (site.all_sessions_token ? `/book/all/${site.all_sessions_token}` : '#contact')\n"
        '    : (resolvedToken ? `/book/${resolvedToken}` : "#contact")\n'
        "\n"
        "  if (!showPrimary && !showSecondary) return null\n"
        "  return (\n"
        '    <div className="ms-hero-cta">\n'
        '      {showPrimary && <a href={primaryHref} className="ms-btn ms-btn--primary">Book a Shoot</a>}\n'
        '      {showSecondary && <a href="#gallery" className="ms-btn ms-btn--outline">View Gallery</a>}\n'
        "    </div>\n"
        "  )\n"
        "}\n",
        1,
    ),
])

# ── 5. src/routes/Sessions.jsx ───────────────────────────────────────────

patch_file("src/routes/Sessions.jsx", [
    (
        "import {\n"
        "  getSignupPages, getSignupPage, createSignupPage, updateSignupPage, deleteSignupPage,\n"
        "  createShootType, updateShootType, deleteShootType, generateSlots, getSlots, deleteSlot,\n"
        "  createManualSlot, deleteAllOpenSlots, getShootTypeQuestionnaires, setShootTypeQuestionnaires,\n"
        "} from '../utils/signupApi.js'\n",
        "import {\n"
        "  getSignupPages, getSignupPage, createSignupPage, updateSignupPage, deleteSignupPage,\n"
        "  createShootType, updateShootType, deleteShootType, generateSlots, getSlots, deleteSlot,\n"
        "  createManualSlot, deleteAllOpenSlots, getShootTypeQuestionnaires, setShootTypeQuestionnaires,\n"
        "  getMyAllSessionsToken,\n"
        "} from '../utils/signupApi.js'\n",
        1,
    ),
    (
        "  const [signupPages, setSignupPages] = useState([])\n"
        "  const [loadingSignups, setLoadingSignups] = useState(false)\n"
        "  const [showNewSignup, setShowNewSignup] = useState(false)\n"
        "  const [openSignupPageId, setOpenSignupPageId] = useState(null)\n"
        "\n"
        "  const [photographerId, setPhotographerId] = useState(null)\n",
        "  const [signupPages, setSignupPages] = useState([])\n"
        "  const [loadingSignups, setLoadingSignups] = useState(false)\n"
        "  const [showNewSignup, setShowNewSignup] = useState(false)\n"
        "  const [openSignupPageId, setOpenSignupPageId] = useState(null)\n"
        "  const [allSessionsToken, setAllSessionsToken] = useState(null)\n"
        "  const [allSessionsBaseUrl, setAllSessionsBaseUrl] = useState(window.location.origin)\n"
        "  const [allSessionsCopied, setAllSessionsCopied] = useState(false)\n"
        "\n"
        "  const [photographerId, setPhotographerId] = useState(null)\n",
        1,
    ),
    (
        "  useEffect(() => {\n"
        "    if (view === 'signups' && signupPages.length === 0) loadSignupPages()\n"
        "  }, [view])\n",
        "  useEffect(() => {\n"
        "    if (view === 'signups' && signupPages.length === 0) loadSignupPages()\n"
        "    if (view === 'signups' && allSessionsToken === null) {\n"
        "      getMyAllSessionsToken().then(setAllSessionsToken).catch(() => {})\n"
        "      getPublicBaseUrl().then(setAllSessionsBaseUrl).catch(() => {})\n"
        "    }\n"
        "  }, [view])\n",
        1,
    ),
    (
        "  async function loadSignupPages() {\n"
        "    setLoadingSignups(true)\n"
        "    try {\n"
        "      const data = await getSignupPages()\n"
        "      setSignupPages(data)\n"
        "    } catch (err) { console.error(err) }\n"
        "    finally { setLoadingSignups(false) }\n"
        "  }\n",
        "  async function loadSignupPages() {\n"
        "    setLoadingSignups(true)\n"
        "    try {\n"
        "      const data = await getSignupPages()\n"
        "      setSignupPages(data)\n"
        "    } catch (err) { console.error(err) }\n"
        "    finally { setLoadingSignups(false) }\n"
        "  }\n"
        "\n"
        "  const allSessionsUrl = allSessionsToken ? `${allSessionsBaseUrl}/book/all/${allSessionsToken}` : ''\n"
        "\n"
        "  function handleCopyAllSessionsLink() {\n"
        "    if (!allSessionsUrl) return\n"
        "    navigator.clipboard.writeText(allSessionsUrl)\n"
        "    setAllSessionsCopied(true)\n"
        "    setTimeout(() => setAllSessionsCopied(false), 1500)\n"
        "  }\n",
        1,
    ),
    (
        "      {/* Sign-ups view */}\n"
        "      {view === 'signups' && (\n"
        '        <div className="max-w-4xl">\n'
        "          <SignupPagesView\n"
        "            pages={signupPages}\n"
        "            loading={loadingSignups}\n"
        "            onCreate={() => setShowNewSignup(true)}\n"
        "            onOpen={setOpenSignupPageId}\n"
        "          />\n"
        "        </div>\n"
        "      )}\n",
        "      {/* Sign-ups view */}\n"
        "      {view === 'signups' && (\n"
        '        <div className="max-w-4xl">\n'
        "          {allSessionsToken && (\n"
        '            <div className="rounded-xl p-3 mb-4 flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3"\n'
        "              style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.25)' }}>\n"
        '              <div className="flex items-center gap-2 min-w-0 flex-1">\n'
        "                <Link2 size={14} style={{ color: '#6366f1', flexShrink: 0 }} />\n"
        '                <div className="min-w-0 flex-1">\n'
        '                  <p className="text-xs font-medium" style={{ color: \'var(--text)\' }}>All active sessions</p>\n'
        '                  <p className="text-xs truncate" style={{ color: \'var(--text-muted)\' }}>{allSessionsUrl}</p>\n'
        "                </div>\n"
        "              </div>\n"
        '              <button onClick={handleCopyAllSessionsLink} className="text-xs font-medium px-2.5 py-1.5 rounded-lg flex items-center justify-center gap-1 shrink-0 w-full sm:w-auto"\n'
        "                style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer' }}>\n"
        "                {allSessionsCopied ? <Check size={12} /> : <Copy size={12} />}{allSessionsCopied ? 'Copied' : 'Copy'}\n"
        "              </button>\n"
        "            </div>\n"
        "          )}\n"
        "          <SignupPagesView\n"
        "            pages={signupPages}\n"
        "            loading={loadingSignups}\n"
        "            onCreate={() => setShowNewSignup(true)}\n"
        "            onOpen={setOpenSignupPageId}\n"
        "          />\n"
        "        </div>\n"
        "      )}\n",
        1,
    ),
])

print("\nDone. Next: copy AllSessionsBooking.jsx into src/routes/, then run the app build/tests.")
