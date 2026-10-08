import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Check, Pencil, X } from 'lucide-react'
import Input from '../ui/Input.jsx'
import GalleryPickThumb from './GalleryPickThumb.jsx'
import MicrositeImagePicker from './MicrositeImagePicker.jsx'
import MicrositeFocalPointModal from './MicrositeFocalPointModal.jsx'
import { supabase } from '../../supabaseClient.js'
import { compressForUpload } from '../../utils/imageProcessor.js'
import { approveReview, rejectReview } from '../../utils/reviewApi.js'

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL

// Moved unchanged out of MicrositeEditor.jsx (v1.5.17) so Session Detail's
// Review card can approve / edit / reject with the exact same controls as
// the Website editor. Only additions: the `export`s, and PendingReviewsPanel's
// `embedded` prop (no panel chrome or header, for use inside a card).

// ── Testimonial photo controls ──────────────────────────────────────────────
// The tile (GalleryPickThumb: X to remove, crosshair to adjust focus) plus
// Choose from gallery / Upload photo, shared by the testimonial edit form
// and the pending-review edit form (v1.5.17) so both are identical. Lifted
// verbatim from SortableTestimonialRow; only t.photo_gallery_image_key
// became the photoKey prop.
export function TestimonialPhotoField({ photoKey, onUpdateFields, onRemovePhoto, onEditPhoto, onAdjustFocus }) {
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const photoInputRef = useRef(null)

  // Direct-upload path for a testimonial photo, mirroring the About
  // section's exact pattern (same /watermark-upload endpoint, same
  // photographers/{id}/logos/ key prefix -- these do NOT count toward
  // storage today, same as the studio logo/dark logo/favicon/about
  // photo uploads; the storage check only ever sums gallery_images).
  async function handlePhotoFileSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploadingPhoto(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { data: { user } } = await supabase.auth.getUser()
      // Only clean up the previous file if it was a direct upload, not a
      // gallery-picked key -- a gallery key belongs to a real client
      // photo and must never be deleted from here.
      if (photoKey && !photoKey.includes('/galleries/')) {
        await fetch(`${WORKER_URL}/delete/${encodeURIComponent(photoKey)}`, {
          method: 'DELETE', headers: { Authorization: `Bearer ${session.access_token}` }
        }).catch(() => {})
      }
      const compressedBlob = await compressForUpload(file)
      const r2Key = `photographers/${user.id}/logos/testimonial-photo-${crypto.randomUUID()}.webp`
      const formData = new FormData()
      formData.append('file', new File([compressedBlob], 'testimonial-photo.webp', { type: 'image/webp' }))
      formData.append('key', r2Key)
      const resp = await fetch(`${WORKER_URL}/watermark-upload`, {
        method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` }, body: formData
      })
      const result = await resp.json()
      if (!result.ok) throw new Error(result.error || 'Upload failed')
      onUpdateFields({ photo_gallery_image_key: r2Key, photo_focus_x: 0.5, photo_focus_y: 0.5 })
    } catch (err) {
      console.error('Testimonial photo upload error:', err)
    } finally {
      setUploadingPhoto(false)
    }
  }

  async function handleRemovePhotoClick() {
    // Same rule as upload above: only delete the underlying R2 file for
    // a direct upload, never for a gallery-sourced key.
    if (photoKey && !photoKey.includes('/galleries/')) {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        await fetch(`${WORKER_URL}/delete/${encodeURIComponent(photoKey)}`, {
          method: 'DELETE', headers: { Authorization: `Bearer ${session.access_token}` }
        })
      } catch {}
    }
    onRemovePhoto()
  }

  return (
    <div className="flex items-center gap-3">
      {photoKey ? (
        <div style={{ width: 60 }}>
          <GalleryPickThumb
            r2Key={photoKey}
            onRemove={handleRemovePhotoClick}
            onAdjustFocus={onAdjustFocus}
          />
        </div>
      ) : (
        <div style={{ width: 60, height: 60, borderRadius: 8, background: 'var(--surface-raised)', flexShrink: 0 }} />
      )}
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <button onClick={onEditPhoto} className="text-sm font-medium px-3 py-1.5 rounded-lg"
            style={{ background: 'var(--surface-raised)', color: 'var(--text)', border: '1px dashed var(--border)', cursor: 'pointer' }}>
            Choose from gallery
          </button>
          <button onClick={() => photoInputRef.current?.click()} disabled={uploadingPhoto} className="text-sm font-medium px-3 py-1.5 rounded-lg"
            style={{ background: 'var(--surface-raised)', color: 'var(--text)', border: '1px dashed var(--border)', cursor: 'pointer' }}>
            {uploadingPhoto ? 'Uploading…' : 'Upload photo'}
          </button>
        </div>
        <input ref={photoInputRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={handlePhotoFileSelect} />
      </div>
    </div>
  )
}

// ── Pending reviews (v1.5.17) ─────────────────────────────────────────────────
// Client-submitted reviews waiting for approval (sql/086). Approving calls
// approve_testimonial_submission, which adds the review to the TOP of
// microsites.testimonials on the server in one transaction -- so it's
// blocked while the editor has unsaved changes (a later Save of the stale
// local list would otherwise erase it). Reject never touches microsites,
// so it stays available. Edits only change the published copy; the
// client's original text stays on the submission (Restore puts it back).

function pendingDraft(r) {
  return {
    quote: r.quote || '',
    name: r.name || '',
    session_type: r.session_type || '',
    photo_gallery_image_key: r.photo_r2_key || null,
    photo_focus_x: 0.5,
    photo_focus_y: 0.5,
  }
}

export default function PendingReviewsPanel({ reviews, blocked = false, embedded = false, onApproved, onRejected }) {
  const [editingId, setEditingId] = useState(null)
  const [drafts, setDrafts] = useState({})
  const [busyId, setBusyId] = useState(null)
  const [confirmRejectId, setConfirmRejectId] = useState(null)
  const [errors, setErrors] = useState({})
  const [photoPickFor, setPhotoPickFor] = useState(null)
  const [focalFor, setFocalFor] = useState(null)

  const draftFor = r => drafts[r.id] || pendingDraft(r)
  const updateDraft = (r, fields) => setDrafts(prev => ({ ...prev, [r.id]: { ...(prev[r.id] || pendingDraft(r)), ...fields } }))
  const fmt = d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  async function approve(r) {
    setBusyId(r.id)
    setErrors(prev => ({ ...prev, [r.id]: null }))
    try {
      const entry = await approveReview(r.id, draftFor(r))
      setEditingId(null)
      onApproved(entry, r.id)
    } catch (err) {
      setErrors(prev => ({ ...prev, [r.id]: err.message }))
    } finally {
      setBusyId(null)
    }
  }

  async function reject(r) {
    setBusyId(r.id)
    setErrors(prev => ({ ...prev, [r.id]: null }))
    try {
      await rejectReview(r.id)
      setConfirmRejectId(null)
      onRejected(r.id)
    } catch (err) {
      setErrors(prev => ({ ...prev, [r.id]: err.message }))
    } finally {
      setBusyId(null)
    }
  }

  const pickTarget = reviews.find(r => r.id === photoPickFor)
  const focalTarget = reviews.find(r => r.id === focalFor)
  const softBtn = 'text-xs font-medium px-2.5 py-1.5 rounded-lg flex items-center gap-1.5'

  return (
    <div data-testid="pending-reviews" className={embedded ? '' : 'rounded-xl overflow-hidden'}
      style={embedded ? undefined : { border: '1px solid #C7CDF5', background: '#F5F6FF' }}>
      {!embedded && (
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <p className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}>
          Waiting for approval
          <span className="text-xs font-semibold px-1.5 rounded-full" style={{ background: '#6366f1', color: '#fff', minWidth: 20, textAlign: 'center' }}>{reviews.length}</span>
        </p>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Not on your website yet</span>
      </div>
      )}

      {reviews.map(r => {
        const d = draftFor(r)
        const isEditing = editingId === r.id
        const isBusy = busyId === r.id
        const session = r.testimonial_requests?.sessions
        const edited = d.quote !== (r.quote || '') || d.name !== (r.name || '') || d.session_type !== (r.session_type || '')
          || d.photo_gallery_image_key !== (r.photo_r2_key || null)
        const canApprove = !blocked && !isBusy && d.quote.trim() && d.name.trim()
        return (
          <div key={r.id} className={embedded ? 'px-5 py-3.5' : 'px-4 py-3'}
            style={{ borderTop: embedded ? 'none' : '1px solid #DDE1FA', background: 'var(--surface)' }}>
            {isEditing ? (
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase" style={{ color: '#6366f1', letterSpacing: '0.04em' }}>
                  Editing review from {r.name}
                </div>
                <Input label="Quote" value={d.quote} onChange={v => updateDraft(r, { quote: v })} type="textarea" placeholder="What the client said" />
                <div className="grid grid-cols-2 gap-2">
                  <Input label="Client name" value={d.name} onChange={v => updateDraft(r, { name: v })} placeholder="e.g. Jordan M." />
                  <Input label="Session type" value={d.session_type} onChange={v => updateDraft(r, { session_type: v })} placeholder="e.g. Studio Session" />
                </div>
                <TestimonialPhotoField
                  photoKey={d.photo_gallery_image_key}
                  onUpdateFields={fields => updateDraft(r, fields)}
                  onRemovePhoto={() => updateDraft(r, { photo_gallery_image_key: null })}
                  onEditPhoto={() => setPhotoPickFor(r.id)}
                  onAdjustFocus={() => setFocalFor(r.id)}
                />
                {edited && (
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Edited from what {r.name} sent.{' '}
                    <button onClick={() => setDrafts(prev => ({ ...prev, [r.id]: pendingDraft(r) }))}
                      style={{ background: 'none', border: 'none', padding: 0, color: '#6366f1', cursor: 'pointer', fontSize: 12 }}>
                      Restore original
                    </button>
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <button onClick={() => approve(r)} disabled={!canApprove} className="text-sm font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5"
                    style={{ background: canApprove ? '#6366f1' : 'var(--surface-raised)', color: canApprove ? '#fff' : 'var(--text-muted)', border: 'none', cursor: canApprove ? 'pointer' : 'not-allowed' }}>
                    <Check size={13} />{isBusy ? 'Approving…' : 'Approve'}
                  </button>
                  <button onClick={() => setEditingId(null)} className="text-sm font-medium px-3 py-1.5 rounded-lg"
                    style={{ background: 'none', color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-3">
                <div style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: 'var(--surface-raised)' }}>
                  {d.photo_gallery_image_key && <GalleryPickThumb r2Key={d.photo_gallery_image_key} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm italic" style={{ color: 'var(--text)', whiteSpace: 'pre-wrap', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    &ldquo;{d.quote}&rdquo;
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    &mdash; {d.name}{d.session_type ? ` · ${d.session_type}` : ''}
                    {session?.id && <> · <Link to={`/sessions/${session.id}`} style={{ color: '#6366f1', textDecoration: 'none' }}>{session.name}</Link></>}
                    {' · '}{fmt(r.submitted_at)}
                    {edited && ' · Edited'}
                  </p>
                  {confirmRejectId === r.id ? (
                    <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-xl" style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)' }}>
                      <p className="text-xs flex-1 font-medium" style={{ color: 'var(--danger)' }}>Reject this review? It won't be shown, and {r.name} won't be notified.</p>
                      <button onClick={() => reject(r)} disabled={isBusy} className="text-xs font-medium px-2.5 py-1 rounded-lg"
                        style={{ background: 'var(--danger)', color: '#fff', border: 'none', cursor: 'pointer' }}>
                        {isBusy ? 'Rejecting…' : 'Reject'}
                      </button>
                      <button onClick={() => setConfirmRejectId(null)} className="text-xs font-medium px-2.5 py-1 rounded-lg"
                        style={{ background: 'var(--surface-raised)', color: 'var(--text)', border: 'none', cursor: 'pointer' }}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      <button onClick={() => approve(r)} disabled={!canApprove} className={softBtn}
                        style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', border: 'none', cursor: canApprove ? 'pointer' : 'not-allowed', opacity: canApprove ? 1 : 0.45 }}>
                        <Check size={12} />{isBusy ? 'Approving…' : 'Approve'}
                      </button>
                      <button onClick={() => setEditingId(r.id)} disabled={blocked} className={softBtn}
                        style={{ background: 'var(--surface-raised)', color: 'var(--text)', border: 'none', cursor: blocked ? 'not-allowed' : 'pointer', opacity: blocked ? 0.45 : 1 }}>
                        <Pencil size={12} />Edit
                      </button>
                      <button onClick={() => setConfirmRejectId(r.id)} className={softBtn}
                        style={{ background: 'var(--danger-subtle)', color: 'var(--danger)', border: 'none', cursor: 'pointer' }}>
                        <X size={12} />Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
            {errors[r.id] && <p className="text-xs mt-2" style={{ color: 'var(--danger)' }}>{errors[r.id]}</p>}
          </div>
        )
      })}

      {blocked && (
        <div className="flex items-center gap-2 px-4 py-2 text-xs" style={{ background: 'var(--warning-subtle)', color: '#92400e', borderTop: '1px solid rgba(245,158,11,0.25)' }}>
          You have unsaved changes on this page. Save them before approving or editing reviews.
        </div>
      )}

      {pickTarget && (
        <MicrositeImagePicker
          onSelect={key => { updateDraft(pickTarget, { photo_gallery_image_key: key, photo_focus_x: 0.5, photo_focus_y: 0.5 }); setPhotoPickFor(null) }}
          onClose={() => setPhotoPickFor(null)}
        />
      )}
      {focalTarget && draftFor(focalTarget).photo_gallery_image_key && (
        <MicrositeFocalPointModal
          r2Key={draftFor(focalTarget).photo_gallery_image_key}
          initialFocusX={draftFor(focalTarget).photo_focus_x ?? 0.5}
          initialFocusY={draftFor(focalTarget).photo_focus_y ?? 0.5}
          onSave={(x, y) => { updateDraft(focalTarget, { photo_focus_x: x, photo_focus_y: y }); setFocalFor(null) }}
          onClose={() => setFocalFor(null)}
        />
      )}
    </div>
  )
}
