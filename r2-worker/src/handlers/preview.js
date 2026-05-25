export async function handlePreview(request, env, corsHeaders) {
  // TODO: Verify share token, fetch preview from R2, serve with aggressive cache headers
  // Key pattern: photographers/{photographer_id}/galleries/{gallery_id}/preview/{uuid}.webp
  // Cache-Control: public, max-age=31536000, immutable
  return new Response(JSON.stringify({ error: 'Not implemented' }), {
    status: 501,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}
