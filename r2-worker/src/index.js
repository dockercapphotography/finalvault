import { handleUpload } from './handlers/upload.js'
import { handlePreview } from './handlers/preview.js'
import { handleOriginal } from './handlers/original.js'
import { handleDelete } from './handlers/delete.js'
import { handleZip } from './handlers/zip.js'
import { handleWatermarkUpload, handleWatermarkServe } from './handlers/watermark.js'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Share-Token, X-Download-Pin'
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    const url = new URL(request.url)
    const pathname = url.pathname

    try {
      // POST /upload — store original or preview
      if (request.method === 'POST' && pathname === '/upload') {
        return await handleUpload(request, env, CORS_HEADERS)
      }

      // GET /preview/:key — serve watermarked WebP preview
      if (request.method === 'GET' && pathname.startsWith('/preview/')) {
        return await handlePreview(request, env, CORS_HEADERS)
      }

      // GET /original/:key — serve original file
      if (request.method === 'GET' && pathname.startsWith('/original/')) {
        return await handleOriginal(request, env, CORS_HEADERS)
      }

      // DELETE /delete/:key — delete both original and preview
      if (request.method === 'DELETE' && pathname.startsWith('/delete/')) {
        return await handleDelete(request, env, CORS_HEADERS)
      }

      // POST /download-zip — stream ZIP of gallery
      if (request.method === 'POST' && pathname === '/download-zip') {
        return await handleZip(request, env, CORS_HEADERS)
      }

      // POST /watermark-upload — store watermark image
      if (request.method === 'POST' && pathname === '/watermark-upload') {
        return await handleWatermarkUpload(request, env, CORS_HEADERS)
      }

      // GET /watermark/:key — serve watermark image to photographer
      if (request.method === 'GET' && pathname.startsWith('/watermark/')) {
        return await handleWatermarkServe(request, env, CORS_HEADERS)
      }

      return new Response(JSON.stringify({ ok: false, error: 'Not found' }), {
        status: 404,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      })
    } catch (err) {
      console.error('Worker unhandled error:', err)
      return new Response(JSON.stringify({ ok: false, error: 'Internal server error' }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      })
    }
  }
}
