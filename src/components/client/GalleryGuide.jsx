import { useState, useEffect } from 'react'
import { Download, Heart, MessageCircle, X } from 'lucide-react'

function getGuideKey(galleryId) {
  return `fv-guide-seen-${galleryId}`
}

function buildSteps(gallery) {
  const steps = []

  steps.push({
    key: 'welcome',
    icon: null,
    title: 'Welcome to your gallery',
    description: 'Your photos are ready. Here\'s a quick look at everything you can do.',
  })

  if (gallery.allow_downloads) {
    const hasWeb = gallery.download_watermarked
    const hasHires = gallery.allow_hires_download
    let desc = 'Tap the download icon on any photo to save it to your device.'
    if (hasWeb && hasHires) {
      desc = 'Tap the download icon on any photo to save it to your device. Web size and high-resolution options are available.'
    } else if (hasHires) {
      desc = 'Tap the download icon on any photo to download the full high-resolution original to your device.'
    } else if (hasWeb) {
      desc = 'Tap the download icon on any photo to download a web-size version to your device.'
    }
    steps.push({
      key: 'download',
      icon: 'download',
      title: 'Download your photos',
      description: desc,
    })
  }

  if (gallery.allow_favorites) {
    steps.push({
      key: 'favorites',
      icon: 'heart',
      title: 'Pick your favorites',
      description: 'Tap the heart icon on any photo to add it to your favorites list. Your photographer can see your picks.',
    })
  }

  if (gallery.allow_comments) {
    steps.push({
      key: 'comments',
      icon: 'message',
      title: 'Leave a comment',
      description: 'Tap the comment icon on any photo to leave a note or question for your photographer.',
    })
  }

  return steps
}

const ICON_ORDER = ['download', 'heart', 'message']

const ICONS = {
  download: Download,
  heart: Heart,
  message: MessageCircle,
}

export default function GalleryGuide({ gallery, onDismiss }) {
  const [current, setCurrent] = useState(0)
  const [visible, setVisible] = useState(false)
  const [show, setShow] = useState(false)

  const steps = buildSteps(gallery)
  // Don't show if fewer than 2 steps (just welcome, nothing to explain)
  const shouldShow = steps.length >= 2

  useEffect(() => {
    if (!shouldShow) return
    const seen = localStorage.getItem(getGuideKey(gallery.id))
    if (seen) return
    // Small delay so gallery renders behind it first
    const t = setTimeout(() => {
      setShow(true)
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
    }, 400)
    return () => clearTimeout(t)
  }, [gallery.id, shouldShow])

  function dismiss() {
    setVisible(false)
    setTimeout(() => {
      localStorage.setItem(getGuideKey(gallery.id), 'true')
      setShow(false)
      onDismiss?.()
    }, 250)
  }

  function handleNext() {
    if (current < steps.length - 1) {
      setCurrent(c => c + 1)
    } else {
      dismiss()
    }
  }

  function handleBack() {
    if (current > 0) setCurrent(c => c - 1)
  }

  if (!show) return null

  const step = steps[current]
  const isLast = current === steps.length - 1

  // Only show icons for features that are actually enabled
  const visibleIcons = ICON_ORDER.filter(key => {
    if (key === 'download') return gallery.allow_downloads
    if (key === 'heart') return gallery.allow_favorites
    if (key === 'message') return gallery.allow_comments
    return false
  })

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={dismiss}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 80,
          background: visible ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0)',
          backdropFilter: visible ? 'blur(2px)' : 'none',
          transition: 'background 0.25s ease, backdrop-filter 0.25s ease',
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 81,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          pointerEvents: 'none',
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: 380,
            borderRadius: 20,
            overflow: 'hidden',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            pointerEvents: 'auto',
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0) scale(1)' : 'translateY(16px) scale(0.97)',
            transition: 'opacity 0.25s ease, transform 0.25s ease',
          }}
        >
          {/* Illustration area */}
          <div
            style={{
              background: 'var(--bg-subtle)',
              padding: '2rem 1.5rem 1.5rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1.25rem',
              position: 'relative',
            }}
          >
            {/* Close button */}
            <button
              onClick={dismiss}
              style={{
                position: 'absolute',
                top: 12,
                right: 12,
                width: 28,
                height: 28,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--text-muted)',
                cursor: 'pointer',
              }}
              aria-label="Close guide"
            >
              <X size={13} />
            </button>

            {/* Icon row — only enabled feature icons */}
            {visibleIcons.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                {visibleIcons.map(key => {
                  const Icon = ICONS[key]
                  const isActive = step.icon === key
                  return (
                    <div
                      key={key}
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: isActive ? '#6366f1' : 'var(--surface)',
                        border: isActive ? '1px solid #6366f1' : '1px solid var(--border)',
                        color: isActive ? '#fff' : 'var(--text-muted)',
                        transform: isActive ? 'scale(1.15)' : 'scale(1)',
                        boxShadow: isActive ? '0 0 0 6px rgba(99,102,241,0.15)' : 'none',
                        transition: 'all 0.25s ease',
                        flexShrink: 0,
                      }}
                    >
                      <Icon size={20} />
                    </div>
                  )
                })}
              </div>
            )}

            <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.03em' }}>
              Step {current + 1} of {steps.length}
            </span>
          </div>

          {/* Body */}
          <div style={{ padding: '1.25rem 1.5rem 1.5rem' }}>
            <p
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text)',
                margin: '0 0 8px',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              {step.title}
            </p>
            <p
              style={{
                fontSize: 14,
                color: 'var(--text-muted)',
                lineHeight: 1.6,
                margin: '0 0 1.25rem',
              }}
            >
              {step.description}
            </p>

            {/* Footer */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              {/* Dots */}
              <div style={{ display: 'flex', gap: 6 }}>
                {steps.map((_, i) => (
                  <div
                    key={i}
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: i === current ? '#6366f1' : 'var(--border)',
                      transition: 'background 0.2s',
                    }}
                  />
                ))}
              </div>

              {/* Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={handleBack}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: 13,
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: 0,
                    letterSpacing: '0.04em',
                    visibility: current === 0 ? 'hidden' : 'visible',
                  }}
                >
                  Back
                </button>
                <button
                  onClick={handleNext}
                  style={{
                    background: '#111',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '0.07em',
                    padding: '9px 18px',
                    cursor: 'pointer',
                    textTransform: 'uppercase',
                  }}
                >
                  {isLast ? 'Go to gallery' : 'Next'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
