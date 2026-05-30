/**
 * imageProcess.js — shared image processing for FinalVault worker
 *
 * Used by download.js and zip.js.
 * Handles: resize to 2048px long edge, watermark lookup + compositing, JPEG encode.
 *
 * Requires: npm install @cf-wasm/photon (in r2-worker/)
 */

import { PhotonImage, SamplingFilter, resize, watermark } from '@cf-wasm/photon/workerd'

/**
 * Fetch watermark config directly by watermark ID.
 * This is the preferred lookup — uses the watermark_id stored on the image row,
 * which records exactly which watermark was baked into the preview.
 *
 * Returns null if watermark not found or not configured.
 *
 * @param {string} watermarkId - UUID from gallery_images.watermark_id
 * @param {object} env - Worker env bindings
 * @returns {Promise<{imageBytes: Uint8Array, opacity: number, position: string, scale: number}|null>}
 */
export async function fetchWatermarkById(watermarkId, env) {
  if (!watermarkId) return null
  try {
    const wmResp = await fetch(
      `${env.SUPABASE_URL}/rest/v1/watermarks?id=eq.${watermarkId}&select=r2_key,opacity,position,scale`,
      {
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        },
      }
    )
    const watermarks = await wmResp.json()
    if (!watermarks?.length) return null

    const wm = watermarks[0]
    if (!wm.r2_key) return null

    const wmObj = await env.BUCKET.get(wm.r2_key)
    if (!wmObj) return null

    const imageBytes = new Uint8Array(await wmObj.arrayBuffer())

    return {
      imageBytes,
      opacity: typeof wm.opacity === 'number' ? wm.opacity : 0.5,
      position: wm.position || 'bottom-right',
      scale: typeof wm.scale === 'number' ? wm.scale : 0.3,
    }
  } catch (err) {
    console.error('fetchWatermarkById error:', err)
    return null
  }
}

/**
 * Process an image for web-size download:
 *   1. Resize to 2048px on long edge (maintain aspect ratio)
 *   2. Composite watermark if provided
 *   3. Encode as JPEG
 *
 * @param {Uint8Array} inputBytes - Raw bytes of the original image
 * @param {object|null} wmConfig - Result of fetchWatermarkById, or null for no watermark
 * @returns {Promise<Uint8Array>} JPEG bytes
 */
export async function processWebImage(inputBytes, wmConfig) {
  const MAX_LONG_EDGE = 2048

  let img = PhotonImage.new_from_byteslice(inputBytes)

  const w = img.get_width()
  const h = img.get_height()

  if (w > MAX_LONG_EDGE || h > MAX_LONG_EDGE) {
    let newW, newH
    if (w >= h) {
      newW = MAX_LONG_EDGE
      newH = Math.round((h / w) * MAX_LONG_EDGE)
    } else {
      newH = MAX_LONG_EDGE
      newW = Math.round((w / h) * MAX_LONG_EDGE)
    }
    const resized = resize(img, newW, newH, SamplingFilter.Lanczos3)
    img.free()
    img = resized
  }

  if (wmConfig) {
    try {
      img = applyWatermark(img, wmConfig)
    } catch (err) {
      console.error('Watermark compositing failed, continuing without:', err)
    }
  }

  // JPEG quality 88 — good balance of size and quality for client delivery
  const jpegBytes = img.get_bytes_jpeg(88)
  img.free()

  return jpegBytes
}

/**
 * Composite a watermark onto a PhotonImage.
 * Mutates img in place (Photon's watermark() modifies the base image).
 * Returns img for chaining.
 */
function applyWatermark(img, wmConfig) {
  const imgW = img.get_width()
  const imgH = img.get_height()

  let wmImg = PhotonImage.new_from_byteslice(wmConfig.imageBytes)

  // Scale watermark to `scale` fraction of image width
  const targetWmW = Math.round(imgW * wmConfig.scale)
  const wmOrigW = wmImg.get_width()
  const wmOrigH = wmImg.get_height()
  const targetWmH = Math.round((wmOrigH / wmOrigW) * targetWmW)

  if (targetWmW !== wmOrigW || targetWmH !== wmOrigH) {
    const scaledWm = resize(wmImg, targetWmW, targetWmH, SamplingFilter.Lanczos3)
    wmImg.free()
    wmImg = scaledWm
  }

  const wmW = wmImg.get_width()
  const wmH = wmImg.get_height()
  const padding = Math.round(imgW * 0.02)
  const { x, y } = getWatermarkPosition(wmConfig.position, imgW, imgH, wmW, wmH, padding)

  const wmWithOpacity = applyOpacityToImage(wmImg, wmConfig.opacity)
  wmImg.free()

  watermark(img, wmWithOpacity, BigInt(x), BigInt(y))
  wmWithOpacity.free()

  return img
}

/**
 * Multiply alpha channel of a PhotonImage by opacity factor.
 * Returns a new PhotonImage. Caller must free original separately.
 */
function applyOpacityToImage(img, opacity) {
  if (opacity >= 1.0) return img

  const rawBytes = img.get_raw_pixels()
  const pixels = new Uint8Array(rawBytes)

  for (let i = 3; i < pixels.length; i += 4) {
    pixels[i] = Math.round(pixels[i] * opacity)
  }

  const w = img.get_width()
  const h = img.get_height()

  return new PhotonImage(pixels, w, h)
}

function getWatermarkPosition(position, imgW, imgH, wmW, wmH, padding) {
  switch (position) {
    case 'center':
      return { x: Math.round((imgW - wmW) / 2), y: Math.round((imgH - wmH) / 2) }
    case 'top-left':
      return { x: padding, y: padding }
    case 'top-right':
      return { x: imgW - wmW - padding, y: padding }
    case 'bottom-left':
      return { x: padding, y: imgH - wmH - padding }
    case 'bottom-right':
    default:
      return { x: imgW - wmW - padding, y: imgH - wmH - padding }
  }
}
