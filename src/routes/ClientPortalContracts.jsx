import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { FileText, CheckCircle, Clock } from 'lucide-react'
import { getPortalData } from '../utils/clientApi.js'
import ClientPortalLayout from '../components/layout/ClientPortalLayout.jsx'

function PendingContractRow({ contract, token }) {
  return (
    <a
      href={`/sign/${contract.sign_token}`}
      className="flex items-center gap-3 rounded-xl px-4 py-3"
      style={{ background: 'rgba(217,119,6,0.06)', border: '1px solid rgba(217,119,6,0.25)', textDecoration: 'none' }}
    >
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: '#fff', border: '1px solid rgba(217,119,6,0.25)' }}>
        <Clock size={16} style={{ color: '#d97706' }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{contract.title}</p>
        <p className="text-xs mt-0.5" style={{ color: '#b07a1f' }}>
          {contract.sent_at ? `Sent ${new Date(contract.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Awaiting signature'}
        </p>
      </div>
      <span className="text-xs font-medium px-3 py-1.5 rounded-lg flex-shrink-0"
        style={{ background: '#d97706', color: '#fff' }}>
        Review &amp; sign
      </span>
    </a>
  )
}

function SignedContractRow({ contract, token }) {
  return (
    <Link
      to={`/client/${token}/contracts/${contract.id}`}
      className="flex items-center gap-3 rounded-xl px-4 py-3"
      style={{ border: '1px solid var(--border)', textDecoration: 'none' }}
    >
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: 'rgba(34,153,84,0.08)' }}>
        <CheckCircle size={16} style={{ color: '#15803d' }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{contract.title}</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Signed {contract.signed_at ? new Date(contract.signed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
        </p>
      </div>
    </Link>
  )
}

export default function ClientPortalContracts() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    load()
  }, [token])

  async function load() {
    setLoading(true)
    setNotFound(false)
    try {
      const result = await getPortalData(token)
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
      </div>
    )
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

  const contracts = data.contracts || []
  // RPC already excludes 'void'; remaining statuses are sent,
  // pending_photographer (both "needs your signature"), and signed.
  const pending = contracts.filter(c => c.status !== 'signed')
  const signed = contracts.filter(c => c.status === 'signed')

  return (
    <ClientPortalLayout
      token={token}
      hasQuestionnaires={(data.pending_questionnaires || []).length > 0}
      pendingContracts={pending.length}
      pendingQuestionnaires={(data.pending_questionnaires || []).length}
    >
      <div className="space-y-5" style={{ maxWidth: 1100 }}>
        <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Contracts</h1>

        {contracts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FileText size={28} style={{ color: 'var(--text-muted)', marginBottom: 10 }} />
            <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>No contracts yet</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Contracts will show up here once your photographer sends one.
            </p>
          </div>
        ) : (
          <>
            {pending.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-2" style={{ color: '#d97706' }}>Needs your signature</p>
                <div className="space-y-2">
                  {pending.map(c => <PendingContractRow key={c.id} contract={c} token={token} />)}
                </div>
              </div>
            )}
            {signed.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Signed</p>
                <div className="space-y-2">
                  {signed.map(c => <SignedContractRow key={c.id} contract={c} token={token} />)}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </ClientPortalLayout>
  )
}
