const PREVIEW_MAX_LONG_EDGE = 400
const PREVIEW_QUALITY = 0.80

export async function generatePreview(file, watermark = null) {
  const imageBitmap = await loadImageBitmap(file)
  const { width, height } = getResizeDimensions(
    imageBitmap.width, imageBitmap.height, PREVIEW_MAX_LONG_EDGE
  )

  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(imageBitmap, 0, 0, width, height)
  imageBitmap.close()

  if (watermark?.url) {
    try { await compositeWatermark(ctx, watermark, width, height) }
    catch (err) { console.warn('Watermark failed:', err) }
  }

  return await canvas.convertToBlob({ type: 'image/webp', quality: PREVIEW_QUALITY })
}

export async function getImageDimensions(file) {
  const bitmap = await loadImageBitmap(file)
  const { width, height } = bitmap
  bitmap.close()
  return { width, height }
}

async function compositeWatermark(ctx, watermark, canvasWidth, canvasHeight) {
  const resp = await fetch(watermark.url)
  const blob = await resp.blob()
  const wmBitmap = await createImageBitmap(blob)
  const wmWidth = Math.round(canvasWidth * 0.25)
  const wmHeight = Math.round((wmBitmap.height / wmBitmap.width) * wmWidth)
  const PADDING = 10
  const { x, y } = getWatermarkPosition(watermark.position, canvasWidth, canvasHeight, wmWidth, wmHeight, PADDING)
  ctx.save()
  ctx.globalAlpha = watermark.opacity ?? 0.3
  ctx.drawImage(wmBitmap, x, y, wmWidth, wmHeight)
  ctx.restore()
  wmBitmap.close()
}

function getWatermarkPosition(position, cW, cH, wmW, wmH, pad) {
  switch (position) {
    case 'top-left':     return { x: pad, y: pad }
    case 'top-right':    return { x: cW - wmW - pad, y: pad }
    case 'bottom-left':  return { x: pad, y: cH - wmH - pad }
    case 'center':       return { x: (cW - wmW) / 2, y: (cH - wmH) / 2 }
    case 'bottom-right':
    default:             return { x: cW - wmW - pad, y: cH - wmH - pad }
  }
}

function getResizeDimensions(w, h, maxLongEdge) {
  if (w <= maxLongEdge && h <= maxLongEdge) return { width: w, height: h }
  if (w >= h) return { width: maxLongEdge, height: Math.round((h / w) * maxLongEdge) }
  return { width: Math.round((w / h) * maxLongEdge), height: maxLongEdge }
}

async function loadImageBitmap(file) {
  try { return await createImageBitmap(file) }
  catch { return await loadViaBlobUrl(file) }
}

async function loadViaBlobUrl(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = async () => {
      URL.revokeObjectURL(url)
      try { resolve(await createImageBitmap(img)) }
      catch (err) { reject(err) }
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Failed to load: ${file.name}`)) }
    img.src = url
  })
}
