import sys

def patch(path, old, new, expected_count=1):
    with open(path, 'r') as f:
        src = f.read()
    count = src.count(old)
    assert count == expected_count, f"{path}: expected {expected_count} occurrence(s) of {old!r}, found {count}"
    src = src.replace(old, new)
    with open(path, 'w') as f:
        f.write(src)
    print(f"OK  {path}: replaced {expected_count}x")

# --- Dashboard.jsx ---
patch('src/routes/Dashboard.jsx',
      "import Toast from '../components/ui/Toast.jsx'",
      "import Toast from '../components/ui/Toast.jsx'\nimport { getPublicBaseUrl } from '../utils/publicBaseUrl.js'")

patch('src/routes/Dashboard.jsx',
      "  function handleCopyLink(shareToken) {\n    navigator.clipboard.writeText(`${window.location.origin}/g/${shareToken}`)\n    setToast({ message: 'Gallery link copied!', type: 'success' })\n  }",
      "  async function handleCopyLink(shareToken) {\n    const baseUrl = await getPublicBaseUrl()\n    navigator.clipboard.writeText(`${baseUrl}/g/${shareToken}`)\n    setToast({ message: 'Gallery link copied!', type: 'success' })\n  }")

# --- SessionDetail.jsx ---
patch('src/routes/SessionDetail.jsx',
      "import * as XLSX from 'xlsx'",
      "import * as XLSX from 'xlsx'\nimport { getPublicBaseUrl } from '../utils/publicBaseUrl.js'")

patch('src/routes/SessionDetail.jsx',
      "            const count = submissionCounts[qid] || 0\n            const formUrl = `${window.location.origin}/submit/${session.submit_token}?q=${qid}`\n            const isSending = sendingForm === qid",
      "            const count = submissionCounts[qid] || 0\n            const isSending = sendingForm === qid")

patch('src/routes/SessionDetail.jsx',
      "                  <button onClick={async () => {\n                    try {\n                      await navigator.clipboard.writeText(formUrl)\n                      setCopiedQ(qid)\n                      setTimeout(() => setCopiedQ(null), 2000)\n                    } catch {\n                      window.prompt('Copy this link:', formUrl)\n                    }\n                  }}",
      "                  <button onClick={async () => {\n                    const baseUrl = await getPublicBaseUrl()\n                    const formUrl = `${baseUrl}/submit/${session.submit_token}?q=${qid}`\n                    try {\n                      await navigator.clipboard.writeText(formUrl)\n                      setCopiedQ(qid)\n                      setTimeout(() => setCopiedQ(null), 2000)\n                    } catch {\n                      window.prompt('Copy this link:', formUrl)\n                    }\n                  }}")

# --- Sessions.jsx ---
patch('src/routes/Sessions.jsx',
      "import { supabase } from '../supabaseClient.js'",
      "import { supabase } from '../supabaseClient.js'\nimport { getPublicBaseUrl } from '../utils/publicBaseUrl.js'")

patch('src/routes/Sessions.jsx',
      "  const bookingUrl = page ? `${window.location.origin}/book/${page.token}` : ''",
      "  const [baseUrl, setBaseUrl] = useState(window.location.origin)\n  useEffect(() => { getPublicBaseUrl().then(setBaseUrl) }, [])\n  const bookingUrl = page ? `${baseUrl}/book/${page.token}` : ''")

# --- ClientDetail.jsx ---
patch('src/routes/ClientDetail.jsx',
      "  Lock, Unlock, ShieldAlert\n} from 'lucide-react'",
      "  Lock, Unlock, ShieldAlert\n} from 'lucide-react'\nimport { getPublicBaseUrl } from '../utils/publicBaseUrl.js'")

patch('src/routes/ClientDetail.jsx',
      "  const portalUrl = client.portal_token\n    ? `${window.location.origin}/client/${client.portal_token}`\n    : null",
      "  const [baseUrl, setBaseUrl] = useState(window.location.origin)\n  useEffect(() => { getPublicBaseUrl().then(setBaseUrl) }, [])\n  const portalUrl = client.portal_token\n    ? `${baseUrl}/client/${client.portal_token}`\n    : null")

print("\nAll patches applied successfully.")
