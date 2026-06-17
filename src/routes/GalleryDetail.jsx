import { useState, useEffect, useRef } from 'react'
import BottomSheet from '../components/layout/BottomSheet.jsx'
import { useScrollLock } from '../hooks/useScrollLock.js'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import {ArrowLeft, BarChart2, Check, ChevronLeft, ChevronRight, Copy, Droplets, ExternalLink, ImageIcon, LayoutGrid, Link as LinkIcon, Mail, MoreVertical, Pencil, Plus, QrCode, Settings, SlidersHorizontal, Trash2, Upload, X} from 'lucide-react'
import { getGallery, updateGallery } from '../utils/galleryApi.js'
import { getImages, deleteImage, saveImageOrder, updateImageWatermark, updateImageName, updateImageKeys } from '../utils/imageApi.js'
import { getBookmarkedImageIds } from '../utils/bookmarkApi.js'
import { deleteFromR2, uploadToR2, buildOriginalKey, buildPreviewKey } from '../utils/r2.js'
import { supabase } from '../supabaseClient.js'
import { useImageUpload } from '../hooks/useImageUpload.js'
import { usePreviewUrls, updatePreviewCache } from '../hooks/usePreviewUrls.js'
import { usePageDrop } from '../hooks/usePageDrop.js'
import ImageUploader from '../components/images/ImageUploader.jsx'
import ImageGrid from '../components/images/ImageGrid.jsx'
import UploadProgress from '../components/images/UploadProgress.jsx'
import BulkActionBar from '../components/images/BulkActionBar.jsx'
import SortDropdown, { sortImages } from '../components/images/SortDropdown.jsx'
import Button from '../components/ui/Button.jsx'
import Badge from '../components/ui/Badge.jsx'
import Toast from '../components/ui/Toast.jsx'
import { formatDate } from '../utils/formatters.js'
import CoverPickerModal from '../components/galleries/CoverPickerModal.jsx'
import ShareButton from '../components/galleries/ShareButton.jsx'
import { getActiveWatermark, getWatermarkUrl, getWatermarks } from '../utils/watermarkApi.js'
import { getSets, createSet, updateSet, deleteSet, saveSetOrder, moveImageToSet, moveImagesToSet } from '../utils/gallerySetApi.js'
import PageBreadcrumb from '../components/ui/PageBreadcrumb.jsx'

export default function GalleryDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [gallery, setGallery] = useState(null)
  const [images, setImages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)
  const [photographerId, setPhotographerId] = useState(null)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [sortBy, setSortBy] = useState('custom')
  const [savingOrder, setSavingOrder] = useState(false)
  const [coverId, setCoverId] = useState(null)
  const [activeWatermark, setActiveWatermark] = useState(null)
  const [showCoverPicker, setShowCoverPicker] = useState(false)
  const [coverPickerImage, setCoverPickerImage] = useState(null)
  const [lightboxImage, setLightboxImage] = useState(null)
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const [sets, setSets] = useState([])
  const [activeSetId, setActiveSetId] = useState(null)
  const [showAddSet, setShowAddSet] = useState(false)
  const [newSetName, setNewSetName] = useState('')
  const [editingSet, setEditingSet] = useState(null)
  const [editSetName, setEditSetName] = useState('')
  const [confirmDeleteSetId, setConfirmDeleteSetId] = useState(null)
  const [dragSetId, setDragSetId] = useState(null)
  const [dragOverSetId, setDragOverSetId] = useState(null)
  const [setMenuOpenId, setSetMenuOpenId] = useState(null)
  const [setMenuPos, setSetMenuPos] = useState({ top: 0, left: 0 })
  const [showWatermark, setShowWatermark] = useState(false)
  const [watermarkTarget, setWatermarkTarget] = useState(null)
  const [watermarks, setWatermarks] = useState([])
  const [selectedWatermarkId, setSelectedWatermarkId] = useState(null)
  const [watermarking, setWatermarking] = useState(false)
  const [watermarkProgress, setWatermarkProgress] = useState({ current: 0, total: 0 })
  const [cacheBusts, setCacheBusts] = useState({})
  const [bookmarkedImageIds, setBookmarkedImageIds] = useState(new Set())

  function handleBookmarkImage(imageId) {
    setBookmarkedImageIds(prev => new Set(prev).add(imageId))
  }
  function handleUnbookmarkImage(imageId) {
    setBookmarkedImageIds(prev => {
      const next = new Set(prev)
      next.delete(imageId)
      return next
    })
  }
  const [viewSize, setViewSize] = useState('small')
  const [showFilename, setShowFilename] = useState(false)
  const [showGridMenu, setShowGridMenu] = useState(false)
  const [showGalleryFilters, setShowGalleryFilters] = useState(false)
  const [galleryFiltersSubScreen, setGalleryFiltersSubScreen] = useState(null)
  const [showActionSheet, setShowActionSheet] = useState(false)
  const [sheetVisible, setSheetVisible] = useState(false)
  const sheetTouchStartY = useRef(null)
  const [downloadingZip, setDownloadingZip] = useState(false)
  const [zipProgress, setZipProgress] = useState(null)  // { current, total, hires }

  function openSheet() { setShowActionSheet(true) }
  function closeSheet() { setShowActionSheet(false) }
  const [shareModal, setShareModal] = useState(null)

  const anyModalOpen = showWatermark || showCoverPicker || showActionSheet || !!confirmDeleteSetId || lightboxIndex !== null
  useScrollLock(anyModalOpen)

  const activeSetImages = activeSetId ? images.filter(i => i.set_id === activeSetId) : images
  const hasImages = images.length > 0
  const hasSetImages = activeSetImages.length > 0
  const { previewUrls, setPreviewUrls } = usePreviewUrls(images)

  const { uploadFiles, uploadItems, isUploading, storageError, reset: resetUpload } = useImageUpload({
    galleryId: id,
    photographerId,
    watermark: activeWatermark,
    setId: activeSetId,
    onComplete: async () => {
      const fresh = await getImages(id)
      setImages(fresh)
      resetUpload()
    },
  })

  const isDragOver = usePageDrop(uploadFiles, hasSetImages)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setPhotographerId(user?.id))
    load()
    loadWatermarks()
    getBookmarkedImageIds().then(setBookmarkedImageIds).catch(() => {})
  }, [id])

  async function loadWatermarks() {
    try {
      const wms = await getWatermarks()
      setWatermarks(wms)
    } catch (err) {
      console.warn('Could not load watermarks:', err)
    }
  }

  async function loadWatermarkForGallery(gallery) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const workerUrl = import.meta.env.VITE_R2_WORKER_URL

      // Use gallery-specific watermark if set, otherwise fall back to active watermark
      let wm = null
      if (gallery.watermark_id) {
        const { data } = await supabase
          .from('watermarks')
          .select('*')
          .eq('id', gallery.watermark_id)
          .single()
        wm = data
      } else {
        wm = await getActiveWatermark()
      }

      if (wm) {
        const url = `${workerUrl}/watermark/${encodeURIComponent(wm.r2_key)}?token=${session.access_token}`
        // Include id so useImageUpload can save it to gallery_images.watermark_id
        setActiveWatermark({ id: wm.id, url, opacity: wm.opacity, position: wm.position, scale: wm.scale ?? 0.15 })
      }
    } catch (err) {
      console.warn('Could not load watermark:', err)
    }
  }

  async function load() {
    try {
      setLoading(true)
      const [g, imgs, setsData] = await Promise.all([getGallery(id), getImages(id), getSets(id)])
      setGallery(g)
      setImages(imgs)
      setCoverId(g.cover_image_id || null)
      setSets(setsData)
      if (setsData.length > 0 && !activeSetId) setActiveSetId(setsData[0].id)
      loadWatermarkForGallery(g)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleSetDragStart(e, setId) {
    setDragSetId(setId)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleSetDragOver(e, setId) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverSetId(setId)
  }

  async function handleSetDrop(e, targetSetId) {
    e.preventDefault()
    if (!dragSetId || dragSetId === targetSetId) { setDragSetId(null); setDragOverSetId(null); return }
    const newOrder = [...sets]
    const fromIdx = newOrder.findIndex(s => s.id === dragSetId)
    const toIdx = newOrder.findIndex(s => s.id === targetSetId)
    const [moved] = newOrder.splice(fromIdx, 1)
    newOrder.splice(toIdx, 0, moved)
    setSets(newOrder)
    setDragSetId(null)
    setDragOverSetId(null)
    try { await saveSetOrder(newOrder.map(s => s.id)) } catch { /* silent */ }
  }

  async function handleAddSet() {
    if (!newSetName.trim()) return
    try {
      const s = await createSet(id, newSetName.trim())
      setSets(prev => [...prev, s])
      setActiveSetId(s.id)
      setNewSetName('')
      setShowAddSet(false)
    } catch (err) {
      console.error(err)
    }
  }

  async function handleUpdateSet(setId) {
    if (!editSetName.trim()) return
    try {
      const updated = await updateSet(setId, { name: editSetName.trim() })
      setSets(prev => prev.map(s => s.id === setId ? updated : s))
      setEditingSet(null)
    } catch (err) {
      console.error(err)
    }
  }

  async function handleDeleteSet(setId) {
    try {
      // Delete all images in this set first
      const imagesToDelete = images.filter(i => i.set_id === setId)
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const workerUrl = import.meta.env.VITE_R2_WORKER_URL
      await Promise.all(imagesToDelete.map(async img => {
        try {
          await deleteImage(img.id)
          if (img.original_r2_key) await fetch(`${workerUrl}/delete/${encodeURIComponent(img.original_r2_key)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
          if (img.preview_r2_key) await fetch(`${workerUrl}/delete/${encodeURIComponent(img.preview_r2_key)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
        } catch (err) {
          console.warn('Failed to delete image', img.id, err)
        }
      }))
      // Remove images from state
      setImages(prev => prev.filter(i => i.set_id !== setId))
      // Delete the set
      await deleteSet(setId)
      setSets(prev => {
        const next = prev.filter(s => s.id !== setId)
        if (activeSetId === setId && next.length > 0) setActiveSetId(next[0].id)
        return next
      })
      setConfirmDeleteSetId(null)
      setToast({ message: `Set and ${imagesToDelete.length} image${imagesToDelete.length !== 1 ? 's' : ''} deleted`, type: 'success' })
    } catch (err) {
      console.error(err)
      setToast({ message: 'Failed to delete set', type: 'error' })
    }
  }

  async function handleMoveImage(imageId, targetSetId) {
    try {
      await moveImageToSet(imageId, targetSetId)
      setImages(prev => prev.map(i => i.id === imageId ? { ...i, set_id: targetSetId } : i))
      setToast({ message: 'Image moved', type: 'success' })
    } catch {
      setToast({ message: 'Failed to move image', type: 'error' })
    }
  }

  async function handleMoveSelected(targetSetId) {
    const toMove = [...selectedIds]
    try {
      await moveImagesToSet(toMove, targetSetId)
      setImages(prev => prev.map(i => selectedIds.has(i.id) ? { ...i, set_id: targetSetId } : i))
      setSelectedIds(new Set())
      setToast({ message: `${toMove.length} images moved`, type: 'success' })
    } catch {
      setToast({ message: 'Failed to move images', type: 'error' })
    }
  }

  async function handleDownloadImage(image, hires) {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    const workerUrl = import.meta.env.VITE_R2_WORKER_URL
    try {
      const params = new URLSearchParams({ size: hires ? 'hires' : 'web' })
      if (!hires && image.watermark_id) params.set('watermark_id', image.watermark_id)
      const resp = await fetch(
        `${workerUrl}/download/${encodeURIComponent(image.original_r2_key)}?${params}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!resp.ok) throw new Error('Download failed')
      const blob = await resp.blob()
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = hires ? image.file_name : image.file_name.replace(/\.[^.]+$/, '_web.jpg')
      document.body.appendChild(link); link.click()
      document.body.removeChild(link); URL.revokeObjectURL(objectUrl)
    } catch (err) {
      setToast({ message: 'Download failed: ' + err.message, type: 'error' })
    }
  }

  async function doPhotographerZipDownload(selected, hires) {
    const total = selected.length
    setDownloadingZip(true)
    setZipProgress({ current: 0, total, hires })
    try {
      const keys = selected.map(i => i.original_r2_key)
      const names = selected.map(i => hires ? i.file_name : i.file_name.replace(/\.[^.]+$/, '_web.jpg'))

      if (hires) {
        // Hires: worker handles it — raw originals, no processing
        const { data: { session } } = await supabase.auth.getSession()
        const token = session.access_token
        const workerUrl = import.meta.env.VITE_R2_WORKER_URL
        const resp = await fetch(`${workerUrl}/download-zip`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ galleryId: id, imageKeys: keys, fileNames: names, size: 'hires' }),
        })
        if (!resp.ok) throw new Error('ZIP failed')
        const blob = await resp.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url
        a.download = `${gallery.title.replace(/[^a-z0-9]/gi, '_')}.zip`
        document.body.appendChild(a); a.click()
        document.body.removeChild(a); URL.revokeObjectURL(url)
      } else {
        // Web size: client-side processing — resize + watermark via canvas + JSZip
        const { default: JSZip } = await import('jszip')
        const zip = new JSZip()
        const { data: { session } } = await supabase.auth.getSession()
        const token = session.access_token
        const workerUrl = import.meta.env.VITE_R2_WORKER_URL

        // Pre-fetch unique watermark images
        const wmBlobCache = {}
        for (const img of selected) {
          const wm = img.watermarks
          if (wm?.r2_key && !wmBlobCache[wm.r2_key]) {
            try {
              const resp = await fetch(`${workerUrl}/watermark/${encodeURIComponent(wm.r2_key)}`, {
                headers: { Authorization: `Bearer ${token}` }
              })
              if (resp.ok) wmBlobCache[wm.r2_key] = URL.createObjectURL(await resp.blob())
            } catch { /* skip */ }
          }
        }

        for (let i = 0; i < selected.length; i++) {
          const img = selected[i]
          const fileName = names[i]
          const wmConfig = img.watermarks || null
          const wmBlobUrl = wmConfig?.r2_key ? wmBlobCache[wmConfig.r2_key] : null
          try {
            const resp = await fetch(
              `${workerUrl}/download/${encodeURIComponent(img.original_r2_key)}?size=hires`,
              { headers: { Authorization: `Bearer ${token}` } }
            )
            if (!resp.ok) continue
            const blob = await resp.blob()
            const jpegBlob = await processImageForZip(blob, wmConfig, wmBlobUrl)
            zip.file(fileName, jpegBlob)
          } catch (err) { console.error('Failed to process', fileName, err) }
          setZipProgress(prev => ({ ...prev, current: i + 1 }))
        }

        for (const url of Object.values(wmBlobCache)) URL.revokeObjectURL(url)

        const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'STORE' })
        const url = URL.createObjectURL(zipBlob)
        const a = document.createElement('a'); a.href = url
        a.download = `${gallery.title.replace(/[^a-z0-9]/gi, '_')}.zip`
        document.body.appendChild(a); a.click()
        document.body.removeChild(a); URL.revokeObjectURL(url)
      }

      setZipProgress(prev => ({ ...prev, current: total }))
      await new Promise(r => setTimeout(r, 1200))
    } catch (err) {
      setToast({ message: 'ZIP download failed: ' + err.message, type: 'error' })
    } finally {
      setDownloadingZip(false); setZipProgress(null)
    }
  }

  async function processImageForZip(imageBlob, wmConfig, wmBlobUrl) {
    const MAX_LONG_EDGE = 2048
    const bitmap = await createImageBitmap(imageBlob)
    const { width: origW, height: origH } = bitmap
    let newW = origW, newH = origH
    if (origW > MAX_LONG_EDGE || origH > MAX_LONG_EDGE) {
      if (origW >= origH) { newW = MAX_LONG_EDGE; newH = Math.round((origH / origW) * MAX_LONG_EDGE) }
      else { newH = MAX_LONG_EDGE; newW = Math.round((origW / origH) * MAX_LONG_EDGE) }
    }
    const canvas = new OffscreenCanvas(newW, newH)
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, newW, newH)
    bitmap.close()
    if (wmConfig && wmBlobUrl) {
      try {
        const wmBitmap = await createImageBitmap(await fetch(wmBlobUrl).then(r => r.blob()))
        const wmW = Math.round(newW * (wmConfig.scale ?? 0.15))
        const wmH = Math.round((wmBitmap.height / wmBitmap.width) * wmW)
        const padding = Math.round(newW * 0.02)
        const pos = wmConfig.position || 'bottom-right'
        const positions = {
          'center':       [Math.round((newW - wmW) / 2), Math.round((newH - wmH) / 2)],
          'top-left':     [padding, padding],
          'top-right':    [newW - wmW - padding, padding],
          'bottom-left':  [padding, newH - wmH - padding],
          'bottom-right': [newW - wmW - padding, newH - wmH - padding],
        }
        const [x, y] = positions[pos] || positions['bottom-right']
        ctx.save(); ctx.globalAlpha = wmConfig.opacity ?? 0.5
        ctx.drawImage(wmBitmap, x, y, wmW, wmH)
        ctx.restore(); wmBitmap.close()
      } catch { /* continue without watermark */ }
    }
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.80 })
  }

  async function handleSetAsCover(image) {
    // Open CoverPickerModal pre-seeded with this image for focal point selection
    setCoverPickerImage(image)
    setShowCoverPicker(true)
  }

  async function handleRename(imageId, newName) {
    try {
      const updated = await updateImageName(imageId, newName)
      setImages(prev => prev.map(i => i.id === imageId ? { ...i, file_name: updated.file_name } : i))
      setToast({ message: 'Renamed', type: 'success' })
    } catch {
      setToast({ message: 'Rename failed', type: 'error' })
    }
  }

  async function handleReplace(image, file) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session.access_token
      const ext = file.name.split('.').pop().toLowerCase()

      // Upload new original (same key path, new uuid image id to bust cache)
      const newImageId = crypto.randomUUID()
      const newOriginalKey = buildOriginalKey(photographerId, id, newImageId, ext)
      const newPreviewKey = buildPreviewKey(photographerId, id, newImageId)

      setToast({ message: 'Uploading replacement…', type: 'success' })

      // Generate preview with current active watermark
      const { generatePreview } = await import('../utils/imageProcessor.js')
      const previewBlob = await generatePreview(file, activeWatermark)

      await Promise.all([
        uploadToR2({ file, key: newOriginalKey, token }),
        uploadToR2({
          file: new File([previewBlob], `${newImageId}.webp`, { type: 'image/webp' }),
          key: newPreviewKey,
          token,
        }),
      ])

      // Delete old R2 files
      await Promise.all([
        deleteFromR2({ key: image.original_r2_key, token }),
        deleteFromR2({ key: image.preview_r2_key, token }),
      ]).catch(() => {})

      // Update DB with new keys
      const updated = await updateImageKeys(image.id, newOriginalKey, newPreviewKey)
      setImages(prev => prev.map(i => i.id === image.id ? { ...i, ...updated } : i))
      setCacheBusts(prev => ({ ...prev, [image.id]: Date.now() }))
      setToast({ message: 'Photo replaced', type: 'success' })
    } catch (err) {
      setToast({ message: 'Replace failed: ' + err.message, type: 'error' })
    }
  }

  function handleOpenWatermark(image = null) {
    setWatermarkTarget(image)
    setSelectedWatermarkId(watermarks[0]?.id || null)
    setShowWatermark(true)
  }

  async function handleWatermark() {
    const wm = watermarks.find(w => w.id === selectedWatermarkId)
    if (!wm) return
    setWatermarking(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const workerUrl = import.meta.env.VITE_R2_WORKER_URL
      const token = session.access_token
      // Fetch watermark as blob since Image() can't send auth headers
      const wmResp = await fetch(`${workerUrl}/watermark/${encodeURIComponent(wm.r2_key)}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!wmResp.ok) { setToast({ message: 'Failed to load watermark', type: 'error' }); setWatermarking(false); return }
      const wmBlobUrl = URL.createObjectURL(await wmResp.blob())
      const wmObj = { url: wmBlobUrl, opacity: wm.opacity, position: wm.position, scale: wm.scale ?? 0.15 }

      const targets = watermarkTarget === 'bulk'
        ? images.filter(i => selectedIds.has(i.id))
        : watermarkTarget
        ? [watermarkTarget]
        : images.filter(i => i.set_id === activeSetId)
      setWatermarkProgress({ current: 0, total: targets.length })

      for (const img of targets) {
        // Fetch original
        const origResp = await fetch(`${workerUrl}/original/${encodeURIComponent(img.original_r2_key)}`, {
          headers: { Authorization: `Bearer ${token}`, 'X-Hires': 'true' }
        })
        if (!origResp.ok) continue
        const origBlob = await origResp.blob()
        const origUrl = URL.createObjectURL(origBlob)

        // Apply watermark via canvas
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        const original = await new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = origUrl })
        const longEdge = Math.max(original.width, original.height)
        const scale = longEdge > 1600 ? 1600 / longEdge : 1
        canvas.width = Math.round(original.width * scale)
        canvas.height = Math.round(original.height * scale)
        ctx.drawImage(original, 0, 0, canvas.width, canvas.height)

        // Load watermark
        const wmImg = await new Promise((res, rej) => {
          const i = new Image(); i.crossOrigin = 'anonymous'
          i.onload = () => res(i)
          i.onerror = (err) => rej(err)
          i.src = wmObj.url
        })
        const wmScale = wmObj.scale || 0.15
        const wmW = canvas.width * wmScale
        const wmH = (wmImg.height / wmImg.width) * wmW
        const positions = {
          'center':       [(canvas.width - wmW) / 2, (canvas.height - wmH) / 2],
          'top-left':     [canvas.width * 0.02, canvas.height * 0.02],
          'top-right':    [canvas.width * 0.98 - wmW, canvas.height * 0.02],
          'bottom-left':  [canvas.width * 0.02, canvas.height * 0.98 - wmH],
          'bottom-right': [canvas.width * 0.98 - wmW, canvas.height * 0.98 - wmH],
        }
        const [wx, wy] = positions[wmObj.position] || positions['bottom-right']
        ctx.globalAlpha = wmObj.opacity > 1 ? wmObj.opacity / 100 : wmObj.opacity
        ctx.drawImage(wmImg, wx, wy, wmW, wmH)
        ctx.globalAlpha = 1
        URL.revokeObjectURL(origUrl)

        // Upload new preview
        const previewBlob = await new Promise(res => canvas.toBlob(res, 'image/webp', 0.80))
        const formData = new FormData()
        formData.append('file', previewBlob, 'preview.webp')
        formData.append('key', img.preview_r2_key)
        const uploadResp = await fetch(`${workerUrl}/upload`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        })

        if (uploadResp.status === 200) {
          // Save the watermark_id that was just applied to this image
          await updateImageWatermark(img.id, wm.id)

          // Update local images state so future downloads use the new watermark_id
          setImages(prev => prev.map(i => i.id === img.id ? { ...i, watermark_id: wm.id, updated_at: new Date().toISOString() } : i))

          // Directly inject the new preview from the canvas blob — no need to re-fetch
          setCacheBusts(prev => ({ ...prev, [img.id]: Date.now() }))
          setWatermarkProgress(prev => ({ ...prev, current: prev.current + 1 }))
          const newBlobUrl = URL.createObjectURL(previewBlob)
          updatePreviewCache(img.preview_r2_key, newBlobUrl)
          setPreviewUrls(prev => {
            if (prev[img.id]?.startsWith('blob:')) URL.revokeObjectURL(prev[img.id])
            return { ...prev, [img.id]: newBlobUrl }
          })
        }
      }

      URL.revokeObjectURL(wmBlobUrl)
      setShowWatermark(false)
      setToast({ message: `Watermark applied to ${targets.length} image${targets.length !== 1 ? 's' : ''}`, type: 'success' })
    } catch (err) {
      setToast({ message: 'Watermark failed: ' + err.message, type: 'error' })
    } finally {
      setWatermarking(false)
    }
  }

  async function handleSortChange(newSort) {
    setSortBy(newSort)
    const sorted = sortImages(images, newSort)
    setImages(sorted)
    setSavingOrder(true)
    try {
      await saveImageOrder(sorted.map(i => i.id))
      setToast({ message: 'Image order saved', type: 'success' })
    } catch {
      setToast({ message: 'Failed to save order', type: 'error' })
    } finally {
      setSavingOrder(false)
    }
  }

  // Drag-to-reorder handler called by ImageGrid with the full reordered array
  async function handleImageReorder(reorderedSetImages) {
    // Merge reordered set images back into the full images array,
    // preserving images from other sets in their original positions
    const otherImages = images.filter(i => i.set_id !== activeSetId)
    const merged = [...otherImages, ...reorderedSetImages]
    setImages(merged)
    setSavingOrder(true)
    try {
      await saveImageOrder(reorderedSetImages.map(i => i.id))
    } catch {
      setToast({ message: 'Failed to save order', type: 'error' })
    } finally {
      setSavingOrder(false)
    }
  }

  async function handleSetCover(image, focusX = 0.5, focusY = 0.5, focusOnly = false) {
    try {
      if (focusOnly) {
        await updateGallery(id, { cover_focus_x: focusX, cover_focus_y: focusY })
      } else {
        await updateGallery(id, { cover_image_id: image.id, cover_r2_key: image.preview_r2_key, cover_focus_x: focusX, cover_focus_y: focusY })
        setCoverId(image.id)
      }
      // Keep local gallery state in sync so the modal re-opens with the correct focal point
      setGallery(prev => ({
        ...prev,
        cover_focus_x: focusX,
        cover_focus_y: focusY,
        ...(focusOnly ? {} : { cover_image_id: image.id, cover_r2_key: image.preview_r2_key }),
      }))
      setToast({ message: 'Cover updated', type: 'success' })
    } catch {
      setToast({ message: 'Failed to set cover', type: 'error' })
    }
  }

  async function handleCoverUpload(file, focusX = 0.5, focusY = 0.5) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const ext = file.name.split('.').pop().toLowerCase()
      const key = `photographers/${photographerId}/galleries/${id}/preview/cover-${crypto.randomUUID()}.${ext}`
      const formData = new FormData()
      formData.append('file', file)
      formData.append('key', key)
      const resp = await fetch(`${import.meta.env.VITE_R2_WORKER_URL}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      })
      if (!resp.ok) throw new Error('Upload failed')
      await updateGallery(id, { cover_r2_key: key, cover_image_id: null, cover_focus_x: focusX, cover_focus_y: focusY })
      setCoverId(null)
      // Keep local gallery state in sync so the modal re-opens with the correct focal point
      setGallery(prev => ({
        ...prev,
        cover_r2_key: key,
        cover_image_id: null,
        cover_focus_x: focusX,
        cover_focus_y: focusY,
      }))
      setToast({ message: 'Cover image uploaded', type: 'success' })
    } catch {
      setToast({ message: 'Failed to upload cover', type: 'error' })
    }
  }

  function handleSelect(imageId) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(imageId) ? next.delete(imageId) : next.add(imageId)
      return next
    })
  }

  function handleSelectAll() { setSelectedIds(new Set(images.map(i => i.id))) }
  function handleClearSelection() { setSelectedIds(new Set()) }

  async function handleDeleteSelected() {
    const toDelete = [...selectedIds]
    const { data: { session } } = await supabase.auth.getSession()
    let errors = 0
    await Promise.all(toDelete.map(async (imageId) => {
      const image = images.find(i => i.id === imageId)
      if (!image) return
      try {
        await Promise.all([
          deleteFromR2({ key: image.original_r2_key, token: session.access_token }),
          image.preview_r2_key ? deleteFromR2({ key: image.preview_r2_key, token: session.access_token }) : Promise.resolve()
        ])
        await deleteImage(imageId)
      } catch { errors++ }
    }))
    setImages(prev => prev.filter(i => !selectedIds.has(i.id)))
    setSelectedIds(new Set())
    setToast({
      message: errors > 0 ? `Deleted with ${errors} error(s)` : `${toDelete.length} images deleted`,
      type: errors > 0 ? 'error' : 'success'
    })
  }

  async function handleDeleteImage(imageId) {
    const image = images.find(i => i.id === imageId)
    if (!image) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await Promise.all([
        deleteFromR2({ key: image.original_r2_key, token: session.access_token }),
        image.preview_r2_key ? deleteFromR2({ key: image.preview_r2_key, token: session.access_token }) : Promise.resolve()
      ])
      await deleteImage(imageId)
      setImages(prev => prev.filter(i => i.id !== imageId))
      setToast({ message: 'Image deleted', type: 'success' })
    } catch (err) {
      setToast({ message: err.message, type: 'error' })
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
        style={{ borderColor: 'var(--border-strong)', borderTopColor: 'transparent' }} />
    </div>
  )

  if (error) return (
    <div className="px-4 py-3 rounded-xl text-sm"
      style={{ background: 'var(--danger-subtle)', color: 'var(--danger)' }}>
      {error}
    </div>
  )

  if (!gallery) return null

  const isExpired = gallery.expires_at && new Date(gallery.expires_at) < new Date()
  const status = !gallery.is_active ? 'inactive' : isExpired ? 'expired' : 'active'
  const statusBadge = {
    active:   <Badge variant="success">Active</Badge>,
    inactive: <Badge variant="default">Inactive</Badge>,
    expired:  <Badge variant="danger">Expired</Badge>,
  }

  return (
    <>
      {isDragOver && hasSetImages && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}>
          <div className="flex flex-col items-center justify-center w-72 h-48 rounded-2xl"
            style={{ background: 'var(--surface)', border: '2px dashed var(--accent)' }}>
            <Upload size={28} className="mb-3" style={{ color: 'var(--text-muted)' }} />
            <p className="font-semibold text-lg mb-1" style={{ color: 'var(--text)' }}>Drop to upload</p>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Release to add to this gallery</p>
          </div>
        </div>
      )}

      <div className="max-w-5xl space-y-6">
        {/* ── Mobile top bar ── */}
        <div className="flex items-center gap-2 md:hidden -mx-0 mb-2">
          <button onClick={() => navigate('/')} style={{ color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
            <ArrowLeft size={18} style={{ flexShrink: 0 }} />
            <h1 className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{gallery.title}</h1>
          </button>
          {statusBadge[status]}
          <button onClick={openSheet} style={{ color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}>
            <MoreVertical size={18} />
          </button>
        </div>

        {/* ── Desktop header ── */}
        <div className="hidden md:block">
          <PageBreadcrumb crumbs={[
            { label: 'Galleries', to: '/', toState: { restoreFolderPath: [] } },
            ...(location.state?.folderPath || []).map((f, i, arr) => ({
              label: f.name,
              to: '/',
              toState: { restoreFolderPath: arr.slice(0, i + 1) },
            })),
            { label: gallery.title },
          ]} />
        </div>

        <div className="hidden md:block">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>{gallery.title}</h1>
                {statusBadge[status]}
              </div>
              {/* Line 1: client name · event name */}
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {[gallery.client_name, gallery.event_name].filter(Boolean).join(' · ')}
              </p>
              {/* Linked client CRM badge */}
              {gallery.client_id && (
                <button
                  onClick={() => navigate(`/clients/${gallery.client_id}`)}
                  className="inline-flex items-center gap-1 mt-1 text-xs px-2 py-0.5 rounded-md"
                  style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.18)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(99,102,241,0.1)'}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  Client record
                </button>
              )}
              {/* Line 2: dates */}
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {[
                  gallery.event_date && `Event ${formatDate(gallery.event_date)}`,
                  `Created ${formatDate(gallery.created_at)}`,
                  gallery.expires_at && `Expires ${formatDate(gallery.expires_at)}`,
                ].filter(Boolean).join(' · ')}
              </p>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <ShareButton gallery={gallery} />
              <Button variant="secondary" onClick={() => setShowCoverPicker(true)}>
                <ImageIcon size={14} />Cover Image
              </Button>
              <Button variant="secondary" onClick={() => window.open(`/g/${gallery.share_token}?preview=1`, '_blank')}>
                <ExternalLink size={14} />Preview
              </Button>
              <Link to={`/galleries/${id}/activity`}>
                <Button variant="secondary"><BarChart2 size={14} />Activity</Button>
              </Link>
              <Link to={`/galleries/${id}/settings`}>
                <Button variant="secondary"><Settings size={14} />Settings</Button>
              </Link>
            </div>
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--border)' }} />

        {/* ── Set tabs — horizontally scrollable strip ── */}
        {sets.length > 0 && (
          <div className="overflow-x-auto -mx-1 px-1 pb-1" style={{ scrollbarWidth: 'none' }}>
            <div className="flex items-center gap-1 min-w-max">
              {sets.map(set => (
                <div key={set.id} className="relative shrink-0"
                  onDragOver={e => handleSetDragOver(e, set.id)}
                  onDrop={e => handleSetDrop(e, set.id)}
                  style={{ opacity: dragSetId === set.id ? 0.4 : 1 }}>

                  {editingSet === set.id ? (
                    <div className="flex items-center gap-1">
                      <input
                        autoFocus
                        value={editSetName}
                        onChange={e => setEditSetName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleUpdateSet(set.id); if (e.key === 'Escape') setEditingSet(null) }}
                        onBlur={() => handleUpdateSet(set.id)}
                        className="text-sm px-2 py-1.5 rounded-lg"
                        style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-strong)', color: 'var(--text)', outline: 'none', minWidth: 80 }}
                      />
                    </div>
                  ) : (
                    <div className="flex items-center">
                      {/* Tab button */}
                      <button
                        onClick={() => setActiveSetId(set.id)}
                        draggable
                        onDragStart={e => handleSetDragStart(e, set.id)}
                        onDragEnd={() => { setDragSetId(null); setDragOverSetId(null) }}
                        className="flex items-center gap-1.5 pl-3 pr-2 text-sm font-medium transition-colors"
                        style={{
                          height: 32,
                          background: activeSetId === set.id ? '#6366f1' : 'var(--surface)',
                          color: activeSetId === set.id ? '#fff' : 'var(--text-muted)',
                          borderTop: `1px solid ${activeSetId === set.id ? '#6366f1' : 'var(--border)'}`,
                          borderBottom: `1px solid ${activeSetId === set.id ? '#6366f1' : 'var(--border)'}`,
                          borderLeft: `1px solid ${activeSetId === set.id ? '#6366f1' : 'var(--border)'}`,
                          borderRight: 'none',
                          cursor: 'pointer',
                          outline: dragOverSetId === set.id && dragSetId !== set.id ? '2px solid #6366f1' : 'none',
                          borderRadius: '8px 0 0 8px',
                        }}>
                        {set.name}
                        <span className="text-xs opacity-70">({images.filter(i => i.set_id === set.id).length})</span>
                      </button>

                      {/* ••• set menu button */}
                      <div className="relative">
                        <button
                          data-set-menu-btn="true"
                          onClick={e => {
                            e.stopPropagation()
                            const rect = e.currentTarget.getBoundingClientRect()
                            setSetMenuPos({ top: rect.bottom + 6, left: rect.left })
                            setSetMenuOpenId(prev => prev === set.id ? null : set.id)
                          }}
                          className="flex items-center justify-center px-1.5 transition-colors"
                          style={{
                            height: 32,
                            background: activeSetId === set.id ? '#5558e3' : 'var(--surface-raised)',
                            color: activeSetId === set.id ? 'rgba(255,255,255,0.8)' : 'var(--text-muted)',
                            border: `1px solid ${activeSetId === set.id ? '#6366f1' : 'var(--border)'}`,
                            cursor: 'pointer',
                            borderRadius: '0 8px 8px 0',
                          }}>
                          <MoreVertical size={12} />
                        </button>

                        {setMenuOpenId === set.id && (
                          <div className="fixed rounded-xl shadow-xl overflow-hidden"
                            style={{ top: setMenuPos.top, left: setMenuPos.left, background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 160, zIndex: 1000 }}>
                            <button onClick={() => { setEditingSet(set.id); setEditSetName(set.name); setSetMenuOpenId(null) }}
                              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left"
                              style={{ color: 'var(--text)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                              <Pencil size={13} style={{ color: 'var(--text-muted)' }} /> Rename
                            </button>
                            {activeSetImages.length > 0 && (
                              <button onClick={() => { handleOpenWatermark(null); setSetMenuOpenId(null) }}
                                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left"
                                style={{ color: 'var(--text)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                <Droplets size={13} style={{ color: 'var(--text-muted)' }} /> Watermark set
                              </button>
                            )}
                            {sets.length > 1 && (
                              <>
                                <div style={{ borderTop: '1px solid var(--border)' }} />
                                <button onClick={() => { setConfirmDeleteSetId(set.id); setSetMenuOpenId(null) }}
                                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left"
                                  style={{ color: 'var(--danger)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                                  onMouseEnter={e => e.currentTarget.style.background = 'var(--danger-subtle)'}
                                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                  <Trash2 size={13} /> Delete set
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Add set */}
              {showAddSet ? (
                <div className="flex items-center gap-1 shrink-0">
                  <input
                    autoFocus
                    value={newSetName}
                    onChange={e => setNewSetName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddSet(); if (e.key === 'Escape') { setShowAddSet(false); setNewSetName('') } }}
                    placeholder="Set name"
                    className="text-sm px-2 py-1.5 rounded-lg"
                    style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-strong)', color: 'var(--text)', outline: 'none', minWidth: 100 }}
                  />
                  <button onClick={handleAddSet}
                    className="text-xs px-2.5 py-1.5 rounded-lg font-medium"
                    style={{ background: '#6366f1', color: '#fff', cursor: 'pointer' }}>Add</button>
                  <button onClick={() => { setShowAddSet(false); setNewSetName('') }}
                    className="text-xs px-2.5 py-1.5 rounded-lg"
                    style={{ color: 'var(--text-muted)', cursor: 'pointer' }}>Cancel</button>
                </div>
              ) : (
                <button onClick={() => setShowAddSet(true)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs shrink-0"
                  style={{ color: 'var(--text-muted)', border: '1px dashed var(--border)', cursor: 'pointer' }}>
                  <Plus size={11} />New Set
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Images for active set ── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="font-medium text-sm" style={{ color: 'var(--text)' }}>
              Images ({activeSetImages.length})
              {savingOrder && <span className="ml-2 text-xs font-normal" style={{ color: 'var(--text-muted)' }}>Saving order...</span>}
            </h2>
            <div className="flex items-center gap-2">
              {/* Desktop: sort + grid controls */}
              {hasSetImages && <div className="hidden md:block"><SortDropdown value={sortBy} onChange={handleSortChange} /></div>}
              {hasSetImages && (
                <div className="relative hidden md:block">
                  <button
                    onClick={() => setShowGridMenu(v => !v)}
                    className="flex items-center justify-center rounded-lg"
                    style={{
                      width: 32, height: 32,
                      background: showGridMenu ? 'var(--surface-raised)' : 'var(--surface)',
                      border: '1px solid var(--border)',
                      cursor: 'pointer',
                      color: 'var(--text-muted)',
                    }}>
                    <LayoutGrid size={14} />
                  </button>
                  {showGridMenu && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setShowGridMenu(false)} />
                      <div className="absolute right-0 top-full mt-1 rounded-xl shadow-lg z-40 overflow-hidden"
                        style={{ background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 160 }}>
                        <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
                          <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Grid Size</p>
                        </div>
                        {[['small', 'Small'], ['large', 'Large']].map(([val, label]) => (
                          <button key={val} onClick={() => setViewSize(val)}
                            className="w-full flex items-center justify-between px-3 py-2.5 text-sm"
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text)' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-raised)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            {label}
                            {viewSize === val && <Check size={13} style={{ color: '#6366f1' }} />}
                          </button>
                        ))}
                        <div className="px-3 py-2" style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
                          <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Show</p>
                        </div>
                        <div className="flex items-center justify-between px-3 py-2.5">
                          <span className="text-sm" style={{ color: 'var(--text)' }}>Filename</span>
                          <button
                            onClick={() => setShowFilename(v => !v)}
                            style={{
                              width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
                              background: showFilename ? '#6366f1' : 'var(--border)',
                              position: 'relative', transition: 'background 0.2s',
                            }}>
                            <span style={{
                              position: 'absolute', top: 2, left: showFilename ? 18 : 2,
                              width: 16, height: 16, borderRadius: '50%', background: '#fff',
                              transition: 'left 0.2s',
                            }} />
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
              {/* Mobile: single Filters button */}
              {hasSetImages && (
                <button
                  onClick={() => { setShowGalleryFilters(true); setGalleryFiltersSubScreen(null) }}
                  className="flex items-center justify-center rounded-lg md:hidden"
                  style={{ width: 32, height: 32, background: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-muted)' }}
                  aria-label="Sort and display options">
                  <SlidersHorizontal size={14} />
                </button>
              )}
              {hasImages && <ImageUploader onUpload={uploadFiles} compact />}
            </div>
          </div>

          {storageError && (
            <div className="px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444' }}>
              <span className="font-medium">Storage limit reached. </span>{storageError.replace('Not enough storage. ', '')}
            </div>
          )}
          {uploadItems.length > 0 && <UploadProgress items={uploadItems} />}

          {hasSetImages && (
            <ImageGrid
              images={activeSetImages}
              previewUrls={previewUrls}
              onDelete={handleDeleteImage}
              coverId={coverId}
              selectedIds={selectedIds}
              onSelect={handleSelect}
              selectionMode={selectedIds.size > 0}
              sets={sets}
              onMoveToSet={handleMoveImage}
              onReWatermark={handleOpenWatermark}
              onDownload={handleDownloadImage}
              onReorder={handleImageReorder}
              viewSize={viewSize}
              showFilename={showFilename}
              onSetAsCover={handleSetAsCover}
              onRename={handleRename}
              onReplace={handleReplace}
              onOpen={img => { const idx = activeSetImages.findIndex(i => i.id === img.id); setLightboxIndex(idx >= 0 ? idx : 0) }}
              bookmarkedImageIds={bookmarkedImageIds}
              onBookmark={handleBookmarkImage}
              onUnbookmark={handleUnbookmarkImage}
            />
          )}

          {!hasSetImages && !isUploading && activeSetId && (
            <ImageUploader onUpload={uploadFiles} />
          )}
        </div>


      </div>

      {selectedIds.size > 0 && (
        <BulkActionBar
          count={selectedIds.size}
          totalCount={activeSetImages.length}
          onClearSelection={handleClearSelection}
          onSelectAll={() => setSelectedIds(new Set(activeSetImages.map(i => i.id)))}
          onDeleteSelected={handleDeleteSelected}
          sets={sets.filter(s => s.id !== activeSetId)}
          onMoveToSet={handleMoveSelected}
          onWatermarkSelected={() => { setWatermarkTarget('bulk'); handleOpenWatermark('bulk') }}
          onDownloadSelected={async (hires) => {
            const selected = images.filter(i => selectedIds.has(i.id))
            setSelectedIds(new Set())
            await doPhotographerZipDownload(selected, hires)
          }}
        />
      )}

      {showCoverPicker && (
        <CoverPickerModal
          images={images}
          previewUrls={previewUrls}
          onSelect={handleSetCover}
          onUpload={handleCoverUpload}
          onClose={() => { setShowCoverPicker(false); setCoverPickerImage(null) }}
          preSelectedImage={coverPickerImage}
          existingCoverUrl={
            gallery.cover_r2_key
              ? `${import.meta.env.VITE_R2_WORKER_URL}/preview/${encodeURIComponent(gallery.cover_r2_key)}`
              : coverId && previewUrls[coverId]
                ? previewUrls[coverId]
                : null
          }
          existingFocusX={gallery.cover_focus_x ?? 0.5}
          existingFocusY={gallery.cover_focus_y ?? 0.5}
        />
      )}

      {/* ── Delete set confirm ── */}
      {confirmDeleteSetId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={() => setConfirmDeleteSetId(null)}>
          <div className="rounded-2xl p-5 space-y-3 max-w-xs w-full"
            style={{ background: 'var(--surface)', border: '1px solid var(--danger)' }}
            onClick={e => e.stopPropagation()}>
            <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
              Delete "{sets.find(s => s.id === confirmDeleteSetId)?.name}"?
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>All images in this set will also be permanently deleted. This cannot be undone.</p>
            <div className="flex gap-2 pt-1">
              <button onClick={() => handleDeleteSet(confirmDeleteSetId)}
                className="text-sm px-4 py-2 rounded-xl font-medium"
                style={{ background: 'var(--danger)', color: '#fff', cursor: 'pointer' }}>Delete</button>
              <button onClick={() => setConfirmDeleteSetId(null)}
                className="text-sm px-4 py-2 rounded-xl"
                style={{ background: 'var(--surface-raised)', color: 'var(--text)', cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Watermark modal ── */}
      {showWatermark && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
          onClick={() => !watermarking && setShowWatermark(false)}>
          <div className="w-full max-w-sm rounded-2xl p-6 space-y-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Watermark</h3>
              {!watermarking && (
                <button onClick={() => setShowWatermark(false)} style={{ color: 'var(--text-muted)', cursor: 'pointer' }}><X size={16} /></button>
              )}
            </div>
            <div className="px-3 py-2.5 rounded-xl text-sm"
              style={{ background: 'var(--warning-subtle)', color: 'var(--warning)' }}>
              {watermarkTarget === 'bulk'
                ? `This will replace the preview for ${selectedIds.size} selected image${selectedIds.size !== 1 ? 's' : ''}.`
                : watermarkTarget
                ? 'This will replace the current preview for this image.'
                : `This will replace the preview for all ${activeSetImages.length} images in this set.`}
              {' '}It may take a moment.
            </div>
            <div>
              <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-muted)' }}>Select watermark</label>
              <select
                value={selectedWatermarkId || ''}
                onChange={e => setSelectedWatermarkId(e.target.value)}
                style={{
                  width: '100%', background: 'var(--surface)', border: '1px solid var(--border)',
                  color: 'var(--text)', borderRadius: '8px', padding: '9px 12px', fontSize: '14px',
                  outline: 'none', cursor: 'pointer', appearance: 'none',
                }}>
                {watermarks.map(wm => (
                  <option key={wm.id} value={wm.id}>{wm.label}</option>
                ))}
              </select>
            </div>
            {watermarking ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
                  <span>Processing {watermarkProgress.current} of {watermarkProgress.total}...</span>
                  <span>{watermarkProgress.total > 0 ? Math.round((watermarkProgress.current / watermarkProgress.total) * 100) : 0}%</span>
                </div>
                <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-raised)' }}>
                  <div className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${watermarkProgress.total > 0 ? (watermarkProgress.current / watermarkProgress.total) * 100 : 0}%`, background: '#6366f1' }} />
                </div>
                <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
                  Please keep this window open until complete.
                </p>
              </div>
            ) : (
              <div className="flex gap-2">
                <button onClick={handleWatermark} disabled={!selectedWatermarkId}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                  style={{ background: '#6366f1', color: '#fff', cursor: 'pointer' }}>
                  Apply Watermark
                </button>
                <button onClick={() => setShowWatermark(false)}
                  className="px-4 py-2.5 rounded-xl text-sm"
                  style={{ background: 'var(--surface-raised)', color: 'var(--text)', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {downloadingZip && zipProgress && (
        <div className="fixed inset-0 z-60 flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-xs rounded-2xl p-6 space-y-5"
            style={{ background: '#1e1e1e', border: '1px solid #333' }}>
            <div className="flex flex-col items-center gap-3 pt-1">
              <div className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(99,102,241,0.1)' }}>
                {zipProgress.hires && zipProgress.current < zipProgress.total ? (
                  <div className="w-5 h-5 border-2 rounded-full animate-spin"
                    style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                )}
              </div>
              <div className="text-center space-y-1">
                <p className="font-semibold text-sm" style={{ color: '#f0f0f0' }}>
                  {zipProgress.current >= zipProgress.total ? 'Download ready!' : zipProgress.hires ? 'Preparing your download…' : 'Processing photos…'}
                </p>
                <p className="text-xs" style={{ color: '#9ca3af' }}>
                  {zipProgress.current >= zipProgress.total
                    ? 'Your ZIP file is downloading now.'
                    : zipProgress.hires
                    ? `Packaging ${zipProgress.total} photo${zipProgress.total !== 1 ? 's' : ''} — this may take a moment.`
                    : `Processing photo ${Math.min(zipProgress.current + 1, zipProgress.total)} of ${zipProgress.total}`}
                </p>
              </div>
            </div>
            {!zipProgress.hires && (
              <div className="space-y-1.5">
                <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: '#2a2a2a' }}>
                  <div className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${zipProgress.total > 0 ? Math.round((zipProgress.current / zipProgress.total) * 100) : 0}%`, background: '#6366f1' }} />
                </div>
                <div className="flex justify-between text-xs" style={{ color: '#6b7280' }}>
                  <span>{zipProgress.current} of {zipProgress.total} photos</span>
                  <span>{zipProgress.total > 0 ? Math.round((zipProgress.current / zipProgress.total) * 100) : 0}%</span>
                </div>
              </div>
            )}
            {zipProgress.hires && zipProgress.current < zipProgress.total && (
              <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: '#2a2a2a' }}>
                <div className="h-full rounded-full animate-pulse" style={{ width: '60%', background: '#6366f1' }} />
              </div>
            )}
            <p className="text-xs text-center" style={{ color: '#4b5563' }}>Please keep this window open until complete.</p>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50">
          <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
        </div>
      )}

      {/* ── Mobile action sheet ── */}
      {/* ── Mobile gallery filters sheet ── */}
      <div className="md:hidden">
        <BottomSheet open={showGalleryFilters} onClose={() => setShowGalleryFilters(false)}>
          {galleryFiltersSubScreen === null && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 20px 12px', borderBottom: '0.5px solid var(--border)', flexShrink: 0 }}>
                <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--text)' }}>Sort &amp; display</span>
              </div>
              <button style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 20px', borderBottom: '0.5px solid var(--border)', cursor: 'pointer', background: 'none', width: '100%', textAlign: 'left' }}
                onClick={() => setGalleryFiltersSubScreen('sort')}>
                <span style={{ fontSize: 15, color: 'var(--text)' }}>Sort</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--text-muted)' }}>
                  {sortBy === 'custom' ? 'Custom order' : sortBy === 'name_asc' ? 'Name: A → Z' : sortBy === 'name_desc' ? 'Name: Z → A' : sortBy === 'date_asc' ? 'Date: Old → New' : 'Date: New → Old'}
                  <ChevronRight size={14} />
                </span>
              </button>
              <button style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 20px', borderBottom: '0.5px solid var(--border)', cursor: 'pointer', background: 'none', width: '100%', textAlign: 'left' }}
                onClick={() => setGalleryFiltersSubScreen('grid')}>
                <span style={{ fontSize: 15, color: 'var(--text)' }}>Grid size</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--text-muted)' }}>
                  {viewSize === 'small' ? 'Small' : 'Large'}
                  <ChevronRight size={14} />
                </span>
              </button>
              <button style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 20px', cursor: 'pointer', background: 'none', width: '100%', textAlign: 'left' }}
                onClick={() => setShowFilename(v => !v)}>
                <span style={{ fontSize: 15, color: 'var(--text)' }}>Show filename</span>
                <div style={{ width: 36, height: 20, borderRadius: 10, background: showFilename ? '#6366f1' : 'var(--border)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                  <span style={{ position: 'absolute', top: 2, left: showFilename ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                </div>
              </button>
              <div style={{ padding: '12px 16px 24px' }}>
                <button onClick={() => setShowGalleryFilters(false)} style={{ width: '100%', padding: 13, borderRadius: 12, background: '#6366f1', color: '#fff', border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>Done</button>
              </div>
            </>
          )}
          {galleryFiltersSubScreen === 'sort' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', padding: '4px 20px 12px', borderBottom: '0.5px solid var(--border)', flexShrink: 0 }}>
                <button onClick={() => setGalleryFiltersSubScreen(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', display: 'flex', alignItems: 'center', gap: 2, fontSize: 14, padding: 0, marginRight: 'auto' }}>
                  <ChevronLeft size={16} /> Back
                </button>
                <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--text)', position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>Sort</span>
              </div>
              {[['date_desc', 'Date: New → Old'], ['date_asc', 'Date: Old → New'], ['name_asc', 'Name: A → Z'], ['name_desc', 'Name: Z → A'], ['custom', 'Custom order']].map(([val, label]) => (
                <button key={val}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 20px', borderBottom: '0.5px solid var(--border)', cursor: 'pointer', background: 'none', width: '100%', textAlign: 'left' }}
                  onClick={() => { handleSortChange(val); setGalleryFiltersSubScreen(null) }}>
                  <span style={{ fontSize: 15, color: 'var(--text)' }}>{label}</span>
                  {sortBy === val && <Check size={14} style={{ color: '#6366f1' }} />}
                </button>
              ))}
            </>
          )}
          {galleryFiltersSubScreen === 'grid' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', padding: '4px 20px 12px', borderBottom: '0.5px solid var(--border)', flexShrink: 0 }}>
                <button onClick={() => setGalleryFiltersSubScreen(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', display: 'flex', alignItems: 'center', gap: 2, fontSize: 14, padding: 0, marginRight: 'auto' }}>
                  <ChevronLeft size={16} /> Back
                </button>
                <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--text)', position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>Grid size</span>
              </div>
              {[['small', 'Small'], ['large', 'Large']].map(([val, label]) => (
                <button key={val}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 20px', borderBottom: '0.5px solid var(--border)', cursor: 'pointer', background: 'none', width: '100%', textAlign: 'left' }}
                  onClick={() => { setViewSize(val); setGalleryFiltersSubScreen(null) }}>
                  <span style={{ fontSize: 15, color: 'var(--text)' }}>{label}</span>
                  {viewSize === val && <Check size={14} style={{ color: '#6366f1' }} />}
                </button>
              ))}
            </>
          )}
        </BottomSheet>
      </div>

      <div className="md:hidden">
        <BottomSheet open={showActionSheet} onClose={closeSheet} maxHeight="auto">
          <div className="p-4 space-y-3">
            {/* Gallery info strip */}
            <div className="px-1 pb-2" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{gallery.title}</p>
                {statusBadge[status]}
              </div>
              {/* Line 1: client name · event name */}
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {[gallery.client_name, gallery.event_name].filter(Boolean).join(' · ')}
              </p>
              {/* Line 2: dates */}
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {[
                  gallery.event_date && `Event ${formatDate(gallery.event_date)}`,
                  `Created ${formatDate(gallery.created_at)}`,
                ].filter(Boolean).join(' · ')}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                { icon: Mail, label: 'Email', action: () => { closeSheet(); setTimeout(() => setShareModal('email'), 300) } },
                { icon: LinkIcon, label: 'Get Link', action: () => { closeSheet(); setTimeout(() => setShareModal('link'), 300) } },
                { icon: QrCode, label: 'QR Code', action: () => { closeSheet(); setTimeout(() => setShareModal('qr'), 300) } },
                { icon: ImageIcon, label: 'Cover', action: () => { closeSheet(); setTimeout(() => setShowCoverPicker(true), 300) } },
                { icon: ExternalLink, label: 'Preview', action: () => { closeSheet(); window.open(`/g/${gallery.share_token}?preview=1`, '_blank') } },
                { icon: BarChart2, label: 'Activity', action: () => { closeSheet(); setTimeout(() => navigate(`/galleries/${id}/activity`), 300) } },
                { icon: Settings, label: 'Settings', action: () => { closeSheet(); setTimeout(() => navigate(`/galleries/${id}/settings`), 300) } },
              ].map(({ icon: Icon, label, action }) => (
                <button key={label} onClick={action}
                  className="flex flex-col items-center gap-2 py-4 rounded-xl"
                  style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                  <Icon size={22} style={{ color: 'var(--text)' }} />
                  <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{label}</span>
                </button>
              ))}
            </div>
          </div>
        </BottomSheet>
      </div>

      {/* Photographer lightbox */}
      {lightboxIndex !== null && (() => {
        const lbImg = activeSetImages[lightboxIndex]
        if (!lbImg) return null
        const total = activeSetImages.length
        const goPrev = () => setLightboxIndex(i => (i - 1 + total) % total)
        const goNext = () => setLightboxIndex(i => (i + 1) % total)
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.95)' }}
            onClick={() => setLightboxIndex(null)}
            onKeyDown={e => { if (e.key === 'ArrowLeft') goPrev(); if (e.key === 'ArrowRight') goNext(); if (e.key === 'Escape') setLightboxIndex(null) }}
            tabIndex={0}
            ref={el => el?.focus()}>
            {/* Close */}
            <button onClick={() => setLightboxIndex(null)}
              className="absolute top-4 right-4 w-9 h-9 rounded-full flex items-center justify-center z-10"
              style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', cursor: 'pointer' }}>
              <X size={16} />
            </button>
            {/* Prev */}
            {total > 1 && (
              <button onClick={e => { e.stopPropagation(); goPrev() }}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center z-10"
                style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', cursor: 'pointer' }}>
                <ChevronLeft size={20} />
              </button>
            )}
            {/* Next */}
            {total > 1 && (
              <button onClick={e => { e.stopPropagation(); goNext() }}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center z-10"
                style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', cursor: 'pointer' }}>
                <ChevronRight size={20} />
              </button>
            )}
            <img
              src={previewUrls[lbImg.id]}
              alt={lbImg.file_name}
              draggable={false}
              onClick={e => e.stopPropagation()}
              style={{
                maxHeight: '90vh', maxWidth: '80vw',
                objectFit: 'contain', borderRadius: 4,
                userSelect: 'none', animation: 'lbFadeIn 0.18s ease',
              }}
            />
            {/* Footer */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
              <p className="text-xs px-3 py-1 rounded-full"
                style={{ color: 'rgba(255,255,255,0.6)', background: 'rgba(0,0,0,0.4)' }}>
                {lbImg.file_name}
              </p>
              {total > 1 && (
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  {lightboxIndex + 1} of {total}
                </p>
              )}
            </div>
            <style>{`@keyframes lbFadeIn { from { opacity:0 } to { opacity:1 } }`}</style>
          </div>
        )
      })()}

      {/* Share modals triggered from mobile sheet */}
      {shareModal && (
        <ShareButton gallery={gallery} openModal={shareModal} onModalClose={() => setShareModal(null)} mobileOnly />
      )}
    </>
  )
}
