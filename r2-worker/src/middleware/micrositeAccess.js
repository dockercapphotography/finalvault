/**
 * Verifies that a requested preview image legitimately belongs to a
 * currently-enabled microsite -- either as the hero image, part of the
 * designated gallery source, or a testimonial photo.
 *
 * Deliberately NOT modeled on verifyShareToken(): there is no client-
 * supplied secret here at all. Legitimacy comes entirely from server-side
 * state (Supabase), so there's nothing sitting in a public page's network
 * requests that could be extracted and reused to access anything else --
 * unlike a gallery's own share_token, which also grants full private
 * gallery access and would leak the password-gate bypass to any visitor
 * of the public microsite if reused here. See docs/microsite-spec.md.
 *
 * Same Supabase REST + service key pattern as shareToken.js/auth.js.
 */
export async function verifyMicrositeAccess(key, env) {
  // Broad match first (any key under photographers/{id}/...), then a
  // narrower optional match for the gallery-preview shape specifically --
  // logo keys (photographers/{id}/logos/...) and hero/testimonial keys
  // don't follow the gallery/preview pattern at all, so requiring it
  // upfront rejected every one of them before any real check ran.
  const photographerMatch = key.match(/^photographers\/([^/]+)\//)
  if (!photographerMatch) {
    return { valid: false, error: 'Invalid key format for microsite access' }
  }
  const photographerId = photographerMatch[1]

  const galleryMatch = key.match(/^photographers\/[^/]+\/galleries\/([^/]+)\/preview\//)
  const galleryId = galleryMatch ? galleryMatch[1] : null

  try {
    const [micrositeResp, photographerResp] = await Promise.all([
      fetch(`${env.SUPABASE_URL}/rest/v1/microsites?photographer_id=eq.${photographerId}&enabled=eq.true&select=hero_image_key,hero_cycle_image_keys,hero_mosaic_image_keys,logo_r2_key,logo_dark_r2_key,about_photo_key,gallery_source_type,gallery_source_gallery_id,gallery_source_image_keys,testimonials`, {
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}` }
      }),
      fetch(`${env.SUPABASE_URL}/rest/v1/photographers?id=eq.${photographerId}&select=logo_r2_key`, {
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}` }
      }),
    ])

    if (!micrositeResp.ok) {
      return { valid: false, error: 'Failed to validate microsite access' }
    }

    const rows = await micrositeResp.json()
    if (!rows || rows.length === 0) {
      return { valid: false, error: 'No enabled microsite for this photographer' }
    }

    const site = rows[0]
    const photographerRows = photographerResp.ok ? await photographerResp.json() : []
    const accountLogoKey = photographerRows?.[0]?.logo_r2_key || null

    const isHero = site.hero_image_key === key
    const isLogo = site.logo_r2_key === key || accountLogoKey === key || site.logo_dark_r2_key === key
    const isAboutPhoto = site.about_photo_key === key
    const isHeroCycleImage = Array.isArray(site.hero_cycle_image_keys) && site.hero_cycle_image_keys.includes(key)
    const isHeroMosaicImage = Array.isArray(site.hero_mosaic_image_keys) && site.hero_mosaic_image_keys.includes(key)

    // Covers both gallery-source paths the schema supports: the current
    // v1 UI (gallery_source_type = 'gallery', one designated gallery --
    // matched by galleryId, so every image in it is allowed) and the
    // reserved-but-not-yet-built manual path (gallery_source_type =
    // 'manual', specific hand-picked keys spanning any gallery). Checking
    // both now means this worker doesn't need a second deploy once the
    // manual picker UI actually ships.
    const isGallerySource =
      (site.gallery_source_type === 'gallery' && site.gallery_source_gallery_id === galleryId)
      || (site.gallery_source_type === 'manual' && Array.isArray(site.gallery_source_image_keys) && site.gallery_source_image_keys.includes(key))

    const isTestimonialPhoto = Array.isArray(site.testimonials)
      && site.testimonials.some(t => t?.photo_gallery_image_key === key)

    if (!isHero && !isLogo && !isAboutPhoto && !isGallerySource && !isTestimonialPhoto && !isHeroCycleImage && !isHeroMosaicImage) {
      return { valid: false, error: 'Image is not part of this microsite' }
    }

    return { valid: true, photographerId }
  } catch (err) {
    console.error('Microsite access verification error:', err)
    return { valid: false, error: 'Microsite access verification failed' }
  }
}
