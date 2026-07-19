import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, CheckCircle, ShieldCheck, ChevronDown, Download } from 'lucide-react'
import { getPortalData } from '../utils/clientApi.js'
import PortalPasswordGate from '../components/layout/PortalPasswordGate.jsx'
import ClientPortalLayout from '../components/layout/ClientPortalLayout.jsx'

const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL

export default function ClientPortalContractDetail() {
  const { token, contractId } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [gateResult, setGateResult] = useState(null)
  const [auditOpen, setAuditOpen] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState(null)

  useEffect(() => {
    load()
  }, [token])

  async function load() {
    setLoading(true)
    setNotFound(false)
    try {
      const result = await getPortalData(token)
      if (result?.password_required) {
        setGateResult(result)
        return
      }
      if (!result) {
        setNotFound(true)
        return
      }
      setData(result)
    } catch {
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }

  async function handleDownload(contract) {
    setDownloading(true)
    setDownloadError(null)
    try {
      const resp = await fetch(`${WORKER_URL}/contract-pdf/${contract.id}?token=${token}`)
      if (!resp.ok) throw new Error('Could not download the PDF. Try again in a moment.')
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${contract.title.replace(/[^a-z0-9]/gi, '_')}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) {
      setDownloadError(err.message)
    } finally {
      setDownloading(false)
    }
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
        <div className="text-center max-w-sm">
          <p className="text-base font-medium" style={{ color: 'var(--text)' }}>This link isn't valid</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            The link may have been regenerated. Contact your photographer for an updated link.
          </p>
        </div>
      </div>
    )
  }

  if (gateResult) {
    return (
      <PortalPasswordGate
        token={token}
        gateResult={gateResult}
        onUnlock={result => { setGateResult(null); setData(result) }}
      />
    )
  }

  if (loading || !data) {
    return (
      <ClientPortalLayout token={token} pendingContracts={0} pendingQuestionnaires={0}>
        <div className="flex items-center justify-center py-24">
          <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
        </div>
      </ClientPortalLayout>
    )
  }

  const contracts = data.contracts || []
  const contract = contracts.find(c => c.id === contractId)
  const pending = contracts.filter(c => c.status !== 'signed')
  const clientName = `${data.client?.first_name || ''} ${data.client?.last_name || ''}`.trim()

  if (!contract || contract.status !== 'signed') {
    // Either the id doesn't match anything in this client's contracts, or
    // it matches a pending one -- pending contracts don't have a detail
    // page of their own, they go straight to /sign/:token from the list.
    return (
      <ClientPortalLayout
        token={token}
        photographerId={data.client?.photographer_id}
        pendingContracts={pending.length}
        pendingQuestionnaires={(data.pending_questionnaires || []).length}
      >
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>Contract not found</p>
          <Link to={`/client/${token}/contracts`} className="text-sm mt-2" style={{ color: '#6366f1' }}>
            Back to Contracts
          </Link>
        </div>
      </ClientPortalLayout>
    )
  }

  return (
    <ClientPortalLayout
      token={token}
      photographerId={data.client?.photographer_id}
      pendingContracts={pending.length}
      pendingQuestionnaires={(data.pending_questionnaires || []).length}
    >
      <div className="space-y-4" style={{ maxWidth: 560 }}>
        <Link to={`/client/${token}/contracts`}
          className="flex items-center gap-2 text-sm"
          style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
          <ArrowLeft size={15} />Contracts
        </Link>

        <div>
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text)', lineHeight: 1.3 }}>{contract.title}</h1>
            <span className="text-xs font-medium px-2.5 py-1 rounded-lg flex-shrink-0"
              style={{ background: 'rgba(34,153,84,0.1)', color: '#15803d', whiteSpace: 'nowrap' }}>
              Fully signed
            </span>
          </div>
          {contract.sent_at && (
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Sent {new Date(contract.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          )}
        </div>

        <div className="rounded-xl px-4 py-3.5" style={{ background: 'rgba(34,153,84,0.06)', border: '1px solid rgba(34,153,84,0.2)' }}>
          <div className="flex items-center gap-2 mb-2.5">
            <CheckCircle size={16} style={{ color: '#15803d' }} />
            <span className="text-sm font-medium" style={{ color: '#15803d' }}>Signed by both parties</span>
          </div>
          <div className="text-xs space-y-0.5" style={{ color: 'var(--text)' }}>
            <p>
              <span style={{ color: 'var(--text-muted)' }}>You</span> · {clientName}
              {contract.signed_at && ` · ${new Date(contract.signed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
            </p>
            <p>
              <span style={{ color: 'var(--text-muted)' }}>Photographer</span> · {contract.photographer_signed_name}
              {contract.photographer_signed_at && ` · ${new Date(contract.photographer_signed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
            </p>
          </div>
        </div>

        <div>
          <button
            onClick={() => handleDownload(contract)}
            disabled={downloading}
            className="w-full py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
            style={{ background: '#6366f1', color: '#fff', border: 'none', cursor: downloading ? 'not-allowed' : 'pointer', opacity: downloading ? 0.7 : 1 }}>
            <Download size={15} />{downloading ? 'Downloading...' : 'Download PDF'}
          </button>
          {downloadError && (
            <p className="text-xs mt-1.5" style={{ color: 'var(--danger)' }}>{downloadError}</p>
          )}
        </div>

        <div style={{ borderTop: '1px solid var(--border)' }}>
          <button
            onClick={() => setAuditOpen(o => !o)}
            className="w-full flex items-center justify-between py-3"
            style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <span className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
              <ShieldCheck size={15} />View audit trail
            </span>
            <ChevronDown size={15} style={{ color: 'var(--text-muted)', transform: auditOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
          </button>
          {auditOpen && (
            <div className="text-xs pb-3 pl-6 space-y-1" style={{ color: 'var(--text-muted)' }}>
              <p>Signed as &quot;{contract.signed_name}&quot;
                {contract.signed_at && ` · ${new Date(contract.signed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
              </p>
              <p>Counter-signed as &quot;{contract.photographer_signed_name}&quot;
                {contract.photographer_signed_at && ` · ${new Date(contract.photographer_signed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
              </p>
              {contract.body_hash && (
                <p className="break-all" style={{ marginTop: 6 }}>
                  Document hash (SHA-256)<br/>
                  <span style={{ fontFamily: 'monospace', fontSize: 10.5 }}>{contract.body_hash}</span>
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </ClientPortalLayout>
  )
}
