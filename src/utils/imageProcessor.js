/**
 * imageProcessor.js
 *
 * Client-side image processing using the Canvas API.
 * Handles preview generation (resize + watermark) before upload.
 * No server-side processing needed — everything happens in the browser.
 */

const PREVIEW_MAX_LONG_EDGE = 1500
const PREVIEW_QUALITY = 0.85

/**
 * Generate a watermarked WebP preview from an original file.
 * Returns a Blob ready to upload to R2.
 *
 * @param {File} file - Original image file
 * @param {Object} watermark - Watermark config from photographer profile
 * @param {string} watermark.url - URL of the watermark image (fetched from R2)
 * @param {number} watermark.opacity - 0.0 to 1.0
 * @param {string} watermark.position - 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
 * @returns {Promise<Blob>} WebP blob
 */
export async function generatePreview(file, watermark = null) {
  const imageBitmap = await loadImageBitmap(file)

  // Calculate preview dimensions
  const { width, height } = getResizeDimensions(
    imageBitmap.width,
    imageBitmap.height,
    PREVIEW_MAX_LONG_EDGE
  )

  // Draw resized image to canvas
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(imageBitmap, 0, 0, width, height)
  imageBitmap.close()

  // Composite watermark if configured
  if (watermark?.url) {
    try {
      await compositeWatermark(ctx, watermark, width, height)
    } catch (err) {
      console.warn('Watermark compositing failed, continuing without watermark:', err)
    }
  }

  // Convert to WebP blob
  const blob = await canvas.convertToBlob({ type: 'image/webp', quality: PREVIEW_QUALITY })
  return blob
}

/**
 * Get image dimensions from a file without full processing.
 * Used to store width/height in Supabase metadata.
 */
export async function getImageDimensions(file) {
  const bitmap = await loadImageBitmap(file)
  const { width, height } = bitmap
  bitmap.close()
  return { width, height }
}

/**
 * Composite a watermark image onto a canvas context.
 */
async function compositeWatermark(ctx, watermark, canvasWidth, canvasHeight) {
  const resp = await fetch(watermark.url)
  const blob = await resp.blob()
  const wmBitmap = await createImageBitmap(blob)

  // Scale watermark to 25% of canvas width
  const wmWidth = Math.round(canvasWidth * 0.25)
  const wmHeight = Math.round((wmBitmap.height / wmBitmap.width) * wmWidth)

  // Calculate position with 20px padding
  const PADDING = 20
  const { x, y } = getWatermarkPosition(
    watermark.position,
    canvasWidth,
    canvasHeight,
    wmWidth,
    wmHeight,
    PADDING
  )

  // Draw watermark with opacity
  ctx.save()
  ctx.globalAlpha = watermark.opacity ?? 0.3
  ctx.drawImage(wmBitmap, x, y, wmWidth, wmHeight)
  ctx.restore()
  wmBitmap.close()
}

/**
 * Calculate watermark x/y position based on position string.
 */
function getWatermarkPosition(position, canvasW, canvasH, wmW, wmH, padding) {
  switch (position) {
    case 'top-left':
      return { x: padding, y: padding }
    case 'top-right':
      return { x: canvasW - wmW - padding, y: padding }
    case 'bottom-left':
      return { x: padding, y: canvasH - wmH - padding }
    case 'center':
      return { x: (canvasW - wmW) / 2, y: (canvasH - wmH) / 2 }
    case 'bottom-right':
    default:
      return { x: canvasW - wmW - padding, y: canvasH - wmH - padding }
  }
}

/**
 * Calculate resize dimensions maintaining aspect ratio.
 */
function getResizeDimensions(originalW, originalH, maxLongEdge) {
  if (originalW <= maxLongEdge && originalH <= maxLongEdge) {
    return { width: originalW, height: originalH }
  }
  if (originalW >= originalH) {
    return {
      width: maxLongEdge,
      height: Math.round((originalH / originalW) * maxLongEdge)
    }
  }
  return {
    width: Math.round((originalW / originalH) * maxLongEdge),
    height: maxLongEdge
  }
}

/**
 * Load a File into an ImageBitmap.
 * Falls back to HTMLImageElement for formats OffscreenCanvas can't handle.
 */
async function loadImageBitmap(file) {
  try {
    return await createImageBitmap(file)
  } catch {
    // Fallback for unsupported formats (e.g. HEIC in some browsers)
    return await loadViaBlobUrl(file)
  }
}

async function loadViaBlobUrl(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = async () => {
      URL.revokeObjectURL(url)
      try {
        const bitmap = await createImageBitmap(img)
        resolve(bitmap)
      } catch (err) {
        reject(err)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`Failed to load image: ${file.name}`))
    }
    img.src = url
  })
}
