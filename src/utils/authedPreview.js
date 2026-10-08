import { supabase } from '../supabaseClient.js'

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL

// Photographer-authenticated preview fetch, returned as an object URL.
// Moved verbatim out of MicrositeEditor.jsx (v1.5.17) so GalleryPickThumb
// can live in its own file and be shared with RequestReviewModal.
export async function fetchAuthedBlob(r2Key) {
  const { data: { session } } = await supabase.auth.getSession()
  const resp = await fetch(`${WORKER_URL}/preview/${encodeURIComponent(r2Key)}`, {
    headers: { Authorization: `Bearer ${session.access_token}` }
  })
  if (!resp.ok) throw new Error('Failed to fetch preview')
  return URL.createObjectURL(await resp.blob())
}
