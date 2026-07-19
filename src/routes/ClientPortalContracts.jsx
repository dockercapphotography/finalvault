import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { FileText, CheckCircle, Clock } from 'lucide-react'
import { getPortalData } from '../utils/clientApi.js'
import PortalPasswordGate from '../components/layout/PortalPasswordGate.jsx'
import ClientPortalLayout from '../components/layout/ClientPortalLayout.jsx'

// Client genuinely still has something to do: review and sign.
function NeedsSignatureRow({ contract }) {
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

// Client already signed -- nothing left for them to do, just waiting on
// the photographer's counter-signature. No button: clicking through to
// /sign/:token would just show that page's own "Already signed" screen,
// so there's nothing productive a button here could lead to.
function AwaitingPhotographerRow({ contract }) {
  return (
    <div
      className="flex items-center gap-3 rounded-xl px-4 py-3"
      style={{ border: '1px solid var(--border)' }}
    >
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: 'var(--surface-raised)' }}>
        <Clock size={16} style={{ color: 'var(--text-muted)' }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{contract.title}</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          You signed {contract.signed_at ? new Date(contract.signed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''} · waiting on your photographer
        </p>
      </div>
    </div>
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
  const [gateResult, setGateResult] = useState(null)

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
  // RPC already excludes 'void'. Three real buckets, not two: a contract
  // sitting in pending_photographer means the CLIENT already signed and is
  // just waiting on the photographer's counter-signature -- that's a very
  // different state from sent (client hasn't acted at all), even though an
  // earlier version of this page lumped both into one "needs your
  // signature" bucket, which was actively misleading (told a client to
  // re-sign something they'd already signed).
  const needsSignature = contracts.filter(c => c.status === 'sent')
  const awaitingPhotographer = contracts.filter(c => c.status === 'pending_photographer')
  const signed = contracts.filter(c => c.status === 'signed')

  return (
    <ClientPortalLayout
      token={token}
      photographerId={data.client?.photographer_id}
      pendingContracts={needsSignature.length}
      pendingQuestionnaires={(data.pending_questionnaires || []).length}
    >
      <div className="space-y-5" style={{ maxWidth: 560 }}>
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
            {needsSignature.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-2" style={{ color: '#d97706' }}>Needs your signature</p>
                <div className="space-y-2">
                  {needsSignature.map(c => <NeedsSignatureRow key={c.id} contract={c} />)}
                </div>
              </div>
            )}
            {awaitingPhotographer.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Awaiting your photographer</p>
                <div className="space-y-2">
                  {awaitingPhotographer.map(c => <AwaitingPhotographerRow key={c.id} contract={c} />)}
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
