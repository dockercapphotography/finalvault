export async function handleOriginal(request, env, corsHeaders) {
  // TODO: Verify JWT (photographer) or share token + PIN (client download)
  // Serve original file from R2 — never watermarked
  return new Response(JSON.stringify({ error: 'Not implemented' }), {
    status: 501,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}
