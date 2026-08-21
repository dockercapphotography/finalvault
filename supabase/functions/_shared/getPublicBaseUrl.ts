// Server-side counterpart to src/utils/publicBaseUrl.js. Shared by every
// Edge Function that builds a client-facing URL (gallery links, contract
// sign links, questionnaire submit links, etc.) so those links use a
// photographer's active custom domain when they have one, matching what
// the dashboard's own generated links already do client-side.
//
// This didn't exist when the custom-domains feature first shipped --
// Phase 1 only wired getPublicBaseUrl() into client-side React code, since
// the original spec (docs/custom-domains-spec.md section 3.4) only ever
// listed browser call sites. Found missing when a real gallery-share email
// kept showing final-vault.app despite an active custom domain being set.

const DEFAULT_BASE_URL = 'https://final-vault.app'

export async function getPublicBaseUrl(supabase: any, photographerId: string): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('photographer_domains')
      .select('domain, status')
      .eq('photographer_id', photographerId)
      .maybeSingle()

    if (error || !data || data.status !== 'active') {
      return DEFAULT_BASE_URL
    }
    return `https://${data.domain}`
  } catch (err) {
    console.error('getPublicBaseUrl failed, falling back to default:', err)
    return DEFAULT_BASE_URL
  }
}
