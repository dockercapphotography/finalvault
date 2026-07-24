import { useState, useEffect } from 'react'
import { AlertTriangle, Play } from 'lucide-react'
import { supabase } from '../../supabaseClient.js'
import { generateWebJpeg } from '../../utils/imageProcessor.js'
import { uploadToR2, buildWebKey } from '../../utils/r2.js'
import SettingsSection from '../ui/SettingsSection.jsx'

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL

// One-time maintenance tool: backfills web_r2_key for images that predate
// the "generate web JPEG at upload time" feature (or otherwise never got
// one). Deliberately scoped to the CURRENT photographer's own images only
// -- runs entirely within normal RLS, no cross-tenant admin bypass needed.
// Uses the same generateWebJpeg() pipeline the upload flow uses, so the
// backfilled files are identical in kind to what a fresh upload produces.
// Fetches originals via the unthrottled /original/ endpoint (not the
// rate-limited /download/), since this can process hundreds of images in
// one run. Sequential, one image at a time, to keep peak memory bounded --
// same reasoning as the ZIP download loops elsewhere in this app.
export default function WebImageBackfillSection({ user }) {
  const [images, setImages] = useState(null)
  const [watermarkMap, setWatermarkMap] = useState({})
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [failures, setFailures] = useState([])
  const [done, setDone] = useState(false)

  useEffect(() => { if (user) loadMissing() }, [user])

  async function loadMissing() {
    const { data: galleries, error: galErr } = await supabase
      .from('galleries')
      .select('id')
      .eq('photographer_id', user.id)
    if (galErr) { console.error(galErr); return }

    const galleryIds = (galleries || []).map(g => g.id)
    if (galleryIds.length === 0) { setImages([]); setWatermarkMap({}); return }

    const [{ data: imgs, error: imgErr }, { data: wms, error: wmErr }] = await Promise.all([
      supabase
        .from('gallery_images')
        .select('id, gallery_id, original_r2_key, file_name, watermark_id')
        .in('gallery_id', galleryIds)
        .is('web_r2_key', null)
        .is('deleted_at', null),
      supabase
        .from('watermarks')
        .select('id, r2_key, opacity, position, scale')
        .eq('photographer_id', user.id),
    ])
    if (imgErr) { console.error(imgErr); return }
    if (wmErr) { console.error(wmErr); return }

    setImages(imgs || [])
    const map = {}
    for (const wm of wms || []) map[wm.id] = wm
    setWatermarkMap(map)
  }

  async function runBackfill() {
    if (!images || images.length === 0) return
    setRunning(true)
    setDone(false)
    setFailures([])
    setProgress({ current: 0, total: images.length })

    const { data: { session } } = await supabase.auth.getSession()
    const token = session.access_token
    const newFailures = []

    for (let i = 0; i < images.length; i++) {
      const img = images[i]
      try {
        const originalResp = await fetch(`${WORKER_URL}/original/${encodeURIComponent(img.original_r2_key)}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!originalResp.ok) throw new Error(`Fetch original failed (${originalResp.status})`)
        const originalBlob = await originalResp.blob()
        const file = new File([originalBlob], img.file_name, { type: originalBlob.type })

        let watermark = null
        const wm = img.watermark_id ? watermarkMap[img.watermark_id] : null
        if (wm) {
          watermark = {
            url: `${WORKER_URL}/watermark/${encodeURIComponent(wm.r2_key)}?token=${token}`,
            opacity: wm.opacity,
            position: wm.position,
            scale: wm.scale,
          }
        }

        const webBlob = await generateWebJpeg(file, watermark)
        const webKey = buildWebKey(user.id, img.gallery_id, img.id)

        await uploadToR2({
          file: new File([webBlob], `${img.id}.jpg`, { type: 'image/jpeg' }),
          key: webKey,
          token,
        })

        const { error: updateErr } = await supabase
          .from('gallery_images')
          .update({ web_r2_key: webKey, web_size: webBlob.size })
          .eq('id', img.id)
        if (updateErr) throw updateErr
      } catch (err) {
        console.error(`Backfill failed for ${img.file_name}:`, err)
        newFailures.push({ fileName: img.file_name, error: err.message })
      }

      setProgress({ current: i + 1, total: images.length })
    }

    setFailures(newFailures)
    setRunning(false)
    setDone(true)
    // Refresh the missing-count so a re-run only picks up genuine failures.
    await loadMissing()
  }

  if (images === null) return null

  return (
    <SettingsSection
      title="Web image backfill"
      description="Generates the missing web-size JPEG for any image that doesn't have one yet -- needed for web-size ZIP downloads to work without falling back to a slower, less reliable server-side path.">
      <div className="rounded-xl px-5 py-4" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
        {images.length === 0 && !running ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {done ? 'All done -- nothing left to backfill.' : 'No images are missing a web-size file.'}
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm" style={{ color: 'var(--text)' }}>
                {images.length} image{images.length === 1 ? '' : 's'} missing a web-size file
              </p>
              {!running && (
                <button onClick={runBackfill}
                  className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg"
                  style={{ background: '#6366f1', color: '#fff', cursor: 'pointer', border: 'none' }}>
                  <Play size={14} /> Start backfill
                </button>
              )}
            </div>

            {running && (
              <div className="mt-3">
                <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                  <div className="h-full rounded-full transition-all" style={{
                    width: `${(progress.current / progress.total) * 100}%`,
                    background: '#6366f1',
                  }} />
                </div>
                <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
                  {progress.current} of {progress.total}
                </p>
              </div>
            )}

            {done && failures.length > 0 && (
              <div className="mt-3 flex items-start gap-2">
                <AlertTriangle size={16} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 1 }} />
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {failures.length} image{failures.length === 1 ? '' : 's'} failed and can be retried by running this again
                  (check the browser console for details).
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </SettingsSection>
  )
}
