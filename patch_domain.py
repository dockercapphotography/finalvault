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

# --- Web files ---
patch('src/routes/SignContract.jsx',
      "const APP_URL = 'https://finalvault.dockercapphotography.com'",
      "const APP_URL = 'https://final-vault.app'")

patch('src/routes/Account.jsx',
      "'{{gallery_url}}':       'https://finalvault.dockercapphotography.com/g/example',",
      "'{{gallery_url}}':       'https://final-vault.app/g/example',")

patch('src/routes/Account.jsx',
      "const BASE_ICON_URL = 'https://finalvault.dockercapphotography.com/brand-icons'",
      "const BASE_ICON_URL = 'https://final-vault.app/brand-icons'")

# --- Edge Functions ---
patch('supabase/functions/sign-contract/index.ts',
      "const appUrl = 'https://finalvault.dockercapphotography.com'",
      "const appUrl = 'https://final-vault.app'")
patch('supabase/functions/sign-contract/index.ts',
      "from: `FinalVault <noreply@dockercapphotography.com>`,",
      "from: `FinalVault <noreply@mail.final-vault.app>`,")

patch('supabase/functions/generate-contract-pdf/index.ts',
      "from: `${senderName} <noreply@dockercapphotography.com>`,",
      "from: `${senderName} <noreply@mail.final-vault.app>`,")
patch('supabase/functions/generate-contract-pdf/index.ts',
      "from: `FinalVault <noreply@dockercapphotography.com>`,",
      "from: `FinalVault <noreply@mail.final-vault.app>`,")

patch('supabase/functions/send-expiry-reminder/index.ts',
      "const appUrl = 'https://finalvault.dockercapphotography.com'",
      "const appUrl = 'https://final-vault.app'")
patch('supabase/functions/send-expiry-reminder/index.ts',
      "from: `${senderName} <noreply@dockercapphotography.com>`,",
      "from: `${senderName} <noreply@mail.final-vault.app>`,")

patch('supabase/functions/send-gallery-email/index.ts',
      "const galleryUrl = `https://finalvault.dockercapphotography.com/g/${gallery.share_token}`",
      "const galleryUrl = `https://final-vault.app/g/${gallery.share_token}`")
patch('supabase/functions/send-gallery-email/index.ts',
      "from: `${senderName} <noreply@dockercapphotography.com>`,",
      "from: `${senderName} <noreply@mail.final-vault.app>`,")
patch('supabase/functions/send-gallery-email/index.ts',
      "const BASE_URL = 'https://finalvault.dockercapphotography.com/brand-icons'",
      "const BASE_URL = 'https://final-vault.app/brand-icons'")

patch('supabase/functions/send-contract/index.ts',
      "const appUrl = 'https://finalvault.dockercapphotography.com'",
      "const appUrl = 'https://final-vault.app'")
patch('supabase/functions/send-contract/index.ts',
      "from: `${senderName} <noreply@dockercapphotography.com>`,",
      "from: `${senderName} <noreply@mail.final-vault.app>`,")

patch('supabase/functions/send-questionnaire-email/index.ts',
      "const formUrl = 'https://finalvault.dockercapphotography.com/submit/' + session.submit_token + (questionnaireId ? '?q=' + questionnaireId : '')",
      "const formUrl = 'https://final-vault.app/submit/' + session.submit_token + (questionnaireId ? '?q=' + questionnaireId : '')")
patch('supabase/functions/send-questionnaire-email/index.ts',
      "from: `${senderName} <noreply@dockercapphotography.com>`,",
      "from: `${senderName} <noreply@mail.final-vault.app>`,")

patch('supabase/functions/send-activity-digest/index.ts',
      "from: `FinalVault <noreply@dockercapphotography.com>`,",
      "from: `FinalVault <noreply@mail.final-vault.app>`,")
patch('supabase/functions/send-activity-digest/index.ts',
      "const BASE_URL = 'https://finalvault.dockercapphotography.com/brand-icons'",
      "const BASE_URL = 'https://final-vault.app/brand-icons'")
patch('supabase/functions/send-activity-digest/index.ts',
      "const appUrl = 'https://finalvault.dockercapphotography.com'",
      "const appUrl = 'https://final-vault.app'")

print("\nAll patches applied successfully.")
