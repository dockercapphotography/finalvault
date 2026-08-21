def patch(path, old, new, expected_count=1):
    with open(path, 'r') as f:
        src = f.read()
    count = src.count(old)
    assert count == expected_count, f"{path}: expected {expected_count} occurrence(s) of {old!r}, found {count}"
    src = src.replace(old, new)
    with open(path, 'w') as f:
        f.write(src)
    print(f"OK  {path}: replaced {expected_count}x")

# --- send-gallery-email ---
patch('supabase/functions/send-gallery-email/index.ts',
      "import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'\nimport { createClient } from 'https://esm.sh/@supabase/supabase-js@2'",
      "import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'\nimport { createClient } from 'https://esm.sh/@supabase/supabase-js@2'\nimport { getPublicBaseUrl } from '../_shared/getPublicBaseUrl.ts'")
patch('supabase/functions/send-gallery-email/index.ts',
      "    const galleryUrl = `https://final-vault.app/g/${gallery.share_token}`",
      "    const galleryUrl = `${await getPublicBaseUrl(supabase, gallery.photographer_id)}/g/${gallery.share_token}`")

# --- send-contract ---
patch('supabase/functions/send-contract/index.ts',
      "import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'\nimport { createClient } from 'https://esm.sh/@supabase/supabase-js@2'",
      "import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'\nimport { createClient } from 'https://esm.sh/@supabase/supabase-js@2'\nimport { getPublicBaseUrl } from '../_shared/getPublicBaseUrl.ts'")
patch('supabase/functions/send-contract/index.ts',
      "    const appUrl = 'https://final-vault.app'\n    const signUrl = `${appUrl}/sign/${contract.sign_token}`",
      "    const appUrl = await getPublicBaseUrl(supabase, user.id)\n    const signUrl = `${appUrl}/sign/${contract.sign_token}`")

# --- send-questionnaire-email ---
patch('supabase/functions/send-questionnaire-email/index.ts',
      "import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'\nimport { createClient } from 'https://esm.sh/@supabase/supabase-js@2'",
      "import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'\nimport { createClient } from 'https://esm.sh/@supabase/supabase-js@2'\nimport { getPublicBaseUrl } from '../_shared/getPublicBaseUrl.ts'")
patch('supabase/functions/send-questionnaire-email/index.ts',
      "    const formUrl = 'https://final-vault.app/submit/' + session.submit_token + (questionnaireId ? '?q=' + questionnaireId : '')",
      "    const baseUrl = await getPublicBaseUrl(supabase, user.id)\n    const formUrl = baseUrl + '/submit/' + session.submit_token + (questionnaireId ? '?q=' + questionnaireId : '')")

# --- send-expiry-reminder ---
patch('supabase/functions/send-expiry-reminder/index.ts',
      "import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'\nimport { createClient } from 'https://esm.sh/@supabase/supabase-js@2'",
      "import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'\nimport { createClient } from 'https://esm.sh/@supabase/supabase-js@2'\nimport { getPublicBaseUrl } from '../_shared/getPublicBaseUrl.ts'")
patch('supabase/functions/send-expiry-reminder/index.ts',
      "    const workerUrl = Deno.env.get('R2_WORKER_URL') || 'https://finalvault-worker.sitranephotography.workers.dev'\n    const appUrl = 'https://final-vault.app'\n    const now = new Date()",
      "    const workerUrl = Deno.env.get('R2_WORKER_URL') || 'https://finalvault-worker.sitranephotography.workers.dev'\n    const now = new Date()")
patch('supabase/functions/send-expiry-reminder/index.ts',
      "      const galleryUrl = `${appUrl}/g/${gallery.share_token}`",
      "      const galleryUrl = `${await getPublicBaseUrl(supabase, gallery.photographer_id)}/g/${gallery.share_token}`")

print("\nAll patches applied successfully.")
