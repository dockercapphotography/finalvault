export async function handleDelete(request, env, corsHeaders) {
  // TODO: Verify JWT, delete both original and preview keys from R2
  return new Response(JSON.stringify({ error: 'Not implemented' }), {
    status: 501,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}
