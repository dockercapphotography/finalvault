import { handleUpload } from './handlers/upload.js'
import { handlePreview } from './handlers/preview.js'
import { handleOriginal } from './handlers/original.js'
import { handleDelete } from './handlers/delete.js'
import { handleZip } from './handlers/zip.js'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Share-Token, X-Download-Pin'
}

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    const url = new URL(request.url)
    const pathname = url.pathname

    try {
      // POST /upload — photographer uploads image (JWT required)
      if (request.method === 'POST' && pathname === '/upload') {
        return await handleUpload(request, env, CORS_HEADERS)
      }

      // GET /preview/:key — serve watermarked WebP preview (share token required)
      if (request.method === 'GET' && pathname.startsWith('/preview/')) {
        return await handlePreview(request, env, CORS_HEADERS)
      }

      // GET /original/:key — serve original file (JWT or share token + PIN)
      if (request.method === 'GET' && pathname.startsWith('/original/')) {
        return await handleOriginal(request, env, CORS_HEADERS)
      }

      // DELETE /:key — photographer deletes image (JWT required)
      if (request.method === 'DELETE') {
        return await handleDelete(request, env, CORS_HEADERS)
      }

      // POST /download-zip — generate ZIP of gallery (share token + optional PIN)
      if (request.method === 'POST' && pathname === '/download-zip') {
        return await handleZip(request, env, CORS_HEADERS)
      }

      return new Response('Not found', { status: 404, headers: CORS_HEADERS })
    } catch (err) {
      console.error('Worker error:', err)
      return new Response('Internal server error', { status: 500, headers: CORS_HEADERS })
    }
  }
}
