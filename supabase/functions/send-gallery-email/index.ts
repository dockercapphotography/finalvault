import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DEFAULT_TEMPLATES = [
  {
    name: 'Preview Delivery',
    subject: 'Your preview gallery is ready — {{gallery_name}}',
    body: `I've put together a selection of my favorites from our session for you to look through. Take your time browsing and use the heart icon to mark the images you love most — your favorites help me prioritize as I work through the rest of your gallery.`,
  },
  {
    name: 'Final Delivery',
    subject: 'Your photos are ready — {{gallery_name}}',
    body: `Your final gallery is ready. It has been a pleasure working with you and I hope these images bring back all the best memories from our session. You can download your images directly from the gallery.`,
  },
  {
    name: 'Large Group / Event',
    subject: 'Your photos from {{gallery_name}} are available',
    body: `Thank you for being part of {{gallery_name}}. Your photos are now available to view and download. If you have any trouble accessing your images, feel free to reach out.`,
  },
  {
    name: 'Follow-up / Reminder',
    subject: 'Reminder — your gallery is waiting',
    body: `Just a friendly reminder that your gallery is still up and ready for you. Your gallery expires on {{expiry_date}}, so please make sure you have downloaded everything you want to keep before then. Let me know if you have any trouble getting in.`,
  },
  {
    name: 'Gallery Expiring Soon',
    subject: 'Your gallery expires soon — {{gallery_name}}',
    body: `I wanted to give you a heads up that your gallery expires on {{expiry_date}}. Please make sure you have downloaded all the images you want to keep before it is taken down. If you need a little more time, just reach out and I will see what I can do.`,
  },
  {
    name: 'Thank You',
    subject: 'Thank you, {{client_name}}',
    body: `I just wanted to take a moment to say thank you for choosing {{business_name}}. It was a genuine pleasure working with you and I am so excited to share the results. I am hard at work on your images and will be in touch as soon as your gallery is ready. Do not hesitate to reach out if you have any questions.`,
  },
]

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { galleryId, recipients, subject, message, includePassword, includePin, includeExpiry, seedTemplates } = await req.json()

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

    // Seed default templates if requested — only runs once per photographer
    if (seedTemplates) {
      const { data: photog } = await supabase
        .from('photographers')
        .select('templates_seeded')
        .eq('id', user.id)
        .single()

      if (photog?.templates_seeded) {
        return new Response(JSON.stringify({ ok: true, inserted: 0, skipped: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      await supabase.from('email_templates').insert(
        DEFAULT_TEMPLATES.map(t => ({ ...t, photographer_id: user.id }))
      )

      await supabase
        .from('photographers')
        .update({ templates_seeded: true })
        .eq('id', user.id)

      return new Response(JSON.stringify({ ok: true, inserted: DEFAULT_TEMPLATES.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!galleryId || !recipients?.length) {
      return new Response(JSON.stringify({ error: 'Missing galleryId or recipients' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: gallery } = await supabase
      .from('galleries')
      .select('id, title, client_name, event_name, event_date, share_token, require_password, plain_password, require_download_pin, plain_download_pin, photographer_id, cover_r2_key, cover_image_id, expires_at')
      .eq('id', galleryId)
      .eq('photographer_id', user.id)
      .single()

    if (!gallery) return new Response(JSON.stringify({ error: 'Gallery not found' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

    const { data: photographer } = await supabase
      .from('photographers')
      .select('display_name, business_name, social_links, payment_links, logo_r2_key')
      .eq('id', user.id)
      .single()

    // Resolve cover image URL
    const workerUrl = Deno.env.get('R2_WORKER_URL') || 'https://finalvault-worker.sitranephotography.workers.dev'
    let coverImageUrl: string | null = null
    if (gallery.cover_r2_key) {
      coverImageUrl = `${workerUrl}/preview/${encodeURIComponent(gallery.cover_r2_key)}?share_token=${gallery.share_token}`
    } else if (gallery.cover_image_id) {
      const { data: coverImg } = await supabase
        .from('gallery_images')
        .select('preview_r2_key')
        .eq('id', gallery.cover_image_id)
        .single()
      if (coverImg?.preview_r2_key) {
        coverImageUrl = `${workerUrl}/preview/${encodeURIComponent(coverImg.preview_r2_key)}?share_token=${gallery.share_token}`
      }
    }

    const senderName = photographer?.business_name || photographer?.display_name || 'Your Photographer'
    const logoUrl = photographer?.logo_r2_key
      ? `${workerUrl}/logo/${encodeURIComponent(photographer.logo_r2_key)}`
      : null
    const galleryUrl = `https://finalvault.dockercapphotography.com/g/${gallery.share_token}`

    const expiryDateStr = gallery.expires_at
      ? new Date(gallery.expires_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : ''

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
    const results = []

    // Resend enforces a hard 5 requests/second window with no burst allowance and
    // previously we had no retry — anything past the 5th email in a batch would
    // silently fail with a 429. We throttle to roughly 3/sec (well under the limit)
    // and retry once on 429 to absorb any window-edge timing issues.
    async function sendWithRetry(body: Record<string, unknown>, attempt = 0): Promise<{ res: Response; data: any }> {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (res.status === 429 && attempt < 2) {
        const retryAfter = Number(res.headers.get('retry-after')) || 1
        await new Promise(r => setTimeout(r, (retryAfter + 0.5) * 1000))
        return sendWithRetry(body, attempt + 1)
      }
      return { res, data }
    }

    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i]
      // Stay under Resend's 5 req/sec limit — wait ~350ms between sends after the first.
      if (i > 0) await new Promise(r => setTimeout(r, 350))
      const email = typeof recipient === 'string' ? recipient : recipient.email
      const name = typeof recipient === 'object' ? recipient.name : null
      const clientName = name || gallery.client_name || 'there'

      const vars: Record<string, string> = {
        gallery_name: gallery.title,
        client_name: clientName,
        event_date: gallery.event_date
          ? new Date(gallery.event_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
          : '',
        my_name: photographer?.display_name || senderName,
        business_name: photographer?.business_name || senderName,
        gallery_url: galleryUrl,
        event_name: gallery.event_name || '',
        password: (includePassword && gallery.plain_password) ? gallery.plain_password : '',
        download_pin: (includePin && gallery.plain_download_pin) ? gallery.plain_download_pin : '',
        expiry_date: expiryDateStr,
      }

      const finalSubject = substituteVariables(subject || `Your gallery is ready — ${gallery.title}`, vars)
      const finalMessage = substituteVariables(message || '', vars)

      const html = buildEmailHtml({
        senderName,
        logoUrl,
        galleryTitle: gallery.title,
        clientName,
        eventName: gallery.event_name || '',
        eventDate: gallery.event_date
          ? new Date(gallery.event_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
          : '',
        galleryUrl,
        coverImageUrl,
        password: includePassword && gallery.require_password ? gallery.plain_password : null,
        downloadPin: includePin && gallery.require_download_pin ? gallery.plain_download_pin : null,
        expiryDate: includeExpiry && expiryDateStr ? expiryDateStr : null,
        customMessage: finalMessage ? renderMarkdownEmail(finalMessage) : null,
        socialLinks: photographer?.social_links || {},
        paymentLinks: photographer?.payment_links || {},
      })

      const { res, data } = await sendWithRetry({
        from: `${senderName} <noreply@dockercapphotography.com>`,
        to: [email],
        subject: finalSubject,
        html,
      })

      results.push({ email, ok: res.ok, id: data.id, error: data.message })
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

function substituteVariables(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

// Mirrors MarkdownToolbar.jsx's renderMarkdown — bold, italic, h2, and lists —
// but wraps consecutive list items in real <ul>/<ol> tags, since bare <li> elements
// outside a list container render inconsistently (or not at all) in email clients
// like Outlook and Gmail.
function applyInlineEmail(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
}

function renderMarkdownEmail(text: string): string {
  if (!text) return ''
  const lines = text.split('\n')
  const htmlParts: string[] = []
  let listBuffer: string[] = []
  let listType: 'ul' | 'ol' | null = null

  function flushList() {
    if (!listBuffer.length || !listType) return
    const tag = listType
    const styleAttr = tag === 'ul'
      ? 'margin:0 0 12px;padding-left:20px;list-style-type:disc;'
      : 'margin:0 0 12px;padding-left:20px;list-style-type:decimal;'
    htmlParts.push(`<${tag} style="${styleAttr}">${listBuffer.join('')}</${tag}>`)
    listBuffer = []
    listType = null
  }

  for (const rawLine of lines) {
    const line = rawLine
    if (line.startsWith('## ')) {
      flushList()
      htmlParts.push(`<h2 style="margin:16px 0 8px;color:#111111;font-size:17px;font-weight:600;">${applyInlineEmail(line.slice(3))}</h2>`)
      continue
    }
    if (line.startsWith('- ')) {
      if (listType !== 'ul') { flushList(); listType = 'ul' }
      listBuffer.push(`<li style="margin:0 0 4px;color:#374151;font-size:15px;line-height:1.6;">${applyInlineEmail(line.slice(2))}</li>`)
      continue
    }
    const olMatch = line.match(/^(\d+)\.\s(.*)/)
    if (olMatch) {
      if (listType !== 'ol') { flushList(); listType = 'ol' }
      listBuffer.push(`<li style="margin:0 0 4px;color:#374151;font-size:15px;line-height:1.6;">${applyInlineEmail(olMatch[2])}</li>`)
      continue
    }
    flushList()
    if (line.trim() === '') {
      htmlParts.push('<div style="height:12px;"></div>')
    } else {
      htmlParts.push(`<p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.7;">${applyInlineEmail(line)}</p>`)
    }
  }
  flushList()

  return htmlParts.join('')
}

const SOCIAL_META: Record<string, { label: string; color: string; icon: string }> = {
  instagram: { label: 'Instagram', color: '#E1306C', icon: '<path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>' },
  facebook:  { label: 'Facebook',  color: '#1877F2', icon: '<path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>' },
  tiktok:    { label: 'TikTok',    color: '#000000', icon: '<path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>' },
  x:         { label: 'X',         color: '#000000', icon: '<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>' },
  youtube:   { label: 'YouTube',   color: '#FF0000', icon: '<path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>' },
  pinterest: { label: 'Pinterest', color: '#E60023', icon: '<path d="M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/>' },
  venmo:     { label: 'Venmo',     color: '#008CFF', icon: '<path d="M19.066 1.003c.433.713.626 1.45.626 2.378 0 2.963-2.528 6.812-4.583 9.517H10.48L8.976 2.524l-4.94.474L6.254 23h7.747c3.406-4.382 6.812-11.87 6.812-16.808 0-1.902-.378-3.188-1.028-4.266l-2.719 1.077z"/>' },
  paypal:    { label: 'PayPal',    color: '#003087', icon: '<path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106zm14.146-14.42a3.35 3.35 0 0 0-.607-.541c-.013.076-.026.175-.041.254-.59 3.025-2.566 4.643-5.933 4.643h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106-.318 2.018a.641.641 0 0 0 .633.74h3.91c.524 0 .968-.382 1.05-.9l.44-2.787.282-1.789c.082-.518.526-.9 1.05-.9h.666c3.297 0 5.88-1.338 6.637-5.21.315-1.617.152-2.967-.609-3.534z"/>' },
  kofi:      { label: 'Ko-Fi',     color: '#FF5E5B', icon: '<path d="M23.881 8.948c-.773-4.085-4.859-4.593-4.859-4.593H.723c-.604 0-.679.798-.679.798s-.082 7.324-.022 11.822c.164 2.424 2.586 2.672 2.586 2.672s8.267-.023 11.966-.049c2.438-.426 2.683-2.566 2.658-3.734 4.352.24 7.422-2.831 6.649-6.916zm-11.062 3.511c-1.246 1.453-4.011 3.976-4.011 3.976s-.121.119-.31.023c-.076-.057-.108-.09-.108-.09-.443-.441-3.368-3.049-4.034-3.954-.709-.965-1.041-2.7-.091-3.71.951-1.01 3.005-1.086 4.363.407 0 0 1.565-1.782 3.468-.963 1.904.82 1.832 3.011.723 4.311zm6.173.478c-.928.116-1.682.028-1.682.028V7.284h1.77s1.971.551 1.971 2.638c0 1.913-.985 2.667-2.059 3.015z"/>' },
  cashapp:   { label: 'Cash App',  color: '#00D632', icon: '<path d="M23.59 3.474A11.967 11.967 0 0 0 20.526.41C18.59-.125 12 0 12 0S5.41-.125 3.474.41A11.967 11.967 0 0 0 .41 3.474C-.125 5.41 0 12 0 12s-.125 6.59.41 8.526a11.967 11.967 0 0 0 3.064 3.064C5.41 24.125 12 24 12 24s6.59.125 8.526-.41a11.967 11.967 0 0 0 3.064-3.064C24.125 18.59 24 12 24 12s.125-5.41-.41-7.526zm-6.55 10.03c-.206 1.37-1.24 2.424-2.605 2.64-.448.07-.883.103-1.306.103-.609 0-1.196-.066-1.744-.195l-.55 2.138a.43.43 0 0 1-.416.32h-1.69a.214.214 0 0 1-.207-.267l.562-2.183a4.654 4.654 0 0 1-2.3-1.88.214.214 0 0 1 .06-.286l1.394-.985a.43.43 0 0 1 .574.083c.45.558 1.045.899 1.743.996l.804-3.124c-1.427-.44-2.986-1.125-2.668-3.077.197-1.222 1.128-2.198 2.46-2.46.386-.074.78-.111 1.172-.111.553 0 1.093.072 1.604.21l.49-1.9a.43.43 0 0 1 .416-.321h1.69c.139 0 .232.136.196.27l-.5 1.94a4.787 4.787 0 0 1 2.017 1.666.214.214 0 0 1-.053.29l-1.38 1.003a.43.43 0 0 1-.578-.074 2.404 2.404 0 0 0-1.514-.872l-.78 3.032c1.485.462 3.09 1.2 2.757 3.063z"/>' },
}

function buildEmailHtml({ senderName, logoUrl, galleryTitle, clientName, eventName, eventDate, galleryUrl, coverImageUrl, password, downloadPin, expiryDate, customMessage, socialLinks, paymentLinks }: {
  senderName: string
  logoUrl: string | null
  galleryTitle: string
  clientName: string
  eventName: string
  eventDate: string
  galleryUrl: string
  coverImageUrl: string | null
  password: string | null
  downloadPin: string | null
  expiryDate: string | null
  customMessage: string | null
  socialLinks: Record<string, string>
  paymentLinks: Record<string, string>
}) {
  const allLinks = { ...socialLinks, ...paymentLinks }
  const BASE_URL = 'https://finalvault.dockercapphotography.com/brand-icons'
  const linkIconsHtml = Object.entries(allLinks)
    .filter(([_, url]) => url)
    .map(([id, url]) => {
      const meta = SOCIAL_META[id]
      if (!meta) return ''
      return `<a href="${url}" style="display:inline-block;margin:0 6px;text-decoration:none;">
        <img src="${BASE_URL}/${id}.png" alt="${meta.label}" width="32" height="32" style="display:block;border:0;border-radius:8px;" />
      </a>`
    }).join('')
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${galleryTitle}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;">

        <!-- Header -->
        <tr>
          <td style="background:#111111;padding:24px 40px;text-align:center;">
            ${logoUrl
              ? `<img src="${logoUrl}" alt="${senderName}" height="40" style="display:inline-block;max-width:200px;max-height:40px;object-fit:contain;border:0;" />`
              : `<p style="margin:0;color:#ffffff;font-size:13px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;">${senderName}</p>`
            }
          </td>
        </tr>

        <!-- Cover image -->
        ${coverImageUrl ? `
        <tr>
          <td style="padding:0;line-height:0;">
            <img src="${coverImageUrl}" alt="${galleryTitle}" width="560" style="display:block;width:100%;max-height:320px;object-fit:cover;" />
          </td>
        </tr>` : ''}

        <!-- Gallery title -->
        <tr>
          <td style="padding:36px 40px 0;text-align:center;">
            <p style="margin:0 0 6px;color:#111111;font-size:22px;font-weight:700;letter-spacing:-0.3px;line-height:1.3;">${galleryTitle}</p>
            ${[eventName, eventDate].filter(Boolean).length > 0 ? `<p style="margin:0;color:#6b7280;font-size:13px;">${[eventName, eventDate].filter(Boolean).join(' &middot; ')}</p>` : ''}
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:28px 40px;">

            <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.7;">Hi ${clientName},</p>

            ${customMessage ? `<div style="margin:0 0 24px;">${customMessage}</div>` : ''}

            <!-- CTA Button — full width -->
            <table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 32px;">
              <tr>
                <td style="background:#111111;border-radius:8px;text-align:center;">
                  <a href="${galleryUrl}" style="display:block;padding:16px 36px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;letter-spacing:0.05em;text-transform:uppercase;">View Gallery</a>
                </td>
              </tr>
            </table>

            <!-- Access details — individual boxes -->
            ${password || downloadPin || expiryDate ? `
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr><td>
                <p style="margin:0 0 10px;color:#111111;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Access Details</p>
                ${password ? `
                <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;">
                  <tr>
                    <td style="padding:12px 16px;">
                      <p style="margin:0 0 4px;color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">Gallery Password</p>
                      <p style="margin:0;color:#111111;font-size:20px;font-weight:700;font-family:'Courier New',monospace;letter-spacing:0.15em;">${password}</p>
                    </td>
                  </tr>
                </table>` : ''}
                ${downloadPin ? `
                <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;">
                  <tr>
                    <td style="padding:12px 16px;">
                      <p style="margin:0 0 4px;color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">Download PIN</p>
                      <p style="margin:0;color:#111111;font-size:28px;font-weight:700;font-family:'Courier New',monospace;letter-spacing:0.3em;">${downloadPin}</p>
                    </td>
                  </tr>
                </table>` : ''}
                ${expiryDate ? `
                <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;background:#fff8f0;border-radius:8px;border:1px solid #fed7aa;">
                  <tr>
                    <td style="padding:12px 16px;">
                      <p style="margin:0 0 4px;color:#9a6b3a;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">Gallery Expires</p>
                      <p style="margin:0;color:#7c4b1a;font-size:14px;font-weight:600;">${expiryDate}</p>
                    </td>
                  </tr>
                </table>` : ''}
              </td></tr>
            </table>` : ''}


          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px;border-top:1px solid #f3f4f6;text-align:center;">
            ${linkIconsHtml ? `<div style="margin-bottom:12px;">${linkIconsHtml}</div>` : ''}
            <p style="margin:0;color:#9ca3af;font-size:12px;">${senderName} &nbsp;&middot;&nbsp; <a href="${galleryUrl}" style="color:#9ca3af;text-decoration:none;">View gallery</a> &nbsp;&middot;&nbsp; Questions? Reply to this email.</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}
