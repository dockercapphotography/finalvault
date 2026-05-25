export async function handleZip(request, env, corsHeaders) {
  // TODO: Verify share token + PIN if required, stream ZIP of gallery images
  // Serve originals or watermarked previews based on gallery download_watermarked setting
  return new Response(JSON.stringify({ error: 'Not implemented' }), {
    status: 501,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}
