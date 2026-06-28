import { handleUpload } from './handlers/upload.js'
import { handlePreview } from './handlers/preview.js'
import { handleOriginal } from './handlers/original.js'
import { handleDownload } from './handlers/download.js'
import { handleDelete } from './handlers/delete.js'
import { handleZip } from './handlers/zip.js'
import { handleWatermarkUpload, handleWatermarkServe, handleLogoServe } from './handlers/watermark.js'
import { handlePdfUpload } from './handlers/upload-pdf.js'
import { handleContractPdf } from './handlers/contract-pdf.js'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Share-Token, X-Download-Pin, X-Hires, X-Download-Size'
}

function ipKey(request) {
  return request.headers.get('CF-Connecting-IP') || 'unknown'
}

function rateLimitedResponse() {
  return new Response(JSON.stringify({ ok: false, error: 'Too many requests. Please slow down.' }), {
    status: 429,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
      'Retry-After': '60',
    }
  })
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    const url = new URL(request.url)
    const pathname = url.pathname
    const ip = ipKey(request)

    try {
      // ── Upload (no rate limit — JWT auth is the protection) ────────────
      if (request.method === 'POST' && pathname === '/upload') {
        return await handleUpload(request, env, CORS_HEADERS)
      }

      // ── Watermark upload (no rate limit — JWT auth is the protection) ──
      if (request.method === 'POST' && pathname === '/watermark-upload') {
        return await handleWatermarkUpload(request, env, CORS_HEADERS)
      }

      // ── Downloads (100/min per IP) ─────────────────────────────────────
      if (request.method === 'GET' && pathname.startsWith('/download/')) {
        const { success } = await env.RATE_LIMIT_DOWNLOAD.limit({ key: ip })
        if (!success) return rateLimitedResponse()
        return await handleDownload(request, env, CORS_HEADERS)
      }

      if (request.method === 'POST' && pathname === '/download-zip') {
        const { success } = await env.RATE_LIMIT_DOWNLOAD.limit({ key: ip })
        if (!success) return rateLimitedResponse()
        return await handleZip(request, env, CORS_HEADERS)
      }

      // Contract PDF download -- same rate-limit bucket as image downloads,
      // since this is serving a real document on the client's behalf, not
      // a static/cosmetic asset like a logo.
      if (request.method === 'GET' && pathname.startsWith('/contract-pdf/')) {
        const { success } = await env.RATE_LIMIT_DOWNLOAD.limit({ key: ip })
        if (!success) return rateLimitedResponse()
        return await handleContractPdf(request, env, CORS_HEADERS)
      }

      // ── Unthrottled routes ─────────────────────────────────────────────
      if (request.method === 'GET' && pathname.startsWith('/preview/')) {
        return await handlePreview(request, env, CORS_HEADERS)
      }
      if (request.method === 'GET' && pathname.startsWith('/original/')) {
        return await handleOriginal(request, env, CORS_HEADERS)
      }
      if (request.method === 'DELETE' && pathname.startsWith('/delete/')) {
        return await handleDelete(request, env, CORS_HEADERS)
      }
      if (request.method === 'GET' && pathname.startsWith('/watermark/')) {
        return await handleWatermarkServe(request, env, CORS_HEADERS)
      }
      if (request.method === 'GET' && pathname.startsWith('/logo/')) {
        return await handleLogoServe(request, env, CORS_HEADERS)
      }

      // ── PDF upload (internal — service role key auth) ──
      if (request.method === 'POST' && pathname === '/upload-pdf') {
        return await handlePdfUpload(request, env, CORS_HEADERS)
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
