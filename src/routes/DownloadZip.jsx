import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { Download, AlertCircle, Loader, Clock, ImageOff } from 'lucide-react'

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL

// Polls while a job is queued/processing -- distinct from the "no in-app
// progress polling" decision made for the download-button click flow
// (spec section 7, question 2). That decision was about not building a
// live progress bar into the initial click; this page's entire purpose
// is showing the current status of a job someone already has a direct
// link to (from the ready/failed email), so checking again after a few
// seconds is just this page doing its job, not scope creep on that
// decision.
const POLL_INTERVAL_MS = 5000

async function getJobStatus(jobId) {
  const resp = await fetch(`${WORKER_URL}/zip-jobs/${jobId}`)
  if (!resp.ok) {
    if (resp.status === 404) return { notFound: true }
    throw new Error('Failed to load download status')
  }
  return resp.json()
}

function Shell({ children }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
        {children}
      </div>
    </div>
  )
}

function IconCircle({ background, children }) {
  return (
    <div style={{ width: 56, height: 56, borderRadius: '50%', background, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
      {children}
    </div>
  )
}

function Title({ children }) {
  return (
    <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111', margin: '0 0 8px', fontFamily: 'system-ui, sans-serif' }}>
      {children}
    </h1>
  )
}

function Body({ children }) {
  return (
    <p style={{ fontSize: 15, color: '#6b7280', margin: 0, fontFamily: 'system-ui, sans-serif', lineHeight: 1.6 }}>
      {children}
    </p>
  )
}

function LoadingScreen() {
  return (
    <Shell>
      <Loader size={24} style={{ color: '#6366f1', animation: 'spin 1s linear infinite' }} />
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </Shell>
  )
}

function NotFoundScreen() {
  return (
    <Shell>
      <IconCircle background="#fee2e2">
        <AlertCircle size={24} style={{ color: '#ef4444' }} />
      </IconCircle>
      <Title>Download not found</Title>
      <Body>This download link is invalid.</Body>
    </Shell>
  )
}

function ExpiredScreen() {
  return (
    <Shell>
      <IconCircle background="#fef3c7">
        <Clock size={24} style={{ color: '#d97706' }} />
      </IconCircle>
      <Title>This download has expired</Title>
      <Body>Download links are only available for 7 days. Reach out to your photographer for a new one.</Body>
    </Shell>
  )
}

function FailedScreen({ errorMessage }) {
  return (
    <Shell>
      <IconCircle background="#fee2e2">
        <AlertCircle size={24} style={{ color: '#ef4444' }} />
      </IconCircle>
      <Title>We ran into a problem</Title>
      <Body>{errorMessage || "We weren't able to finish preparing this download."}</Body>
    </Shell>
  )
}

function ProcessingScreen({ imagesCompleted, imageCount }) {
  return (
    <Shell>
      <IconCircle background="#e0e7ff">
        <Loader size={24} style={{ color: '#6366f1', animation: 'spin 1s linear infinite' }} />
      </IconCircle>
      <Title>Still preparing your download</Title>
      <Body>
        {imageCount ? `${imagesCompleted || 0} of ${imageCount} photos processed so far. ` : ''}
        This page will update automatically -- feel free to leave it open, or check back in a few minutes.
      </Body>
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </Shell>
  )
}

function ReadyScreen({ jobId, imageCount, skippedCount }) {
  const includedCount = imageCount - skippedCount
  return (
    <Shell>
      <IconCircle background="#dcfce7">
        <Download size={24} style={{ color: '#22c55e' }} />
      </IconCircle>
      <Title>Your download is ready</Title>
      <Body>
        {includedCount} full-resolution photo{includedCount === 1 ? '' : 's'} ready to download.
      </Body>
      {skippedCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: '#fff8f0', border: '1px solid #fed7aa', borderRadius: 10, padding: '12px 16px', margin: '16px 0 0', textAlign: 'left' }}>
          <ImageOff size={16} style={{ color: '#9a6b3a', flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontSize: 13, color: '#7c4b1a', margin: 0, fontFamily: 'system-ui, sans-serif', lineHeight: 1.5 }}>
            {skippedCount} photo{skippedCount === 1 ? '' : 's'} couldn't be included after repeated attempts -- everything else downloaded successfully.
          </p>
        </div>
      )}
      <a
        href={`${WORKER_URL}/zip-jobs/${jobId}/download`}
        style={{ display: 'block', marginTop: 24, padding: '16px 36px', background: '#111111', borderRadius: 8, color: '#ffffff', fontSize: 14, fontWeight: 600, textDecoration: 'none', letterSpacing: '0.05em', textTransform: 'uppercase', fontFamily: 'system-ui, sans-serif' }}
      >
        Download ZIP
      </a>
    </Shell>
  )
}

export default function DownloadZip() {
  const { jobId } = useParams()
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const pollRef = useRef(null)

  useEffect(() => {
    load()
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current)
    }
  }, [jobId])

  async function load() {
    try {
      const data = await getJobStatus(jobId)
      setStatus(data)
      setLoadError(false)

      if (!data.notFound && (data.status === 'queued' || data.status === 'processing')) {
        pollRef.current = setTimeout(load, POLL_INTERVAL_MS)
      }
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  if (loading && !status) return <LoadingScreen />
  if (loadError && !status) return <FailedScreen errorMessage="Could not load this download. Please try again." />
  if (status?.notFound) return <NotFoundScreen />

  switch (status.status) {
    case 'ready':
      return <ReadyScreen jobId={jobId} imageCount={status.imageCount} skippedCount={status.skippedCount} />
    case 'failed':
      return <FailedScreen errorMessage={status.errorMessage} />
    case 'expired':
      return <ExpiredScreen />
    case 'queued':
    case 'processing':
    default:
      return <ProcessingScreen imagesCompleted={status.imagesCompleted} imageCount={status.imageCount} />
  }
}
