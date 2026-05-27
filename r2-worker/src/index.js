import { handleUpload } from './handlers/upload.js'
import { handlePreview } from './handlers/preview.js'
import { handleOriginal } from './handlers/original.js'
import { handleDelete } from './handlers/delete.js'
import { handleZip } from './handlers/zip.js'
import { handleWatermarkUpload, handleWatermarkServe } from './handlers/watermark.js'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Share-Token, X-Download-Pin, X-Hires'
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    const url = new URL(request.url)
    const pathname = url.pathname

    try {
      if (request.method === 'POST' && pathname === '/upload') {
        return await handleUpload(request, env, CORS_HEADERS)
      }
      if (request.method === 'GET' && pathname.startsWith('/preview/')) {
        return await handlePreview(request, env, CORS_HEADERS)
      }
      if (request.method === 'GET' && pathname.startsWith('/original/')) {
        return await handleOriginal(request, env, CORS_HEADERS)
      }
      if (request.method === 'DELETE' && pathname.startsWith('/delete/')) {
        return await handleDelete(request, env, CORS_HEADERS)
      }
      if (request.method === 'POST' && pathname === '/download-zip') {
        return await handleZip(request, env, CORS_HEADERS)
      }
      if (request.method === 'POST' && pathname === '/watermark-upload') {
        return await handleWatermarkUpload(request, env, CORS_HEADERS)
      }
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
