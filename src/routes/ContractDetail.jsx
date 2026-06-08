import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, CheckCircle, AlertCircle, FileText,
  User, Clock, Shield, Trash2
} from 'lucide-react'
import { getContract, updateContract, voidContract, deleteContract } from '../utils/crmApi.js'
import { supabase } from '../supabaseClient.js'
import { formatDate } from '../utils/formatters.js'
import Button from '../components/ui/Button.jsx'
import Badge from '../components/ui/Badge.jsx'
import Toast from '../components/ui/Toast.jsx'
import PageBreadcrumb from '../components/ui/PageBreadcrumb.jsx'

const STATUS_CONFIG = {
  draft:                { label: 'Draft',              variant: 'default' },
  sent:                 { label: 'Awaiting Signature', variant: 'warning' },
  pending_photographer: { label: 'Needs Counter-Sign', variant: 'warning' },
  signed:               { label: 'Fully Signed',       variant: 'success' },
  void:                 { label: 'Void',               variant: 'danger' },
}

export default function ContractDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [contract, setContract] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)

  // Counter-sign state
  const [counterSignName, setCounterSignName] = useState('')
  const [countersigning, setCountersigning] = useState(false)
  const [photographerDisplayName, setPhotographerDisplayName] = useState('')

  // Void/delete state
  const [showVoidConfirm, setShowVoidConfirm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [voidReason, setVoidReason] = useState('')
  const [actioning, setActioning] = useState(false)

  useEffect(() => {
    load()
  }, [id])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [c, { data: { user } }] = await Promise.all([
        getContract(id),
        supabase.auth.getUser(),
      ])
      setContract(c)

      if (user) {
        const { data: ph } = await supabase
          .from('photographers')
          .select('display_name')
          .eq('id', user.id)
          .single()
        const name = ph?.display_name || ''
        setPhotographerDisplayName(name)
        setCounterSignName(name)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleCounterSign() {
    if (!counterSignName.trim()) return
    setCountersigning(true)
    try {
      const now = new Date().toISOString()
      const updated = await updateContract(id, {
        status: 'signed',
        photographer_signed_at: now,
        photographer_signed_name: counterSignName.trim(),
      })
      setContract(prev => ({ ...prev, ...updated }))
      setToast({ message: 'Contract fully signed', type: 'success' })
    } catch (err) {
      setToast({ message: err.message, type: 'error' })
    } finally {
      setCountersigning(false)
    }
  }

  async function handleVoid() {
    setActioning(true)
    try {
      await voidContract(id, voidReason)
      setContract(prev => ({ ...prev, status: 'void' }))
      setShowVoidConfirm(false)
      setToast({ message: 'Contract voided', type: 'success' })
    } catch (err) {
      setToast({ message: err.message, type: 'error' })
    } finally {
      setActioning(false)
    }
  }

  async function handleDelete() {
    setActioning(true)
    try {
      await deleteContract(id)
      navigate(contract.client_id ? `/clients/${contract.client_id}` : '/clients')
    } catch (err) {
      setToast({ message: err.message, type: 'error' })
      setActioning(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
        style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
    </div>
  )

  if (error || !contract) return (
    <div className="max-w-2xl space-y-4">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm"
        style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
        <ArrowLeft size={16} />Back
      </button>
      <div className="px-4 py-3 rounded-xl text-sm"
        style={{ background: 'var(--danger-subtle)', color: 'var(--danger)', border: '1px solid var(--danger)' }}>
        {error || 'Contract not found.'}
      </div>
    </div>
  )

  const clientName = contract.clients
    ? `${contract.clients.first_name} ${contract.clients.last_name}`
    : 'Unknown client'
  const statusCfg = STATUS_CONFIG[contract.status] || STATUS_CONFIG.draft
  const needsCounterSign = contract.status === 'pending_photographer'
  const isFullySigned = contract.status === 'signed'

  return (
    <div className="max-w-3xl space-y-6">
      {/* Breadcrumb */}
      <div className="hidden md:block">
        <PageBreadcrumb crumbs={[
          { label: 'Clients', to: '/clients' },
          ...(contract.client_id ? [{ label: clientName, to: `/clients/${contract.client_id}` }] : []),
          { label: contract.title },
        ]} />
      </div>
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm md:hidden"
        style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
        <ArrowLeft size={16} />Back
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>{contract.title}</h1>
            <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
          </div>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {contract.client_id
              ? <Link to={`/clients/${contract.client_id}`} style={{ color: '#6366f1', textDecoration: 'none' }}>{clientName}</Link>
              : clientName}
            {contract.galleries?.title && ` · ${contract.galleries.title}`}
            {contract.sent_at && ` · Sent ${formatDate(contract.sent_at)}`}
          </p>
        </div>
      </div>

      {/* Counter-sign banner */}
      {needsCounterSign && (
        <div className="rounded-2xl overflow-hidden" style={{ border: '2px solid #6366f1', background: 'rgba(99,102,241,0.05)' }}>
          <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(99,102,241,0.2)' }}>
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle size={16} style={{ color: '#6366f1' }} />
              <h3 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Your counter-signature is needed</h3>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {clientName} signed on {formatDate(contract.signed_at)} as "{contract.signed_name}".
              Review the contract below and add your counter-signature to complete it.
            </p>
          </div>
          <div className="px-5 py-4 flex items-end gap-3 flex-wrap">
            <div className="flex-1" style={{ minWidth: 200 }}>
              <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text)' }}>
                Your full name
              </label>
              <input
                type="text"
                value={counterSignName}
                onChange={e => setCounterSignName(e.target.value)}
                placeholder={photographerDisplayName || 'Your full name'}
                style={{
                  width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)',
                  color: 'var(--text)', borderRadius: 8, padding: '8px 12px',
                  fontSize: 14, outline: 'none',
                }}
                onFocus={e => e.target.style.borderColor = '#6366f1'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
              />
            </div>
            <Button
              onClick={handleCounterSign}
              disabled={countersigning || !counterSignName.trim()}>
              <CheckCircle size={14} />
              {countersigning ? 'Signing...' : 'Counter-Sign'}
            </Button>
          </div>
        </div>
      )}

      {/* Fully signed confirmation */}
      {isFullySigned && (
        <div className="px-5 py-4 rounded-2xl" style={{ background: 'var(--success-subtle)', border: '1px solid var(--success)' }}>
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle size={16} style={{ color: 'var(--success)' }} />
            <p className="font-semibold text-sm" style={{ color: 'var(--success)' }}>Fully signed</p>
          </div>
          <div className="space-y-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            <p>Client: <span style={{ color: 'var(--text)' }}>{contract.signed_name}</span> · {formatDate(contract.signed_at)}</p>
            <p>Photographer: <span style={{ color: 'var(--text)' }}>{contract.photographer_signed_name}</span> · {formatDate(contract.photographer_signed_at)}</p>
          </div>
        </div>
      )}

      {/* Audit trail */}
      {(contract.signed_name || contract.signed_ip) && (
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <div className="px-5 py-4" style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2">
              <Shield size={14} style={{ color: 'var(--text-muted)' }} />
              <h3 className="font-medium text-sm" style={{ color: 'var(--text)' }}>Audit Trail</h3>
            </div>
          </div>
          <div className="px-5 py-4 space-y-2" style={{ background: 'var(--surface)' }}>
            {contract.signed_name && (
              <div className="flex items-start gap-3">
                <User size={13} style={{ color: 'var(--text-muted)', marginTop: 1, flexShrink: 0 }} />
                <div>
                  <p className="text-xs font-medium" style={{ color: 'var(--text)' }}>Client signature</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    "{contract.signed_name}" · {contract.signed_at && formatDate(contract.signed_at)}
                    {contract.signed_ip && ` · IP ${contract.signed_ip}`}
                  </p>
                </div>
              </div>
            )}
            {contract.photographer_signed_name && (
              <div className="flex items-start gap-3">
                <CheckCircle size={13} style={{ color: 'var(--success)', marginTop: 1, flexShrink: 0 }} />
                <div>
                  <p className="text-xs font-medium" style={{ color: 'var(--text)' }}>Counter-signature</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    "{contract.photographer_signed_name}" · {contract.photographer_signed_at && formatDate(contract.photographer_signed_at)}
                  </p>
                </div>
              </div>
            )}
            {contract.body_hash && (
              <div className="flex items-start gap-3">
                <Shield size={13} style={{ color: 'var(--text-muted)', marginTop: 1, flexShrink: 0 }} />
                <div>
                  <p className="text-xs font-medium" style={{ color: 'var(--text)' }}>Document hash (SHA-256)</p>
                  <p className="text-xs font-mono truncate" style={{ color: 'var(--text-muted)' }}>{contract.body_hash}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Contract body */}
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <div className="px-5 py-4 flex items-center gap-2" style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
          <FileText size={14} style={{ color: 'var(--text-muted)' }} />
          <h3 className="font-medium text-sm" style={{ color: 'var(--text)' }}>Contract Body</h3>
        </div>
        <div className="px-5 py-5" style={{ background: 'var(--surface)' }}>
          <pre style={{
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            fontSize: 13, lineHeight: 1.8, color: 'var(--text)',
            fontFamily: 'inherit', margin: 0,
          }}>
            {contract.body}
          </pre>
        </div>
      </div>

      {/* Danger zone */}
      {!isFullySigned && (
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <div className="px-5 py-4" style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
            <h3 className="font-medium text-sm" style={{ color: 'var(--text)' }}>Danger Zone</h3>
          </div>
          <div className="px-5 py-4 space-y-3" style={{ background: 'var(--surface)' }}>
            {/* Void */}
            {contract.status !== 'void' && contract.status !== 'draft' && (
              <div>
                {!showVoidConfirm ? (
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>Void contract</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        Marks this contract as void. The signing link will stop working.
                      </p>
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => setShowVoidConfirm(true)}>
                      Void
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input
                      value={voidReason}
                      onChange={e => setVoidReason(e.target.value)}
                      placeholder="Reason for voiding (optional)"
                      style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none' }}
                    />
                    <div className="flex gap-2">
                      <Button variant="danger" size="sm" onClick={handleVoid} disabled={actioning}>
                        {actioning ? 'Voiding...' : 'Confirm Void'}
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => setShowVoidConfirm(false)}>Cancel</Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Delete */}
            <div>
              {!showDeleteConfirm ? (
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>Delete contract</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Permanently removes this contract record.</p>
                  </div>
                  <Button variant="danger" size="sm" onClick={() => setShowDeleteConfirm(true)}>
                    <Trash2 size={13} />Delete
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
                  style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)' }}>
                  <p className="text-sm flex-1 font-medium" style={{ color: 'var(--danger)' }}>
                    Delete this contract? This cannot be undone.
                  </p>
                  <Button variant="danger" size="sm" onClick={handleDelete} disabled={actioning}>
                    {actioning ? 'Deleting...' : 'Confirm'}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50">
          <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
        </div>
      )}
    </div>
  )
}
