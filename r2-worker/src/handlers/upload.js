export async function handleUpload(request, env, corsHeaders) {
  // TODO: Verify JWT, parse multipart form, store original to R2
  // Key pattern: photographers/{photographer_id}/galleries/{gallery_id}/original/{uuid}.{ext}
  return new Response(JSON.stringify({ error: 'Not implemented' }), {
    status: 501,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}
