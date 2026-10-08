import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient.js'
import { CheckCircle, Check, MessageSquare } from 'lucide-react'
import { useBookingBranding } from '../utils/bookingBranding.js'
import { useDocumentTitle } from '../hooks/useDocumentTitle.js'
import BrandHeader from '../components/booking/BrandHeader.jsx'
import BookingCover from '../components/booking/BookingCover.jsx'
import { LoadingScreen, ErrorScreen } from './SubmitForm.jsx'

// Public review page, /review/:token (v1.5.17). Built from the same
// pieces as SubmitForm.jsx -- BookingCover + top scrim + BrandHeader
// overlay, then a title card overlapping the cover with the accent left
// stripe -- so the two client-facing forms read as one family.
//
// Everything comes from one RPC (get_review_form_data, sql/086); the
// submit goes through submit_testimonial, which enforces one review per
// link, validates the chosen photo against this session's gallery, and
// raises plain-language errors this page shows as-is.
//
// Photos (the cover and the picker thumbnails) load through the worker's
// ?review_token= mode (r2-worker/src/middleware/reviewImageAccess.js),
// which only serves previews from this session's own gallery.

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL
const QUOTE_MAX = 1000
const NAME_MAX = 80
// How many photos show before "Show all" -- enough to pick from without
// turning a 150-photo gallery into a long scroll on a phone.
const INITIAL_PHOTO_COUNT = 8

// Same scrim SubmitForm.jsx / BookingHero.jsx use under the overlaid logo.
const TOP_SCRIM = 'linear-gradient(180deg, rgba(20,17,13,0.6) 0%, rgba(20,17,13,0) 100%)'

function reviewImageUrl(key, token) {
  return `${WORKER_URL}/preview/${encodeURIComponent(key)}?review_token=${encodeURIComponent(token)}`
}

async function fetchReviewData(token) {
  const { data, error } = await supabase.rpc('get_review_form_data', { p_token: token })
  if (error || !data || data.type === 'not_found') return null
  return data
}

const inputStyle = {
  width: '100%', padding: '13px 16px', border: '1.5px solid var(--bk-border)', borderRadius: 10,
  fontSize: 16, color: 'var(--bk-ink)', outline: 'none', boxSizing: 'border-box',
  background: 'var(--bk-bg-subtle)', fontFamily: 'inherit',
}

function CoverHeader({ data, token, branding, height }) {
  return (
    <div style={{ position: 'relative' }}>
      <BookingCover
        imageKey={data.cover_r2_key}
        imageUrl={data.cover_r2_key ? reviewImageUrl(data.cover_r2_key, token) : undefined}
        focusX={data.cover_focus_x ?? 0.5}
        focusY={data.cover_focus_y ?? 0.5}
        height={height}
      />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 90, background: TOP_SCRIM }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '16px 20px 0' }}>
        <BrandHeader branding={branding} overlay />
      </div>
    </div>
  )
}

function FinalVaultFooter() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 20 }}>
      <img src="/finalvault_logo.svg" alt="FinalVault" width="22" height="22" style={{ opacity: 0.7 }} />
      <span style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '13px', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9ca3af' }}>FinalVault</span>
    </div>
  )
}

// Shown after a successful submit AND when someone reopens a link that
// was already used -- both echo back what was sent.
function EchoPhoto({ photoKey, token }) {
  const [failed, setFailed] = useState(false)
  if (!photoKey || failed) return null
  return (
    <img src={reviewImageUrl(photoKey, token)} alt="" onError={() => setFailed(true)}
      style={{ display: 'block', width: '100%', height: 240, objectFit: 'cover' }} />
  )
}

function DoneScreen({ data, token, branding, bkVars, quote, name, photoKey, alreadySent, submittedAt }) {
  const studioName = branding.studio_name || 'Your photographer'
  const firstName = data.client_first_name
  const sentOn = submittedAt
    ? new Date(submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return (
    <div style={{ ...bkVars, minHeight: '100vh', background: 'var(--bk-bg)', color: 'var(--bk-ink)', fontFamily: 'var(--bk-font-body)' }}>
      <CoverHeader data={data} token={token} branding={branding} height={170} />
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '28px 20px 60px', textAlign: 'center' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', margin: '0 auto 18px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: alreadySent ? 'var(--bk-bg-subtle)' : '#dcfce7',
        }}>
          {alreadySent
            ? <MessageSquare size={26} style={{ color: 'var(--bk-muted)' }} />
            : <CheckCircle size={28} style={{ color: '#22c55e' }} />}
        </div>
        <h1 style={{ fontSize: 24, fontFamily: 'var(--bk-font-display)', fontWeight: 700, color: 'var(--bk-ink)', margin: '0 0 10px' }}>
          {alreadySent ? 'Review already sent' : (firstName ? `Thank you, ${firstName}` : 'Thank you')}
        </h1>
        <p style={{ fontSize: 15, color: 'var(--bk-muted)', margin: '0 0 20px', lineHeight: 1.6 }}>
          {alreadySent
            ? `You sent this review${sentOn ? ` on ${sentOn}` : ''}. To change it, reply to the email from ${studioName}.`
            : `Your review was sent to ${studioName}.`}
        </p>
        {quote && (
          <div style={{ textAlign: 'left', background: 'var(--bk-surface)', border: '1px solid var(--bk-border)', borderRadius: 12, overflow: 'hidden' }}>
            <EchoPhoto photoKey={photoKey} token={token} />
            <div style={{ padding: '16px 18px' }}>
              <p style={{ margin: 0, fontSize: 15, fontStyle: 'italic', color: 'var(--bk-ink)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                &ldquo;{quote}&rdquo;
              </p>
              {name && (
                <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--bk-muted)' }}>&mdash; {name}</p>
              )}
            </div>
          </div>
        )}
        <FinalVaultFooter />
      </div>
    </div>
  )
}

function PhotoPicker({ images, token, selectedId, onSelect }) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? images : images.slice(0, INITIAL_PHOTO_COUNT)

  const tileBase = {
    position: 'relative', aspectRatio: '1 / 1', borderRadius: 8, overflow: 'hidden',
    padding: 0, border: 'none', cursor: 'pointer', background: 'var(--bk-bg-subtle)',
  }
  const selectedRing = '0 0 0 2px var(--bk-surface), 0 0 0 4px var(--bk-accent)'

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8 }}>
        {visible.map(img => {
          const selected = img.id === selectedId
          return (
            <button key={img.id} type="button" onClick={() => onSelect(selected ? null : img.id)}
              aria-label={selected ? 'Selected photo' : 'Choose this photo'} aria-pressed={selected}
              style={{ ...tileBase, boxShadow: selected ? selectedRing : 'none' }}>
              <img src={reviewImageUrl(img.preview_r2_key, token)} alt="" loading="lazy"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              {selected && (
                <span style={{
                  position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: '50%',
                  background: 'var(--bk-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Check size={13} color="var(--bk-accent-button-text)" />
                </span>
              )}
            </button>
          )
        })}
        <button type="button" onClick={() => onSelect(null)} aria-pressed={selectedId === null}
          style={{
            ...tileBase, background: 'var(--bk-surface)', border: '1px dashed var(--bk-border)',
            boxShadow: selectedId === null ? selectedRing : 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, color: 'var(--bk-muted)', fontFamily: 'inherit',
          }}>
          No photo
        </button>
      </div>
      {images.length > INITIAL_PHOTO_COUNT && (
        <p style={{ fontSize: 12, color: 'var(--bk-muted)', margin: '10px 0 0' }}>
          {showAll ? `Showing all ${images.length}` : `Showing ${INITIAL_PHOTO_COUNT} of ${images.length}`}
          {' · '}
          <button type="button" onClick={() => setShowAll(s => !s)}
            style={{ background: 'none', border: 'none', padding: 0, color: 'var(--bk-accent)', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
            {showAll ? 'Show fewer' : 'Show all'}
          </button>
        </p>
      )}
    </div>
  )
}

export default function ReviewForm() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const [quote, setQuote] = useState('')
  const [name, setName] = useState('')
  const [photoId, setPhotoId] = useState(null)
  const [consent, setConsent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [done, setDone] = useState(false)

  // Called every render with a safe default before data loads (rules of
  // hooks) -- same pattern as SubmitForm.jsx.
  const branding = data?.branding || { has_microsite: false, studio_name: null, logo_r2_key: null }
  const { bkVars } = useBookingBranding(branding)
  useDocumentTitle(branding.studio_name ? `Leave a review · ${branding.studio_name}` : null, { suffix: false })

  function applyData(result) {
    setData(result)
    if (result?.type === 'found') {
      setName(prev => prev || result.default_name || '')
      // The photographer's suggested photo starts selected; the client
      // can pick another or No photo.
      if (result.suggested_image_id) setPhotoId(prev => prev ?? result.suggested_image_id)
    }
    setLoading(false)
  }

  // Same .then() shape as SubmitForm.jsx's load, with a cancelled flag
  // so a StrictMode double-mount (or a token change) can't apply a stale
  // response -- the editor load race fixed in v1.5.16.
  useEffect(() => {
    let cancelled = false
    fetchReviewData(token).then(result => { if (!cancelled) applyData(result) })
    return () => { cancelled = true }
  }, [token])

  const trimmedQuote = quote.trim()
  const trimmedName = name.trim()
  const canSubmit = trimmedQuote.length > 0 && trimmedQuote.length <= QUOTE_MAX
    && trimmedName.length > 0 && trimmedName.length <= NAME_MAX
    && consent && !submitting

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const { data: result, error } = await supabase.rpc('submit_testimonial', {
        p_token: token,
        p_quote: trimmedQuote,
        p_name: trimmedName,
        p_gallery_image_id: photoId,
        p_consent: consent,
      })
      if (error) {
        // submit_testimonial raises plain-language messages for every
        // validation failure, so they're safe to show directly.
        setSubmitError(error.message || 'Something went wrong. Please try again.')
        return
      }
      if (result?.type === 'submitted') {
        setDone(true)
      } else if (result?.type === 'already_submitted') {
        // Another tab/device got there first -- reload to show what was sent.
        setLoading(true)
        applyData(await fetchReviewData(token))
      } else {
        setData(null)
      }
    } catch (err) {
      console.error(err)
      setSubmitError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <LoadingScreen />
  if (!data) return <ErrorScreen message="This review link is invalid or no longer active." />

  if (data.type === 'submitted') {
    return <DoneScreen data={data} token={token} branding={branding} bkVars={bkVars}
      quote={data.quote} name={data.name} photoKey={data.photo_r2_key} alreadySent submittedAt={data.submitted_at} />
  }
  if (done) {
    const chosenKey = (data.images || []).find(img => img.id === photoId)?.preview_r2_key
    return <DoneScreen data={data} token={token} branding={branding} bkVars={bkVars}
      quote={trimmedQuote} name={trimmedName} photoKey={chosenKey} />
  }

  const studioName = branding.studio_name || 'Your photographer'
  const allImages = Array.isArray(data.images) ? data.images : []
  // Suggested photo first, so it's visible without "Show all".
  const suggested = allImages.find(img => img.id === data.suggested_image_id)
  const images = suggested ? [suggested, ...allImages.filter(img => img !== suggested)] : allImages
  const labelStyle = { display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--bk-ink)', marginBottom: 6 }

  return (
    <div style={{ ...bkVars, minHeight: '100vh', background: 'var(--bk-bg)', color: 'var(--bk-ink)', fontFamily: 'var(--bk-font-body)' }}>
      <CoverHeader data={data} token={token} branding={branding} height={250} />

      {/* Title card overlapping the cover's bottom edge -- same -44px
          overlap and accent stripe as SubmitForm.jsx. */}
      <div style={{ maxWidth: 720, margin: '-44px auto 0', padding: '0 16px', position: 'relative', zIndex: 2 }}>
        <div className="rounded-2xl p-5" style={{ background: 'var(--bk-surface)', border: '1px solid var(--bk-border)', position: 'relative', overflow: 'hidden', paddingLeft: 22 }}>
          <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 4, background: 'var(--bk-accent)' }} />
          {data.session_type && (
            <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--bk-accent)', margin: 0 }}>
              {data.session_type}
            </p>
          )}
          <h1 style={{ fontSize: 20, fontFamily: 'var(--bk-font-display)', fontWeight: 700, color: 'var(--bk-ink)', margin: '4px 0 0', letterSpacing: '-0.01em' }}>
            How was your session?
          </h1>
          <p style={{ fontSize: 13, color: 'var(--bk-muted)', margin: '8px 0 0', lineHeight: 1.6 }}>
            Share a few words about {data.session_name ? <strong style={{ fontWeight: 600 }}>{data.session_name}</strong> : 'your session'}.
            {' '}{studioName} will read it before anything is posted.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 80px' }}>
        <div style={{ background: 'var(--bk-surface)', border: '1px solid var(--bk-border)', borderRadius: 16, padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 26, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>

          <div>
            <label htmlFor="review-quote" style={labelStyle}>Your review <span style={{ color: '#ef4444' }}>*</span></label>
            <textarea id="review-quote" value={quote} onChange={e => setQuote(e.target.value.slice(0, QUOTE_MAX))}
              rows={6} placeholder="What was your session like?"
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
              onFocus={e => e.target.style.borderColor = 'var(--bk-accent)'}
              onBlur={e => e.target.style.borderColor = 'var(--bk-border)'} />
            <p style={{ fontSize: 11, color: 'var(--bk-muted)', margin: '4px 0 0', textAlign: 'right' }}>
              {quote.length} / {QUOTE_MAX}
            </p>
          </div>

          <div>
            <label htmlFor="review-name" style={labelStyle}>Name to show <span style={{ color: '#ef4444' }}>*</span></label>
            <input id="review-name" type="text" value={name} maxLength={NAME_MAX} autoComplete="name"
              onChange={e => setName(e.target.value)}
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = 'var(--bk-accent)'}
              onBlur={e => e.target.style.borderColor = 'var(--bk-border)'} />
          </div>

          {/* Skipped entirely when the session has no (active) gallery. */}
          {images.length > 0 && (
            <div>
              <span style={labelStyle}>Pick a photo to go with it</span>
              <p style={{ fontSize: 12, color: 'var(--bk-muted)', margin: '0 0 10px' }}>Optional. From your gallery.</p>
              <PhotoPicker images={images} token={token} selectedId={photoId} onSelect={setPhotoId} />
            </div>
          )}

          <div style={{ borderTop: '1px solid var(--bk-border)', paddingTop: 20 }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: 'var(--bk-accent)', flexShrink: 0, marginTop: 2, cursor: 'pointer' }} />
              <span style={{ fontSize: 14, color: 'var(--bk-ink)', lineHeight: 1.6 }}>
                {studioName} may show my review, name{images.length > 0 ? ', and chosen photo' : ''} on their website.
              </span>
            </label>
          </div>

          {submitError && (
            <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px' }}>
              <p style={{ fontSize: 13, color: '#dc2626', margin: 0 }}>{submitError}</p>
            </div>
          )}

          <button onClick={handleSubmit} disabled={!canSubmit}
            style={{
              width: '100%', padding: '16px 20px', borderRadius: 12, fontSize: 17, fontWeight: 700,
              border: 'none', cursor: canSubmit ? 'pointer' : 'not-allowed',
              background: canSubmit ? 'var(--bk-accent)' : 'var(--bk-border)',
              color: canSubmit ? 'var(--bk-accent-button-text)' : 'var(--bk-muted)',
              transition: 'background 0.15s', fontFamily: 'inherit',
            }}>
            {submitting ? 'Sending…' : 'Send review'}
          </button>
        </div>

        <FinalVaultFooter />
      </div>
    </div>
  )
}
